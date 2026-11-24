import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'artifacts/review-explorer-20261110'); fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://weights.4chess.cc/**', route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/analysis/?lang=en`);
  await page.waitForFunction(() => window.__maiaStudioApp?.positions.length);
  assert.equal(await page.title(), 'Diverge · Chess Analysis & Game Review');
  assert.match(await page.locator('meta[name="description"]').getAttribute('content'), /Compare Stockfish/);
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    app.positionAnalysis.refresh = () => {}; app.runFullReview = async () => {};
    app.boardUI.setOrientation('black');
    const pgn = '[White "Player White"]\n[Black "Player Black"]\n[Result "1-0"]\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Be7 5. O-O O-O 6. Nc3 d6 7. h3 a6 1-0';
    app.startNewSession({ pgn, autoReview: false });
    const losses = [0, 12, 65, 140, 260, null, 0, 0, 10, 0, 10, 200, 90, 0];
    const allMoves = app.positions.slice(1).map((position, index) => ({ ...position, fenBefore: app.positions[index].fen, lossCp: losses[index], severity: losses[index] == null ? 'unknown' : losses[index] >= 200 ? 'blunder' : losses[index] >= 100 ? 'mistake' : losses[index] >= 40 ? 'inaccuracy' : 'good', bestUci: index === 0 || index === 7 || index === 9 ? position.uci : 'a2a3', bestSan: 'a3', accuracy: losses[index] == null ? null : 90, isBookMove: index < 2, isOnlyLegalMove: index === 6 }));
    Object.assign(allMoves[3], { divergenceType: 'intuition_trap', divergenceStatus: 'confirmed', humanRawProbability: .58 });
    Object.assign(allMoves[7], { divergenceType: 'beyond_intuition', divergenceStatus: 'confirmed', maiaTopSan: 'Nc6', maiaLossCp: 80 });
    Object.assign(allMoves[9], { divergenceType: 'beyond_intuition', divergenceStatus: 'confirmed', isCombinationFollowup: true });
    Object.assign(allMoves[8], { divergenceType: 'precise_intuition', divergenceStatus: 'confirmed', maiaTopSan: 'd4', maiaAdvantageCp: 28, maiaESL: 2.5 });
    Object.assign(allMoves[11], { evalBeforeCp: 800, evalAfterCp: -600, expectedScoreLoss: 4.9 });
    Object.assign(allMoves[12], { evalBeforeCp: 0, evalAfterCp: 90, expectedScoreLoss: 8.2 });
    window.syntheticReview = { allMoves, keyMoments: [], positionEvaluations: [], accuracyWhite: 86.3, accuracyBlack: 80.1, engineOnly: true, depth: 10, elo: 1500, engineKey: 'sf19lite', totalMoves: allMoves.length };
    app.applyReviewResult(syntheticReview, { refreshPosition: false });
  });
  const count = (side, quality) => page.locator(`#review-overview button[data-review-side="${side}"][data-review-category="${quality}"]`);
  const overview = page.locator('#review-summary');
  const reportEntry = page.locator('#review-engine-summary #review-report-entry');
  assert.equal(await overview.isVisible(), false, 'Completion leaves the board visible');
  assert.equal(await page.locator('#review-ready').count(), 0, 'The center column has no separate completion banner');
  assert.equal(await reportEntry.getAttribute('data-pending'), 'true');
  const boardBounds = await page.locator('#board-container').boundingBox();
  await reportEntry.click();
  assert.equal(await overview.evaluate(el => el.matches(':modal')), true);
  assert.equal(await page.locator('#position-score').isVisible(), true);
  assert.equal(await page.locator('#review-report-title').innerText(), 'White wins, but there was a better option on move 7');
  assert.equal(await page.locator('#review-report-side [aria-pressed="true"]').getAttribute('data-practice-side'), 'b');
  const centered = el => {
    const { left, width, top, height } = el.getBoundingClientRect();
    return Math.abs(left + width / 2 - innerWidth / 2) <= 1 && Math.abs(top + height / 2 - innerHeight / 2) <= 1;
  };
  assert(await overview.evaluate(centered), 'The modal is centered relative to the full desktop viewport');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => __maiaStudioApp.currentPly), 0);
  await page.evaluate(() => __maiaStudioApp.applyReviewResult({ ...syntheticReview, engineOnly: false }, { refreshPosition: false }));
  assert.equal(await overview.isVisible(), true, 'Maia enrichment preserves the open overview');
  assert.equal(await page.locator('#review-card-countdown').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await overview.isVisible(), false);
  assert(await reportEntry.isVisible(), 'The report remains available after it has been viewed');
  assert.equal(await reportEntry.getAttribute('data-pending'), 'false');
  assert(await reportEntry.evaluate(el => el === document.activeElement), 'Closing restores focus to the precision-area entry');
  assert.deepEqual(await page.locator('#board-container').boundingBox(), boardBounds);
  await page.locator('#btn-review-overview').click();
  const headline = page.locator('#review-report-title');
  await page.evaluate(() => {
    const app = __maiaStudioApp;
    const balanced = Array.from({ length: syntheticReview.allMoves.length + 1 }, () => ({ scoreCp: 0 }));
    app.el.metaResult.textContent = '1/2-1/2';
    app.applyReviewResult({ ...syntheticReview, positionEvaluations: balanced }, { refreshPosition: false });
  });
  assert.equal(await headline.innerText(), 'A close game ends in a draw');
  await page.evaluate(() => {
    const app = __maiaStudioApp;
    const positions = Array.from({ length: syntheticReview.allMoves.length + 1 }, () => ({ scoreCp: 0 }));
    positions[positions.length - 1] = { scoreCp: -10000, isMate: true, terminal: true };
    app.el.metaResult.textContent = '0-1';
    app.applyReviewResult({ ...syntheticReview, positionEvaluations: positions }, { refreshPosition: false });
  });
  assert.equal(await headline.innerText(), 'Black wins by checkmate on move 7');
  await page.evaluate(() => {
    const app = __maiaStudioApp;
    const whiteScores = [0, 10, -230, -210, -180, -60, 20, 0, 60, 100, 140, 200, 240, 300, 350];
    const positions = whiteScores.map((cp, i) => ({ scoreCp: i % 2 ? -cp : cp }));
    app.el.metaResult.textContent = '1-0';
    app.applyReviewResult({ ...syntheticReview, positionEvaluations: positions }, { refreshPosition: false });
  });
  assert.equal(await headline.innerText(), 'White comes from behind to win');
  await page.evaluate(() => {
    const app = __maiaStudioApp;
    app.applyReviewResult({ ...syntheticReview, isPartial: true }, { refreshPosition: false });
  });
  assert.equal(await headline.innerText(), 'In the moves available, White missed a chance on move 7');
  assert.doesNotMatch(await page.locator('#review-report-meta').innerText(), /1-0/);
  await page.evaluate(() => {
    __maiaStudioApp.el.metaResult.textContent = '1-0';
    __maiaStudioApp.applyReviewResult(syntheticReview, { refreshPosition: false });
  });
  await page.getByRole('button', { name: 'Close game overview' }).click();
  assert.equal(await overview.isVisible(), false);
  assert.equal(await page.locator('#btn-review-overview').evaluate(el => el === document.activeElement), true);
  await page.locator('#btn-review-overview').click();
  await page.locator('#review-report-side [data-practice-side="all"]').click();
  await page.getByRole('button', { name: 'Replay these 2 positions' }).click();
  assert.equal(await page.locator('#practice-panel').isVisible(), true);
  assert.equal(await page.locator('#review-summary').isVisible(), false);
  const initialQueue = await page.evaluate(() => __maiaStudioApp.practice.queue.map(move => move.ply));
  await page.evaluate(() => {
    const enriched = { ...syntheticReview, engineOnly: false };
    __maiaStudioApp.applyReviewResult(enriched, { refreshPosition: false });
  });
  assert.deepEqual(await page.evaluate(() => __maiaStudioApp.practice.queue.map(move => move.ply)), initialQueue);
  await page.locator('#practice-panel').getByRole('button', { name: 'Back to Studio' }).click();
  assert.equal(await overview.isVisible(), false);
  assert.equal(await page.locator('#position-score').isVisible(), true);
  await page.evaluate(() => __maiaStudioApp.applyReviewResult(syntheticReview, { refreshPosition: false }));
  await page.locator('#btn-review-overview').click();
  await page.locator('#review-report-side [data-practice-side="b"]').click();
  await page.locator('#review-report-workbench').click();
  const classifications = page.locator('#review-classifications');
  assert.equal(await classifications.getAttribute('open'), null, 'Traditional classifications start collapsed');
  const side = value => page.locator(`.review-filter-toolbar .review-side-controls [data-review-side="${value}"]`);
  const clear = page.locator('#review-clear-filter');
  assert(await side('b').isVisible(), 'Side selection works without opening classifications');
  assert.equal(await side('b').getAttribute('aria-pressed'), 'true', 'Initial selection follows the entry view');
  const metric = (side, quality) => count(side, quality).locator('.review-metric-value');
  const listMode = mode => page.locator(`.review-list-modes [data-filter="${mode}"]`);
  assert.equal(await page.locator('.review-intuition-card').count(), 0, 'The scan prompt stands alone before results');
  assert(await page.locator('#review-overview #intuition-toggle').isVisible());
  await side('w').click();
  assert.deepEqual(await page.locator('.blunder-card').evaluateAll(cards => cards.map(card => Number(card.dataset.ply))), [5, 13]);
  await listMode('moves').click();
  await side('b').click();
  assert.equal(await listMode('moves').getAttribute('aria-pressed'), 'true', 'Switching sides keeps the current category');
  assert.deepEqual(await page.locator('.blunder-card').evaluateAll(cards => cards.map(card => Number(card.dataset.ply))), [2, 4, 6, 8, 10, 12, 14]);
  await clear.click();
  assert(await clear.isHidden(), 'Both sides and key moments need no reset');
  await side('b').click();
  assert.deepEqual(await page.locator('.review-engine-value strong').allTextContents(), ['86.3', '80.1']);
  assert.equal(await page.locator('.review-list-modes [data-filter]').count(), 2);
  await classifications.locator('summary').click();
  await page.evaluate(() => {
    __maiaStudioApp.intuitionReview.state = 'partial';
    __maiaStudioApp.applyReviewResult({
      ...syntheticReview, engineOnly: false, allMoves: syntheticReview.allMoves.map((move, index) => ({
        ...move, _predMoves: index === 3 ? [{ uci: move.uci }] : [],
        ...(index === 3 ? {} : { divergenceStatus: 'unconfirmed' })
      }))
    }, { refreshPosition: false });
  });
  assert.equal(await page.locator('#review-intuition-coverage').innerText(), 'Maia scanned 1/14 moves');
  assert.equal(await page.locator('#intuition-toggle').innerText(), 'Retry scan');
  assert.equal(await metric('b', 'trap').innerText(), '1');
  assert.equal(await metric('w', 'trap').count(), 0, 'An incomplete scan only shows confirmed counts');
  assert.equal(await page.locator('.review-intuition-card').count(), 1);
  assert.notEqual(await classifications.getAttribute('open'), null, 'Enrichment preserves disclosure state');
  await page.evaluate(() => {
    syntheticReview.engineOnly = false;
    __maiaStudioApp.intuitionReview.state = 'done';
    __maiaStudioApp.applyReviewResult(syntheticReview, { refreshPosition: false });
  });
  assert.equal(await metric('b', 'trap').innerText(), '1'); assert.equal(await metric('b', 'beyond').innerText(), '1');
  assert.equal(await metric('w', 'trap').innerText(), '0');
  assert.equal(await page.locator('#review-overview #intuition-toggle').isHidden(), true);
  assert.deepEqual(await page.locator('.review-intuition-card').evaluateAll(cards => cards.map(card => card.dataset.kind)), ['trap', 'beyond', 'precise']);
  assert.equal(await count('b', 'quality:unknown').innerText(), '1'); assert.equal(await count('w', 'quality:forced').innerText(), '1');
  const appearance = button => button.evaluate(el => {
    const style = getComputedStyle(el);
    return [style.color, style.backgroundColor, style.fontWeight];
  });
  assert.equal((await appearance(count('b', 'quality:best')))[0], (await appearance(count('w', 'quality:best')))[0]);
  assert.equal((await appearance(count('b', 'quality:inaccuracy')))[0], (await appearance(count('w', 'quality:forced')))[0], 'Zero uses the muted count color');
  const mistakeStyle = await appearance(count('b', 'quality:mistake'));
  const blunderStyle = await appearance(count('b', 'quality:blunder'));
  assert.notEqual(mistakeStyle[0], blunderStyle[0]);
  assert.notEqual(mistakeStyle[1], blunderStyle[1]);
  assert.equal(blunderStyle[2], '700');
  assert.equal(await metric('w', 'precise').innerText(), '1');
  await count('w', 'precise').click();
  assert.equal(await count('w', 'precise').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#review-selection-label').innerText(), 'White · Precise intuition · 1 moves');
  assert.equal(await page.locator('.review-tag-precise').innerText(), 'Precise intuition');
  assert.match(await page.locator('.review-card-reason').innerText(), /0\.28.*2\.5 percentage points/);
  assert.deepEqual(await page.evaluate(() => {
    const app = __maiaStudioApp;
    return [app.currentPly, app.evalChart.currentPly, app.isReviewingMove,
      app.boardUI.chess.getFen() === app.positions[8].fen, app.positionAnalysis.context().fen === app.positions[8].fen];
  }), [9, 9, true, true, true], 'A specific filter selects the first move and the board before it');
  assert.equal(await page.locator('.blunder-card.active').getAttribute('data-ply'), '9');
  assert(await page.locator('#move-ply-9').evaluate(el => el.classList.contains('active')));
  assert(await page.locator('#current-insight').isHidden(), 'The active result card stands on its own');
  await page.evaluate(() => __maiaStudioApp.goToPly(9));
  await count('w', 'precise').click();
  assert.equal(await page.evaluate(() => __maiaStudioApp.isReviewingMove), false, 'The result keeps the current position if it is already selected');
  await count('w', 'trap').click();
  assert.equal(await page.evaluate(() => __maiaStudioApp.currentPly), 9, 'An empty filter preserves the board');
  assert(await page.locator('.review-empty').isVisible());
  assert(await page.locator('#current-insight').isVisible());
  await listMode('moves').click();
  assert.equal(await page.locator('.blunder-card').count(), 7, 'All moves preserves the selected side');
  await count('all', 'precise').click();
  assert.equal(await page.locator('.blunder-card').count(), 1);
  assert.equal(await count('all', 'precise').getAttribute('aria-pressed'), 'true');
  await page.locator('#review-clear-filter').click();
  assert.deepEqual(await page.locator('.blunder-card').evaluateAll(cards => cards.map(card => Number(card.dataset.ply))), [4, 5, 8, 13]);
  assert.equal(await page.locator('.review-turning-point').count(), 3);
  await count('b', 'mistakes').click();
  assert.deepEqual(await page.locator('.blunder-card').evaluateAll(cards => cards.map(card => Number(card.dataset.ply))), [4, 12]);
  await count('b', 'quality:blunder').click();
  assert.equal(await page.locator('.blunder-card').getAttribute('data-ply'), '12', 'The quality filter retains a non-key blunder');
  assert.equal(await count('b', 'quality:blunder').getAttribute('aria-pressed'), 'true');
  assert.notEqual((await appearance(count('b', 'quality:blunder')))[1], blunderStyle[1]);
  await count('b', 'quality:mistake').click();
  assert.equal(await page.locator('.blunder-card').count(), 1);
  const tags = await page.locator('.blunder-card .blunder-type-tag').allTextContents();
  assert.deepEqual(tags, ['Mistake', 'Intuition trap']);
  assert.match(await page.locator('.review-card-reason').innerText(), /1500.*58.0%/);
  await page.locator('.review-move-jump').click();
  assert.equal(await page.evaluate(() => __maiaStudioApp.currentPly), 4);
  assert.equal(await page.evaluate(() => __maiaStudioApp.isReviewingMove), true);
  await page.locator('#btn-flip').click();
  assert.equal(await page.locator('.review-side-controls button[aria-pressed="true"]').getAttribute('data-review-side'), 'b', 'Flipping the board does not change selected player');
  await count('b', 'quality:unknown').click();
  assert.equal(await page.locator('.blunder-card .practice-start').count(), 0, 'Unknown evaluations cannot become retry questions');
  await count('b', 'trap').click();
  await page.evaluate(() => { __maiaStudioApp.stockfish.evaluate = async (_fen, depth) => depth === 14 ? { scoreCp: 100, depth: 14, bestMove: { uci: __maiaStudioApp.practice.item.uci, san: __maiaStudioApp.practice.item.san } } : { scoreCp: -80, depth: 13 }; });
  await page.locator('#review-practice-batch').click();
  assert.equal(await page.locator('.insight-column').isVisible(), false, 'Side panel answers are hidden during training');
  assert.equal(await page.locator('#engine-candidate-lines').isVisible(), false);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => __maiaStudioApp.practice.active && __maiaStudioApp.currentPly === 4), true, 'Navigation shortcuts cannot reveal later moves during a retry');
  await page.evaluate(() => __maiaStudioApp.boardUI.moveTo('b8', 'c6'));
  await page.waitForFunction(() => __maiaStudioApp.practiceResults.get(4)?.status === 'independent');
  assert.equal(await page.evaluate(() => __maiaStudioApp.practiceResults.get(4).status), 'independent');
  await page.getByRole('button', { name: 'View practice summary' }).click();
  assert.match(await page.locator('#practice-panel').innerText(), /Independent 1/);
  assert.equal(await page.locator('.position-analysis').isVisible(), false, 'Keep the focused view through the summary');
  await page.locator('#practice-panel').getByRole('button', { name: /^Review move 2/ }).click();
  assert.equal(await page.evaluate(() => __maiaStudioApp.currentPly), 4, 'The summary can jump to the exact half-move');
  assert.equal(await page.locator('.position-analysis').isVisible(), true);
  // Multi-position queue provenance and progression use the current side/category selection.
  await page.locator('#review-clear-filter').click();
  await page.locator('.review-side-controls button[data-review-side="w"]').click();
  assert.equal(await page.locator('.blunder-card').count(), 2);
  await page.locator('#review-practice-batch').click();
  await page.locator('.practice-controls button').filter({ hasText: 'Hint', exact: true }).click();
  await page.evaluate(async () => { await __maiaStudioApp.practice.submit({}, 'synthetic-after'); });
  assert.equal(await page.evaluate(() => __maiaStudioApp.practiceResults.get(5).status), 'hinted');
  await page.locator('.practice-controls button').filter({ hasText: 'Next position' }).click();
  await page.getByRole('button', { name: 'Show analysis', exact: true }).click();
  await page.getByRole('button', { name: 'View practice summary' }).click();
  assert.match(await page.locator('#practice-panel').innerText(), /With hints 1.*Revealed 1/);
  await page.locator('#practice-panel').getByRole('button', { name: 'Back to Studio' }).click();
  const branchBefore = await page.evaluate(() => {
    const app = __maiaStudioApp;
    app.goToPly(0);
    app.boardUI.moveTo('d2', 'd4');
    const record = () => ({
      fen: app.boardUI.chess.getFen(), ply: app.currentPly, cursor: app.activeBranch.cursor,
      side: app.reviewExplorer.side, filter: app.currentDivergenceFilter, orientation: app.boardUI.orientation
    });
    window.readPracticeOrigin = record;
    return record();
  });
  await page.locator('#review-practice-batch').click();
  await page.locator('#practice-panel').getByRole('button', { name: 'Back to Studio' }).click();
  assert.deepEqual(await page.evaluate(() => readPracticeOrigin()), branchBefore, 'Leaving practice restores the exact personal branch');
  assert.equal(await page.evaluate(() => __maiaStudioApp.isBranching), true);
  await page.locator('#review-clear-filter').click();
  await classifications.locator('summary').click();
  await page.evaluate(() => { __maiaStudioApp.el.blunderList.closest('.insight-column').scrollTop = 0; });
  await page.screenshot({ path: path.join(output, 'desktop-en.png'), fullPage: true });
  await page.locator('#btn-settings').click();
  await page.locator('#review-settings #btn-lang-toggle').click();
  await page.keyboard.press('Escape');
  assert.match(await page.locator('#review-overview h2').innerText(), /双方复盘总览/);
  assert.equal(await page.title(), '歧路 Diverge · 局面分析与棋局复盘');
  assert.match(await page.locator('meta[name="description"]').getAttribute('content'), /对比 Stockfish/);
  await page.evaluate(() => { document.querySelector('.insight-column').scrollTop = 0; });
  await page.screenshot({ path: path.join(output, 'desktop-zh.png'), fullPage: true });
  await classifications.locator('summary').click();
  await count('b', 'quality:mistake').click();
  await page.locator('.blunder-card').screenshot({ path: path.join(output, 'quality-trap-card-zh.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#btn-review-overview').click();
  assert.equal(await overview.isVisible(), true);
  assert(await overview.evaluate(centered), 'The modal is centered relative to the full mobile viewport');
  assert(await overview.evaluate(el => {
    const { left, right, top, bottom } = el.getBoundingClientRect();
    return left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight &&
      el.querySelector('footer button').getBoundingClientRect().bottom <= bottom;
  }), 'Mobile dialog and its close action fit the viewport');
  await page.keyboard.press('Escape');
  assert.equal(await overview.isVisible(), false);
  await page.locator('#review-overview').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No page-wide overflow on mobile');
  await page.screenshot({ path: path.join(output, 'mobile-zh.png'), fullPage: true });
  // End remains available while an engine request is pending; the late result is ignored.
  await page.evaluate(() => {
    const app = __maiaStudioApp, item = syntheticReview.allMoves[4];
    app.practiceResults.delete(item.ply); app.startPractice(item);
    app.stockfish.evaluate = () => new Promise(resolve => { window.releasePractice = resolve; });
    window.pendingPractice = app.practice.submit({}, 'synthetic-after');
  });
  await page.getByRole('button', { name: '返回工作台', exact: true }).click();
  await page.evaluate(async () => { releasePractice({ scoreCp: 100, depth: 14 }); await pendingPractice; });
  assert.equal(await page.evaluate(() => __maiaStudioApp.practiceResults.has(5)), false, 'Cancelled grading cannot create a practice outcome');

  // Long reviews keep filters available and isolate notation scrolling from candidate research.
  await page.evaluate(() => {
    const app = __maiaStudioApp;
    const moves = Array.from({ length: 20 }, (_, i) => `${i * 2 + 1}. Nf3 Nf6 ${i * 2 + 2}. Ng1 Ng8`).join(' ');
    app.startNewSession({ pgn: `[Result "1/2-1/2"]\n${moves} 1/2-1/2`, autoReview: false });
    const allMoves = app.positions.slice(1).map((position, index) => ({
      ...position, fenBefore: app.positions[index].fen, lossCp: 120, severity: 'mistake', accuracy: 70,
      evalBeforeCp: 0, evalAfterCp: 120, expectedScoreLoss: 10.8, bestUci: 'a2a3', bestSan: 'a3'
    }));
    app.goToPly(3);
    app.applyReviewResult({ ...syntheticReview, allMoves, totalMoves: allMoves.length }, { refreshPosition: false });
    app.reviewExplorer.side = 'all';
    app.renderBlunderCards();
  });
  assert.equal(await page.locator('#review-report-entry').isVisible(), true, 'Completion keeps the board and current workspace when the user has explored');
  assert.equal(await page.evaluate(() => __maiaStudioApp.currentPly), 3);
  for (const width of [1360, 1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const desktop = width >= 1180;
    await page.evaluate(() => {
      const app = __maiaStudioApp;
      app.reviewExplorer.side = 'b';
      app.renderBlunderCards();
      app.goToPly(3);
    });
    assert(await page.locator('#current-insight').isVisible());
    const anchorCard = page.locator('#blunder-list .blunder-card[data-ply="40"]');
    await anchorCard.evaluate(card => card.scrollIntoView({ block: 'center' }));
    const anchorTop = (await anchorCard.boundingBox()).y;
    await anchorCard.locator('.review-move-jump').click();
    assert(await page.locator('#current-insight').isHidden());
    const anchoredTop = (await anchorCard.boundingBox()).y;
    assert(Math.abs(anchoredTop - anchorTop) <= 2, `The clicked card keeps its screen position at ${width}px (${anchorTop} → ${anchoredTop})`);
    await page.locator('.review-side-controls [data-review-side="all"]').click();
    await page.locator('#blunder-list .blunder-card[data-ply="40"]').evaluate(card => card.scrollIntoView({ block: 'start' }));
    await page.waitForFunction(() => Number.parseFloat(document.querySelector('#insight-column').style.getPropertyValue('--review-toolbar-height')) > 0);
    const sticky = await page.evaluate(() => {
      const column = document.querySelector('.insight-column'), toolbar = document.querySelector('.review-filter-toolbar');
      const bar = toolbar.getBoundingClientRect(), card = document.querySelector('.blunder-card[data-ply="40"]').getBoundingClientRect();
      return { barTop: bar.top, barBottom: bar.bottom, columnTop: column.getBoundingClientRect().top,
        cardTop: card.top, overviewBottom: document.querySelector('#review-overview').getBoundingClientRect().bottom,
        barHeight: bar.height, recordedHeight: Number.parseFloat(column.style.getPropertyValue('--review-toolbar-height')) };
    });
    assert(Math.abs(sticky.barTop - (desktop ? sticky.columnTop : 0)) < 2, `Filter toolbar sticks at ${width}px`);
    assert(sticky.overviewBottom < sticky.barTop, 'The large overview scrolls above the sticky filters');
    assert(sticky.cardTop >= sticky.barBottom, 'Jumped card heading stays below the wrapped toolbar');
    assert(Math.abs(sticky.barHeight - sticky.recordedHeight) < 1, 'Wrapped filter height updates the navigation offset');
    await listMode('moves').click();
    assert.equal(await listMode('moves').getAttribute('aria-pressed'), 'true');
    const selected = await page.locator('.blunder-card').first().boundingBox();
    const toolbar = await page.locator('.review-filter-toolbar').boundingBox();
    assert(selected.y >= toolbar.y + toolbar.height - 1, 'Changing filters exposes the first card below the toolbar');
    if (desktop) {
      await page.evaluate(() => {
        scrollTo(0, 0);
        const app = __maiaStudioApp, scroll = document.querySelector('.analysis-scroll');
        scroll.scrollTop = scroll.scrollHeight;
        app.el.blunderList.querySelector('[data-ply="40"] .review-move-jump').click();
      });
      const anchored = await page.evaluate(() => {
        const scroll = document.querySelector('.analysis-scroll'), section = document.querySelector('.position-analysis');
        return { y: scroll.scrollTop, top: section.getBoundingClientRect().top, bottom: section.getBoundingClientRect().bottom,
          viewport: scroll.getBoundingClientRect().top, viewportBottom: scroll.getBoundingClientRect().bottom,
          inner: __maiaStudioApp.el.moveNotationTable.scrollTop };
      });
      assert(anchored.top >= anchored.viewport - 1 && anchored.bottom <= anchored.viewportBottom + 1, `Clicking a key move reveals the candidate panel ${JSON.stringify(anchored)}`);
      assert(anchored.inner > 0, 'The selected notation row scrolls internally');
      await page.evaluate(() => { __maiaStudioApp.goToPly(79); __maiaStudioApp.goToPly(0); });
      assert.equal(await page.locator('.analysis-scroll').evaluate(el => el.scrollTop), anchored.y, 'Navigation and returning to move zero preserve the candidate viewport');
      await page.evaluate(() => {
        const app = __maiaStudioApp, scroll = document.querySelector('.analysis-scroll');
        scroll.scrollTop = scroll.scrollHeight;
        app.evalChart.select({ point: { ply: 78 }, branch: false });
      });
      assert.equal(await page.evaluate(() => __maiaStudioApp.currentPly), 78);
      const panel = await page.locator('.position-analysis').boundingBox();
      const middle = await page.locator('.analysis-scroll').boundingBox();
      assert(panel.y >= middle.y - 1 && panel.y + panel.height <= middle.y + middle.height + 1, 'Chart selection also reveals engine and intuition candidates');
    }
    await page.screenshot({ path: path.join(output, `review-sticky-${width}.png`) });
  }
  // Starting another input clears counts and retry outcomes, including the completed-session panel.
  await page.evaluate(() => __maiaStudioApp.startNewSession({ fen: '8/8/8/4k3/8/4K3/8/8 b - - 0 42', autoReview: false }));
  assert.equal(await page.locator('#review-overview').isVisible(), false);
  assert.equal(await page.locator('#practice-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => __maiaStudioApp.practiceResults.size), 0);

  // Opt-in commentary. The fake Prompt API intentionally omits Chrome brand
  // data and lets an aborted prompt finish late to exercise application guards.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(async () => {
    const app = __maiaStudioApp;
    const { setLanguage } = await import('/analysis/i18n.js?v=20261124-checkup-results');
    setLanguage('en');
    window.aiCalls = { probes: 0, creates: 0, prompts: 0, gamePrompts: 0, aborts: 0, childDestroys: 0, rootDestroys: 0, availability: 'downloadable' };
    Object.defineProperty(globalThis, 'LanguageModel', { configurable: true, value: {
      async availability(options) {
        aiCalls.probes++;
        aiCalls.options = options;
        return aiCalls.availability;
      },
      create(options) {
        aiCalls.creates++;
        aiCalls.createOptions = { expectedInputs: options.expectedInputs, expectedOutputs: options.expectedOutputs };
        options.monitor({ addEventListener: (_type, listener) => listener({ loaded: .42 }) });
        return new Promise(resolve => {
          window.completeLocalModel = () => resolve({
            async clone() {
              return {
                prompt(input, { signal, responseConstraint }) {
                  const request = JSON.parse(input);
                  const overview = !!request.facts.result;
                  if (overview) aiCalls.gamePrompts++;
                  else { aiCalls.prompts++; aiCalls.input = request; }
                  aiCalls.constraint = responseConstraint;
                  signal.addEventListener('abort', () => aiCalls.aborts++, { once: true });
                  return new Promise(finish => { window[overview ? 'finishGameCommentary' : 'finishCommentary'] = finish; });
                },
                destroy() { aiCalls.childDestroys++; }
              };
            },
            destroy() { aiCalls.rootDestroys++; }
          });
        });
      }
    } });
    app.startNewSession({ pgn: '[Result "1-0"]\n[Termination "White won on time"]\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 1-0', autoReview: false });
    const moves = app.positions.slice(1).map((move, i) => ({ ...move, fenBefore: app.positions[i].fen }));
    Object.assign(moves[3], {
      lossCp: 155, severity: 'mistake', accuracy: 70, expectedScoreLoss: 14,
      verifiedLossCp: 150, verifiedExpectedScoreLoss: 13.2, divergenceType: 'intuition_trap', divergenceStatus: 'confirmed',
      humanRawProbability: .42, maiaTopUci: 'b8c6', verifiedBestSan: 'Nf6',
      verifiedBestUci: 'g8f6', verifiedBestPv: ['g8f6', 'b1c3'],
      verifiedPlayedPv: ['b8c6', 'f3e5', 'c6e5']
    });
    window.commentaryReview = { ...syntheticReview, allMoves: moves, totalMoves: moves.length, engineOnly: false };
    app.goToPly(4);
    app.reviewExplorer.side = 'all';
    app.applyReviewResult(commentaryReview, { refreshPosition: false });
  });
  const commentary = page.locator('#review-commentary');
  const toggle = page.locator('#setting-review-commentary');
  const status = page.locator('#review-commentary-status');
  const download = page.locator('#review-commentary-download');
  const explain = page.locator('.blunder-card[data-ply="4"] .review-commentary-action');
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await commentary.count(), 0, 'The selected card does not automatically expand a second explanation');
  await explain.click();
  assert.equal(await explain.getAttribute('aria-expanded'), 'true');
  assert(await page.locator('.blunder-card[data-ply="4"] #review-commentary').isVisible());
  assert(await page.locator('#current-insight').isHidden());
  await explain.click();
  assert.equal(await commentary.count(), 0);
  await explain.click();
  assert.match(await commentary.innerText(), /Nxe5, taking a pawn.*13\.2 percentage points/);
  assert.equal(await page.locator('.review-commentary-action').count(), 1);
  assert.equal(await page.locator('#review-report-title').textContent(), 'Black ran out of time and White won');
  assert.match(await page.locator('#review-report-story').textContent(), /Black played Nc6.*preferred Nf6/);
  await page.locator('#btn-settings').click();
  assert.equal(await download.isVisible(), false);
  assert.deepEqual(await page.evaluate(() => [aiCalls.probes, aiCalls.creates]), [0, 0]);
  await toggle.check();
  await download.waitFor();
  assert.equal(await page.evaluate(() => aiCalls.creates), 0, 'Detection never starts a download');
  assert.match(await commentary.innerText(), /Nxe5, taking a pawn.*13\.2 percentage points/);
  await download.click();
  await page.waitForFunction(() => document.getElementById('review-commentary-progress').value === 42);
  assert.match(await status.innerText(), /42%/);
  assert.deepEqual(await page.evaluate(() => aiCalls.createOptions), await page.evaluate(() => aiCalls.options));
  await page.evaluate(() => completeLocalModel());
  await page.waitForFunction(() => aiCalls.prompts === 1 && aiCalls.gamePrompts === 1);
  await page.evaluate(() => finishGameCommentary(JSON.stringify({
    text: '[[result]]. The main turning point came at [[turning]], when [[side]] chose [[played]] over [[best]].'
  })));
  await page.waitForFunction(() => !document.getElementById('review-studio-summary').hidden);
  assert.match(await page.locator('#review-studio-summary').innerText(), /Black ran out of time and White won.*chose Nc6 over Nf6/);
  await page.keyboard.press('Escape');
  await page.evaluate(() => __maiaStudioApp.goToPly(2));
  assert.equal(await commentary.count(), 0);
  assert.equal(await page.evaluate(() => aiCalls.aborts), 1);
  await page.evaluate(() => finishCommentary('{"text":"The choice of [[played]] cost [[cost]]."}'));
  await page.waitForFunction(() => aiCalls.childDestroys === 2);
  assert.equal(await page.evaluate(() => __maiaStudioApp.reviewCommentary.cache.size), 1, 'Only the recap was cached. Late move text cannot enter the cache');

  await explain.click();
  await page.waitForFunction(() => aiCalls.prompts === 2);
  await page.evaluate(() => finishCommentary('{"text":"The choice of [[played]] cost [[cost]]. It also permitted Qh8+."}'));
  await page.waitForFunction(() => aiCalls.childDestroys === 3);
  assert.match(await commentary.innerText(), /Verified chess facts/);
  assert.doesNotMatch(await commentary.innerText(), /Qh8/);
  const factsInput = await page.evaluate(() => aiCalls.input.facts);
  assert.equal(factsInput.played, 'Nc6');
  assert.equal(factsInput.reply, 'Nxe5, taking a pawn');
  assert.equal(factsInput.best, 'Nf6');
  assert.equal(factsInput.cost, '13.2 percentage points of expected score');
  assert(!JSON.stringify(factsInput).includes('rnbq'));

  await page.evaluate(() => __maiaStudioApp.goToPly(2));
  await explain.click();
  await page.waitForFunction(() => aiCalls.prompts === 3);
  await page.evaluate(() => finishCommentary('{"text":"The choice of [[played]] gave the opponent [[reply]]. Compared with [[best]], it loses [[cost]]."}'));
  await page.waitForFunction(() => document.getElementById('review-commentary').textContent.includes('Chrome local AI'));
  await page.evaluate(() => __maiaStudioApp.goToPly(2));
  await explain.click();
  assert.match(await commentary.innerText(), /gave the opponent Nxe5.*Compared with Nf6/);
  assert(await page.evaluate(() => !__maiaStudioApp.reviewCommentary.request && aiCalls.prompts === 3), 'An identical fact snapshot reuses the validated output');
  await page.evaluate(() => __maiaStudioApp.startPractice(commentaryReview.allMoves[3]));
  assert.equal(await commentary.count(), 0, 'Practice hides all commentary');
  await page.getByRole('button', { name: 'Back to Studio' }).click();

  await page.locator('#btn-settings').click();
  await page.locator('#btn-lang-toggle').click();
  assert.match(await status.innerText(), /中文版/);
  assert.equal(await download.isVisible(), false);
  assert.equal(await page.evaluate(() => aiCalls.rootDestroys), 0);
  await page.keyboard.press('Escape');
  assert.match(await commentary.innerText(), /已验证的棋理说明/);
  await page.locator('#btn-settings').click();
  await page.locator('#btn-lang-toggle').click();
  assert.match(await commentary.innerText(), /Chrome local AI/);
  assert.equal(await page.evaluate(() => aiCalls.creates), 1);
  await page.keyboard.press('Escape');

  const resetChecks = await page.evaluate(async () => {
    const app = __maiaStudioApp;
    const card = document.getElementById('review-studio-summary');
    const original = '[Result "1-0"]\n[Termination "White won on time"]\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 1-0';
    window.restoreCommentaryFixture = () => {
      app.startNewSession({ pgn: original, autoReview: false });
      app.goToPly(4);
      app.reviewExplorer.side = 'all';
      app.applyReviewResult(commentaryReview, { refreshPosition: false });
    };
    const actions = {
      newGame: () => app.startNewSession({ pgn: '[Result "0-1"]\n1. d4 d5 0-1', autoReview: false }),
      reanalyze: () => {
        app.analyzer.analyzeGame = async () => null;
        return Object.getPrototypeOf(app).runFullReview.call(app, true);
      },
      switchEngine: () => {
        document.getElementById('intuition-edition').value = '23m';
        app.changeEngineVersions({ persist: false, prioritizePosition: true });
      }
    };
    const checks = {};
    for (const [name, transition] of Object.entries(actions)) {
      restoreCommentaryFixture();
      const wasVisible = !card.hidden && card.querySelector('p').textContent.includes('White won');
      const pending = new AbortController();
      app.reviewCommentary.overviewRequest = pending;
      await transition();
      checks[name] = [wasVisible, card.hidden, card.querySelector('p').textContent === '', pending.signal.aborted];
    }
    return checks;
  });
  for (const [name, checks] of Object.entries(resetChecks)) {
    assert.deepEqual(checks, [true, true, true, true], `Recap removal and in-flight abort for ${name}`);
  }
  const pendingOverview = await page.evaluate(() => {
    const app = __maiaStudioApp;
    restoreCommentaryFixture();
    app.goToPly(0);
    const previous = aiCalls.gamePrompts;
    app.terminationType = null;
    app.applyReviewResult(commentaryReview, { refreshPosition: false });
    return previous;
  });
  await page.waitForFunction(previous => aiCalls.gamePrompts > previous, pendingOverview);
  const destroyed = await page.evaluate(() => {
    const app = __maiaStudioApp;
    const before = aiCalls.childDestroys;
    app.startNewSession({ pgn: '[Result "0-1"]\n1. c4 e5 0-1', autoReview: false });
    finishGameCommentary('{"text":"[[result]]. At [[turning]], [[side]] lost ground after [[played]] instead of [[best]]."}');
    return before;
  });
  await page.waitForFunction(before => aiCalls.childDestroys > before, destroyed);
  assert.equal(await page.locator('#review-studio-summary').isVisible(), false);
  assert.equal(await page.locator('#review-studio-summary p').textContent(), '');
  await page.evaluate(() => restoreCommentaryFixture());
  await explain.click();
  await page.locator('#btn-settings').click();
  await toggle.uncheck();
  assert.match(await commentary.innerText(), /Verified chess facts/);
  assert.equal(await page.locator('.review-commentary-action').count(), 1);
  assert.equal(await page.evaluate(() => aiCalls.rootDestroys), 1);
  assert.equal(await page.locator('#review-studio-summary').isVisible(), false);
  await page.evaluate(() => { aiCalls.availability = 'unavailable'; });
  await toggle.check();
  await page.waitForFunction(() => document.getElementById('review-commentary-status').textContent.includes('unavailable'));
  assert.equal(await download.isVisible(), false);
  assert.equal(await page.evaluate(() => aiCalls.creates), 1, 'Unavailable browsers keep the chess explanation without a model request');
  assert.match(await commentary.innerText(), /Verified chess facts/);
  await page.evaluate(() => {
    const app = __maiaStudioApp;
    app.el.metaResult.textContent = '*';
    app.applyReviewResult(commentaryReview, { refreshPosition: false });
  });
  assert.equal(await commentary.count(), 0, 'A result is required to show the new commentary');
  const incoming = await browser.newPage({ locale: 'zh-CN' });
  incoming.on('pageerror', error => errors.push(error.message));
  await incoming.route('https://weights.4chess.cc/**', route => route.abort());
  await incoming.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    value: { async writeText(text) { window.copiedGame = text; } }
  }));
  const base = 'http://127.0.0.1:' + server.address().port + '/analysis/';
  const importPgn = '[White "Player 100%20"]\n[Black "Guest"]\n[WhiteElo "1819"]\n[BlackElo "1412"]\n'
    + '[Result "1-0"]\n[Termination "White won by resignation"]\n[ECO "A80"]\n[TimeControl "180+2"]\n\n'
    + '1. d4 f5 2. c4 Nf6 1-0';
  await incoming.goto(base + '#' + new URLSearchParams({ pgn: importPgn, orientation: 'black', lang: 'zh' }));
  await incoming.waitForFunction(() => window.__maiaStudioApp?.positions.length === 5);
  const readSession = target => target.evaluate(() => {
    const app = __maiaStudioApp;
    return [app.currentPly, app.boardUI.orientation, app.currentElo, app.reviewExplorer.side, app.reviewOverview.side];
  });
  assert.deepEqual(await readSession(incoming), [4, 'black', 1400, 'b', 'b']);
  assert.match(await incoming.locator('#meta-white').textContent(), /100%20/);
  assert.match(await incoming.locator('#studio-elo-hint').textContent(), /黑方 PGN 评分 1412.*Maia 1400/);
  assert.equal(new URL(incoming.url()).hash, '');
  await incoming.evaluate(() => {
    const app = __maiaStudioApp;
    app.pauseWholeReview();
    app.runFullReview = async () => {};
    app.positionAnalysis.refresh = () => {};
    const moves = app.positions.slice(1).map((position, i) => ({
      ...position, accuracy: 99, severity: 'good', lossCp: i === 1 ? 28 : 0,
      expectedScoreLoss: i === 1 ? 2.6 : 0, bestSan: i === 1 ? 'Nf6' : position.san,
      fenBefore: app.positions[i].fen
    }));
    const pv = [[], ['g8f6','c2c4'], ['c2c4'], [], []];
    window.closeGameReview = {
      allMoves: moves, positionEvaluations: pv.map(pv => ({ scoreCp: 0, pv })),
      totalMoves: moves.length, engineOnly: true, engineKey: 'sf19lite', depth: 10
    };
    app.applyReviewResult(closeGameReview, { refreshPosition: false });
  });
  assert.equal(await incoming.locator('.blunder-card').count(), 0);
  assert.equal(await incoming.locator('.review-observations button').count(), 1);
  assert.match(await incoming.locator('.review-observations').innerText(), /f5.*Nf6/s);
  assert.equal(await incoming.locator('#review-practice-batch').isDisabled(), true);
  await incoming.locator('#review-report-entry').click();
  assert.match(await incoming.locator('#review-report-title').innerText(), /黑方在第 2 回合后认输/);
  assert.match(await incoming.locator('#review-report-story').innerText(), /仍接近均势/);
  assert.match(await incoming.locator('#review-report-context').innerText(), /荷兰防御.*3\+2 闪电棋/);
  await incoming.evaluate(() => {
    const positionEvaluations = closeGameReview.positionEvaluations.slice();
    positionEvaluations[4] = { scoreCp: 9980, isMate: true, terminal: false };
    __maiaStudioApp.applyReviewResult({ ...closeGameReview, positionEvaluations }, { refreshPosition: false });
  });
  assert.match(await incoming.locator('#review-report-title').innerText(), /认输/);
  assert.match(await incoming.locator('#review-report-story').innerText(), /找到白方可以强制将杀/);
  await incoming.locator('#review-copy-game-link').click();
  const shareUrl = await incoming.evaluate(() => copiedGame);
  assert.ok(shareUrl.startsWith(base + '#pgn='));
  const recipient = await browser.newPage();
  recipient.on('pageerror', error => errors.push(error.message));
  await recipient.route('https://weights.4chess.cc/**', route => route.abort());
  await recipient.goto(shareUrl);
  await recipient.waitForFunction(() => window.__maiaStudioApp?.positions.length === 5);
  assert.deepEqual(await readSession(recipient), [4, 'black', 1400, 'b', 'b']);
  assert.match(await recipient.locator('#meta-white').innerText(), /100%20/);
  assert.equal(await recipient.evaluate(async () => (await import('/engine/engine-preferences.js')).getPreferences().defaultElo), 1900);
  assert.equal(await recipient.locator('#studio-elo-hint').getAttribute('hidden'), '', 'The copied rating is explicit');
  await recipient.close();

  await incoming.keyboard.press('Escape');
  const nextPgn = '[White "Replacement"]\n[BlackElo "1175"]\n[Result "0-1"]\n1. e4 e5 0-1';
  await incoming.locator('#pgn-file-input').setInputFiles({ name: 'replacement.pgn', mimeType: 'text/plain', buffer: Buffer.from(nextPgn) });
  await incoming.waitForFunction(() => document.getElementById('meta-white').textContent.includes('Replacement'));
  assert.deepEqual(await readSession(incoming), [0, 'black', 1200, 'b', 'b']);
  await incoming.reload();
  await incoming.waitForFunction(() => window.__maiaStudioApp?.positions.length === 3);
  assert.deepEqual(await readSession(incoming), [0, 'black', 1200, 'b', 'b']);
  assert.match(await incoming.locator('#meta-white').innerText(), /Replacement/);
  assert(await incoming.evaluate(() => __maiaStudioApp.smartLoadInput('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')));
  await incoming.reload();
  await incoming.waitForFunction(() => window.__maiaStudioApp?.positions.length === 1);
  assert.equal(await incoming.evaluate(() => __maiaStudioApp.hasAnalysisInput), true, 'An explicitly imported initial position supersedes the last PGN');

  const denied = await browser.newPage();
  denied.on('pageerror', error => errors.push(error.message));
  await denied.goto(base + '#' + new URLSearchParams({ pgn: '[Result "*"]\n1. e4 *', orientation: 'black' }));
  await denied.waitForFunction(() => window.__maiaStudioApp?.positions.length === 1);
  assert.equal(await denied.evaluate(() => __maiaStudioApp.hasAnalysisInput || __maiaStudioApp.stockfish.isReady), false);
  await denied.close();
  await incoming.close();
  console.log('PASS review links: final position, rating provenance, bilingual context, resignation, observation isolation, fresh-profile sharing, replacement and reload; unfinished PGNs are blocked.');

  const checkup = await browser.newPage({ serviceWorkers: 'block' });
  checkup.on('pageerror', error => errors.push(error.message));
  await checkup.route('https://weights.4chess.cc/**', route => route.abort());
  await checkup.goto(base + '?lang=en');
  await checkup.waitForFunction(() => window.__maiaStudioApp?.positions.length === 1);
  const accountPgn = '[Site "Chess.com"]\n[White "OtherPlayer"]\n[Black "StudyPlayer"]\n[Result "0-1"]\n1. e4 e5 2. Nf3 Nc6 0-1';
  await checkup.evaluate(pgn => {
    const app = __maiaStudioApp;
    app.positionAnalysis.refresh = () => {};
    app.intuitionReview.start = () => {};
    const analyze = () => new Promise(resolve => {
      window.completeAnalysis = (isPartial = false) => resolve({
        allMoves: app.positions.slice(1).map((position, i) => ({ ...position, fenBefore: app.positions[i].fen })),
        positionEvaluations: [], accuracyWhite: 93, accuracyBlack: 94, engineOnly: true, isPartial
      });
    });
    window.beginReview = options => {
      app.analyzer.analyzeGame = analyze;
      app.startNewSession({ pgn, ...options });
    };
    beginReview({ openOverview: true });
  }, accountPgn);
  const summary = checkup.locator('#review-summary');
  await checkup.evaluate(() => completeAnalysis());
  await summary.waitFor();
  await checkup.keyboard.press('Escape');
  await checkup.locator('#btn-reanalyze').click();
  await checkup.evaluate(() => completeAnalysis());
  await checkup.locator('#review-report-entry').waitFor();
  assert.equal(await summary.isVisible(), false, 'Reanalyzing the same game does not auto-open again');

  await checkup.evaluate(() => beginReview({ openOverview: true }));
  await checkup.locator('#btn-settings').click();
  await checkup.locator('#btn-close-settings').click();
  await checkup.evaluate(() => completeAnalysis());
  await checkup.locator('#review-report-entry').waitFor();
  assert.equal(await summary.isVisible(), false, 'Interacting while waiting keeps the workbench open');
  assert.deepEqual(await checkup.locator('#review-engine-scores strong').allTextContents(), ['93.0', '94.0']);
  await checkup.evaluate(() => beginReview({ openOverview: true }));
  await checkup.evaluate(() => completeAnalysis(true));
  await checkup.locator('#review-report-entry').waitFor();
  assert.equal(await summary.isVisible(), false, 'Partial results only show the manual entry');

  await checkup.evaluate(async () => {
    const bank = __maiaStudioApp.mistakeBank;
    await bank.ready;
    await bank.store.saveProfile({ id: 'child', displayName: 'Child', aliases: ['StudyPlayer'] });
    await bank.refreshState();
    __maiaStudioApp.stockfish.initialize = async () => true;
    __maiaStudioApp.maiaEngine.initialize = async () => true;
  });
  const month = new Date().toISOString().slice(0, 7).replace('-', '/');
  const archive = 'https://api.chess.com/pub/player/studyplayer/games/' + month;
  const archiveGame = id => ({
    url: 'https://www.chess.com/game/live/' + id, rules: 'chess',
    end_time: Math.floor(Date.now() / 1000) - 5, pgn: accountPgn
  });
  let archiveGames = [archiveGame(12345678)];
  let archiveError = false;
  await checkup.route('https://api.chess.com/pub/player/studyplayer/games/archives', route => route.fulfill({ json: { archives: [archive] } }));
  await checkup.route(archive, route => route.fulfill(archiveError ? { status: 503 } : { json: { games: archiveGames } }));
  await checkup.route('https://lichess.org/api/games/user/lichesschild?**', route => route.fulfill({ body: '' }));

  const studioProfile = checkup.locator('#studio-profile-select');
  const guide = checkup.locator('#study-link-guide');
  const dot = checkup.locator('#checkup-new-dot');
  await studioProfile.selectOption('child');
  await guide.getByText(/Link a player.*Child/).waitFor();
  await guide.getByRole('button', { name: /Link .*StudyPlayer/ }).click();
  await guide.waitFor({ state: 'hidden' });
  await checkup.waitForFunction(() => __maiaStudioApp.checkupReminders.profile?.checkupReminders?.['chesscom:studyplayer']?.checkedAt > 0);
  assert.equal(await dot.isVisible(), false, 'First lookup seeds the baseline');
  assert.equal(await checkup.evaluate(() => __maiaStudioApp.reviewExplorer.side), 'b');

  const forceProbe = () => checkup.evaluate(async () => {
    const app = __maiaStudioApp;
    await app.mistakeBank.store.updateCheckupReminder('child', { platform: 'chesscom', username: 'StudyPlayer' },
      state => ({ ...state, checkedAt: Date.now() - 3600_000, retryAt: 0 }));
    await app.checkupReminders.refresh();
  });
  archiveGames.push(archiveGame(12345679));
  await forceProbe();
  await dot.waitFor();
  archiveError = true;
  await forceProbe();
  assert.equal(await dot.isVisible(), true, 'A failed lookup does not clear the dot');
  archiveError = false;

  const ply = await checkup.evaluate(() => __maiaStudioApp.currentPly);
  await studioProfile.selectOption('default');
  await guide.getByRole('button', { name: /StudyPlayer.*Switch to Child/ }).waitFor();
  assert.equal(await dot.isVisible(), false, 'The current profile owns its reminder');
  await guide.getByRole('button', { name: /StudyPlayer.*Switch to Child/ }).click();
  await dot.waitFor();
  assert.equal(await checkup.evaluate(() => __maiaStudioApp.currentPly), ply, 'Profile changes preserve the selected ply');

  const profile = checkup.locator('#checkup-profile-select');
  const cards = checkup.locator('#checkup-accounts li');
  await checkup.locator('#btn-intuition-checkup').click();
  await checkup.getByRole('button', { name: /Analyze new games · Chess.com · StudyPlayer/ }).waitFor();
  assert.equal(await profile.inputValue(), 'child');
  await checkup.locator('[data-checkup-source="lichess"]').click();
  await checkup.locator('#checkup-username').fill('LichessChild');
  await checkup.locator('#btn-checkup-save-account').click();
  await checkup.getByRole('button', { name: /Run first checkup · Lichess · LichessChild/ }).waitFor();

  await checkup.getByRole('button', { name: /Analyze new games · Chess.com · StudyPlayer/ }).click();
  await checkup.locator('#checkup-report-box').waitFor();
  await dot.waitFor({ state: 'hidden' });
  assert.match(await checkup.locator('#checkup-report-box').innerText(), /StudyPlayer/);
  assert.deepEqual(await checkup.evaluate(async () => {
    const store = __maiaStudioApp.mistakeBank.store;
    const report = (await store.listCheckups('child'))[0];
    return {
      source: report.sourceLabel,
      analyzedGameIds: report.analyzedGameIds,
      otherProfileReports: (await store.listCheckups('default')).length
    };
  }), { source: 'chesscom:StudyPlayer', analyzedGameIds: ['live:12345679'], otherProfileReports: 0 });
  await checkup.evaluate(async () => {
    const app = __maiaStudioApp;
    const store = app.mistakeBank.store;
    const report = (await store.listCheckups('child'))[0];
    const lastDiagnosedAt = Date.now() - 8 * 86400_000;
    await store.put('checkups', { ...report, createdAt: lastDiagnosedAt });
    await store.updateCheckupReminder('child', { platform: 'chesscom', username: 'StudyPlayer' },
      state => ({ ...state, lastDiagnosedAt }));
    await app.checkupReminders.refresh();
  });
  assert.match(await checkup.locator('#btn-intuition-checkup').getAttribute('title'), /8d ago/);
  await profile.selectOption('default');
  await cards.first().waitFor({ state: 'detached' });
  assert.equal(await checkup.locator('#checkup-report-box').isVisible(), false);
  assert.equal(await studioProfile.inputValue(), 'default');
  await profile.selectOption('child');
  await checkup.locator('#checkup-tab-settings').click();
  await checkup.getByRole('button', { name: /Unlink Lichess · LichessChild/ }).click();
  await checkup.getByRole('button', { name: /Unlink Lichess · LichessChild/ }).waitFor({ state: 'detached' });
  await checkup.reload();
  await checkup.waitForFunction(() => window.__maiaStudioApp?.positions.length > 1);
  await checkup.locator('#btn-intuition-checkup').click();
  await checkup.locator('#checkup-tab-settings').click();
  await cards.first().waitFor();
  assert.equal(await profile.inputValue(), 'child');
  assert.equal(await cards.count(), 1, 'IndexedDB preserves linked accounts and removals after reload');
  await checkup.setViewportSize({ width: 390, height: 844 });
  assert(await checkup.locator('#checkup-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth + 1),
    'Account cards and profile selector fit the mobile dialog');
  await checkup.locator('#btn-close-checkup').click();
  await studioProfile.selectOption('default');
  await guide.getByRole('button', { name: /StudyPlayer.*Switch to Child/ }).waitFor();
  await checkup.locator('#study-link-dismiss').click();
  await checkup.reload();
  await checkup.waitForFunction(() => window.__maiaStudioApp?.checkupGame && __maiaStudioApp.mistakeBank.activeProfile?.id === 'default');
  assert.equal(await guide.isVisible(), false, 'Dismissing a game guide survives refresh');
  await checkup.close();
  console.log('PASS conditional overview and multi-account checkup: profile switch and link guide, first lookup, new-game dot, transient failure, diagnosis clears processed games, profile isolation and IndexedDB reload.');

  assert.deepEqual(errors, []);
  console.log('PASS review UI and local commentary: default off, explicit download, progress, verified facts, grounded English loss wording, recap cancellation on all review resets, cache, practice isolation and Chinese fallback.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
