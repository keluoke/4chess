import { cpSync, mkdirSync, rmSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve, relative } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist/site');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
// Deploy only the public website. Local service, popup experiments, releases and secrets never enter this output.
const entries = ['index.html','404.html','favicon.svg','robots.txt','sitemap.xml','site','en','zh','analysis','live','engine','content/fair-play-guard.js','lib','models','ui','icons','guide','privacy','LICENSE','LICENSES','THIRD_PARTY_NOTICES.md'];
for (const entry of entries) {
  mkdirSync(resolve(output, entry, '..'), { recursive: true });
  cpSync(resolve(root, entry), resolve(output, entry), { recursive: true });
}
cpSync(resolve(root, 'cloudflare/headers'), resolve(output, '_headers'));
cpSync(resolve(root, 'cloudflare/redirects'), resolve(output, '_redirects'));
function verify(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, item.name), path = relative(output, file).replaceAll('\\', '/');
    if (item.isDirectory()) { verify(file); continue; }
    if (statSync(file).size > 25 * 1024 * 1024) throw new Error(`Pages size limit exceeded: ${path}`);
    if (path.startsWith('models/') && statSync(file).size > 1024 * 1024) throw new Error(`Large model forbidden: ${path}`);
  }
}
verify(output);
const swPath = join(output, 'analysis/sw.js');
const assets = JSON.parse(readFileSync(swPath, 'utf8').match(/const STATIC_ASSETS = (\[[^;]+\]);/)[1]);
const urls = new Set();
for (const asset of assets) {
  const url = new URL(asset, pathToFileURL(swPath));
  const path = fileURLToPath(url);
  const file = url.pathname.endsWith('/') ? join(path, 'index.html') : path;
  if (!file.startsWith(`${output}/`) || url.hash || urls.has(url.href)) throw new Error(`Invalid or duplicate precache URL: ${asset}`);
  if (!statSync(file).isFile()) throw new Error(`Precache URL is not a file: ${asset}`);
  urls.add(url.href);
}
// Pages Functions are bundled by Pages from the repository functions/ directory.
console.log(`Website ready: ${output}; ${urls.size} precache URLs verified.`);
