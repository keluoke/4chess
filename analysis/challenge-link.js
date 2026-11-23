import { ChessBoard } from '../engine/chess-core.js';

const MAX_TOKEN = 320;
const uci = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const fenFields = /^[prnbqkPRNBQK1-8/]+ [wb] (?:K?Q?k?q?|-)(?: (?:[a-h][36]|-))$/;

function restoreChallenge(payload) {
  if (!Array.isArray(payload) || payload.length !== 6) return null;
  const [version, position, played, best, elo, probability] = payload;
  if (version !== 1 || typeof position !== 'string' || position.length > 95 || !fenFields.test(position) ||
      typeof played !== 'string' || !uci.test(played) || typeof best !== 'string' || !uci.test(best) || played === best) return null;
  if (!(elo === null || (Number.isInteger(elo) && elo >= 600 && elo <= 2600)) ||
      !(probability === null || (Number.isInteger(probability) && probability >= 0 && probability <= 1000))) return null;
  const board = new ChessBoard(position + ' 0 1');
  if (!board.isValid) return null;
  const legal = board.getLegalMoves();
  const playedMove = legal.find(move => move.uci === played);
  const bestMove = legal.find(move => move.uci === best);
  if (!playedMove || !bestMove) return null;
  return {
    fen: board.getFen(), turn: board.turn, elo, probability: probability === null ? null : probability / 10,
    played, best, playedSan: board.moveToSan(playedMove, legal), bestSan: board.moveToSan(bestMove, legal)
  };
}

export function checkupChallengeUrl(trap, lang) {
  if (trap?.divergenceStatus !== 'confirmed' || trap.divergenceType !== 'intuition_trap') return null;
  const position = typeof trap.fenBefore === 'string' && trap.fenBefore.trim().split(/\s+/).slice(0, 4).join(' ');
  const probability = Number.isFinite(trap.humanProb) && trap.humanProb >= 0 && trap.humanProb <= 1
    ? Math.round(trap.humanProb * 1000) : null;
  const payload = [1, position, trap.playedUci || trap.uci, trap.bestUci || trap.verifiedBestUci,
    Number.isInteger(trap.elo) && trap.elo >= 600 && trap.elo <= 2600 ? trap.elo : null, probability];
  if (!restoreChallenge(payload)) return null;
  const token = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'https://4chess.cc/analysis/challenge.html#' + new URLSearchParams({ p: token, lang: lang === 'zh' ? 'zh' : 'en' });
}

export function decodeChallenge(token) {
  if (typeof token !== 'string' || !token.length || token.length > MAX_TOKEN || !/^[a-zA-Z0-9_-]+$/.test(token)) return null;
  try {
    return restoreChallenge(JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/'))));
  } catch {
    return null;
  }
}
