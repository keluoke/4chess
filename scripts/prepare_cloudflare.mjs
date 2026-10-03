import { copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Prepare Cloudflare Pages configuration files during CI build
if (existsSync(resolve(rootDir, 'cloudflare/headers'))) {
  copyFileSync(resolve(rootDir, 'cloudflare/headers'), resolve(rootDir, '_headers'));
  console.log('✅ Generated _headers from cloudflare/headers');
}

if (existsSync(resolve(rootDir, 'cloudflare/redirects'))) {
  copyFileSync(resolve(rootDir, 'cloudflare/redirects'), resolve(rootDir, '_redirects'));
  console.log('✅ Generated _redirects from cloudflare/redirects');
}

console.log('ℹ️ Note: If loading as unpacked Chrome extension locally, run "npm run clean" to remove _headers/_redirects.');
