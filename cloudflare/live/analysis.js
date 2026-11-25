import { ChessBoard } from '../../engine/chess-core.js';
import { expectedScore, positiveIntuition, qualifiesTrap } from '../../engine/review-policy.js';
import { LIVE_ANALYSIS_RATINGS, LIVE_ANALYSIS_VERSION, livePositionKey } from '../../engine/live-analysis-position.js';

const MAX_PLIES = 600;
const LEASE_MS = 180_000;
const RETRY_MS = 10_000;

export const pilotRound = (eventId, round) => eventId === 'wcc2026' && round === 'xLgOJ6cb';

const textEncoder = new TextEncoder();
async function authorize(header, secret) {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const [expected, supplied] = await Promise.all([secret, header.slice(7)].map(value =>
    crypto.subtle.digest('SHA-256', textEncoder.encode(value)).then(digest => new Uint8Array(digest))));
  return expected.reduce((diff, byte, index) => diff | (byte ^ supplied[index]), 0) === 0;
}

const fenAt = (game, ply) => ply ? game.moves[ply - 1]?.fen : game.initialFen;
const resultKey = (round, key) => 'analysis:' + round + ':' + key;

function parseLine(value, fen) {
  if (!value || !Number.isInteger(value.depth) || value.depth < 16 || value.depth > 64 ||
      (value.mate !== null ? !Number.isInteger(value.mate) || Math.abs(value.mate) > 200
        : !Number.isInteger(value.cp) || Math.abs(value.cp) > 10000) ||
      !Array.isArray(value.pv) || !value.pv.length || value.pv.length > 12 || value.pv[0] !== value.uci) return null;
  const board = new ChessBoard(fen);
  for (const uci of value.pv) {
    const move = board.getLegalMoves().find(candidate => candidate.uci === uci);
    if (!move) return null;
    board.makeMove(move);
  }
  return { uci: value.uci, cp: value.cp, mate: value.mate, depth: value.depth, pv: value.pv };
}

function classify(evidence, game, ply) {
  if (!evidence || !ply) return null;
  const move = game.moves[ply - 1];
  const legal = new Set(new ChessBoard(fenAt(game, ply - 1)).getLegalMoves().map(choice => choice.uci));
  const { best, maia, bestCp, playedCp, maiaCp, probability, rank, maiaProbability, depth, elo } = evidence;
  if (legal.size < 2 || !legal.has(best) || !legal.has(maia) || !Number.isInteger(depth) || depth < 18 ||
      ![bestCp, playedCp, maiaCp].every(score => Number.isInteger(score) && Math.abs(score) <= 10000) ||
      ![probability, maiaProbability].every(probability => Number.isFinite(probability) && probability >= 0 && probability <= 1) ||
      !Number.isInteger(rank) || rank < 1 || !LIVE_ANALYSIS_RATINGS.includes(elo)) return null;
  const lossCp = Math.max(0, bestCp - playedCp), stableBest = best === move.uci;
  const loss = (expectedScore(bestCp) - expectedScore(playedCp)) * 100;
  const kind = !stableBest && qualifiesTrap({ lossCp, scoreLoss: loss, probability, rank }) ? 'intuition_trap'
    : maia === move.uci ? null : positiveIntuition({
      lossCp, maiaAdvantageCp: playedCp - maiaCp, maiaESL: (expectedScore(playedCp) - expectedScore(maiaCp)) * 100,
      probability, maiaProbability, stableBest
    });
  return kind ? { kind, elo, lossCp } : null;
}

function sanitize(value, game, ply) {
  if (!value || typeof value !== 'object') return null;
  const fen = fenAt(game, ply);
  const board = new ChessBoard(fen);
  const moves = board.getLegalMoves();
  const moment = classify(value.evidence, game, ply);
  if (!moves.length) {
    if (value.terminal !== true) return null;
    return { terminal: true, moment, mate: board.inCheck() ? (board.turn === 'w' ? -1 : 1) : null };
  }
  if (!Array.isArray(value.lines) || value.lines.length !== Math.min(moves.length, 3) ||
      typeof value.engine !== 'string' || !/^Stockfish 19(?:\.?[0-9]+)?$/.test(value.engine) || value.model !== 'maia3-79m' ||
      !value.policies || typeof value.policies !== 'object') return null;
  const lines = value.lines.map(line => parseLine(line, fen));
  if (lines.some(line => !line) || new Set(lines.map(line => line.uci)).size !== lines.length) return null;
  const policies = {};
  for (const band of LIVE_ANALYSIS_RATINGS) {
    const distribution = value.policies[band];
    if (!distribution || typeof distribution !== 'object') return null;
    const entries = moves.map(({ uci }) => [uci, distribution[uci]]);
    if (entries.some(([, prob]) => !Number.isFinite(prob) || prob < 0 || prob > 1) ||
        Math.abs(entries.reduce((sum, [, prob]) => sum + prob, 0) - 1) > 0.02) return null;
    policies[band] = Object.fromEntries(entries);
  }
  return { lines, policies, engine: value.engine, model: value.model, moment };
}

export function createAnalysisService({ storage, secret, getGame, ensureGame }) {
  async function identity(round, game, ply) {
    const key = await livePositionKey(game.initialFen, game.moves, ply);
    return { round, ply, key, fen: fenAt(game, ply) };
  }

  return async function handle(request, url, event, round) {
    if (!pilotRound(event, round) || !secret) return new Response(null, { status: 404 });
    const game = getGame(event, round);
    if (url.pathname === '/analysis') {
      const requestedPly = url.searchParams.get('ply');
      const ply = requestedPly === null ? game?.moves.length : Number(requestedPly);
      if (!game || !Number.isSafeInteger(ply) || ply < 0 || ply > Math.min(game.moves.length, MAX_PLIES)) {
        return Response.json({ status: 'pending', round }, { status: 202 });
      }
      const position = await identity(round, game, ply);
      const result = await storage.get(resultKey(round, position.key));
      return Response.json(result ? { ...position, status: 'ready', version: LIVE_ANALYSIS_VERSION, result }
        : { ...position, status: 'pending' }, { status: result ? 200 : 202 });
    }
    if (request.method !== 'POST' || !await authorize(request.headers.get('Authorization'), secret)) {
      return new Response(null, { status: 401 });
    }

    const leaseKey = 'analysis-lease:' + round;
    const lease = await storage.get(leaseKey);
    const now = Date.now();
    if (url.pathname === '/analysis-work') {
      if (lease && lease.until > now) return Response.json({ status: 'busy' });
      const available = await ensureGame(event, round);
      if (!available) return Response.json({ status: 'idle' });
      const skip = await storage.get('analysis-retry:' + round);
      for (let ply = Math.min(available.moves.length, MAX_PLIES); ply >= 0; ply--) {
        const position = await identity(round, available, ply);
        if (skip?.key === position.key && skip.until > now || await storage.get(resultKey(round, position.key))) continue;
        const id = crypto.randomUUID();
        await storage.put(leaseKey, { ...position, id, until: now + LEASE_MS });
        return Response.json({ status: 'claimed', ...position, lease: id, version: LIVE_ANALYSIS_VERSION,
          initialFen: available.initialFen, moves: available.moves.slice(0, ply).map(move => move.uci) });
      }
      return Response.json({ status: 'idle' });
    }
    if (!lease || lease.until < now) return new Response(null, { status: 409 });
    const raw = await request.text();
    if (raw.length > 128 * 1024) return new Response(null, { status: 413 });
    let value;
    try { value = JSON.parse(raw); }
    catch { return new Response(null, { status: 400 }); }
    if (value?.lease !== lease.id) return new Response(null, { status: 409 });
    if (!game || lease.ply > game.moves.length || (await identity(round, game, lease.ply)).key !== lease.key) {
      await storage.delete(leaseKey);
      return new Response(null, { status: 409 });
    }
    if (value.retry === true) {
      await storage.put('analysis-retry:' + round, { key: lease.key, until: now + RETRY_MS });
      await storage.delete(leaseKey);
      return new Response(null, { status: 204 });
    }
    const result = sanitize(value.result, game, lease.ply);
    if (!result) return new Response(null, { status: 422 });
    await storage.put(resultKey(round, lease.key), result);
    await storage.delete(leaseKey);
    return new Response(null, { status: 204 });
  };
}
