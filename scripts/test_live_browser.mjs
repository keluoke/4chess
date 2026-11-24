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
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 980 } });
  const issues = [];
  page.on('pageerror', error => issues.push(error.message));
  await page.clock.install();
  await page.route('**/api/live/event?*', route => {
    const snapshot = { games: parseRoundPgn(pgn(line), event) };
    return route.fulfill({ json: eventView('wcc2026', event, rounds, new Map([[current.id, snapshot]]), current.startsAt + 1000) });
  });
  await page.route('**/api/live/round?*', route => {
    const roundId = new URL(route.request().url()).searchParams.get('id');
    const game = parseRoundPgn(pgn(roundId === current.id ? line : ''), event)[0];
    return route.fulfill({ json: {
      ...game, roundId, roundName: 'Game 1', status: roundId === current.id ? 'live' : 'scheduled'
    } });
  });
  await page.route('**/live/engines.js?*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export class LiveEngines { cancel() {} async inspect({ move, fenBefore }) { return { score: "+0.35", maiaReady: true, moment: { ...move, fenBefore, bestUci: move.uci, bestSan: move.san, maiaTopUci: "f1c4", maiaTopSan: "Bc4", humanRawProbability: .11, lossCp: 0, severity: "good", divergenceStatus: "confirmed", divergenceType: "beyond_intuition" } }; } }'
  }));

  await page.goto('http://127.0.0.1:' + server.address().port + '/live/?lang=zh');
  await page.locator('#event-moves button[data-ply="3"]').waitFor();
  assert.equal(await page.locator('#event-board .maia-square').count(), 64);
  assert.equal(await page.locator('#white-clock').innerText(), '1:59:32');
  assert.equal(await page.locator('#black-clock').innerText(), '1:58:52');
  await page.locator('#previous').click();
  await page.locator('#event-board [data-square="g1"]').click();
  await page.locator('#event-board [data-square="f3"]').click();
  assert.equal(await page.locator('#ply-note').innerText(), '试走变化');
  line += ' Nc6';
  await page.clock.fastForward(11000);
  await page.locator('#new-move').waitFor();
  assert.equal(await page.locator('#ply-note').innerText(), '试走变化');
  assert.equal(await page.locator('#event-board [data-square="f3"] .maia-piece').count(), 1);
  await page.locator('#new-move').click();
  assert.equal(await page.locator('#ply-note').innerText(), '4 / 4');
  await page.locator('#analyze').click();
  await page.locator('#intuition-tag').getByText('神之一手').waitFor();
  assert.equal(await page.locator('#sf-line').innerText(), 'Nc6 · +0.35');
  const downloaded = page.waitForEvent('download');
  await page.locator('#moment').click();
  assert.equal((await downloaded).suggestedFilename(), 'diverge-wcc-' + current.id + '-4.png');
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
  await page.locator('#round-select').selectOption(rounds[1].id);
  await page.locator('#event-status').getByText('尚未开赛').waitFor();
  assert.equal(await page.locator('#event-moves button').count(), 0);
  assert.deepEqual(issues, []);
} finally {
  await browser.close();
  server.close();
}
console.log('PASS live browser: board, clocks, branch and new update, opt-in engine panel, PNG, mobile layout, round switching.');
