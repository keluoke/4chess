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
  await worker.evaluate(() => chrome.storage.local.set({ studio_orientation: 'white' }));
  const game = await open({ pgn, orientation: 'black', white: 'UX White', black: 'UX Black', result: '1-0', lang: 'en' });
  assert.match(game.response.targetUrl, /#pgn=/);
  assert.equal(new URLSearchParams(new URL(game.response.targetUrl).hash.slice(1)).get('orientation'), 'black');
  assert.equal(await game.page.evaluate(() => __maiaStudioApp.boardUI.orientation), 'black');
  assert.equal(await game.page.locator('#setting-orientation').inputValue(), 'black');
  const loadedGame = await game.page.evaluate(() => ({ moves: __maiaStudioApp.moves.length, white: document.querySelector('#meta-white').textContent, black: document.querySelector('#meta-black').textContent, result: document.querySelector('#meta-result').textContent, elo: __maiaStudioApp.currentElo }));
  assert.equal(loadedGame.moves, 4); assert.match(loadedGame.white, /UX White/); assert.match(loadedGame.black, /UX Black/); assert.match(loadedGame.result, /1-0/); assert.equal(loadedGame.elo, 2050);
  await game.page.close();
  const whiteGame = await open({ pgn, orientation: 'white' });
  assert.equal(await whiteGame.page.evaluate(() => __maiaStudioApp.boardUI.orientation), 'white', 'Explicit white overrides the previously used black view');
  await whiteGame.page.close();
  // Actual panel click: read a DOM flip synchronously, then preserve that snapshot while PGN extraction yields.
  for (const platform of ['chesscom', 'lichess']) {
    const sourceUrl = platform === 'chesscom' ? 'https://www.chess.com/analysis/orientation-fixture' : 'https://lichess.org/analysis/orientation-fixture';
    const board = platform === 'chesscom' ? '<wc-chess-board style="display:block;width:320px;height:320px"></wc-chess-board>' : '<div class="cg-wrap"><cg-board style="display:block;width:320px;height:320px"></cg-board></div>';
    await context.route(sourceUrl, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>' + board + '</body>' }));
    const host = await context.newPage(); await host.goto(sourceUrl);
    await host.waitForFunction(() => document.querySelector('#maia3-intuition-panel')?.dataset.fairPlayLocked === 'false');
    const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url).id, sourceUrl);
    const openedPage = context.waitForEvent('page');
    await worker.evaluate(async ({ tabId, id, platform, pgn }) => {
      await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', func: async ({ id, platform, pgn }) => {
        const { GameAnalyzer } = await import(`chrome-extension://${id}/engine/game-analyzer.js`);
        let release;
        GameAnalyzer.extractPageMoves = () => new Promise(resolve => { release = () => {
          const moves = [{ san: 'e4', ply: 1 }, { san: 'e5', ply: 2 }, { san: 'Nf3', ply: 3 }, { san: 'Nc6', ply: 4 }];
          moves.result = '1-0'; moves.rawPgn = pgn; resolve(moves);
        }; });
        const board = document.querySelector(platform === 'chesscom' ? 'wc-chess-board' : '.cg-wrap');
        const flipped = platform === 'chesscom' ? 'flipped' : 'orientation-black';
        board.classList.add(flipped);
        const button = document.querySelector('#btn-trigger-standalone');
        if (button.disabled) throw new Error('Analysis action must be unlocked');
        button.click();
        if (!release) throw new Error('Click did not start game extraction');
        board.classList.remove(flipped); // The view changes during async extraction.
        release();
      }, args: [{ id, platform, pgn }] });
    }, { tabId, id, platform, pgn });
    const opened = await openedPage;
    await opened.waitForFunction(() => window.__maiaStudioApp?.moves.length === 4);
    assert.equal(await opened.evaluate(() => __maiaStudioApp.boardUI.orientation), 'black', `${platform}: preserve the direction at click time, before the flip observer/PGN completion`);
    await opened.close(); await host.close();
  }

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
  await worker.evaluate(() => chrome.storage.local.set({ studio_orientation: 'white' }));
  const localGame = await open({ pgn, orientation: 'black' });
  assert.equal(await localGame.page.evaluate(() => __maiaStudioApp.boardUI.orientation), 'black');
  assert.equal(await localGame.page.locator('#setting-orientation').inputValue(), 'black');
  await localGame.page.close();
  // Storage-only launch (legacy/offline): a stored game can carry its own view without URL intent.
  await worker.evaluate(() => chrome.storage.local.set({ studio_orientation: 'white' }));
  const storedGame = await context.newPage();
  await storedGame.goto(`chrome-extension://${id}/analysis/index.html`);
  await storedGame.waitForFunction(() => window.__maiaStudioApp?.moves.length === 4);
  assert.equal(await storedGame.evaluate(() => __maiaStudioApp.boardUI.orientation), 'black');
  await storedGame.close();
  console.log('PASS packaged MV3 handoff: web/local FEN and PGN orientation, both platform panel clicks and delayed extraction snapshots, white/black preference overrides, storage-only view, rating/language/model preferences and invalid-input recovery');
} finally { await context.close(); server.close(); fs.rmSync(temp, { recursive: true, force: true }); }
