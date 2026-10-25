import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = process.argv.includes('--local');
let sourceCommit = null, sourceDirty = true;
try {
  sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  sourceDirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
} catch {}
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const entries = ['manifest.json', 'background.js', 'index.html', 'favicon.svg', '_locales', 'analysis', 'content', 'engine', 'lib', 'popup', 'scan', 'offscreen', 'icons', 'ui', 'models', 'guide', 'LICENSE', 'LICENSES', 'THIRD_PARTY_NOTICES.md', 'README.md'];

const excludedPatterns = [
  /\.DS_Store$/,
  /(^|[/\\])\._[^/\\]*$/,
  /__MACOSX/,
  /engine[/\\]stockfish-standard-web\.js$/,
  /lib[/\\]stockfish-19-standard\.js$/,
  /popup[/\\]puzzle-poster\.js$/,
  /popup[/\\]qrcode\.mjs$/,
  /scripts[/\\]share-service\.mjs$/,
  /\.env(\..+)?$/,
  /local-config\.json$/
];

function shouldExclude(relPath) {
  return excludedPatterns.some(pat => (!local || !/puzzle-poster|qrcode/.test(pat.source)) && pat.test(relPath));
}

function copyRecursive(src, dst, rel = '') {
  if (shouldExclude(rel)) return;
  const stat = statSync(src);
  if (stat.isDirectory()) {
    mkdirSync(dst, { recursive: true });
    for (const name of readdirSync(src)) {
      copyRecursive(join(src, name), join(dst, name), join(rel, name));
    }
  } else {
    copyFileSync(src, dst);
  }
}

const staging = resolve(root, 'releases', `${local ? 'diverge-local' : 'diverge-extension'}-v${manifest.version}.staging`);
const unpacked = resolve(root, 'releases', `${local ? 'diverge-local' : 'diverge-extension'}-v${manifest.version}`);
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

try {
  // 1. Copy entries to clean staging workspace
  for (const entry of entries) {
    copyRecursive(join(root, entry), join(staging, entry), entry);
  }

  // 2. Strip local-only feature blocks
  function sanitizeFile(file) {
    const stat = statSync(file);
    if (stat.isDirectory()) {
      for (const name of readdirSync(file)) {
        sanitizeFile(join(file, name));
      }
      return;
    }
    if (/\.(js|css|html|json)$/.test(file)) {
      let content = readFileSync(file, 'utf8');
      if (content.includes('LOCAL_FEATURE_START')) {
        content = content.replace(/\/\*\s*LOCAL_FEATURE_START:[^*]*\*\/(?:[\s\S]*?)\/\*\s*LOCAL_FEATURE_END:[^*]*\*\/\s*/g, '');
        writeFileSync(file, content, 'utf8');
      }
    }
  }
  if (!local) sanitizeFile(staging);
  writeFileSync(join(staging, 'index.html'), '<!doctype html><html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=analysis/index.html"><title>Diverge</title><a href="analysis/index.html">Open analysis studio</a></html>');

  // 3. Strip local loopback permissions from staging manifest
  const stagingManifestPath = join(staging, 'manifest.json');
  const stagingManifest = JSON.parse(readFileSync(stagingManifestPath, 'utf8'));
  if (!local && Array.isArray(stagingManifest.host_permissions)) {
    stagingManifest.host_permissions = stagingManifest.host_permissions.filter(
      (h) => !h.includes('127.0.0.1') && !h.includes('localhost')
    );
  }
  writeFileSync(stagingManifestPath, JSON.stringify(stagingManifest, null, 2), 'utf8');

  // 4. Asset and size checks on staging files
  function check(file) {
    const stat = statSync(file);
    if (stat.isDirectory()) return readdirSync(file).forEach(name => {
      if (name.startsWith('_') && !(file === staging && name === '_locales')) throw new Error(`Reserved underscore path: ${name}`);
      check(join(file, name));
    });
    if (file !== join(staging, 'manifest.json') && /(^|[/\\])manifest\.json$/.test(file)) throw new Error(`Duplicate manifest forbidden in extension: ${file}`);
    if (stat.size > 25 * 1024 * 1024) throw new Error(`Oversized extension asset: ${file}`);
    if (/models[/\\]/.test(file) && stat.size > 1024 * 1024) throw new Error(`Large model forbidden in extension: ${file}`);
  }
  for (const entry of entries) {
    if (entry.startsWith('_') && entry !== '_locales') throw new Error(`Reserved root path: ${entry}`);
    check(join(staging, entry));
  }

  if (local) {
    rmSync(unpacked, { recursive: true, force: true });
    renameSync(staging, unpacked);
    console.log(`[Local development only — never upload] ${unpacked}`);
    process.exit(0);
  }

  // 4. Create release ZIP
  const output = resolve(root, 'releases', `diverge-extension-v${manifest.version}.zip`);
  mkdirSync(resolve(root, 'releases'), { recursive: true });
  rmSync(output, { force: true });
  execFileSync('zip', ['-r', '-X', output, ...entries, '-x', '*.DS_Store', '*__MACOSX*'], { cwd: staging, stdio: 'ignore' });

  // 5. Strict Zero-Residual Assertions on generated ZIP
  const zipFiles = execFileSync('unzip', ['-Z', '-1', output], { encoding: 'utf8' }).split('\n');
  const forbiddenFilePatterns = [/puzzle-poster\.js$/, /qrcode\.mjs$/, /share-service\.mjs$/, /\.env/];
  for (const f of zipFiles) {
    if (!f) continue;
    for (const pat of forbiddenFilePatterns) {
      if (pat.test(f)) {
        rmSync(output, { force: true });
        throw new Error(`Store isolation failed: forbidden file found in zip: ${f}`);
      }
    }
  }

  const zipContent = execFileSync('unzip', ['-p', output, '*.js', '*.css', '*.html', '*.json'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const forbiddenStrings = ['puzzle-poster', 'scan-poster', 'poster-modal', 'PUZZLE_POSTER', '127.0.0.1:3210', 'localhost:3210', 'LOCAL_FEATURE_START', 'WECHAT_APPSECRET'];
  for (const word of forbiddenStrings) {
    if (zipContent.includes(word)) {
      rmSync(output, { force: true });
      throw new Error(`Store isolation failed: forbidden string "${word}" leaked into release zip!`);
    }
  }

  // Preserve exactly the same bytes for Load unpacked. _locales is the sole permitted underscore directory.
  rmSync(unpacked, { recursive: true, force: true });
  renameSync(staging, unpacked);
  writeFileSync(resolve(root, 'releases', `diverge-extension-v${manifest.version}.json`), JSON.stringify({ sourceCommit, sourceDirty, version: manifest.version, zip: output, unpacked, localShareIncluded: false }, null, 2) + '\n');
  console.log(`[Package Success] Store ZIP: ${output}\n[Load unpacked] ${unpacked}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
