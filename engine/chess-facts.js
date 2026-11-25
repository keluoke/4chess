import { ChessBoard } from './chess-core.js';
import { intuitionKind } from './review-policy.js?v=20261120-review';

function replay(fen, variation) {
  const board = new ChessBoard(fen);
  if (!board.isValid) return [];
  const line = [];
  for (const uci of variation.slice(0, 3)) {
    const move = board.getLegalMoves().find(candidate => candidate.uci === uci);
    if (!move) break;
    board.makeMove(move);
    line.push({
      san: move.san, square: move.toSq,
      capture: move.enPassant ? 'p' : move.captured?.type ?? null,
      check: board.inCheck()
    });
  }
  return line;
}

export function intuitionTrapFacts(move, review) {
  if (!move || review?.engineOnly || move.divergenceStatus !== 'confirmed' || intuitionKind(move) !== 'trap') return null;
  if (!Number.isFinite(move.verifiedLossCp) || move.verifiedLossCp < 0 ||
      !Number.isFinite(move.verifiedExpectedScoreLoss) || move.verifiedExpectedScoreLoss < 0 ||
      move.verifiedExpectedScoreLoss > 100) return null;
  const { fenBefore, uci } = move;
  if (!fenBefore || !uci) return null;
  const playedPv = Array.isArray(move.verifiedPlayedPv) && move.verifiedPlayedPv[0] === uci ? move.verifiedPlayedPv : [uci];
  const playedLine = replay(fenBefore, playedPv);
  if (!playedLine.length) return null;

  // Older review caches contain the verified SAN, but have no verified PV.
  const board = new ChessBoard(fenBefore);
  const bestUci = move.verifiedBestUci ||
    board.getLegalMoves().find(candidate => candidate.san === move.verifiedBestSan)?.uci;
  const bestPv = Array.isArray(move.verifiedBestPv) && move.verifiedBestPv[0] === bestUci ? move.verifiedBestPv : [bestUci];
  const bestLine = replay(fenBefore, bestPv);
  const maiaTop = move.maiaTopUci ? replay(fenBefore, [move.maiaTopUci])[0]?.san : null;
  const probability = move.humanRawProbability;
  return {
    turn: board.turn === 'w' ? 'White' : 'Black',
    played: playedLine[0],
    playedReply: playedLine[1] ?? null,
    best: bestLine[0] ?? null,
    bestLine: bestLine.map(step => step.san),
    maiaTop: maiaTop ?? null,
    maiaRating: Number.isInteger(review?.elo) ? review.elo : null,
    playedProbability: Number.isFinite(probability) && probability >= 0 && probability <= 1 ? probability : null,
    expectedScoreLossPoints: move.verifiedExpectedScoreLoss,
    lossCp: move.evalBeforeIsMate || move.evalAfterIsMate ? null : move.verifiedLossCp
  };
}
