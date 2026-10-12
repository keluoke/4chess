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

// Ensure lightweight vision models exist in models/
const wasmTarget = resolve(rootDir, 'models/chess-cnn.wasm');
const binTarget = resolve(rootDir, 'models/chessimg2pos_weights.bin');
const assetsDir = resolve(rootDir, '../chesspuzzle/assets/models');

if (!existsSync(wasmTarget) && existsSync(resolve(assetsDir, 'chess-cnn.wasm'))) {
  copyFileSync(resolve(assetsDir, 'chess-cnn.wasm'), wasmTarget);
  console.log('✅ Recovered models/chess-cnn.wasm');
}
if (!existsSync(binTarget) && existsSync(resolve(assetsDir, 'chessimg2pos_weights.bin'))) {
  copyFileSync(resolve(assetsDir, 'chessimg2pos_weights.bin'), binTarget);
  console.log('✅ Recovered models/chessimg2pos_weights.bin');
}

console.log('ℹ️ Build the isolated extension ZIP with npm run package; website build files stay outside that package.');
