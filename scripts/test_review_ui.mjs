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
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/analysis/?lang=zh`);
  await page.waitForFunction(() => window.__maiaStudioApp?.positions?.length);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => [...document.fonts].some(f => f.family === 'Inter' && f.status === 'loaded')), true, 'Bundled Inter actually loads');
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
  // Exercise actual Web Animations against rendered pieces, including interruption,
  // castling and changing reduced-motion while an animation is running.
  const motionFixture = await page.evaluate(async () => {
    const { ChessBoard } = await import('../engine/chess-core.js');
    const board = window.__maiaStudioApp.boardUI;
    const start = new ChessBoard().getFen();
    const chess = new ChessBoard(start);
    chess.makeMove(chess.getLegalMoves().find(m => m.uci === 'e2e4'));
    const moved = chess.getFen();
    board.setPosition(start);
    board.setPosition(moved, { from: 'e2', to: 'e4' });
    const animated = board.squareEls.e4.querySelector('.maia-piece').getAnimations().length;
    board.setPosition(start);
    board.setPosition(moved, { from: 'e2', to: 'e4' });
    const concurrent = board.container.getAnimations({ subtree: true }).filter(a => a.effect.target.classList.contains('maia-piece')).length;
    const castle = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const c = new ChessBoard(castle);
    c.makeMove(c.getLegalMoves().find(m => m.uci === 'e1g1'));
    board.setPosition(castle);
    board.setPosition(c.getFen(), { from: 'e1', to: 'g1' });
    const castling = ['g1','f1'].map(sq => board.squareEls[sq].querySelector('.maia-piece').getAnimations().length);
    window.motionFixture = { start, moved };
    return { animated, concurrent, castling, fen: board.chess.getFen(), expected: c.getFen() };
  });
  assert.equal(motionFixture.animated, 1);
  assert.equal(motionFixture.concurrent, 1, 'Rapid navigation cancels earlier piece motion');
  assert.deepEqual(motionFixture.castling, [1, 1], 'King and rook animate together');
  assert.equal(motionFixture.fen, motionFixture.expected, 'Logical board settles before animation');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => {
    const board = window.__maiaStudioApp.boardUI;
    board.setPosition(window.motionFixture.start);
    board.setPosition(window.motionFixture.moved);
    return board.container.getAnimations({ subtree: true }).length;
  }), 0, 'Reduced motion cancels in-flight animations and suppresses new ones');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#btn-import-pgn').click();
  await page.locator('#pgn-input').fill('[White "Whitehouse"]\n[Black "Blackwell"]\n[Result "1-0"]\n1. e4 e5 2. Nf3 f6 3. Nxe5 fxe5 4. Qh5+ Ke7 1-0');
  await page.locator('#btn-submit-pgn').click();
  await page.waitForFunction(() => window.__maiaStudioApp.reviewResult, null, { timeout: 60000 });
  assert.equal(await page.locator('#review-summary').isVisible(), true);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.maiaEngine.isReady), false, 'Scores render before delayed Maia initializes');
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3);
  assert.equal(await page.locator('#engine-candidate-lines').isVisible(), true, 'Engine variations remain visible while Maia waits');
  assert.equal(await page.locator('#position-score').evaluate(el => getComputedStyle(el).fontSize), '48px');
  assert.equal(await page.locator('.candidate-move').first().evaluate(el => getComputedStyle(el).fontSize), '14px');
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
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    app.highlightMoveRow(3); app.highlightMoveRow(4);
  });
  assert.equal(await page.locator('#move-ply-4 .notation-selection').evaluate(el => el.getAnimations().some(a => a.effect.target === el)), true, 'Highlight slides independently of notation text');
  assert.equal(await page.locator('#move-ply-4').evaluate(el => getComputedStyle(el).transform), 'none');
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
  // Ultra-wide study desk must enlarge the real board without losing chart state.
  await page.setViewportSize({ width:2560, height:1080 });
  await page.waitForFunction(() => document.querySelector('#eval-chart-container').parentElement.matches('.analysis-column'));
  const wideBoard = await page.locator('#board-container').boundingBox();
  assert(wideBoard.width >= 760 && wideBoard.width <= 830, `Ultra-wide board is ${wideBoard.width}px`);
  assert(Math.abs(wideBoard.width - wideBoard.height) < 1, 'Wide board remains square');
  assert.equal(await page.locator('.board-controls').first().evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true);
  assert.equal(await page.locator('#eval-chart-container').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#eval-branch-dots [data-offset="3"]').click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.activeBranch.cursor), 3, 'Relocated chart still selects branch positions');
  assert.equal(await page.evaluate(() => JSON.stringify(window.__maiaStudioApp.reviewResult)), reportBeforeBranch);
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3);
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(root,'artifacts/workbench-ultrawide-2560.png')});
  await page.locator('[data-theme-toggle]').click();
  await page.waitForTimeout(200);
  await page.screenshot({path:path.join(root,'artifacts/workbench-ultrawide-dark.png')});
  await page.locator('[data-theme-toggle]').click();
  await page.locator('#btn-focus').click();
  await page.waitForTimeout(280);
  assert.equal(await page.locator('.insight-column').isVisible(), false);
  assert.equal(await page.locator('#eval-chart-container').isVisible(), true);
  assert((await page.locator('#board-container').boundingBox()).width >= wideBoard.width);
  await page.locator('#btn-focus').click();
  await page.waitForTimeout(280);
  const divider = page.locator('.divider-board');
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  assert((await page.locator('#board-container').boundingBox()).width < wideBoard.width, 'Keyboard divider resizes board');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.activeBranch.cursor), 3, 'Divider arrow keys do not navigate chess moves');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('diverge-study-columns-v1')));
  assert(stored.board > 0, 'Column preference persists');
  const savedWidth = (await page.locator('#board-container').boundingBox()).width;
  const reopened = await page.context().newPage();
  await reopened.setViewportSize({width:2560,height:1080});
  await reopened.goto(`http://127.0.0.1:${server.address().port}/analysis/?lang=zh`);
  await reopened.waitForFunction(() => !!window.__maiaStudioApp?.positions.length);
  await reopened.evaluate(() => {
    const app = window.__maiaStudioApp;
    app.positionAnalysis.refresh = () => {};
    app.startNewSession({pgn:'[Result "1-0"]\n1. e4 e5 1-0',autoReview:false});
  });
  await reopened.waitForTimeout(100);
  assert(Math.abs((await reopened.locator('#board-container').boundingBox()).width - savedWidth) < 1, 'New page restores divider preference');
  await reopened.close();
  await page.keyboard.press('Home');
  assert(Math.abs((await page.locator('#board-container').boundingBox()).width - wideBoard.width) < 1, 'Home resets width');
  const dividerBox = await divider.boundingBox();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + 100);
  await page.mouse.down();await page.mouse.move(dividerBox.x - 80, dividerBox.y + 100);await page.mouse.up();
  assert((await page.locator('#board-container').boundingBox()).width < wideBoard.width - 60, 'Pointer divider resizes board');
  await divider.dblclick();
  await page.locator('.divider-insight').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.keyboard.press('Home');
  for (const size of [{width:1920,height:1080},{width:2560,height:900},{width:1800,height:720},{width:2560,height:560}]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No wide overflow at ${size.width}x${size.height}`);
    assert.equal(await page.locator('.board-column .board-controls').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true, 'Controls fit short wide screens');
    await divider.focus();
    for(let i=0;i<20;i++) await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Dragged column is bounded after viewport resize');
    assert.equal(await page.locator('.board-column .board-controls').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true, 'Resized board respects available height');
    await page.keyboard.press('Home');
  }
  await page.setViewportSize({width:1440,height:1100});
  await page.waitForFunction(() => document.querySelector('#eval-chart-container').parentElement.matches('.board-column'));
  assert.equal(await page.locator('#eval-chart-container').count(), 1, 'Breakpoint relocation never duplicates the chart');
  await page.locator('#btn-focus').click();
  assert.equal(await page.locator('.insight-column').isVisible(), false);
  assert.equal(await page.locator('#btn-focus').getAttribute('aria-pressed'), 'true');
  await page.screenshot({path:path.join(root,'artifacts/workbench-focus-desktop.png')});
  await page.locator('#btn-focus').click();
  const frameSample = await page.evaluate(() => new Promise(resolve => {
    const deltas = []; let previous, frame = 0;
    function tick(now) {
      if (previous !== undefined) deltas.push(now - previous);
      previous = now;
      if ([0, 8, 16, 24].includes(frame)) document.getElementById('btn-focus').click();
      if (++frame < 60) requestAnimationFrame(tick);
      else resolve({ frames: deltas.length, maxMs: Math.max(...deltas), over50ms: deltas.filter(ms => ms > 50).length });
    }
    requestAnimationFrame(tick);
  }));
  fs.writeFileSync(path.join(root, 'artifacts/workbench-motion-frames.json'), JSON.stringify({ ...frameSample, scope: 'Local headless browser; real Stockfish, deterministic Maia; not a device performance benchmark' }, null, 2));
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.insight-column').isVisible(), true, 'Interrupted focus transitions retain final layout');
  assert.equal(await page.locator('.board-column').evaluate(el => getComputedStyle(el).transform), 'none');
  await page.locator('[data-theme-toggle]').click();
  await page.waitForTimeout(350);
  await page.screenshot({path:path.join(root,'artifacts/workbench-dark-desktop.png')});
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(root, 'artifacts/workbench-dark-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: path.join(root, 'artifacts/workbench-dark-mobile-board.png') });
  await page.locator('.position-analysis').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, 'artifacts/workbench-dark-mobile-analysis.png') });
  await page.evaluate(() => scrollTo(0, 0));
  await page.setViewportSize({ width: 1440, height: 1100 });
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
  assert.equal(await page.locator('.eval-chart-wrapper').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true, 'Chart remains inside desktop viewport');
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
