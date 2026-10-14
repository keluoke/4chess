import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json')));
const entries = ['manifest.json', 'background.js', 'index.html', 'favicon.svg', '_locales', 'analysis', 'content', 'engine', 'lib', 'popup', 'scan', 'offscreen', 'icons', 'ui', 'models', 'guide', 'LICENSE', 'LICENSES', 'THIRD_PARTY_NOTICES.md', 'README.md'];
function check(file) {
  const stat = statSync(file);
  if (stat.isDirectory()) return readdirSync(file).forEach(name => check(join(file, name)));
  if (file !== join(root, 'manifest.json') && /(^|[/\\])manifest\.json$/.test(file)) throw new Error(`Duplicate manifest forbidden in extension: ${file}`);
  if (stat.size > 25 * 1024 * 1024) throw new Error(`Oversized extension asset: ${file}`);
  if (/models[/\\]/.test(file) && stat.size > 1024 * 1024) throw new Error(`Large model forbidden in extension: ${file}`);
}
entries.forEach(entry => check(join(root, entry)));
const output = resolve(root, 'releases', `diverge-extension-v${manifest.version}.zip`);
mkdirSync(resolve(root, 'releases'), { recursive: true }); rmSync(output, { force: true });
execFileSync('zip', ['-r', '-X', output, ...entries, '-x', '*.DS_Store', '*__MACOSX*', 'engine/stockfish-standard-web.js', 'lib/stockfish-19-standard.js'], { cwd: root, stdio: 'ignore' });
console.log(output);
