import assert from 'node:assert/strict';
import { createReadStream, existsSync, statSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { LIVE_EVENTS } from '../cloudflare/live/events.js';
import { eventView, fallbackRounds, parseRoundPgn } from '../cloudflare/live/model.js';

const root = path.resolve(import.meta.dirname, '..');
const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(root + path.sep) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const event = LIVE_EVENTS.wcc2026;
const rounds = fallbackRounds(event);
const current = rounds[0];
const pgn = line => '[Event "Game 1"]\n[White "Sindarov"]\n[WhiteFideId "14205483"]\n[Black "Gukesh"]\n[BlackFideId "46616543"]\n[Result "*"]\n\n' + line + ' *';
let line = '1. e4 { [%clk 1:59:32] } e5 { [%clk 1:58:52] } 2. Nf3 { [%clk 1:57:33] }';
let updatedAt = current.startsAt + 1000;
let finished = false;
async function mockBroadcast(context) {
  await context.route('**/api/live/event?*', route => {
    const raw = finished ? pgn(line).replace('[Result "*"]', '[Result "1/2-1/2"]').replace(/\*$/, '1/2-1/2') : pgn(line);
    const snapshot = { games: parseRoundPgn(raw, event) };
    return route.fulfill({ json: eventView('wcc2026', event, rounds, new Map([[current.id, snapshot]]), current.startsAt + 1000) });
  });
  await context.route('**/api/live/round?*', route => {
    const roundId = new URL(route.request().url()).searchParams.get('id');
    const isCurrent = roundId === current.id;
    const raw = pgn(isCurrent ? line : '');
    const game = parseRoundPgn(isCurrent && finished ? raw.replace('[Result "*"]', '[Result "1/2-1/2"]').replace(/\*$/, '1/2-1/2') : raw, event)[0];
    return route.fulfill({ json: {
      ...game, roundId, updatedAt, roundName: 'Game 1', status: isCurrent ? (finished ? 'finished' : 'live') : 'scheduled'
    } });
  });
}

async function mockEngines(context) {
  await context.route('**/live/engines.js?*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `import { ChessBoard } from '/engine/chess-core.js';
    export class LiveEngines {
      constructor({ maiaVariant, maiaMode, stockfishVariant, depth, elo }) {
        this.mode = maiaMode;
        window.liveMaiaMode = maiaMode;
        window.liveEngineSettings = { maiaVariant, stockfishVariant, depth, elo };
      }
      cancel() {}
      dispose() {}
      status() {
        return {
          sf: { state: 'ready', source: 'bundled' },
          maia: this.mode === 'off' ? null : this.mode === 'cache' ? { state: 'ready', source: 'cache' }
            : { state: 'downloading', source: 'cdn', percent: 46 }
        };
      }
      async sampleMaia(position, elo) { return [{ uci: position.series[0].uci, rawProb: elo / 4000 }]; }
      async inspect(position) {
        const chess = new ChessBoard(position.fen);
        const legal = chess.getLegalMoves();
        const stockfish = legal.find(move => move.uci === (chess.turn === 'w' ? 'f1b5' : 'b8c6')) || legal[0];
        const maia = { ...legal.find(move => move.uci !== stockfish.uci), rawProb: .55 };
        const evaluation = chess.turn === 'w' ? { cp: 35, text: '+0.35' } : { cp: -35, text: '-0.35' };
        const series = [{ uci: stockfish.uci, san: stockfish.san, label: stockfish.san, role: 'sf' }];
        const moves = [{ uci: stockfish.uci, rawProb: .16 }, maia];
        (window.positionRequests ||= []).push(position.fen);
        if (window.holdAssessment) {
          window.holdAssessment = false;
          await new Promise(resolve => { window.finishAssessment = resolve; });
        }
        if (this.mode === 'off') return { evaluation, stockfish, depth: 18 };
        return { evaluation, stockfish, maia, depth: 18, maiaReady: true, trend: { ...position, series, moves } };
      }
      async classify(move, { fen: fenBefore }) {
        return {
          ...move, fenBefore, bestUci: move.uci === 'b8c6' ? 'g8f6' : move.uci,
          bestSan: move.san === 'Nc6' ? 'Nf6' : move.san, maiaTopUci: 'f1c4', maiaTopSan: 'Bc4',
          humanRawProbability: .11, lossCp: 0, severity: 'good', divergenceStatus: 'confirmed', divergenceType: 'beyond_intuition'
        };
      }
    }`
  }));
}

const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'chromium', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const issues = [];
  page.on('pageerror', error => issues.push(error.message));
  await page.clock.install({ time: current.startsAt + 1000 });
  await mockBroadcast(context);
  await mockEngines(context);
  const origin = 'http://127.0.0.1:' + server.address().port;
  await page.goto(origin + '/live/?lang=zh');
  await page.locator('#event-moves button[data-ply="3"]').waitFor();
  await page.locator('#sf-line').getByText('Nc6 · -0.35 · D18').waitFor();
  await page.locator('#analyze:not([disabled])').waitFor();
  assert.equal(await page.locator('#analyze').innerText(), '暂停双引擎');
  const expectedFen = parseRoundPgn(pgn(line), event)[0].fen;
  assert.equal(await page.evaluate(() => window.positionRequests[0]), expectedFen);
  assert.equal(await page.locator('#gauge-score-black').innerText(), '-0.35');
  assert.ok(Number.parseFloat(await page.locator('#gauge-white').evaluate(el => el.style.height)) < 50);
  assert.equal(await page.locator('#event-board [data-role="sf"]').count(), 1);
  assert.equal(await page.locator('#event-board [data-role="maia"]').count(), 1);
  assert.equal(await page.locator('#workbench-game').isVisible(), false);
  for (const id of ['#event-board', '#evaluation-gauge', '#white-clock', '#black-clock']) {
    const rect = await page.locator(id).boundingBox();
    assert.ok(rect.y >= 0 && rect.y + rect.height <= 720, id + ' fits above the fold: ' + JSON.stringify(rect));
  }
  const layout = await page.locator('#round-rail button:first-child').evaluate(button => Array.from(button.children, child => child.getBoundingClientRect().y));
  assert.ok(Math.abs(layout[0] - layout[1]) < 4, 'Round number and result occupy one line');
  await page.locator('#btn-settings').click();
  assert.equal(await page.locator('#event-elo').inputValue(), '2600');
  assert.equal(await page.locator('#live-maia').inputValue(), '23m');
  assert.equal(await page.locator('#live-sf').inputValue(), 'lite');
  await page.locator('#setting-sf-arrows').uncheck();
  await page.waitForFunction(() => !document.querySelector('#event-board [data-role="sf"]'));
  assert.equal(await page.locator('#event-board [data-role="maia"]').count(), 1);
  await page.locator('#setting-sf-arrows').check();
  await page.locator('#live-settings button').click();
  assert.equal(await page.locator('#round-rail button').count(), 14);
  assert.equal(await page.locator('#round-rail button[aria-current]').getAttribute('data-round'), current.id);
  assert.match(await page.locator('#white-seat').innerText(), /辛达罗夫/);
  assert.match(await page.locator('#black-seat').innerText(), /古克什/);
  await page.locator('#copy-live-link').click();
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(copied.searchParams.get('round'), current.id);
  assert.equal(copied.searchParams.get('ply'), '3');
  await page.locator('#moment').click();
  await page.locator('#share-card-dialog[open]').waitFor();
  assert.equal(await page.locator('#share-card-canvas').evaluate(el => el.width), 1080);
  await page.locator('#btn-close-share-card').click();
  assert.equal(await page.locator('#event-board .maia-square').count(), 64);
  assert.equal(await page.locator('#white-clock').innerText(), '1:57:33');
  const blackBefore = await page.locator('#black-clock').innerText();
  await page.clock.fastForward(2000);
  assert.notEqual(await page.locator('#black-clock').innerText(), blackBefore);
  assert.equal(await page.locator('#black-seat').getAttribute('data-to-move'), 'true');
  assert.equal(await page.locator('#white-clock').innerText(), '1:57:33');
  await page.locator('#previous').click();
  assert.equal(await page.locator('#black-clock').innerText(), '1:58:52');
  assert.equal(await page.locator('#white-clock').innerText(), '1:59:32');
  assert.equal(await page.locator('#black-seat').getAttribute('data-to-move'), 'false');
  const square = name => page.locator('#event-board [data-square="' + name + '"]');
  const drag = async (from, to, button, shift = false) => {
    const a = await square(from).boundingBox(), b = await square(to).boundingBox();
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down({ button });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up({ button });
    if (shift) await page.keyboard.up('Shift');
  };
  await drag('g1', 'f3', 'right');
  assert.equal(await page.locator('.study-annotations line').count(), 1);
  await drag('g1', 'f3', 'right', true);
  assert.equal(await page.locator('#ply-note').innerText(), '试走变化');
  assert.match(await page.locator('.study-annotations').textContent(), /!!/);
  await page.locator('#sf-line').getByText('Nc6 · -0.35 · D18').waitFor();
  await page.locator('#flip-board').click();
  assert.equal(await page.locator('#board-frame').evaluate(element => element.previousElementSibling.id), 'white-seat');
  assert.ok(await page.locator('#evaluation-gauge').evaluate(el => el.classList.contains('flipped')));
  assert.equal(await page.locator('#workbench-game').isVisible(), false);
  assert.deepEqual(await page.evaluate(() => window.liveEngineSettings), { maiaVariant: '23m', stockfishVariant: 'lite', depth: 18, elo: 2600 });
  assert.equal(await page.locator('#maia-progress').evaluate(el => el.value), 46);
  await page.locator('#moment').click();
  await page.locator('#share-card-dialog[open]').waitFor();
  await page.locator('#btn-share-card-link').click();
  const branchLink = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(branchLink.searchParams.get('ply'), '2');
  assert.equal(branchLink.searchParams.get('line'), 'g1f3');
  const recipient = await context.newPage();
  await recipient.goto(origin + '/live/' + branchLink.search);
  await recipient.locator('#ply-note').getByText('试走变化').waitFor();
  assert.equal(await recipient.locator('#event-board [data-square="f3"] .maia-piece').count(), 1);
  branchLink.searchParams.set('line', 'g1g6');
  await recipient.goto(origin + '/live/' + branchLink.search);
  await recipient.locator('#live-link-status').getByText('此链接中的试走变化无法在当前棋谱上重现。').waitFor();
  assert.equal(await recipient.locator('#event-board [data-square="g1"] .maia-piece').count(), 1);
  await recipient.close();
  await page.locator('#btn-close-share-card').click();
  line += ' Nc6 { [%clk 0:04:59] }';
  updatedAt = await page.evaluate(() => Date.now() + 11000);
  await page.clock.fastForward(11000);
  await page.locator('#new-move').waitFor();
  assert.equal(await page.locator('#ply-note').innerText(), '试走变化');
  assert.equal(await page.locator('#event-board [data-square="f3"] .maia-piece').count(), 1);
  await page.locator('#new-move').click();
  assert.equal(await page.locator('#ply-note').innerText(), '4 / 4');
  await page.locator('#intuition-tag').getByText('Nc6 · 神之一手').waitFor();
  assert.equal(await page.locator('#sf-line').innerText(), 'Bb5 · +0.35 · D18');
  assert.equal(await page.locator('#black-clock').innerText(), '4:59');
  assert.equal(await page.locator('#black-clock').getAttribute('data-low'), 'true');
  assert.equal(await page.locator('#white-seat').getAttribute('data-to-move'), 'true');
  await page.locator('#trend-toggle').click();
  await page.locator('#trend-status').getByText('已完成 6/6 档', { exact: false }).waitFor();
  assert.equal(await page.locator('#trend-chart circle').count(), 6);
  await page.locator('#trend-data-view').click();
  assert.equal(await page.locator('#trend-data tbody tr').count(), 6);
  assert.equal(await page.locator('#trend-data tbody tr:first-child td').innerText(), '15.0%');
  await page.locator('#trend-chart-view').click();
  assert.equal(await page.locator('#trend-chart').isVisible(), true);
  await page.evaluate(() => {
    window.cardText = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      window.cardText.push(String(text));
      return fillText.call(this, text, ...args);
    };
  });
  await page.locator('#language').click();
  await page.locator('#moment').click();
  await page.locator('#share-card-dialog[open]').waitFor();
  assert.equal(await page.locator('#share-card-canvas').evaluate(el => el.height), 1350);
  await page.locator('#btn-share-card-link').click();
  assert.equal(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get('ply'), '4');
  await page.locator('#btn-share-card-copy').click();
  await page.locator('#share-card-status').getByText('Copied PNG image to clipboard.', { exact: true }).waitFor();
  assert.ok(await page.evaluate(async () => (await navigator.clipboard.read()).some(item => item.types.includes('image/png'))));
  await page.locator('[data-share-format="landscape"]').click();
  await page.locator('#btn-share-card-download:not([disabled])').waitFor();
  assert.equal(await page.locator('#share-card-canvas').evaluate(el => el.width), 1200);
  const downloaded = page.waitForEvent('download');
  await page.locator('#btn-share-card-download').click();
  assert.equal((await downloaded).suggestedFilename(), 'diverge-wcc-' + current.id + '-4-landscape.png');
  assert.ok(await page.evaluate(() => window.cardText.some(text => /Brilliant move/.test(text))));
  await page.locator('#btn-close-share-card').click();
  await page.locator('#language').click();
  await page.evaluate(() => { window.holdAssessment = true; });
  await page.locator('#previous').click();
  assert.equal(await page.locator('#live-trend').isVisible(), false);
  await page.waitForFunction(() => !!window.finishAssessment);
  await page.evaluate(() => {
    for (const hidden of [true, false]) {
      Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    }
    window.finishAssessment();
  });
  await page.locator('#sf-line').getByText('Nc6 · -0.35 · D18').waitFor();
  assert.ok(await page.evaluate(fen => window.positionRequests.filter(request => request === fen).length >= 4, expectedFen));
  await drag('b8', 'c6', 'left');
  assert.equal(await page.locator('#ply-note').innerText(), '试走变化');
  await page.locator('#event-moves button[data-ply="2"]').click();
  await square('g1').click();
  await square('f3').click();
  assert.equal(await page.locator('#ply-note').innerText(), '试走变化');
  if (process.env.LIVE_SCREENSHOTS) {
    mkdirSync(process.env.LIVE_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.LIVE_SCREENSHOTS, 'desktop.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 710 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page stays within the viewport');
  const board = await page.locator('#event-board').boundingBox();
  assert.equal(board.width, board.height);
  assert.equal(board.width, 390);
  if (process.env.LIVE_SCREENSHOTS) {
    await page.screenshot({ path: path.join(process.env.LIVE_SCREENSHOTS, 'mobile.png'), fullPage: true });
  }
  await page.locator('#round-rail button[data-round="' + rounds[1].id + '"]').click();
  await page.locator('#event-status').getByText('尚未开赛').waitFor();
  const countdown = await page.locator('#round-countdown').innerText();
  assert.match(countdown, /距开赛 \d{2,}:\d{2}:\d{2}/);
  await page.clock.fastForward(1100);
  assert.notEqual(await page.locator('#round-countdown').innerText(), countdown);
  assert.equal(await page.locator('#event-moves button').count(), 0);
  await page.locator('#analyze').click();
  assert.equal(await page.locator('#sf-line').innerText(), '—');
  await page.locator('#moment').click();
  await page.locator('#share-card-dialog[open]').waitFor();
  await page.locator('#btn-share-card-link').click();
  assert.equal(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get('ply'), '0');
  await page.locator('#btn-close-share-card').click();
  finished = true;
  await page.locator('#round-rail button[data-round="' + current.id + '"]').click();
  await page.locator('#workbench-game').getByText('查看整盘复盘报告 →').waitFor();
  assert.match(await page.locator('#round-rail button[aria-current]').innerText(), /½–½/);
  assert.match(await page.locator('#workbench-game').getAttribute('href'), /^\/analysis\/#pgn=/);
  assert.deepEqual(issues, []);
  await page.locator('#btn-settings').click();
  await page.locator('#live-maia').selectOption('79m');
  await page.locator('#live-sf').selectOption('standard');
  const other = await page.context().newPage();
  await other.goto(origin + '/analysis/');
  const synced = await other.evaluate(async () => (await import('/engine/engine-preferences.js')).getSavedPreferences());
  assert.equal(synced.maiaVariant, '79m');
  assert.equal(synced.stockfishVariant, 'standard');
  await other.evaluate(async () => (await import('/engine/engine-preferences.js')).savePreferences({ maiaVariant: '5m' }));
  await page.waitForFunction(() => document.querySelector('#live-maia').value === '5m');

  finished = false;
  line += ' 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. Nc3 Bb7';
  const mobile = await browser.newContext({ viewport: { width: 390, height: 710 }, hasTouch: true, isMobile: true });
  await mockBroadcast(mobile);
  await mockEngines(mobile);
  const phone = await mobile.newPage();
  phone.on('pageerror', error => issues.push(error.message));
  await phone.goto(origin + '/live/?lang=en');
  await phone.locator('#event-moves [data-ply="24"]').waitFor({ state: 'attached' });
  await phone.locator('#load-maia:not([disabled])').waitFor();
  await phone.waitForFunction(() => window.liveMaiaMode === 'off');
  assert.equal(await phone.evaluate(() => window.liveMaiaMode), 'off');
  assert.deepEqual(await phone.evaluate(() => window.liveEngineSettings),
    { maiaVariant: '5m', stockfishVariant: 'lite', depth: 18, elo: 2600 });
  assert.match(await phone.locator('#load-maia').getAttribute('aria-label'), /5M.*28 MiB/);
  assert.match(await phone.locator('#match-score').innerText(), /SIN\s+0 – 0\s+GUK/);
  assert.equal(await phone.locator('#event-board').evaluate(element => getComputedStyle(element).touchAction), 'none');
  const phoneLayout = await phone.evaluate(() => Object.fromEntries([
    'event-moves', 'event-board', 'black-clock', 'white-clock', 'engine-lines', 'round-controls'
  ].map(id => {
    const element = id === 'round-controls' ? document.querySelector('.round-controls') : document.getElementById(id);
    const { x, y, width, height, bottom } = element.getBoundingClientRect();
    return [id, { x, y, width, height, bottom }];
  })));
  assert.equal(phoneLayout['event-board'].x, 0);
  assert.equal(phoneLayout['event-board'].width, 390);
  assert.ok(phoneLayout['event-moves'].height <= 34);
  assert.ok(Object.values(phoneLayout).every(rect => rect.y >= 0 && rect.bottom <= 710), JSON.stringify(phoneLayout));
  assert.equal(await phone.locator('#copy-live-link').isVisible(), false);
  assert.equal(await phone.locator('#event-moves').evaluate(element => element.scrollLeft > 0), true);
  await phone.locator('#first').tap();
  const touch = await mobile.newCDPSession(phone);
  const center = async square => {
    const box = await phone.locator('#event-board [data-square="' + square + '"]').boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await center('d2')] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await center('d3')] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [await center('d4')] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.locator('#ply-note').getByText('Variation').waitFor();
  assert.equal(await phone.evaluate(() => scrollY), 0);
  await phone.locator('#moment').tap();
  await phone.locator('#share-card-dialog[open]').waitFor();
  assert.equal(await phone.locator('#share-card-canvas').evaluate(element => element.height), 1350);
  await phone.locator('#btn-close-share-card').tap();
  await phone.locator('#load-maia').tap();
  await phone.locator('#trend-toggle').waitFor();
  assert.equal(await phone.evaluate(() => window.liveMaiaMode), 'download');

  await phone.evaluate(async () => {
    const { ModelCache } = await import('/engine/model-cache.js');
    const { getModelCacheKey } = await import('/engine/model-loader.js');
    await ModelCache.saveModel(getModelCacheKey('https://weights.4chess.cc/maia3_23m.bin'), new ArrayBuffer(8));
    await (await import('/engine/engine-preferences.js')).savePreferences({ stockfishVariant: 'standard' });
  });
  await phone.reload();
  await phone.locator('#trend-toggle').waitFor();
  assert.equal(await phone.evaluate(() => window.liveMaiaMode), 'cache');
  assert.deepEqual(await phone.evaluate(() => window.liveEngineSettings),
    { maiaVariant: '23m', stockfishVariant: 'lite', depth: 18, elo: 2600 });
  assert.equal(await phone.locator('#load-maia').isVisible(), false);
  assert.deepEqual(issues, []);
  console.log('390×710 mobile layout', JSON.stringify(phoneLayout));
} finally {
  await browser.close();
  server.close();
}
console.log('PASS live browser: desktop and mobile first screens, touch drag, cold and cached Maia, clocks, shared variations, settings and PNG.');
