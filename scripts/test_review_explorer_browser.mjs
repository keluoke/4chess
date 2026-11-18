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
  const clock = page.locator('#review-card-countdown');
  const timerStarted = Date.now();
  assert.equal(await overview.evaluate(el => el.matches(':modal')), true, 'Scores open a floating modal over the workbench');
  assert.equal(await page.locator('#position-score').isVisible(), true);
  assert.equal(await page.locator('#review-report-title').innerText(), 'White wins, but there was a better option on move 7');
  assert.equal(await page.locator('#review-card-seconds').innerText(), '8');
  assert.match(await clock.getAttribute('aria-label'), /Analysis Studio in 8 seconds/);
  const centered = el => {
    const { left, width, top, height } = el.getBoundingClientRect();
    return Math.abs(left + width / 2 - innerWidth / 2) <= 1 && Math.abs(top + height / 2 - innerHeight / 2) <= 1;
  };
  assert(await overview.evaluate(centered), 'The modal is centered relative to the full desktop viewport');
  const boardBounds = await page.locator('#board-container').boundingBox();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => __maiaStudioApp.currentPly), 0);
  await page.waitForFunction(() => document.getElementById('review-card-seconds').textContent === '7');
  await page.evaluate(() => __maiaStudioApp.applyReviewResult({ ...syntheticReview, engineOnly: false }, { refreshPosition: false }));
  assert.equal(await page.locator('#review-card-seconds').innerText(), '7', 'Maia enrichment keeps the original deadline');
  await overview.waitFor({ state: 'hidden', timeout: 8500 });
  assert(Date.now() - timerStarted >= 7300, 'The card stays open for the extended countdown');
  assert.deepEqual(await page.locator('#board-container').boundingBox(), boardBounds, 'Closing the card preserves the workbench layout');
  await page.evaluate(() => __maiaStudioApp.applyReviewResult(syntheticReview, { refreshPosition: false }));
  await page.locator('#btn-review-overview').click();
  assert.equal(await clock.isVisible(), false, 'A manually reopened review stays available for reading');
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
  assert.equal(await page.locator('.review-side-controls button[aria-pressed="true"]').getAttribute('data-review-side'), 'b', 'Initial selection follows the entry view');
  assert.equal(await count('b', 'trap').innerText(), '—', 'An unrun intuition scan cannot claim zero traps');
  assert.equal(await count('w', 'precise').innerText(), '—');
  const preciseFilter = page.getByRole('button', { name: /^Precise intuition\s*\(/ });
  assert.match(await preciseFilter.innerText(), /—/);
  await page.evaluate(() => { syntheticReview.engineOnly = false; __maiaStudioApp.applyReviewResult(syntheticReview, { refreshPosition: false }); });
  assert.equal(await count('b', 'trap').innerText(), '1'); assert.equal(await count('b', 'beyond').innerText(), '1');
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
  assert.equal(await count('w', 'precise').innerText(), '1');
  await count('w', 'precise').click();
  assert.equal(await preciseFilter.getAttribute('aria-pressed'), 'true');
  assert.equal(await preciseFilter.locator('#filter-count-precise').innerText(), '1');
  assert.equal(await page.locator('.review-tag-precise').innerText(), 'Precise intuition');
  assert.match(await page.locator('.review-card-reason').innerText(), /0\.28.*2\.5 percentage points/);
  await page.locator('.filter-pill[data-filter="moves"]').click();
  await preciseFilter.click();
  assert.equal(await page.locator('.blunder-card').count(), 1);
  assert.equal(await count('w', 'precise').getAttribute('aria-pressed'), 'true');
  await page.locator('#review-clear-filter').click();
  assert.deepEqual(await page.locator('.blunder-card').evaluateAll(cards => cards.map(card => Number(card.dataset.ply))), [4, 5, 8, 13]);
  assert.equal(await page.locator('.review-turning-point').count(), 3);
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
  assert.equal(await page.locator('#review-ready').isVisible(), true, 'Completion keeps the board and current workspace when the user has explored');
  assert.equal(await page.evaluate(() => __maiaStudioApp.currentPly), 3);
  for (const width of [1360, 1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const desktop = width >= 1180;
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
    await page.locator('.filter-pill[data-filter="mistakes"]').click();
    assert.equal(await page.locator('.filter-pill[data-filter="mistakes"]').getAttribute('aria-pressed'), 'true');
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
  assert.deepEqual(errors, []);
  console.log('PASS review UI: side counts and filters, dual labels, unscanned/unknown states, jump/chart navigation, stable side when flipped, answer hiding, practice outcomes, bilingual/mobile layout and session reset.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
