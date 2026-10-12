// Browser regression: real Stockfish WASM, deterministic Maia fixture for repeatable UI checks.
// Set PLAYWRIGHT_MODULE to an installed Playwright ESM entrypoint if it isn't a local dependency.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/analysis/?lang=zh`);
  await page.waitForFunction(() => window.__maiaStudioApp?.positions?.length);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.stockfish.isReady), false, 'Blank landing must not initialize an engine');
  assert.equal(await page.locator('#text-status-sf').textContent(), '未启动');
  for (const id of ['btn-lang-toggle', 'btn-import-pgn', 'btn-reanalyze', 'btn-first', 'btn-prev', 'btn-play', 'btn-next', 'btn-last', 'btn-flip', 'btn-sound']) assert.equal(await page.locator(`#${id}`).count(), 1);
  assert.equal(await page.locator('#icon-sound-on polygon').count(), 1);
  assert.equal(await page.locator('#btn-settings').innerText(), '', 'Settings button is icon-only');
  assert.equal(await page.locator('#tab-moves, #tab-blunders').count(), 0);
  await page.evaluate(async () => {
    const { ChessBoard } = await import('./../engine/chess-core.js');
    const app = window.__maiaStudioApp;
    app.maiaEngine.initialize = async () => { app.maiaEngine.isReady = true; };
    app.maiaEngine.predict = async (fen, elo, sf, abort) => {
      await new Promise(resolve => setTimeout(resolve, 35));
      if (abort?.()) return null;
      return { moves: new ChessBoard(fen).getLegalMoves().slice(0, 3).map((move, index) => ({ ...move, prob: [37, 23, 12][index] })), heatmap: Array(64).fill(.2) };
    };
  });
  await page.locator('#btn-import-pgn').click();
  await page.locator('#pgn-input').fill('[White "Whitehouse"]\n[Black "Blackwell"]\n[Result "1-0"]\n1. e4 e5 2. Nf3 f6 3. Nxe5 fxe5 4. Qh5+ Ke7 1-0');
  await page.locator('#btn-submit-pgn').click();
  await page.waitForFunction(() => window.__maiaStudioApp.reviewResult, null, { timeout: 60000 });
  assert.equal(await page.locator('#review-summary').isVisible(), true);
  assert.doesNotMatch(await page.locator('#val-accuracy-white').textContent(), /%/);
  assert.doesNotMatch(await page.locator('#val-accuracy-black').textContent(), /%/);
  await page.locator('#move-ply-4').click();
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3, null, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#maia-candidate-lines .candidate-line').length === 3);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.chess.getFen() === window.__maiaStudioApp.positionAnalysis.context().fen), true);
  const score = await page.locator('#evaluation-gauge').innerText();
  await page.locator('#btn-flip').click();
  assert.equal(await page.locator('#evaluation-gauge').innerText(), score, 'Flip preserves White-centric score and its sign');
  assert.match(await page.locator('#evaluation-gauge').getAttribute('class'), /flipped/);
  await page.locator('#btn-position-before').click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.chess.getFen() === window.__maiaStudioApp.positions[3].fen), true);
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3);
  await page.locator('#engine-candidate-lines .candidate-move').first().click();
  assert.equal(await page.locator('#branch-banner').isVisible(), true);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.branchFen === window.__maiaStudioApp.boardUI.chess.getFen()), true);
  await page.locator('#btn-exit-branch').click();
  assert.equal(await page.locator('#branch-banner').isVisible(), false);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.chess.getFen() === window.__maiaStudioApp.positions[4].fen), true);
  const sound = await page.locator('#btn-sound').getAttribute('aria-pressed');
  await page.locator('#btn-sound').click();
  assert.notEqual(await page.locator('#btn-sound').getAttribute('aria-pressed'), sound);
  await page.locator('#btn-lang-toggle').click();
  assert.equal(await page.locator('#meta-white').textContent(), '⚪ Whitehouse');
  assert.equal(await page.locator('#meta-black').textContent(), '⚫ Blackwell');
  assert.equal(await page.locator('#meta-result').textContent(), '1-0');
  await page.locator('#btn-settings').click();
  assert.equal(await page.locator('#review-settings').getAttribute('aria-label'), 'Review settings');
  await page.locator('#setting-arrows').uncheck();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.arrows.length), 0);
  await page.locator('#setting-probability').uncheck();
  assert.equal(await page.locator('.candidate-probability').count(), 0);
  await page.locator('#setting-heatmap').check();
  await page.waitForFunction(() => document.querySelectorAll('.intuition-heat').length > 0, null, { timeout: 20000 });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#review-settings').isVisible(), false);
  // Explicit fixtures exercise both key-move lists without implying real Maia classification evidence.
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    const record = app.reviewResult.allMoves[3];
    app.reviewResult.keyMoments = [{ ...record, divergenceType: 'intuition_trap' }, { ...app.reviewResult.allMoves[6], divergenceType: 'beyond_intuition' }];
    app.applyReviewResult(app.reviewResult);
  });
  await page.locator('[data-filter="beyond"]').click();
  assert.equal(await page.locator('.blunder-card').count(), 1);
  await page.locator('[data-filter="trap"]').click();
  assert.equal(await page.locator('.blunder-card').count(), 1);
  await page.locator('.blunder-card').click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.isReviewingMove), true);
  // Fast navigation and a new game must leave every row bound to the final visible position.
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    for (const ply of [1, 5, 2, 7, 3]) app.goToPly(ply);
    app.loadGameFromPgn('[White "New game"]\n[Result "0-1"]\n1. d4 d5 2. c4 e6 0-1', false);
    app.goToPly(2);
  });
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3);
  assert.equal(await page.locator('#review-summary').isVisible(), false, 'New game cannot retain the preceding report');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.chess.getFen() === window.__maiaStudioApp.positionAnalysis.active.ctx.fen), true);
  await page.evaluate(() => {
    const text = Array.from({ length: 20 }, (_, i) => `${2 * i + 1}. Nf3 Nf6 ${2 * i + 2}. Ng1 Ng8`).join(' ');
    window.__maiaStudioApp.loadGameFromPgn(`[Result "1/2-1/2"]\n${text} 1/2-1/2`, false);
    window.__maiaStudioApp.goToPly(80, { silent: true });
  });
  assert.equal(await page.locator('#move-ply-80').count(), 1, 'A long game retains its complete notation');
  assert.equal(await page.locator('#move-notation-table').evaluate(el => el.clientHeight <= 260 && el.scrollHeight > el.clientHeight), true, 'Long notation scrolls within its section');
  for (const width of [320, 390, 736, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
  }
  assert.deepEqual(errors, []);
  console.log('✅ Browser UI passed: real Stockfish, bilingual layout, original controls, before/after positions, candidate rehearsal, settings, heatmap, sound, key filters, stale-game isolation and responsive widths. Maia uses a deterministic fixture in this regression.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
