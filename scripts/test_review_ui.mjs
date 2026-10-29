// Browser regression: real Stockfish WASM, deterministic Maia fixture for repeatable UI checks.
// Set PLAYWRIGHT_MODULE to an installed Playwright ESM entrypoint if it isn't a local dependency.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const staleAssets = new Map(['analysis.css', 'i18n.js'].map(name => [
  `/analysis/${name}`, execFileSync('git', ['show', `c669463:analysis/${name}`], { cwd: root })
]));
let staleRequests = 0;
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (staleAssets.has(url.pathname) && !url.searchParams.has('v')) {
    staleRequests++;
    res.writeHead(200, { 'Content-Type': mime[path.extname(url.pathname)], 'Cache-Control': 'public, max-age=14400' });
    res.end(staleAssets.get(url.pathname));
    return;
  }
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
  assert.equal(await page.locator('.candidate-line').count(), 0);
  assert.equal(await page.locator('.candidate-heading').first().evaluate(el => getComputedStyle(el).display), 'flex', 'New UI styling must not reuse the previous cached CSS');
  for (const id of ['btn-lang-toggle', 'btn-import-pgn', 'btn-reanalyze', 'btn-first', 'btn-prev', 'btn-play', 'btn-next', 'btn-last', 'btn-flip', 'btn-sound']) assert.equal(await page.locator(`#${id}`).count(), 1);
  assert.equal(await page.locator('#icon-sound-on polygon').count(), 1);
  assert.equal(await page.locator('#btn-settings').innerText(), '', 'Settings button is icon-only');
  assert.equal(await page.locator('#tab-moves, #tab-blunders').count(), 0);
  assert.equal(await page.locator('.position-analysis-heading, #btn-position-current, #btn-position-before, #position-turn').count(), 0);
  await page.evaluate(async () => {
    const { ChessBoard } = await import('./../engine/chess-core.js');
    const app = window.__maiaStudioApp;
    const waiting = new Promise(resolve => { window.releaseTestMaia = resolve; });
    app.maiaEngine.initialize = async () => { await waiting; app.maiaEngine.isReady = true; };
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
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.maiaEngine.isReady), false, 'Scores render before delayed Maia initializes');
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3);
  assert.equal(await page.locator('#engine-candidate-lines').isVisible(), true, 'Engine variations remain visible while Maia waits');
  const coreAccuracy = await page.locator('#val-accuracy-white').textContent();
  await page.locator('#intuition-toggle').click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.intuitionReview.state), 'paused');
  assert.equal(await page.locator('#val-accuracy-white').textContent(), coreAccuracy);
  await page.evaluate(() => window.releaseTestMaia());
  await page.locator('#intuition-toggle').click();
  await page.waitForFunction(() => window.__maiaStudioApp.intuitionReview.state === 'done', null, { timeout: 60000 });
  assert.equal(await page.locator('#val-accuracy-white').textContent(), coreAccuracy, 'Intuition enrichment does not rescore the game');
  assert.equal(await page.locator('#candidate-comparison').count(), 0);
  assert.equal(await page.locator('#maia-candidate-lines').isVisible(), true);
  assert.doesNotMatch(await page.locator('#val-accuracy-white').textContent(), /%/);
  assert.doesNotMatch(await page.locator('#val-accuracy-black').textContent(), /%/);
  assert.match(await page.locator('#accuracy-detail-black').textContent(), /\d+\/\d+/);
  assert(await page.locator('#val-accuracy-black').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 28));
  await page.locator('.accuracy-method summary').click();
  assert.match(await page.locator('#accuracy-analysis-detail').textContent(), /D12/);
  assert.match(await page.locator('.accuracy-method p').first().textContent(), /调和平均/);
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  await page.locator('#review-summary').screenshot({ path: path.join(root, 'artifacts/accuracy-review-desktop.png') });
  await page.locator('.accuracy-method summary').click();
  await page.screenshot({ path: path.join(root, 'artifacts/studio-columns-desktop.png') });
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#review-summary').screenshot({ path: path.join(root, 'artifacts/accuracy-review-mobile.png') });
  await page.screenshot({path:path.join(root,'artifacts/studio-columns-mobile.png'),fullPage:true});
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator('#move-ply-4').click();
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3, null, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#maia-candidate-lines .candidate-line').length === 3);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.chess.getFen() === window.__maiaStudioApp.positionAnalysis.context().fen), true);
  const score = await page.locator('#evaluation-gauge').innerText();
  await page.locator('#btn-flip').click();
  assert.equal(await page.locator('#evaluation-gauge').innerText(), score, 'Flip preserves White-centric score and its sign');
  assert.match(await page.locator('#evaluation-gauge').getAttribute('class'), /flipped/);
  await page.evaluate(() => window.__maiaStudioApp.goToPly(4, { before: true }));
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.chess.getFen() === window.__maiaStudioApp.positions[3].fen), true);
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3);
  await page.locator('#engine-candidate-lines .candidate-move').first().click();
  assert.equal(await page.locator('#branch-banner').isVisible(), true);
  assert.doesNotMatch(await page.locator('#branch-banner').innerText(), /🌿|探索其他可能/);
  await page.waitForFunction(() => window.__maiaStudioApp.evalChart.branch?.points.every(p => Number.isFinite(p.cp)), null, {timeout:30000});
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.evalChart.branch.basePly), 3, 'Before-move rehearsal branches from the displayed position');
  assert.equal(await page.locator('#move-notation-table .study-branches').count(), 1, 'Branch is embedded in notation');
  await page.screenshot({path:path.join(root,'artifacts/studio-columns-branch.png')});
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.branchFen === window.__maiaStudioApp.boardUI.chess.getFen()), true);
  await page.locator('#btn-first').click();
  await page.locator('#btn-prev').click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.currentPly), 2, 'Rewinding past a before-move fork goes to the preceding mainline position');
  await page.locator('#move-notation-table .study-branch').first().click();
  await page.locator('#btn-exit-branch').click();
  assert.equal(await page.locator('#branch-banner').isVisible(), false);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.chess.getFen() === window.__maiaStudioApp.positions[4].fen), true);
  const reportBeforeBranch = await page.evaluate(() => JSON.stringify(window.__maiaStudioApp.reviewResult));
  await page.evaluate(async () => {
    const app = window.__maiaStudioApp;
    const { legalVariation } = await import('./position-analysis.js?v=20261029-workbench');
    const initialize = app.maiaEngine.initialize;
    const waiting = new Promise(resolve => { window.releaseBranchMaia = () => { app.maiaEngine.initialize = initialize; resolve(); }; });
    app.maiaEngine.initialize = () => waiting;
    app.goToPly(0);
    app.previewCandidate(app.positionAnalysis.context(), legalVariation(app.positions[0].fen, ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','f8e7','e2e3','e8g8']));
  });
  await page.waitForFunction(() => window.__maiaStudioApp.evalChart.branch?.points.every(p => Number.isFinite(p.cp)), null, {timeout:90000});
  await page.evaluate(() => window.releaseBranchMaia());
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.evalChart.maxPly), 10, 'Shared axis extends beyond the eight-ply original game');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__maiaStudioApp.reviewResult)), reportBeforeBranch, 'Branch exploration preserves the original report');
  await page.locator('#eval-branch-dots [data-offset="3"]').click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.activeBranch.cursor), 3);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.chess.getFen() === window.__maiaStudioApp.activeBranch.moves[2].fen), true);
  await page.locator('#btn-next').click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.activeBranch.cursor), 4);
  assert.notEqual(await page.locator('#position-score').textContent(), '—', 'Visited branch score is immediately available during deeper foreground analysis');
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3);
  await page.screenshot({path:path.join(root,'artifacts/workbench-branch-desktop.png')});
  await page.locator('#btn-focus').click();
  assert.equal(await page.locator('.insight-column').isVisible(), false);
  assert.equal(await page.locator('#btn-focus').getAttribute('aria-pressed'), 'true');
  await page.screenshot({path:path.join(root,'artifacts/workbench-focus-desktop.png')});
  await page.locator('#btn-focus').click();
  await page.locator('[data-theme-toggle]').click();
  await page.waitForTimeout(350);
  await page.screenshot({path:path.join(root,'artifacts/workbench-dark-desktop.png')});
  await page.locator('[data-theme-toggle]').click();
  await page.locator('#btn-exit-branch').click();
  assert.equal(await page.locator('#eval-branch-dots circle').count(), 0);
  const sound = await page.locator('#btn-sound').getAttribute('aria-pressed');
  await page.locator('#btn-sound').click();
  assert.notEqual(await page.locator('#btn-sound').getAttribute('aria-pressed'), sound);
  await page.locator('#btn-lang-toggle').click();
  assert.match(await page.locator('#accuracy-detail-black').textContent(), /moves evaluated/);
  assert.match(await page.locator('.eval-chart-title').textContent(), /Evaluation/);
  assert.match(await page.locator('.accuracy-method p').first().textContent(), /harmonic/);
  assert.equal(await page.locator('#meta-white').textContent(), '⚪ Whitehouse');
  assert.equal(await page.locator('#meta-black').textContent(), '⚫ Blackwell');
  assert.equal(await page.locator('#meta-result').textContent(), '1-0');
  await page.locator('#btn-settings').click();
  assert.equal(await page.locator('#review-settings').getAttribute('aria-label'), 'Analysis settings');
  await page.locator('#setting-arrows').uncheck();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.arrows.length), 0);
  await page.locator('#setting-probability').uncheck();
  assert.equal(await page.locator('.candidate-probability').count(), 0);
  await page.locator('#setting-heatmap').check();
  await page.waitForFunction(() => document.querySelectorAll('.intuition-heat').length > 0, null, { timeout: 20000 });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#review-settings').isVisible(), false);
  // Switching Maia retains the engine report and does not start whole-game SF again.
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    window.coreBeforeSwitch = app.coreReview;
    window.primaryWorkerBeforeSwitch = app.stockfish.worker;
    const originalInit = app.initEngines.bind(app);
    const predict = app.maiaEngine.predict;
    app.initEngines = options => {
      originalInit(options);
      app.maiaEngine.initialize = async () => { app.maiaEngine.isReady = true; };
      app.maiaEngine.predict = predict;
    };
  });
  await page.locator('#btn-settings').click();
  await page.locator('#intuition-edition').selectOption('23m');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.coreReview === window.coreBeforeSwitch), true);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.stockfish.worker === window.primaryWorkerBeforeSwitch), true);
  await page.waitForFunction(() => window.__maiaStudioApp.intuitionReview.state === 'done', null, { timeout:60000 });
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
  await page.locator('.practice-start').click();
  assert.equal(await page.locator('#practice-panel').isVisible(), true);
  assert.equal(await page.locator('.position-analysis').isVisible(), false);
  assert.equal(await page.locator('.notation-section').isVisible(), false);
  assert.equal(await page.locator('.eval-chart-wrapper').isVisible(), false);
  await page.screenshot({ path: path.join(root, 'artifacts/studio-practice-desktop.png') });
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.arrows.length), 0);
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    const move = app.boardUI.chess.getLegalMoves().find(m => m.uci === 'f7f6');
    app.boardUI.chess.makeMove(move);
    app.handleUserBoardMove(move, app.boardUI.chess.getFen());
  });
  await page.waitForFunction(() => !window.__maiaStudioApp.practice.busy, null, { timeout: 20000 });
  assert.match(await page.locator('#practice-panel [role="status"]').textContent(), /loses ground/);
  assert.equal(await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    return app.boardUI.chess.getFen() === app.practice.item.fenBefore;
  }), true, 'Unsuccessful attempt returns to the original position without revealing answers');
  await page.locator('#practice-panel button').click();
  assert.equal(await page.locator('.position-analysis').isVisible(), true);
  assert.equal(await page.locator('#practice-panel').isVisible(), false);
  // Fast navigation and a new game must leave every row bound to the final visible position.
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    for (const ply of [1, 5, 2, 7, 3]) app.goToPly(ply);
    app.loadGameFromPgn('[White "New game"]\n[Result "0-1"]\n1. d4 d5 2. c4 e6 0-1', false);
    app.goToPly(2);
  });
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3);
  assert.equal(await page.locator('#review-summary').isVisible(), false, 'New game cannot retain the preceding report');
  assert.equal(await page.locator('#move-notation-table .study-branches').count(), 0, 'New game clears saved branches');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.evalChart.branch), null);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.chess.getFen() === window.__maiaStudioApp.positionAnalysis.active.ctx.fen), true);
  await page.evaluate(() => {
    const text = Array.from({ length: 20 }, (_, i) => `${2 * i + 1}. Nf3 Nf6 ${2 * i + 2}. Ng1 Ng8`).join(' ');
    window.__maiaStudioApp.loadGameFromPgn(`[Result "1/2-1/2"]\n${text} 1/2-1/2`, false);
    window.__maiaStudioApp.goToPly(80, { silent: true });
  });
  assert.equal(await page.locator('#move-ply-80').count(), 1, 'A long game retains its complete notation');
  assert.equal(await page.locator('#move-notation-table').evaluate(el => el.clientHeight <= 260 && el.scrollHeight > el.clientHeight), true, 'Long notation scrolls within its section');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    app.renderBlunderCards(Array.from({ length: 40 }, (_, i) => ({
      ply: i * 2 + 2, san: app.positions[i * 2 + 2].san, turn: 'b', moveNumber: i + 1,
      fenBefore: app.positions[i * 2 + 1].fen, divergenceType: 'intuition_trap',
      maiaTopSan: 'e5', maiaTopProb: 38, maiaTop1Loss: 1.2, lossPawns: 1.2
    })));
    document.activeElement?.blur();
  });
  const boardBox = await page.locator('#board-container').boundingBox();
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.currentPly), 80);
  assert.deepEqual(await page.locator('#board-container').boundingBox(), boardBox, 'Keyboard navigation must leave board position and size unchanged');
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.equal(await page.locator('.insight-column').evaluate(el => el.scrollTop > 0), true, 'Current key move scrolls only the right review column');
  await page.locator('.insight-column').hover();
  await page.mouse.wheel(0, -650);
  await page.waitForTimeout(200);
  assert.deepEqual(await page.locator('#board-container').boundingBox(), boardBox, 'Scrolling the right column must not move the board');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#move-notation-table').evaluate(el => el.scrollTop), 0);
  await page.locator('#btn-settings').click();
  assert.equal(await page.locator('#engine-edition option[value="standard"]').textContent(), 'SF19 Standard');
  assert.equal(await page.locator('#intuition-edition option[value="79m"]').textContent(), 'Maia-3 79M');
  assert.deepEqual(await page.locator('#intuition-edition option').allTextContents(), ['Maia-3 5M', 'Maia-3 23M', 'Maia-3 79M']);
  await page.keyboard.press('Escape');
  for (const width of [320, 390, 736, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
  }
  assert.equal(await page.evaluate(async () => {
    const { ModelCache } = await import('../engine/model-cache.js');
    const buffer = new Uint8Array(64 * 1024 * 1024 + 7);
    for (const index of [0, 32 * 1024 * 1024 - 1, 32 * 1024 * 1024, buffer.length - 1]) buffer[index] = 71;
    await ModelCache.saveModel('small-fixture', new Uint8Array([8, 9]).buffer);
    if (!await ModelCache.saveModel('chunked-fixture', buffer.buffer)) return false;
    const restored = new Uint8Array(await ModelCache.getModel('chunked-fixture'));
    if (restored.length !== buffer.length || [0, 32 * 1024 * 1024 - 1, 32 * 1024 * 1024, buffer.length - 1].some(index => restored[index] !== 71)) return false;
    await ModelCache.clearCache('chunked-fixture');
    return await ModelCache.getModel('chunked-fixture') === null && (await ModelCache.getModel('small-fixture')).byteLength === 2;
  }), true, 'Chunked IndexedDB weights round-trip across boundaries; clearing one model preserves another');
  assert.deepEqual(errors, []);
  assert.equal(staleRequests, 0, 'Versioned style and shared translations bypass the deliberately stale four-hour responses');
  console.log('✅ Workbench passed: branch curves without Maia readiness, extended axis, chart/board/notation navigation, report isolation, focus mode and light/dark themes. Split review, retry, settings, stale-game isolation and responsive widths passed with real Stockfish and deterministic Maia fixtures.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
