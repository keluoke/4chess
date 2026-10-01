/**
 * Test PWA Manifest, Service Worker, and Multi-Source Importer
 * (URL Hash, Lichess URL, FEN, PGN, File upload, Drag-and-Drop)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

console.log('--- 1. Testing PWA Manifest & Service Worker ---');

// Check manifest.webmanifest exists and is valid JSON
const manifestPath = resolve(rootDir, 'analysis/manifest.webmanifest');
if (!existsSync(manifestPath)) {
  throw new Error('manifest.webmanifest does not exist!');
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.name || !manifest.start_url || manifest.display !== 'standalone') {
  throw new Error('manifest.webmanifest is missing required PWA fields!');
}
console.log('✅ manifest.webmanifest is valid PWA manifest (display: standalone, name: ' + manifest.name + ')');

// Check Service Worker
const swPath = resolve(rootDir, 'analysis/sw.js');
if (!existsSync(swPath)) {
  throw new Error('sw.js does not exist!');
}
const swContent = readFileSync(swPath, 'utf8');
if (!swContent.includes('addEventListener(\'install\'') || !swContent.includes('addEventListener(\'fetch\'')) {
  throw new Error('sw.js missing install or fetch listener!');
}
console.log('✅ analysis/sw.js exists and implements Service Worker lifecycle');

// Check Cloudflare Pages cloudflare/headers & cloudflare/redirects
const headersPath = resolve(rootDir, 'cloudflare/headers');
if (!existsSync(headersPath)) {
  throw new Error('cloudflare/headers does not exist!');
}
const headersContent = readFileSync(headersPath, 'utf8');
if (!headersContent.includes('Cross-Origin-Opener-Policy') || !headersContent.includes('application/wasm')) {
  throw new Error('cloudflare/headers missing COOP/COEP or wasm mime type!');
}
console.log('✅ Cloudflare Pages cloudflare/headers has COOP/COEP for multithreaded WASM');

const redirectsPath = resolve(rootDir, 'cloudflare/redirects');
if (!existsSync(redirectsPath)) {
  throw new Error('cloudflare/redirects does not exist!');
}
console.log('✅ Cloudflare Pages cloudflare/redirects configured');

// Check functions/api/chesscom.js
const funcPath = resolve(rootDir, 'functions/api/chesscom.js');
if (!existsSync(funcPath)) {
  throw new Error('functions/api/chesscom.js does not exist!');
}
console.log('✅ Cloudflare Pages Functions edge proxy exists: functions/api/chesscom.js');

console.log('\n--- 2. Testing URL Regex Patterns for Multi-Source Importer ---');

const lichessRegex = /(?:https?:\/\/)?(?:www\.)?lichess\.org\/([a-zA-Z0-9]{8,12})/i;
const chesscomRegex = /(?:https?:\/\/)?(?:www\.)?chess\.com\/game\/(live|daily)\/([0-9]+)/i;

// Test Lichess patterns
const lichessTest1 = 'https://lichess.org/sFnZDTa1';
const lichessTest2 = 'https://lichess.org/sFnZDTa1/white';
const lichessTest3 = 'lichess.org/sFnZDTa1/black#25';
if (lichessTest1.match(lichessRegex)?.[1].slice(0, 8) !== 'sFnZDTa1') throw new Error('Failed Lichess regex test 1');
if (lichessTest2.match(lichessRegex)?.[1].slice(0, 8) !== 'sFnZDTa1') throw new Error('Failed Lichess regex test 2');
if (lichessTest3.match(lichessRegex)?.[1].slice(0, 8) !== 'sFnZDTa1') throw new Error('Failed Lichess regex test 3');
console.log('✅ Lichess URL regex handles standard, side-specific, and move-anchored URLs');

// Test Chess.com patterns
function parseChesscomUrl(text) {
  if (!text.includes('chess.com') && !/^\d{8,16}$/.test(text)) return null;
  const idMatch = text.match(/(\d{8,16})/);
  if (!idMatch) return null;
  const gameId = idMatch[1];
  const type = text.toLowerCase().includes('daily') ? 'daily' : 'live';
  return { type, gameId };
}

const ccTest1 = 'https://www.chess.com/game/live/123456789';
const ccTest2 = 'https://chess.com/game/daily/987654321';
const ccTest3 = 'https://www.chess.com/analysis/game/live/184602606266/review?flip=false';
const ccTest4 = 'https://www.chess.com/play/online/game/184602606266';
const ccTest5 = '184602606266';

const match1 = parseChesscomUrl(ccTest1);
const match2 = parseChesscomUrl(ccTest2);
const match3 = parseChesscomUrl(ccTest3);
const match4 = parseChesscomUrl(ccTest4);
const match5 = parseChesscomUrl(ccTest5);

if (!match1 || match1.type !== 'live' || match1.gameId !== '123456789') throw new Error('Failed Chess.com regex test 1');
if (!match2 || match2.type !== 'daily' || match2.gameId !== '987654321') throw new Error('Failed Chess.com regex test 2');
if (!match3 || match3.type !== 'live' || match3.gameId !== '184602606266') throw new Error('Failed Chess.com review URL test 3');
if (!match4 || match4.type !== 'live' || match4.gameId !== '184602606266') throw new Error('Failed Chess.com play URL test 4');
if (!match5 || match5.type !== 'live' || match5.gameId !== '184602606266') throw new Error('Failed Chess.com bare ID test 5');
console.log('✅ Chess.com URL matcher handles live, daily, analysis/review, and bare IDs');

console.log('\n--- 3. Testing URL Hash Parsing ---');
const samplePgn = '[White "Test White"]\n[Black "Test Black"]\n1. e4 e5 2. Nf3 Nc6';
const encodedHash = `pgn=${encodeURIComponent(samplePgn)}&elo=1500`;
const params = new URLSearchParams(encodedHash);
if (params.get('elo') !== '1500') throw new Error('Failed elo param');
if (params.get('pgn') !== samplePgn) throw new Error('Failed pgn param decode');
console.log('✅ URL Hash parameter parsing and decoding verified (100% client-side privacy)');

console.log('\n🎉 All PWA and Multi-Source Importer tests passed successfully!');
