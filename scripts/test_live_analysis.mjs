import assert from 'node:assert/strict';
import { ChessBoard } from '../engine/chess-core.js';
import { LIVE_ANALYSIS_RATINGS } from '../engine/live-analysis-position.js';
import { createAnalysisService } from '../cloudflare/live/analysis.js';
import { serveAnalysis } from '../cloudflare/live/http.js';

const stored = new Map();
function gameFor(ucis) {
  const board = new ChessBoard();
  return {
    initialFen: board.getFen(), moves: ucis.map((uci, index) => {
      const move = board.getLegalMoves().find(move => move.uci === uci);
      board.makeMove(move);
      return { uci, ply: index + 1, fen: board.getFen() };
    })
  };
}
let game = gameFor(['e2e4', 'e7e5', 'g1f3']);
const store = {
  get: async key => stored.get(key),
  put: async (key, value) => stored.set(key, structuredClone(value)),
  delete: async key => stored.delete(key)
};
const handler = createAnalysisService({ storage: store, secret: 'internal-test-token', getGame: () => game,
  ensureGame: async () => game });
const env = { LIVE_COLLECTOR: {
  idFromName: name => name,
  get: () => ({ fetch: (url, init) => {
    const request = new Request(url, init);
    const route = new URL(url);
    return handler(request, route, route.searchParams.get('event'), route.searchParams.get('round'));
  } })
} };
const route = (path, init) => ({ env, request: new Request('https://4chess.cc/api/live/' + path, init),
  waitUntil: promise => void promise });
const round = 'round=xLgOJ6cb';
const headers = { Authorization: 'Bearer internal-test-token' };
const read = (ply, etag, roundQuery = round) => serveAnalysis(route('analysis?' + roundQuery + '&ply=' + ply, {
  headers: etag ? { 'If-None-Match': etag } : {}
}));
const worker = (op, payload, authorization = headers, roundQuery = round) => serveAnalysis(route('analysis-work?' + roundQuery + '&op=' + op, {
  method: 'POST', headers: authorization, body: JSON.stringify(payload ?? {})
}), true);
const claim = async () => (await worker('claim')).json();
function result(fen) {
  const choices = new ChessBoard(fen).getLegalMoves();
  const lines = choices.slice(0, 3).map(({ uci }, i) => ({ cp: 30 - i * 20, mate: null, pv: [uci], uci, depth: 24 }));
  const probabilities = Object.fromEntries(choices.map(({ uci }) => [uci, 1 / choices.length]));
  return { lines, policies: Object.fromEntries(LIVE_ANALYSIS_RATINGS.map(elo => [elo, probabilities])),
    engine: 'Stockfish 19', model: 'maia3-79m' };
}

assert.equal((await worker('claim', null, { Authorization: 'Bearer wrong' })).status, 401);
assert.equal((await read(3)).status, 202);
const head = await claim();
assert.equal(head.status, 'claimed');
assert.equal(head.ply, 3);
assert.equal((await claim()).status, 'busy');
const invalidResult = result(head.fen);
invalidResult.lines[0].uci = 'z5z6';
assert.equal((await worker('publish', { lease: head.lease, result: invalidResult })).status, 422);
assert.equal((await worker('publish', { lease: 'wrong', result: result(head.fen) })).status, 409);
game.moves[0].clk = 500;
assert.equal((await worker('publish', { lease: head.lease, result: result(head.fen) })).status, 204);
const ready = await read(3);
assert.equal(ready.status, 200);
assert.equal((await read(3, ready.headers.get('ETag'))).status, 304);
assert.equal((await ready.json()).key, head.key);

const previous = await claim();
assert.equal(previous.ply, 2);
game = gameFor(['e2e4', 'c7c5', 'g1f3', 'd7d6']);
assert.equal((await read(3)).status, 202, 'A correction invalidates the old line even though its suffix is unchanged');
assert.equal((await worker('publish', { lease: previous.lease, result: result(previous.fen) })).status, 409);
const corrected = await claim();
assert.equal(corrected.ply, 4);
assert.equal((await worker('publish', { lease: corrected.lease, retry: true })).status, 204);
const backfill = await claim();
assert.equal(backfill.ply, 3);
assert.equal((await worker('publish', { lease: backfill.lease, result: result(backfill.fen) })).status, 204);
assert.equal((await read(3)).status, 200);
const secondRound = 'round=L3j03TZq';
assert.equal((await read(3, null, secondRound)).status, 202);
const second = await (await worker('claim', null, headers, secondRound)).json();
assert.equal(second.round, 'L3j03TZq');
assert.equal(second.ply, 4);
assert.equal((await worker('publish', { lease: second.lease, result: result(second.fen) }, headers, secondRound)).status, 204);
assert.equal((await read(4, null, secondRound)).status, 200);
assert.equal((await read(4)).status, 202, 'The same position key is scoped to a round');
assert.equal((await read(4, null, 'round=AAAAAAAA')).status, 404);
console.log('PASS live analysis: private lease, validated output, clock identity, corrected lines, late jobs, batched backfill and ETag.');
