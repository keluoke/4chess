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
    document.body.dataset.theme = 'dark';
    app.boardUI.container.style.setProperty('--board-light', 'light-dark(#d4e5d3, #223e30)');
    const canvas = document.getElementById('review-share-preview');
    const ctx = canvas.getContext('2d');
    const fillText = ctx.fillText.bind(ctx);
    window.reportCoordinates = [];
    window.reportText = [];
    ctx.fillText = (text, x, y, maxWidth) => {
      if (x === 274 && /^[1-8]$/.test(text)) window.reportCoordinates.push(text);
      window.reportText.push(String(text));
      fillText(text, x, y, maxWidth);
    };
    return { accuracy: [result.accuracyWhite, result.accuracyBlack], path: app.evalChart.linePath.getAttribute('d') };
  });
  await page.locator('#review-share-open').click();
  await page.locator('#review-share-png:not([disabled])').waitFor();
  assert.equal(await page.locator('#review-share-preview').evaluate(canvas => canvas.width), 1080);
  const pixel = (canvas, x, y) => canvas.evaluate((element, [left, top]) =>
    Array.from(element.getContext('2d').getImageData(left, top, 1, 1).data), [x, y]);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).colorScheme), 'dark');
  assert.deepEqual(await pixel(page.locator('#review-share-preview'), 303, 790), [212, 229, 211, 255], 'Empty h3 square keeps the light board palette in dark mode');
  assert.deepEqual(await pixel(page.locator('#review-share-preview'), 75, 840), [255, 255, 255, 255]);
  assert.deepEqual(await page.evaluate(() => reportCoordinates), ['1', '2', '3', '4', '5', '6', '7', '8'], 'The black move is drawn from Black’s side');
  const download = page.waitForEvent('download');
  await page.locator('#review-share-png').click();
  const png = await download;
  assert.equal(png.suggestedFilename(), 'diverge-game-review.png');
  const bytes = fs.readFileSync(await png.path());
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert(bytes.readUInt32BE(20) >= 1000, 'The report uses a vertical layout');
  await page.locator('#review-share-image').click();
  await page.locator('#review-share-status').getByText('Copied to the clipboard.', { exact: true }).waitFor();
  assert(await page.evaluate(async () => (await navigator.clipboard.read()).some(item => item.types.includes('image/png'))));
  await page.locator('#review-share-text').click();
  const textSummary = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(textSummary, /Sample White 1-0 Sample Black/);
  assert.equal(textSummary.split('\n').length, 3);
  await page.locator('#review-share-copy').click();
  const shared = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(shared.origin, 'https://4chess.cc');
  assert.equal(shared.pathname, '/analysis/shared.html');
  assert.match(shared.hash, /review=/);

  await page.evaluate(async () => {
    const { ChessBoard } = await import('/engine/chess-core.js');
    const app = window.__maiaStudioApp;
    const report = app.reviewResult;
    report.elo = 2600;
    Object.assign(report.allMoves[0], { reviewStoryBestUci: report.allMoves[0].uci, humanProbability: 2.8,
      maiaTopUci: 'd2d4', maiaTopProb: 41 });
    Object.assign(report.allMoves[3], { narrowChoice: { narrow: true, found: false } });
    Object.assign(report.allMoves[4], { narrowChoice: { narrow: true, found: true }, isBeyondIntuition: true,
      divergenceType: 'beyond_intuition', divergenceStatus: 'confirmed', reviewStoryBestUci: report.allMoves[4].uci,
      maiaTopUci: 'f1c4', maiaLossCp: 85, maiaESL: 5 });
    Object.assign(report.allMoves[5], { narrowChoice: { narrow: false, found: false } });
    app.maiaEngine.isReady = true;
    let stalled = true;
    window.compareRequests = [];
    window.reportText = [];
    window.reportCoordinates = [];
    app.maiaEngine.predict = async (fen, elo, _, cancelled, history) => {
      if (stalled) {
        stalled = false;
        await new Promise(resolve => { window.releaseComparison = resolve; });
        if (cancelled()) return null;
      }
      const ply = report.allMoves.findIndex(move => move.fenBefore === fen);
      window.compareRequests.push({ ply, elo, history });
      const played = report.allMoves[ply].uci;
      const alternative = new ChessBoard(fen).getLegalMoves().find(move => move.uci !== played)?.uci;
      return { moves: [{ uci: elo === 1500 || elo === 1900 && ply >= 2 ? alternative : played }] };
    };
  });
  await page.locator('#review-share-compare').click();
  await page.waitForFunction(() => window.releaseComparison);
  await page.getByRole('button', { name: 'Stop comparing' }).click();
  await page.evaluate(() => window.releaseComparison());
  assert.equal(await page.locator('#review-share-copy').isEnabled(), true);
  await page.getByRole('button', { name: 'Compare 1500 / 1900 / 2600 Elo' }).click();
  await page.locator('#review-share-compare-status').getByText('Rating comparison added', { exact: true }).waitFor();
  await page.locator('#review-share-text:enabled').click();
  const storyText = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(storyText, /1\. e4 · Maia predicts 2\.8% of 2600 Elo players/);
  assert.match(storyText, /3\/8 plies checked · 2 narrow positions · 1 correct replies/);
  assert.match(storyText, /1500 · 1\. e4 +\/ +1900 · 2\. Nf3 +\/ +2600 · No streak/);
  await page.locator('#review-share-details[open]').getByText(/first run of 4 consecutive plies/).waitFor();
  const firstFocus = await page.evaluate(() => ({ text: window.reportText, board: window.reportCoordinates }));
  assert.ok(firstFocus.text.includes('Intuition trap'));
  assert.equal(firstFocus.board.length, 8, 'Only one board is drawn even with two confirmed candidates');
  assert.doesNotMatch(firstFocus.text.join(' '), /Brilliant move|Least expected|narrow positions|first run|Where each rating|checked|0 precise/);
  assert.deepEqual(await page.evaluate(() => window.compareRequests.find(request => request.elo === 1900 && request.ply === 2)?.history.length), 2);
  await page.locator('#review-share-copy').click();
  const withStory = new URL(await page.evaluate(() => navigator.clipboard.readText()));

  const recipient = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const engineAssets = [];
  recipient.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('.wasm') || /maia-worker|stockfish-inbrowser|weights\.4chess/.test(request.url())) engineAssets.push(request.url());
  });
  const view = await recipient.newPage();
  view.on('pageerror', error => errors.push(error.message));
  await view.goto(origin + withStory.pathname + withStory.hash);
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
  await view.locator('#snapshot-story').getByRole('button', { name: '2. Nf3', exact: true }).click();
  assert.equal(await view.locator('#snapshot-position').innerText(), '1… e5');
  assert.equal(await view.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(engineAssets, [], 'Viewing and replaying a snapshot must never start an engine');
  if (process.env.TEST_SHARE_SCREENSHOT) {
    await view.screenshot({ path: process.env.TEST_SHARE_SCREENSHOT, fullPage: true });
    await png.saveAs(process.env.TEST_SHARE_SCREENSHOT.replace(/\.png$/, '-report.png'));
  }

  await page.locator('#review-share-anonymize').check();
  await page.locator('#review-share-copy:not([disabled])').waitFor();
  await page.locator('#review-share-text').click();
  assert.doesNotMatch(await page.evaluate(() => navigator.clipboard.readText()), /Sample White|Sample Black|AbCd1234/);
  await page.locator('#review-share-copy').click();
  const anonymous = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  const data = await view.evaluate(async hash => {
    const { decodeReviewSnapshot } = await import('./review-snapshot.js?v=20261125-poster-focus');
    return decodeReviewSnapshot(new URLSearchParams(hash.slice(1)).get('review'));
  }, anonymous.hash);
  assert.deepEqual([data.white, data.black, data.source], ['', '', null]);
  assert.equal(anonymous.hash.includes('secret'), false);
  await view.goto(origin + shared.pathname + '?lang=zh#review=invalid');
  await view.getByText('无法打开这份复盘，请让分享者重新复制链接。', { exact: true }).waitFor();
  assert(await view.locator('#snapshot-report').isHidden());

  const alternativeFocuses = await page.evaluate(async () => {
    const app = window.__maiaStudioApp;
    const original = app.reviewResult;
    const rare = original.allMoves.map(move => ({
      ...move, divergenceType: null, isHumanTrap: false, isBeyondIntuition: false,
      severity: 'good', lossCp: 0, accuracy: 98
    }));
    const shot = async allMoves => {
      window.reportText = [];
      window.reportCoordinates = [];
      app.reviewResult = { ...original, accuracyWhite: 98.3, accuracyBlack: 97.6, allMoves };
      await app.reviewShare.prepare();
      return { text: window.reportText, board: window.reportCoordinates, height: app.reviewShare.canvas.height };
    };
    const rareFocus = await shot(rare);
    const narrowFocus = await shot(rare.map(move => ({ ...move, humanProbability: null })));
    const blunderFocus = await shot(rare.map((move, index) => index === 2 ? { ...move, severity: 'blunder', lossCp: 250 } : move));
    app.reviewResult = original;
    return { rareFocus, narrowFocus, blunderFocus };
  });
  assert.ok(alternativeFocuses.rareFocus.text.includes('Least expected engine pick'));
  assert.ok(alternativeFocuses.rareFocus.text.includes('Human instinct d4'));
  assert.ok(alternativeFocuses.rareFocus.text.includes('Engine pick e4'));
  assert.ok(alternativeFocuses.rareFocus.text.some(text => text.includes('98.3%') && text.includes('No blunders')));
  assert.equal(alternativeFocuses.rareFocus.board.length, 8);
  assert.doesNotMatch(alternativeFocuses.rareFocus.text.join(' '), /only correct|unique|tightrope|Where each rating/);
  assert.ok(alternativeFocuses.narrowFocus.text.includes('Found the best move in 1 of 2 confirmed tightrope positions'));
  assert.equal(alternativeFocuses.narrowFocus.board.length, 0);
  assert.ok(alternativeFocuses.narrowFocus.height < alternativeFocuses.rareFocus.height);
  assert.ok(!alternativeFocuses.blunderFocus.text.some(text => text.includes('No blunders')));
  const broadcastFooter = await page.evaluate(async () => {
    const app = window.__maiaStudioApp;
    app.reviewShare.anonymize.checked = false;
    app.pgnTags.gameurl = 'https://lichess.org/broadcast/fide-world-chess-championship-2026/game-1/xLgOJ6cb/j7pdr7s2';
    window.reportText = [];
    await app.reviewShare.prepare();
    delete app.pgnTags.gameurl;
    return window.reportText;
  });
  assert.ok(broadcastFooter.includes('Scan to replay the game'));
  await page.locator('#review-share-status').getByText(/QR code opens the broadcast replay/).waitFor();

  await page.locator('#review-share-close').click();
  await page.locator('#review-report-workbench').click();
  await page.evaluate(() => __maiaStudioApp.boardUI.setOrientation('black'));
  await page.locator('.review-side-controls [data-review-side="all"]').click();
  await page.locator('.review-list-modes [data-filter="moves"]').click();
  await page.locator('#blunder-list .blunder-card[data-ply="4"]').getByRole('button', { name: 'Share card' }).click();
  await page.locator('#share-card-dialog[open] #btn-share-card-download:enabled').waitFor();
  const moveCard = page.locator('#share-card-canvas');
  assert.deepEqual(await pixel(moveCard, 55, 219), [212, 229, 211, 255], 'Single move matches the board’s light square');
  assert.deepEqual(await pixel(moveCard, 45, 340), [255, 255, 255, 255], 'Single move keeps the light frame in dark mode');
  assert.deepEqual(await pixel(moveCard, 30, 30), [238, 243, 237, 255], 'Single move uses the diagnosis paper background');
  const legendRows = await page.evaluate(async () => {
    const { buildShareCardSpec, readStudioShareBoard, renderShareCardCanvas } =
      await import('/analysis/share-card.js?v=20261124-intuition-labels');
    const host = document.getElementById('board-container');
    const theme = readStudioShareBoard(host);
    const move = __maiaStudioApp.reviewResult.allMoves[3];
    const spec = buildShareCardSpec(move, { lang: 'en', theme });
    spec.arrows.forEach(arrow => { arrow.label = arrow.label.repeat(14); });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const rows = [];
    const badges = [];
    const roundRect = ctx.roundRect.bind(ctx);
    ctx.roundRect = (x, y, w, h, radius) => {
      if (h === 34) rows.push({ y, bottom: y + h });
      return roundRect(x, y, w, h, radius);
    };
    const fillText = ctx.fillText.bind(ctx);
    ctx.fillText = (text, x, y, width) => {
      if (y === 64 || y === 46) badges.push([text, ctx.fillStyle]);
      fillText(text, x, y, width);
    };
    await renderShareCardCanvas(spec, canvas);
    const legendRows = rows.slice();
    const highlight = { ...move, divergenceType: 'beyond_intuition', severity: 'good', lossCp: 0 };
    await renderShareCardCanvas(buildShareCardSpec(highlight, { lang: 'zh', theme, format: 'portrait' }), canvas);
    return { rows: legendRows, theme, badges };
  });
  assert.deepEqual(legendRows.badges, [['Intuition trap', '#b94950'], ['神之一手', '#2e6086']]);
  assert.equal(legendRows.rows.length, 2);
  assert(legendRows.rows[1].y > legendRows.rows[0].bottom, 'Long labels use two separate rows');
  assert(legendRows.rows[1].bottom < 410, 'The second legend row ends above the QR quiet zone');
  assert.equal(legendRows.theme.stockfish, 'rgb(46, 96, 134)');
  assert.equal(legendRows.theme.played, 'rgb(185, 73, 80)');
  for (const [format, width, height] of [['landscape', 1200, 675], ['portrait', 1080, 1350]]) {
    await page.locator(`#share-card-dialog [data-share-format="${format}"]`).click();
    await page.locator('#btn-share-card-download:enabled').waitFor();
    const exported = page.waitForEvent('download');
    await page.locator('#btn-share-card-download').click();
    const image = await exported;
    const data = fs.readFileSync(await image.path());
    assert.deepEqual([data.readUInt32BE(16), data.readUInt32BE(20)], [width, height]);
    assert.match(image.suggestedFilename(), new RegExp(`-${format}\\.png$`));
    if (process.env.TEST_SHARE_SCREENSHOT) await image.saveAs(process.env.TEST_SHARE_SCREENSHOT.replace(/\.png$/, `-move-${format}.png`));
  }
  await page.locator('#btn-share-card-copy').click();
  await page.locator('#share-card-status').getByText('Copied PNG image to clipboard.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);

  const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))).version;
  const extension = path.resolve(root, process.env.DIVERGE_RELEASE_DIR || 'releases', 'diverge-extension-v' + version);
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
  console.log('PASS whole-game share: PNG download and clipboard, anonymous text, exact snapshot and variations, no engine requests, mobile layout.', shared.href.length + ' URL chars');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
