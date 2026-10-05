import { rmSync, existsSync, renameSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// 1. Clean temporary Cloudflare configuration files
rmSync(resolve(rootDir, '_headers'), { force: true });
rmSync(resolve(rootDir, '_redirects'), { force: true });

// 2. Sanitize any underscore files in node_modules (@exodus/bytes fallback/_utils.js)
const utilsFile = resolve(rootDir, 'node_modules/@exodus/bytes/fallback/_utils.js');
const newUtilsFile = resolve(rootDir, 'node_modules/@exodus/bytes/fallback/utils.js');
if (existsSync(utilsFile)) {
  renameSync(utilsFile, newUtilsFile);
  const bytesDir = resolve(rootDir, 'node_modules/@exodus/bytes');
  function fixImports(d) {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, f.name);
      if (f.isDirectory()) fixImports(full);
      else if (f.name.endsWith('.js') || f.name.endsWith('.cjs')) {
        let content = readFileSync(full, 'utf8');
        if (content.includes('_utils.js')) {
          content = content.replaceAll('_utils.js', 'utils.js');
          writeFileSync(full, content, 'utf8');
        }
      }
    }
  }
  fixImports(bytesDir);
}

// 3. Clean macOS AppleDouble and .DS_Store files if on macOS
try {
  execSync(`dot_clean "${rootDir}"`, { stdio: 'ignore' });
} catch (e) {}

console.log('✅ Extension directory fully sanitized for Chrome unpacked extension loading!');

