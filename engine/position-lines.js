import { ChessBoard } from './chess-core.js';

// All displayed evaluations share White's perspective, regardless of orientation.
export function whiteEvaluation(result, fen) {
  if (!result || !Number.isFinite(result.scoreCp)) return null;
  const cp = (fen.split(' ')[1] === 'b' ? -1 : 1) * result.scoreCp;
  if (result.isMate) {
    const match = String(result.scoreText ?? result.score ?? '').match(/(?:M|#)([+-]?\d+)/);
    const distance = match ? Math.abs(Number(match[1])) : Math.max(0, Math.round((10000 - Math.abs(cp)) / 100));
    return { cp, isMate: true, text: `${cp < 0 ? '-' : '+'}M${distance}` };
  }
  return { cp, isMate: false, text: `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}` };
}

export function legalVariation(fen, pv = [], limit = 12) {
  const board = new ChessBoard(fen);
  if (!board.isValid) return [];
  const moves = [];
  for (const uci of pv.slice(0, limit)) {
    const move = board.getLegalMoves().find(m => m.uci === uci);
    if (!move) break;
    const number = board.fullMoves;
    const prefix = board.turn === 'w' ? `${number}. ` : moves.length === 0 ? `${number}… ` : '';
    board.makeMove(move);
    moves.push({ uci, san: move.san, label: `${prefix}${move.san}`, fen: board.getFen() });
  }
  return moves;
}

export function engineLines(result, fen) {
  if (!result) return [];
  const legal = new Set(new ChessBoard(fen).getLegalMoves().map(m => m.uci));
  const lines = result.lines?.length ? result.lines : [{ ...result, uci: result.bestMove?.uci, multipv: 1 }];
  const seen = new Set();
  return [...lines].sort((a, b) => a.multipv - b.multipv).filter(line => {
    if (!legal.has(line.uci) || seen.has(line.uci)) return false;
    seen.add(line.uci);
    return true;
  }).slice(0, 3).map(line => ({
    ...line,
    evaluation: whiteEvaluation(line, fen),
    variation: legalVariation(fen, line.pv?.[0] === line.uci ? line.pv : [line.uci])
  }));
}

export function comparableScoreDelta(reference, candidate) {
  if (!reference || !candidate || reference.isBound || candidate.isBound ||
      reference.isMate || candidate.isMate || !Number.isFinite(reference.scoreCp) ||
      !Number.isFinite(candidate.scoreCp) || !Number.isInteger(reference.depth) ||
      reference.depth !== candidate.depth) return null;
  const delta = candidate.scoreCp - reference.scoreCp;
  return delta <= 0 ? delta : null;
}
