import { cpSync, mkdirSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist/site');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
// Deploy only the public website. Local service, popup experiments, releases and secrets never enter this output.
const entries = ['index.html','404.html','favicon.svg','robots.txt','sitemap.xml','site','en','zh','analysis','engine','content/fair-play-guard.js','lib','models','ui','icons','guide','privacy','LICENSE','LICENSES','THIRD_PARTY_NOTICES.md'];
for (const entry of entries) {
  mkdirSync(resolve(output, entry, '..'), { recursive: true });
  cpSync(resolve(root, entry), resolve(output, entry), { recursive: true });
}
cpSync(resolve(root, 'cloudflare/headers'), resolve(output, '_headers'));
cpSync(resolve(root, 'cloudflare/redirects'), resolve(output, '_redirects'));
// Generate complete local module pre-cache coverage, including worker entry points.
const modules = [];
function verify(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, item.name), path = relative(output, file).replaceAll('\\', '/');
    if (item.isDirectory()) { verify(file); continue; }
    if (statSync(file).size > 25 * 1024 * 1024) throw new Error(`Pages size limit exceeded: ${path}`);
    if (path.startsWith('models/') && statSync(file).size > 1024 * 1024) throw new Error(`Large model forbidden: ${path}`);
    if (/^(analysis|engine|ui)\/.+\.(js|css)$/.test(path) && path !== 'analysis/sw.js') modules.push('../' + path);
  }
}
verify(output);
const swPath = join(output, 'analysis/sw.js');
writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('// GENERATED_MODULES', `STATIC_ASSETS.push(...${JSON.stringify(modules)});`));
// Pages Functions are bundled by Pages from the repository functions/ directory.
console.log(`Website ready: ${output}; ${modules.length} local module dependencies verified.`);
