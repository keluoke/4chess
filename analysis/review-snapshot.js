import { ChessBoard } from '../engine/chess-core.js';
import { whiteEvaluation, legalVariation } from '../engine/position-lines.js';
import { coreTurningPoints, intuitionKind, moveQuality } from '../engine/review-policy.js?v=20261120-review';

const RESULTS = ['1-0', '0-1', '1/2-1/2'];
const QUALITIES = ['unknown', 'forced', 'best', 'good', 'inaccuracy', 'mistake', 'blunder'];
const KINDS = [null, 'beyond', 'precise', 'trap'];
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MAX_PLIES = 600;
const MAX_FRAGMENT = 24000;
const MAX_BYTES = 128 * 1024;
const MAX_PV = 6;
const clean = (input, limit = 100) => typeof input === 'string' ? input.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, limit) : '';
const count = value => Number.isInteger(value) && value >= 0 && value <= MAX_PLIES ? value : null;
const depth = value => Number.isInteger(value) && value >= 0 && value <= 128 ? value : null;
const accuracy = value => Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 10) : null;
const uci = value => typeof value === 'string' && UCI.test(value) ? value : null;
const probability = value => Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 100) : null;
const loss = value => Number.isFinite(value) && value >= 0 && value <= 20000 ? Math.round(value) : null;

// Share only a completed public platform permalink, never a round-trip of an arbitrary PGN tag.
export function publicGameLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    if (['chess.com', 'www.chess.com'].includes(url.hostname) && /^\/game\/(?:live|daily)\/\d{1,16}\/?$/.test(url.pathname)) {
      return 'https://www.chess.com' + url.pathname.replace(/\/$/, '');
    }
    if (url.hostname === 'lichess.org' && /^\/(?:game\/)?[a-zA-Z0-9]{8}\/?$/.test(url.pathname)) {
      const id = url.pathname.split('/').filter(Boolean).at(-1);
      if (!['analysis', 'training', 'practice', 'insights', 'streamer'].includes(id.toLowerCase())) return 'https://lichess.org/' + id;
    }
  } catch { /* Local PGNs do not necessarily have a public original. */ }
  return null;
}

function packScore(score, isMate, fen, scoreText) {
  if (!Number.isFinite(score) || Math.abs(score) > 10000 || !fen) return null;
  const evaluation = whiteEvaluation({ scoreCp: score, isMate, score: scoreText }, fen);
  return evaluation.isMate ? [evaluation.cp, Number(evaluation.text.slice(2))] : Math.round(evaluation.cp);
}

function packMove(move) {
  if (!uci(move.uci)) throw new Error('Invalid reviewed move');
  const after = move.evalAfter && move.evalAfter !== '?';
  const before = !after && move.evalBefore && move.evalBefore !== '?';
  const chart = after ? packScore(move.evalAfterCp, move.evalAfterIsMate, move.fenAfter, move.evalAfter)
    : before ? packScore(move.evalBeforeCp, move.evalBeforeIsMate, move.fenBefore, move.evalBefore) : null;
  const kind = intuitionKind(move);
  const best = uci(move.verifiedBestUci || move.bestUci);
  const maia = uci(move.maiaTopUci);
  const common = [move.uci, chart, Math.max(0, QUALITIES.indexOf(moveQuality(move))), best, maia,
    probability(move.maiaTopProb), probability(move.humanProbability), KINDS.indexOf(kind)];
  // The two losses refer to different candidate moves.
  common.push(loss(move.verifiedLossCp ?? move.lossCp), loss(move.maiaLossCp), depth(move.scoreVerificationDepth ?? move.verificationDepth));
  if (kind) {
    common.push((move.verifiedBestPv || []).slice(0, MAX_PV).filter(uci),
      (move.verifiedPlayedPv || []).slice(0, MAX_PV).filter(uci));
  }
  return common;
}

export function makeReviewSnapshot({ report, game, anonymize = false }) {
  if (!RESULTS.includes(game.result) || report?.isPartial || !report?.allMoves?.length ||
      report.allMoves.length > MAX_PLIES || report.totalMoves !== report.allMoves.length) throw new Error('A completed review is required');
  const moves = report.allMoves;
  const first = moves[0];
  const initial = first.evalBefore && first.evalBefore !== '?'
    ? packScore(first.evalBeforeCp, first.evalBeforeIsMate, first.fenBefore, first.evalBefore) : null;
  const scoreDepths = (report.scoreVerifications || []).map(value => depth(value.depth)).filter(Number.isFinite);
  return {
    v: 1,
    g: [moves[0].fenBefore === ChessBoard.INITIAL_FEN ? null : moves[0].fenBefore, game.result,
      anonymize ? '' : clean(game.white), anonymize ? '' : clean(game.black), clean(game.opening),
      anonymize ? null : publicGameLink(game.source)],
    r: [accuracy(report.accuracyWhite), accuracy(report.accuracyBlack), clean(report.engineKey, 50), clean(report.modelKey, 50),
      Number.isInteger(report.elo) && report.elo >= 600 && report.elo <= 2600 ? report.elo : null,
      depth(report.depthMin ?? report.depth), depth(report.depthMax ?? report.depth), scoreDepths.length, Math.max(0, ...scoreDepths),
      ['quick', 'deep'].includes(report.reviewMode) ? report.reviewMode : null, depth(report.reviewPolicyVersion)],
    e: initial,
    m: moves.map(packMove),
    k: [...coreTurningPoints(moves)].slice(0, 3)
  };
}

function readScore(value) {
  const cp = Array.isArray(value) ? value[0] : value;
  if (!Number.isInteger(cp) || Math.abs(cp) > 10000) return null;
  const mate = Array.isArray(value) && count(value[1]) !== null ? value[1] : null;
  return { cp, mate, text: mate === null ? (cp > 0 ? '+' : '') + (cp / 100).toFixed(2) : (cp < 0 ? '-M' : '+M') + mate };
}

function readCandidate(fen, first, pv = []) {
  if (!uci(first)) return [];
  const line = Array.isArray(pv) && pv[0] === first ? pv.slice(0, MAX_PV) : [first];
  return legalVariation(fen, line, MAX_PV);
}

export function restoreReviewSnapshot(payload) {
  if (payload?.v !== 1 || !Array.isArray(payload.g) || !Array.isArray(payload.r) ||
      !Array.isArray(payload.m) || !payload.m.length || payload.m.length > MAX_PLIES || !RESULTS.includes(payload.g[1])) {
    throw new Error('Invalid review snapshot');
  }
  const [fen, result, white, black, opening, source] = payload.g;
  const chess = new ChessBoard();
  if (fen !== null && (typeof fen !== 'string' || fen.length > 120 || !chess.load(fen))) throw new Error('Invalid starting position');
  const startFen = chess.getFen();
  const plies = payload.m.map((row, index) => {
    if (!Array.isArray(row) || !uci(row[0])) throw new Error('Invalid move record');
    const [played, score, quality, best, maia, maiaProb, playedProb, kind, playedLoss, maiaLoss, checkedDepth, bestPv, playedPv] = row;
    const fenBefore = chess.getFen();
    const turn = chess.turn, number = chess.fullMoves;
    const legal = chess.getLegalMoves().find(move => move.uci === played);
    if (!legal) throw new Error('Illegal move in review snapshot');
    chess.makeMove(legal);
    return {
      ply: index + 1, uci: played, san: legal.san, fenBefore, fenAfter: chess.getFen(), turn, number,
      score: readScore(score), quality: Number.isInteger(quality) && QUALITIES[quality] || 'unknown',
      kind: Number.isInteger(kind) && KINDS[kind] || null,
      best: readCandidate(fenBefore, best, bestPv), maia: readCandidate(fenBefore, maia),
      played: readCandidate(fenBefore, played, playedPv), maiaProb: probability(maiaProb / 100) === maiaProb ? maiaProb / 100 : null,
      playedProb: probability(playedProb / 100) === playedProb ? playedProb / 100 : null,
      playedLoss: loss(playedLoss), maiaLoss: loss(maiaLoss), checkedDepth: depth(checkedDepth)
    };
  });
  const [w, b, engine, model, elo, minDepth, maxDepth, verified, verifiedDepth, mode, policy] = payload.r;
  const keyPlies = Array.isArray(payload.k) ? [...new Set(payload.k.slice(0, 3).filter(ply => Number.isInteger(ply) && ply > 0 && ply <= plies.length))] : [];
  return { startFen, result, white: clean(white), black: clean(black), opening: clean(opening), source: publicGameLink(source),
    accuracy: [w, b].map(value => Number.isInteger(value) && value >= 0 && value <= 1000 ? value / 10 : null),
    engine: clean(engine, 50), model: clean(model, 50), elo: Number.isInteger(elo) && elo >= 600 && elo <= 2600 ? elo : null,
    minDepth: depth(minDepth), maxDepth: depth(maxDepth), verified: count(verified), verifiedDepth: depth(verifiedDepth),
    mode: ['quick', 'deep'].includes(mode) ? mode : null, policy: depth(policy),
    maiaCoverage: plies.filter(move => move.maia.length).length, initial: readScore(payload.e), plies, keyPlies };
}

async function streamBytes(stream, maximum) {
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) throw new Error('Review snapshot is too large');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function encodeReviewSnapshot(payload) {
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).length > MAX_BYTES) throw new Error('Review snapshot is too large');
  const input = new Blob([json]);
  // "deflate" works on more browser versions than "deflate-raw".
  const compressed = await streamBytes(input.stream().pipeThrough(new CompressionStream('deflate')), MAX_FRAGMENT * 3 / 4);
  const token = btoa(String.fromCharCode(...compressed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (token.length > MAX_FRAGMENT) throw new Error('Review snapshot is too large');
  return token;
}

export async function decodeReviewSnapshot(token) {
  if (typeof token !== 'string' || token.length > MAX_FRAGMENT || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Invalid snapshot link');
  const packed = Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
  const bytes = await streamBytes(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate')), MAX_BYTES);
  return restoreReviewSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
