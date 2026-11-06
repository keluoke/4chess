// Browser interactions, state recovery, and safety for the floating panel. Data is synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const shots = path.join(root, 'artifacts/floating-ux-delivery'); fs.mkdirSync(shots, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/ui/theme.css"><link rel="stylesheet" href="/content/styles.css"></head><body><button id="host-button">Host</button></body></html>'); return; }
  const f = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/plain'); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, locale: 'zh-CN' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
  await page.evaluate(async () => {
    const { IntuitionPanel } = await import('/content/intuition-panel.js');
    const { MaiaEngine } = await import('/engine/maia-engine.js');
    window.hover = []; window.eloCalls = []; window.retryCalls = []; window.openCalls = [];
    window.panel = new IntuitionPanel({
      onMoveHover: move => hover.push(move), onEloChange: elo => eloCalls.push(elo),
      onRetryEngine: name => { retryCalls.push(name); return new Promise(resolve => window.resolveRetry = resolve); },
      onOpenStandaloneAnalysis: mode => { openCalls.push(mode); return new Promise((resolve, reject) => { window.resolveOpen = resolve; window.rejectOpen = reject; }); }
    });
    panel.setFairPlayLocked(false);
    if (panel.container.dataset.fairPlayLocked !== 'false') throw Error('An initially safe page must expose its unlocked state');
    panel.userPositioned = true; panel.setLanguage('zh'); panel.container.dataset.theme = 'light';
    window.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    window.data = { fen, isAvailable: true, turn: 'w', moves: [{ uci: 'e2e4', san: 'e4', prob: 59.3, deltaText: '-0.05' }, { uci: 'd2d4', san: 'd4', prob: 27, deltaText: '0.00' }], stockfish: { bestMove: { uci: 'd2d4', san: 'd4' }, score: '+0.32', scoreCp: 32, lines: [{ uci: 'e2e4', deltaCp: -5, deltaText: '-0.05' }] }, status: { maia: { state: 'ready', source: 'IndexedDB 缓存' }, stockfish: { state: 'ready' } } };
    data.comparison = MaiaEngine.prototype.buildComparison(data.moves[0], data.stockfish, 1900);
    window.comparisonCopy = data.comparison.summary;
    window.noEngineDelta = MaiaEngine.prototype.buildComparison(data.moves[0], null, 1900).delta;
    panel.update(data, 500); panel.setPositionContext(fen, 'position');
  });
  const panel = page.locator('#maia3-intuition-panel');
  assert.match(await page.locator('#maia-insight-badge').innerText(), /评分接近/);
  assert(!((await page.locator('#maia-insight-card').getAttribute('class')).includes('alert-trap')));
  assert.doesNotMatch(await page.locator('.weui-sf-mini-row').innerText(), /Δ/);
  assert.match(await page.evaluate(() => comparisonCopy), /Maia 预测/);
  assert.equal(await page.evaluate(() => noEngineDelta), null);
  await page.evaluate(() => panel.update({ ...data, turn: 'b', stockfish: { ...data.stockfish, scoreCp: 80, score: '+0.80' } }));
  assert.match(await page.locator('.weui-sf-eval').innerText(), /白方评分 -0.80/);
  await page.evaluate(() => panel.update({ ...data, turn: 'b', stockfish: { ...data.stockfish, isMate: true, score: 'M+3' } }));
  assert.match(await page.locator('.weui-sf-eval').innerText(), /M-3/);
  await page.evaluate(() => panel.update({ ...data, comparison: null, moves: [{ ...data.moves[0], deltaText: undefined }] }));
  assert.match(await page.locator('#maia-insight-badge').innerText(), /评分待确认/);
  await page.evaluate(() => panel.update({ ...data, comparison: { deltaText: '-1.30' } }));
  assert((await page.locator('#maia-insight-card').getAttribute('class')).includes('alert-trap'));
  await page.evaluate(() => panel.update(data));
  // Focus and activation provide the same preview as a mouse, and updating data preserves focus.
  const first = page.locator('.weui-move-item').first(); await first.focus();
  assert.equal(await page.evaluate(() => hover.at(-1)), 'e2e4');
  await page.keyboard.press('Enter'); assert.equal(await first.getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => panel.update(data, 550));
  assert.equal(await page.evaluate(() => document.activeElement.dataset.uci), 'e2e4');
  await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => hover.at(-1)), null);
  await first.click(); assert.equal(await first.getAttribute('aria-pressed'), 'true');
  await first.click(); assert.equal(await first.getAttribute('aria-pressed'), 'false');
  // Each control has a name and labels toggle their associated input.
  await page.locator('#panel-display').click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'maia-chk-heatmap');
  assert.equal(await page.locator('#weui-btn-more').getAttribute('aria-expanded'), 'true');
  const before = await page.locator('#maia-chk-heatmap').isChecked(); await page.locator('#lbl-heatmap').click();
  assert.equal(await page.locator('#maia-chk-heatmap').isChecked(), !before);
  const names = await page.locator('#cdn-config-drawer input').evaluateAll(elements => elements.every(e => e.labels.length || e.getAttribute('aria-labelledby') || e.getAttribute('aria-label')));
  assert(names);
  await page.locator('#panel-hide').scrollIntoViewIfNeeded(); await page.locator('#panel-hide').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'weui-btn-drawer-close');
  await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'panel-hide');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#cdn-config-drawer').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'weui-btn-more');
  // Three intermediate slider values produce one analysis callback on commit.
  await page.locator('#panel-rating').click();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.locator('#maia-elo-slider').dispatchEvent('change');
  await page.waitForTimeout(260);
  assert.deepEqual(await page.evaluate(() => eloCalls), [2050]);
  await page.keyboard.press('Escape');
  // Loading is not an error; only failure exposes recovery, with single-flight retries.
  await page.evaluate(() => panel.update({ isAvailable: false, turn: 'w', status: { maia: { state: 'downloading', percent: 37, loadedMB: 10, totalMB: 28 }, stockfish: { state: 'initializing' } } }));
  assert.equal(await page.getByRole('button', { name: /重试/ }).count(), 0);
  await page.evaluate(() => panel.update({ isAvailable: false, turn: 'w', stockfish: data.stockfish, status: { maia: { state: 'error' }, stockfish: { state: 'ready' } } }));
  assert(await page.locator('.weui-move-item').count());
  const retry = page.locator('[data-retry-engine="maia"]'); await retry.click();
  assert(await retry.isDisabled()); assert.deepEqual(await page.evaluate(() => retryCalls), ['maia']);
  await page.evaluate(() => { panel.updateEngineStatus({ maia: { state: 'ready' }, stockfish: { state: 'ready' } }); resolveRetry(); panel.update({ ...data, stockfish: null, status: { maia: { state: 'ready' }, stockfish: { state: 'error' } } }); });
  assert.equal(await page.locator('.weui-delta-tag').first().innerText(), '—');
  assert.match(await page.locator('#maia-insight-text').innerText(), /暂无质量评分/);
  await page.locator('[data-retry-engine="stockfish"]').click();
  assert.deepEqual(await page.evaluate(() => retryCalls), ['maia', 'stockfish']);
  await page.evaluate(() => { resolveRetry(); panel.update(data); });
  // Full semantic state survives a language switch during a calculation.
  await page.evaluate(() => { panel.setEvaluating(fen); panel.setLanguage('en'); });
  assert.match(await page.locator('#maia-turn-pill').innerText(), /Thinking/);
  assert.match(await page.locator('#maia-moves-header-text').innerText(), /White/);
  assert.match(await page.locator('#maia-inference-time').innerText(), /Thinking/);
  await page.evaluate(() => { panel.setLanguage('zh'); panel.update(data); });
  await panel.screenshot({ path: path.join(shots, 'ready.png') });
  // The open action stays busy until the result is known; errors give executable recovery.
  await page.locator('#btn-trigger-standalone').click();
  assert(await page.locator('#btn-trigger-standalone').isDisabled());
  await page.evaluate(() => panel.openStandalone());
  assert.deepEqual(await page.evaluate(() => openCalls), ['position']);
  await page.evaluate(() => rejectOpen(new Error('模拟打开失败')));
  await page.waitForFunction(() => !document.querySelector('#btn-trigger-standalone').disabled);
  assert.match(await page.locator('#panel-action-recovery').innerText(), /模拟打开失败/);
  assert(await page.getByRole('button', { name: '导入 PGN / 打开工作台' }).isVisible());
  await page.locator('#btn-trigger-standalone').click(); await page.evaluate(() => resolveOpen());
  await page.waitForFunction(() => !document.querySelector('#btn-trigger-standalone').disabled);
  // No programmatic retry, preview or handoff runs while the panel is protected.
  const counts = await page.evaluate(() => ({ retry: retryCalls.length, open: openCalls.length, positiveHover: hover.filter(Boolean).length }));
  await page.evaluate(() => { panel.setFairPlayLocked(true); panel.retryEngine('maia'); panel.openStandalone(); panel.previewMove('e2e4'); });
  assert.deepEqual(await page.evaluate(() => ({ retry: retryCalls.length, open: openCalls.length, positiveHover: hover.filter(Boolean).length })), counts);
  assert(await page.locator('#btn-trigger-standalone').isDisabled());
  await page.evaluate(() => panel.setFairPlayLocked(false));
  assert.doesNotMatch(await panel.innerText(), /对局中|已锁定|公平竞技保护/);
  assert.match(await panel.innerText(), /读取/);
  // Minimize frees space, while explicit content collapse closes the drawer and preserves cover.
  await page.locator('#weui-btn-more').click(); await page.locator('#panel-collapse').scrollIntoViewIfNeeded(); await page.locator('#panel-collapse').click();
  assert.equal(await page.locator('#cdn-config-drawer').isVisible(), false);
  assert.equal(await panel.getAttribute('data-collapsed'), 'true');
  await page.locator('#maia-restore').click(); await page.locator('#weui-btn-close').click();
  assert.equal(await panel.isVisible(), false); assert(await page.locator('#maia-wechat-float').isVisible());
  await page.setViewportSize({ width: 320, height: 460 });
  await page.waitForFunction(() => { const r=document.querySelector('#maia-wechat-float').getBoundingClientRect(); return r.x>=0 && r.right<=innerWidth; });
  const fab = await page.locator('#maia-wechat-float').boundingBox(); assert(fab.x >= 0 && fab.x + fab.width <= 320);
  await page.locator('#maia-wechat-float').press('Enter'); assert(await panel.isVisible());
  // Reset clears manual placement; a short summary can expand into a usable panel.
  await page.evaluate(() => { panel.container.style.left = '12px'; panel.userPositioned = true; panel.resetPosition(); });
  assert.equal(await page.evaluate(() => panel.userPositioned), false);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForFunction(() => document.querySelector('#maia3-intuition-panel').getBoundingClientRect().height === 600);
  const beforeDrag = await panel.boundingBox();
  const title = await page.locator('#txt-panel-title').boundingBox();
  await page.mouse.move(title.x + 10, title.y + 5); await page.mouse.down();
  await page.mouse.move(title.x - 50, title.y + 40); await page.mouse.up();
  const afterDrag = await panel.boundingBox();
  assert(Math.abs(afterDrag.x - beforeDrag.x + 60) < 1 && Math.abs(afterDrag.y - beforeDrag.y - 35) < 1, 'Pointer dragging must move the panel');
  await page.evaluate(() => panel.resetPosition());
  await page.evaluate(() => { panel.update(data); panel.userPositioned = true; panel.container.style.setProperty('--diverge-panel-width', '250px'); panel.container.style.setProperty('--diverge-panel-height', '200px'); panel.syncPanelSize(); });
  await panel.screenshot({ path: path.join(shots, 'compact.png') });
  await page.locator('#panel-expand').click(); assert((await panel.boundingBox()).height >= 420);
  assert(await page.locator('.weui-move-item').first().isVisible());
  assert.deepEqual(errors, []);
  console.log('PASS floating UX: meaningful summaries, numeric semantics, preview by keyboard/click, named controls, focus loop/Esc, coalesced Elo, loading/retry, partial failures, bilingual thinking, single-flight handoff, protected actions, collapse/minimize, reset and expansion');
} finally { await browser.close(); server.close(); }
