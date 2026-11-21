import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'chromium', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 930 }, permissions: ['clipboard-read','clipboard-write'] });
  await context.route('https://weights.4chess.cc/**', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/analysis/?lang=en');
  await page.waitForFunction(() => window.__maiaStudioApp?.positions.length);

  const expected = await page.evaluate(async () => {
    const app = window.__maiaStudioApp;
    app.maiaEngine.initialize = async () => false;
    app.maiaEngine.predict = async () => ({ moves: [] });
    const pgn = '[Event "Private practice room"]\n[Site "https://lichess.org/AbCd1234"]\n[White "Sample White"]\n[Black "Sample Black"]\n[Opening "Damiano Defence"]\n[Result "1-0"]\n1. e4 e5 {private notes} 2. Nf3 f6 3. Nxe5 fxe5 4. Qh5+ Ke7 1-0';
    app.startNewSession({ pgn, autoReview: false });
    await app.runFullReview();
    app.intuitionReview.dispose();
    const result = app.reviewResult = app.coreReview;
    const move = result.allMoves[3];
    Object.assign(move, {
      divergenceType: 'intuition_trap', divergenceStatus: 'confirmed', isHumanTrap: true,
      verifiedBestUci: 'b8c6', verifiedBestSan: 'Nc6', verifiedBestPv: ['b8c6', 'f1b5'],
      verifiedPlayedPv: ['f7f6', 'f3e5'], maiaTopUci: 'f7f6', maiaTopProb: 61.1, humanProbability: 61.1,
      verifiedExpectedScoreLoss: 25, verifiedLossCp: 180
    });
    app.applyReviewResult(result);
    app.reviewOverview.show('overview');
    return { accuracy: [result.accuracyWhite, result.accuracyBlack], path: app.evalChart.linePath.getAttribute('d') };
  });
  await page.locator('#review-share-open').click();
  await page.locator('#review-share-png:not([disabled])').waitFor();
  assert.equal(await page.locator('#review-share-preview').evaluate(canvas => canvas.width), 1080);
  const download = page.waitForEvent('download');
  await page.locator('#review-share-png').click();
  const png = await download;
  assert.equal(png.suggestedFilename(), 'diverge-game-review.png');
  const bytes = fs.readFileSync(await png.path());
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert(bytes.readUInt32BE(20) >= 1000, 'The report uses a vertical layout');
  await page.locator('#review-share-copy').click();
  const shared = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(shared.origin, 'https://4chess.cc');
  assert.equal(shared.pathname, '/analysis/shared.html');
  assert.match(shared.hash, /review=/);

  const recipient = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const engineAssets = [];
  recipient.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('.wasm') || /maia-worker|stockfish-inbrowser|weights\.4chess/.test(request.url())) engineAssets.push(request.url());
  });
  const view = await recipient.newPage();
  view.on('pageerror', error => errors.push(error.message));
  await view.goto(origin + shared.pathname + shared.hash);
  await view.locator('#snapshot-report').waitFor();
  assert.match(await view.locator('#snapshot-title').innerText(), /Sample White.*Sample Black/);
  assert.deepEqual(await view.locator('#snapshot-scores dd').allTextContents(), expected.accuracy.map(value => value.toFixed(1) + '%'));
  assert.equal(await view.locator('#eval-line-path').getAttribute('d'), expected.path, 'Receive the exact chart without a scoring run');
  await view.locator('#snapshot-turns button', { hasText: '2… f6' }).click();
  assert.match(await view.locator('#snapshot-evidence').innerText(), /Stockfish · Nc6/);
  assert.match(await view.locator('#snapshot-evidence').innerText(), /Played move lost 1.80 pawns/);
  await view.locator('#snapshot-lines button', { hasText: 'Bb5' }).click();
  assert.match(await view.locator('#snapshot-position').innerText(), /Variation.*Bb5/);
  assert.match(await view.locator('#snapshot-analyze').getAttribute('href'), /#fen=/);
  await view.locator('#snapshot-next').click();
  assert.equal(await view.locator('#snapshot-position').innerText(), '2… f6');
  assert.equal(await view.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(engineAssets, [], 'Viewing and replaying a snapshot must never start an engine');
  if (process.env.TEST_SHARE_SCREENSHOT) {
    await view.screenshot({ path: process.env.TEST_SHARE_SCREENSHOT, fullPage: true });
    await png.saveAs(process.env.TEST_SHARE_SCREENSHOT.replace(/\.png$/, '-report.png'));
  }

  await page.locator('#review-share-anonymize').check();
  await page.locator('#review-share-copy:not([disabled])').waitFor();
  await page.locator('#review-share-copy').click();
  const anonymous = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  const data = await view.evaluate(async hash => {
    const { decodeReviewSnapshot } = await import('./review-snapshot.js?v=20261122-v129');
    return decodeReviewSnapshot(new URLSearchParams(hash.slice(1)).get('review'));
  }, anonymous.hash);
  assert.deepEqual([data.white, data.black, data.source], ['', '', null]);
  assert.equal(anonymous.hash.includes('secret'), false);
  await view.goto(origin + shared.pathname + '#review=invalid');
  await view.waitForFunction(() => !document.getElementById('snapshot-status').hidden && /invalid|损坏/.test(document.getElementById('snapshot-status').textContent));
  assert(await view.locator('#snapshot-report').isHidden());
  assert.deepEqual(errors, []);

  const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))).version;
  const extension = path.join(root, 'releases', 'diverge-extension-v' + version);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'diverge-review-share-'));
  const installed = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension]
  });
  try {
    await installed.route('https://weights.4chess.cc/**', request => request.abort());
    const sw = installed.serviceWorkers()[0] || await installed.waitForEvent('serviceworker');
    const studio = await installed.newPage();
    const pgn = '[Result "1-0"]\n1. e4 e5 2. Nf3 Nc6 1-0';
    await studio.goto('chrome-extension://' + new URL(sw.url()).host + '/analysis/index.html#' + new URLSearchParams({ pgn, lang: 'en' }));
    await studio.waitForFunction(() => window.__maiaStudioApp?.reviewResult?.totalMoves === 4);
    await studio.locator('#btn-review-overview').click();
    await studio.locator('#review-share-open').click();
    await studio.locator('#review-share-png:not([disabled])').waitFor();
    assert.equal(await studio.locator('#review-share-preview').evaluate(canvas => canvas.width), 1080);
    assert.match(await studio.evaluate(() => window.__maiaStudioApp.reviewShare.url), /^https:\/\/4chess\.cc\/analysis\/shared\.html#review=/);
  } finally {
    await installed.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log('PASS whole-game PNG and snapshot: independent browser, identical accuracy and chart, key move and variation, no engine requests, anonymous export and mobile layout.', shared.href.length + ' URL chars');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
