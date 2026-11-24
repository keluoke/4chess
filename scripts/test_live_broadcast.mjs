import assert from 'node:assert/strict';
import { LiveCollector } from '../cloudflare/live/collector.js';
import { LIVE_EVENTS } from '../cloudflare/live/events.js';
import { parseRoundPgn, eventView, fallbackRounds } from '../cloudflare/live/model.js';
import { onRequest as eventApi } from '../functions/api/live/event.js';
import { onRequest as roundApi } from '../functions/api/live/round.js';

const event = LIVE_EVENTS.wcc2026;
const round = event.roundIds[0];
const second = event.roundIds[1];
const pgn = (mainline, result = '*', swap = false) => [
  '[Event "Game 1"]',
  swap ? '[White "Gukesh"]' : '[White "Sindarov"]',
  swap ? '[WhiteFideId "46616543"]' : '[WhiteFideId "14205483"]',
  swap ? '[Black "Sindarov"]' : '[Black "Gukesh"]',
  swap ? '[BlackFideId "14205483"]' : '[BlackFideId "46616543"]',
  '[Result "' + result + '"]', '', mainline + ' ' + result
].join('\n');

const moves = '1. e4 { [%clk 1:59:58.25] } (1. d4 { [%clk 0:00:10] }) e5 { [%clk 1:59:57] }';
const parsed = parseRoundPgn(pgn(moves), event);
assert.equal(parsed[0].moves[0].clk, 7198.25);
assert.equal(parsed[0].moves[1].clk, 7197);
assert.deepEqual(parsed[0].moves.map(move => move.uci), ['e2e4', 'e7e5']);
assert.equal(parsed[0].moves[1].fen, parsed[0].fen);
assert.equal(parseRoundPgn(pgn(''), event)[0].moves.length, 0);
assert.throws(() => parseRoundPgn(pgn('1. e6'), event), /Illegal/);
const first = parseRoundPgn(pgn('1. e4', '1-0'), event);
const other = parseRoundPgn(pgn('1. d4', '0-1', true), event);
const score = eventView('wcc2026', event, fallbackRounds(event),
  new Map([[round, { games: first }], [second, { games: other }]]), event.startsAt);
assert.deepEqual(score.score, { '14205483': 2, '46616543': 0 });
assert.equal(score.activeRoundId, null);

let now = event.startsAt - 60_000;
const originalNow = Date.now;
const originalFetch = fetch;
Date.now = () => now;
let calls = [], active = 0, maximum = 0;
let answer = pgn('');
let override = null;
globalThis.fetch = async url => {
  calls.push(url);
  active++;
  maximum = Math.max(maximum, active);
  await new Promise(resolve => setTimeout(resolve, 1));
  active--;
  if (url.includes('/round/')) return override?.() || new Response(answer);
  return Response.json({ tour: { id: event.tournamentId }, rounds: fallbackRounds(event) });
};
const storage = new Map();
async function collector() {
  let initialization;
  const instance = new LiveCollector({
    blockConcurrencyWhile: callback => { initialization = callback(); },
    storage: {
      list: async () => storage.entries(),
      put: async (key, value) => storage.set(key, structuredClone(value))
    }
  }, {});
  await initialization;
  return instance;
}
let instance = await collector();
const env = {
  LIVE_COLLECTOR: {
    idFromName: id => id,
    get: () => ({ fetch: url => instance.fetch(new Request(url)) })
  }
};
const hit = (type, params, etag) => (type === 'event' ? eventApi : roundApi)({
  env, waitUntil: promise => void promise,
  request: new Request('https://4chess.cc/api/live/' + type + '?' + params, {
    headers: etag ? { 'If-None-Match': etag } : {}
  })
});

try {
  const scheduled = await hit('event', 'id=wcc2026');
  assert.equal((await scheduled.json()).rounds.length, 14);
  assert.equal(calls.length, 1);
  const unknown = await hit('round', 'id=unknownx');
  assert.equal(unknown.status, 404);
  assert.equal(calls.length, 1);

  now = event.startsAt + 100;
  answer = pgn(moves);
  const initial = await Promise.all(Array.from({ length: 30 }, () => hit('round', 'id=' + round)));
  const etag = initial[0].headers.get('ETag');
  assert.ok(etag);
  for (const response of initial) {
    assert.equal(response.headers.get('ETag'), etag);
    assert.equal((await response.json()).moves.length, 2);
  }
  assert.equal(calls.filter(url => url.includes('/round/')).length, 1);
  const unchanged = await hit('round', 'id=' + round, 'W/' + etag);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  const raw = await hit('round', 'id=' + round + '&format=pgn');
  assert.equal(await raw.text(), answer);
  assert.notEqual(raw.headers.get('ETag'), etag);
  assert.equal(calls.filter(url => url.includes('/round/')).length, 1);

  now += 12_100;
  answer = pgn('1. e4 e6 { [%clk 1:57:22] }');
  const correction = await hit('round', 'id=' + round, etag);
  const correctedTag = correction.headers.get('ETag');
  assert.equal(correction.status, 200);
  assert.notEqual(correctedTag, etag);
  assert.equal((await correction.json()).moves[1].uci, 'e7e6');

  now += 12_100;
  override = () => new Response(null, { status: 429, headers: { 'Retry-After': '70' } });
  const stale = await hit('round', 'id=' + round);
  assert.equal(stale.headers.get('X-Stale'), '1');
  assert.equal(stale.headers.get('Retry-After'), '70');
  assert.equal(stale.headers.get('ETag'), correctedTag);
  const count = calls.length;
  instance = await collector();
  now += 60_100;
  assert.equal((await hit('round', 'id=' + round, correctedTag)).status, 304);
  assert.equal(calls.length, count, 'Cold restart honors the same Lichess cooldown');

  override = null;
  answer = pgn('1. e4 e6', '1/2-1/2');
  now += 10_100;
  const conclusion = await hit('round', 'id=' + round);
  assert.equal((await conclusion.json()).status, 'finished');
  const total = await hit('event', 'id=wcc2026');
  assert.equal((await total.json()).score['14205483'], .5);
  assert.equal(maximum, 1);
} finally {
  Date.now = originalNow;
  globalThis.fetch = originalFetch;
}
console.log('PASS live broadcast: real legal replay, FIDE IDs, coalescing, ETag/304, corrected moves, persisted 429, final score.');
