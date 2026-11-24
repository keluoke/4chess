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
let line = '1. e4 { [%clk 1:59:32] } e5 { [%clk 1:58:52] } 2. Nf3';
let finished = false;
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'chromium', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 980 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const issues = [];
  page.on('pageerror', error => issues.push(error.message));
  await page.clock.install({ time: current.startsAt + 1000 });
  await page.route('**/api/live/event?*', route => {
    const raw = finished ? pgn(line).replace('[Result "*"]', '[Result "1/2-1/2"]').replace(/\*$/, '1/2-1/2') : pgn(line);
    const snapshot = { games: parseRoundPgn(raw, event) };
    return route.fulfill({ json: eventView('wcc2026', event, rounds, new Map([[current.id, snapshot]]), current.startsAt + 1000) });
  });
  await page.route('**/api/live/round?*', route => {
    const roundId = new URL(route.request().url()).searchParams.get('id');
    const isCurrent = roundId === current.id;
    const raw = pgn(isCurrent ? line : '');
    const game = parseRoundPgn(isCurrent && finished ? raw.replace('[Result "*"]', '[Result "1/2-1/2"]').replace(/\*$/, '1/2-1/2') : raw, event)[0];
    return route.fulfill({ json: {
      ...game, roundId, roundName: 'Game 1', status: isCurrent ? (finished ? 'finished' : 'live') : 'scheduled'
    } });
  });
  await page.route('**/live/engines.js?*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `export class LiveEngines {
      constructor(settings) { window.liveEngineSettings = settings; }
      cancel() {}
      status() { return { sf: { state: 'ready', source: 'bundled' }, maia: { state: 'downloading', source: 'cdn', percent: 46 } }; }
      async sampleMaia(_position, elo) { return [{ uci: 'b8c6', rawProb: elo / 4000 }]; }
      async inspect({ move, fenBefore, elo }) {
        if (!move) return { score: '+0.35', maiaReady: true, bestSan: 'Nc6', maiaTopSan: 'Nf6' };
        (window.assessments ||= []).push(move.ply);
        if (window.holdAssessment) {
          window.holdAssessment = false;
          await new Promise(resolve => { window.finishAssessment = resolve; });
        }
        const trend = { fen: fenBefore, elo, history: [], series: [{ uci: move.uci, label: move.san, san: move.san, role: 'played' }],
          moves: [{ uci: move.uci, rawProb: .55 }] };
        return { score: '+0.35', maiaReady: true, trend, moment: {
          ...move, fenBefore, bestUci: move.uci === 'b8c6' ? 'g8f6' : move.uci,
          bestSan: move.san === 'Nc6' ? 'Nf6' : move.san, maiaTopUci: 'f1c4', maiaTopSan: 'Bc4',
          humanRawProbability: .11, lossCp: 0, severity: 'good', divergenceStatus: 'confirmed', divergenceType: 'beyond_intuition'
        } };
      }
    }`
  }));

  const origin = 'http://127.0.0.1:' + server.address().port;
  await page.goto(origin + '/live/?lang=zh');
  await page.locator('#event-moves button[data-ply="3"]').waitFor();
  await page.locator('#analyze:not([disabled])').waitFor();
  assert.equal(await page.locator('#event-elo').inputValue(), '2600');
  assert.equal(await page.locator('#live-maia').inputValue(), '23m');
  assert.equal(await page.locator('#live-sf').inputValue(), 'lite');
  assert.equal(await page.locator('#round-rail button').count(), 14);
  assert.equal(await page.locator('#round-rail button[aria-current]').getAttribute('data-round'), current.id);
  assert.match(await page.locator('#round-players').innerText(), /辛达罗夫.*白方.*古克什.*黑方/);
  await page.locator('#copy-live-link').click();
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(copied.searchParams.get('round'), current.id);
  assert.equal(copied.searchParams.get('ply'), '3');
  await page.locator('#moment').click();
  await page.locator('#share-card-dialog[open]').waitFor();
  assert.equal(await page.locator('#share-card-canvas').evaluate(el => el.width), 1080);
  await page.locator('#btn-close-share-card').click();
  assert.equal(await page.locator('#event-board .maia-square').count(), 64);
  assert.equal(await page.locator('#white-clock').innerText(), '1:59:32');
  assert.equal(await page.locator('#black-clock').innerText(), '1:58:52');
  await page.locator('#previous').click();
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
  await page.locator('#flip-board').click();
  assert.equal(await page.locator('#event-board').evaluate(element => element.previousElementSibling.id), 'white-seat');
  assert.match(await page.locator('#workbench-game').getAttribute('href'), /^\/analysis\/#fen=/);
  await page.locator('#analyze').click();
  await page.locator('#sf-line').getByText('Nc6 · +0.35').waitFor();
  assert.deepEqual(await page.evaluate(() => window.liveEngineSettings), { maiaVariant: '23m', stockfishVariant: 'lite', depth: 18, elo: 2600 });
  assert.equal(await page.locator('#maia-progress').evaluate(el => el.value), 46);
  assert.equal(await page.locator('#moment').isVisible(), false);
  line += ' Nc6';
  await page.clock.fastForward(11000);
  await page.locator('#new-move').waitFor();
  assert.equal(await page.locator('#ply-note').innerText(), '试走变化');
  assert.equal(await page.locator('#event-board [data-square="f3"] .maia-piece').count(), 1);
  await page.locator('#new-move').click();
  assert.equal(await page.locator('#ply-note').innerText(), '4 / 4');
  await page.locator('#intuition-tag').getByText('神之一手').waitFor();
  assert.equal(await page.locator('#sf-line').innerText(), 'Nf6 · +0.35');
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
  assert.ok(await page.evaluate(() => window.cardText.some(text => /^Played ·/.test(text))));
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
  await page.locator('#sf-line').getByText('Nf3 · +0.35').waitFor();
  assert.equal(await page.evaluate(() => window.assessments.filter(ply => ply === 3).length), 2);
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
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page stays within the viewport');
  const board = await page.locator('#event-board').boundingBox();
  assert.equal(board.width, board.height);
  if (process.env.LIVE_SCREENSHOTS) {
    await page.screenshot({ path: path.join(process.env.LIVE_SCREENSHOTS, 'mobile.png'), fullPage: true });
  }
  await page.locator('#round-rail button[data-round="' + rounds[1].id + '"]').click();
  await page.locator('#event-status').getByText('尚未开赛').waitFor();
  assert.match(await page.locator('#round-countdown').innerText(), /距开赛还有/);
  assert.equal(await page.locator('#event-moves button').count(), 0);
  finished = true;
  await page.locator('#round-rail button[data-round="' + current.id + '"]').click();
  await page.locator('#workbench-game').getByText('在工作台复盘本局').waitFor();
  assert.match(await page.locator('#round-rail button[aria-current]').innerText(), /½–½/);
  assert.match(await page.locator('#workbench-game').getAttribute('href'), /^\/analysis\/#pgn=/);
  assert.deepEqual(issues, []);
  await page.locator('#live-maia').selectOption('79m');
  await page.locator('#live-sf').selectOption('standard');
  const other = await page.context().newPage();
  await other.goto(origin + '/analysis/');
  const synced = await other.evaluate(async () => (await import('/engine/engine-preferences.js')).getSavedPreferences());
  assert.equal(synced.maiaVariant, '79m');
  assert.equal(synced.stockfishVariant, 'standard');
  await other.evaluate(async () => (await import('/engine/engine-preferences.js')).savePreferences({ maiaVariant: '5m' }));
  await page.waitForFunction(() => document.querySelector('#live-maia').value === '5m');
} finally {
  await browser.close();
  server.close();
}
console.log('PASS live browser: board, clocks, branch and new update, opt-in engine panel, PNG, mobile layout, round switching.');
