// Opt-in integration check. Downloads the real CDN assets into an isolated browser cache.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = http.createServer((req, res) => {
  let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [], downloads = [];
  page.on('pageerror', error => errors.push(error.message));
  context.on('request', req => { if (req.url().includes('weights.4chess.cc')) downloads.push(req.url()); });
  page.on('console', message => { if (/成功就绪|已就绪|下载模型/.test(message.text())) console.log(message.text()); });
  await page.goto(process.env.STUDIO_URL || `http://127.0.0.1:${server.address().port}/analysis/?lang=zh`);
  await page.waitForFunction(() => window.__maiaStudioApp?.positions.length);
  await page.locator('#btn-settings').click();
  await page.selectOption('#engine-edition', 'standard');
  await page.selectOption('#intuition-edition', '79m');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const app = window.__maiaStudioApp;
    const ready = await app.stockfish.initialize();
    const sf = await app.stockfish.evaluate(app.positions[0].fen, 10, 20000, 3);
    await app.maiaEngine.initialize();
    const prediction = await app.maiaEngine.predict(app.positions[0].fen, 1900, null, () => false, []);
    return { ready, name: app.stockfish.engineName, sf, meta: app.maiaEngine.modelMetadata, moves: prediction?.moves.slice(0, 3), latency: prediction?.latencyMs };
  });
  assert.equal(result.ready, true);
  assert.equal(result.name, 'Stockfish 19 WASM');
  assert.equal(result.sf.lines.length, 3);
  assert.equal(result.meta.total_params, 83094020);
  assert.deepEqual(result.moves.map(m => m.uci), ['e2e4', 'd2d4', 'c2c4']);
  assert.equal(downloads.some(url => url.includes('stockfish-19-standard-v1.wasm')), true);
  assert.equal(downloads.some(url => url.includes('maia3_79m_fp16_v1.bin')), true);
  await page.evaluate(() => window.__maiaStudioApp.loadGameFromPgn('[White "Standard"]\n[Black "79M"]\n[Result "1-0"]\n1. e4 e5 2. Nf3 Nc6 1-0'));
  await page.waitForFunction(() => window.__maiaStudioApp.reviewResult, null, { timeout: 120000 });
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.reviewResult.engineKey), 'sf19standard-v1');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.reviewResult.modelKey), 'maia3-79m-fp16-v1');
  await page.evaluate(() => { window.__maiaStudioApp.goToPly(2); document.activeElement?.blur(); });
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3 && document.querySelectorAll('#maia-candidate-lines .candidate-line').length === 3, null, { timeout: 60000 });
  const rect = await page.locator('#board-container').boundingBox();
  await page.keyboard.press('End');
  assert.deepEqual(await page.locator('#board-container').boundingBox(), rect);
  await page.waitForFunction(() => document.querySelectorAll('#engine-candidate-lines .candidate-line').length === 3 && document.querySelectorAll('#maia-candidate-lines .candidate-line').length === 3, null, { timeout: 60000 });
  if (process.env.STUDIO_SCREENSHOT) await page.screenshot({ path: process.env.STUDIO_SCREENSHOT });
  const count = downloads.length;
  await page.reload();
  await page.waitForFunction(() => window.__maiaStudioApp?.positions.length);
  assert.equal(await page.locator('#engine-edition').inputValue(), 'standard');
  assert.equal(await page.locator('#intuition-edition').inputValue(), '79m');
  await page.evaluate(async () => {
    const app = window.__maiaStudioApp;
    await app.stockfish.initialize();
    await app.maiaEngine.initialize();
  });
  assert.equal(downloads.length, count, 'Reload must reuse both IndexedDB weights without a second download');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result, downloads: count, cacheReuse: true }));
  console.log('✅ Real SF19 Standard and Maia-3 79M: legal candidates, completed review, keyboard stability, saved selection and cache reuse.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
