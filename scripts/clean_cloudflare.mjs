import { rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

rmSync(resolve(rootDir, '_headers'), { force: true });
rmSync(resolve(rootDir, '_redirects'), { force: true });
console.log('✅ Cleaned temporary Cloudflare files (_headers, _redirects) for Chrome unpacked extension compatibility');
