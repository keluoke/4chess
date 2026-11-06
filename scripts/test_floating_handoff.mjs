// Current packaged MV3 -> service worker -> local web-studio runtime. No public website is modified.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))).version;
const extension = path.join(root, 'releases', `diverge-extension-v${version}`);
assert(fs.existsSync(extension), 'Package the current extension first');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'diverge-handoff-'));
const server = http.createServer((req, res) => {
  let f = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.js':'application/javascript', '.css':'text/css', '.html':'text/html', '.wasm':'application/wasm', '.json':'application/json' })[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { channel: 'chromium', headless: true, locale: 'zh-CN', args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  await worker.evaluate(async () => {
    for (let n = 0; n < 50; n++) { if ((await chrome.storage.local.get('defaultElo')).defaultElo !== undefined) return; await new Promise(r => setTimeout(r, 20)); }
    throw new Error('Installation defaults did not initialize');
  });
  await context.route('https://weights.4chess.cc/**', r => r.abort());
  await context.route('https://4chess.cc/**', async r => { const u = new URL(r.request().url()); const response = await r.fetch({ url: origin + u.pathname + u.search }); await r.fulfill({ response }); });
  await worker.evaluate(() => chrome.storage.local.set({ maiaVariant: '5m', stockfishVariant: 'lite', defaultElo: 2050, maia3_lang: 'en', useWebReview: true }));
  const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup/popup.html`);
  const send = data => popup.evaluate(gameData => new Promise(resolve => chrome.runtime.sendMessage({ type: 'OPEN_ANALYSIS_TAB', gameData }, resolve)), data);
  const open = async data => {
    const pagePromise = context.waitForEvent('page'); const response = await send(data); assert.equal(response.ok, true);
    const page = await pagePromise; await page.waitForFunction(() => window.__maiaStudioApp?.positions.length);
    return { page, response };
  };
  const fen = '8/8/8/4k3/8/4K3/8/8 b - - 0 42';
  const position = await open({ fen, orientation: 'black', lang: 'en' });
  console.log('Position handoff URL', position.response.targetUrl);
  assert.match(position.response.targetUrl, /#fen=/);
  const loadedPosition = await position.page.evaluate(() => ({ fen: __maiaStudioApp.positions[0].fen, elo: __maiaStudioApp.currentElo, orientation: __maiaStudioApp.boardUI.orientation, language: document.documentElement.lang, model: __maiaStudioApp.modelVariant, engine: __maiaStudioApp.engineVariant, positionInput: __maiaStudioApp.hasAnalysisInput }));
  assert.equal(loadedPosition.fen, fen); assert.equal(loadedPosition.elo, 2050); assert.equal(loadedPosition.orientation, 'black'); assert.equal(loadedPosition.language, 'en'); assert.equal(loadedPosition.model, '5m'); assert.equal(loadedPosition.engine, 'lite');
  await position.page.close();
  const pgn = '[White "UX White"]\n[Black "UX Black"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0';
  const game = await open({ pgn, white: 'UX White', black: 'UX Black', result: '1-0', lang: 'en' });
  assert.match(game.response.targetUrl, /#pgn=/);
  const loadedGame = await game.page.evaluate(() => ({ moves: __maiaStudioApp.moves.length, white: document.querySelector('#meta-white').textContent, black: document.querySelector('#meta-black').textContent, result: document.querySelector('#meta-result').textContent, elo: __maiaStudioApp.currentElo }));
  assert.equal(loadedGame.moves, 4); assert.match(loadedGame.white, /UX White/); assert.match(loadedGame.black, /UX Black/); assert.match(loadedGame.result, /1-0/); assert.equal(loadedGame.elo, 2050);
  await game.page.close();
  const invalid = await send({ fen: 'invalid-fen' }); assert.equal(invalid.ok, false);
  await worker.evaluate(() => { globalThis.savedTabsCreate = chrome.tabs.create; chrome.tabs.create = (_options, callback) => callback(undefined); });
  const failedOpen = await send({ empty: true }); assert.equal(failedOpen.ok, false, 'A failed tab creation must never report success');
  await worker.evaluate(() => { chrome.tabs.create = globalThis.savedTabsCreate; delete globalThis.savedTabsCreate; });
  const empty = await open({ empty: true, lang: 'en' }); assert.equal(await empty.page.evaluate(() => __maiaStudioApp.moves.length), 0); await empty.page.close();
  // Local/offline studio must receive the same FEN and preferences, without relying on the public web.
  await worker.evaluate(() => chrome.storage.local.set({ useWebReview: false, maia3_lang: 'zh' }));
  const local = await open({ fen, orientation: 'black', lang: 'zh' });
  assert.match(local.response.targetUrl, /^chrome-extension:/);
  assert.equal(await local.page.evaluate(() => __maiaStudioApp.positions[0].fen), fen);
  assert.equal(await local.page.evaluate(() => __maiaStudioApp.currentElo), 2050);
  assert.equal(await local.page.locator('html').getAttribute('lang'), 'zh-CN'); await local.page.close();
  console.log('PASS packaged MV3 handoff: web and local FEN, orientation, non-preset Elo, language, model/engine preferences, completed PGN metadata, invalid FEN rejection and empty import recovery');
} finally { await context.close(); server.close(); fs.rmSync(temp, { recursive: true, force: true }); }
