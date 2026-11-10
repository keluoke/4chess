// Shared review policy: unknown evaluations never become teaching claims.
export const REVIEW_QUALITIES = ['best', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced', 'unknown'];

// Same loss bands as the analyzer; presentation never invents finer quality grades.
export function errorSeverity(lossCp) {
  if (!Number.isFinite(lossCp)) return 'unknown';
  return lossCp >= 200 ? 'blunder' : lossCp >= 100 ? 'mistake' : lossCp >= 40 ? 'inaccuracy' : 'good';
}

export function moveQuality(move) {
  if (move.isOnlyLegalMove) return 'forced';
  if (!['good', 'inaccuracy', 'mistake', 'blunder'].includes(move.severity) || !Number.isFinite(move.lossCp) || move.accuracy === null) return 'unknown';
  const severity = errorSeverity(move.lossCp);
  if (severity !== 'good') return severity;
  // UCI identity includes promotion; never equate a merely low-loss move with Best.
  return move.uci && move.uci === (move.bestUci || move.bestMove?.uci) ? 'best' : 'good';
}

export function intuitionKind(move) {
  if (['unknown', 'forced'].includes(moveQuality(move))) return null;
  if (move.divergenceStatus && move.divergenceStatus !== 'confirmed') return null;
  if (move.divergenceType === 'beyond_intuition' || move.isBeyondIntuition) return 'beyond';
  if (move.divergenceType === 'intuition_trap' || move.isHumanTrap) return 'trap';
  return null;
}

export function reviewKeyMove(move) {
  return ['mistake', 'blunder'].includes(moveQuality(move)) ||
    !!(intuitionKind(move) && !move.isCombinationFollowup);
}

export function selectReviewMoves(moves, side = 'all', filter = 'all') {
  return (moves || []).filter(move => ['w', 'b'].includes(move.turn) && (side === 'all' || move.turn === side) && (
    filter === 'moves' || (filter === 'all' ? reviewKeyMove(move) : filter === 'mistakes' ? ['mistake', 'blunder'].includes(moveQuality(move)) :
      filter === 'book' ? move.isBookMove : ['beyond', 'trap'].includes(filter) ? intuitionKind(move) === filter && !move.isCombinationFollowup :
        filter.startsWith('quality:') && moveQuality(move) === filter.slice(8))
  )).sort((a, b) => a.ply - b.ply);
}

export function reviewCounts(moves) {
  const counts = {};
  for (const side of ['w', 'b']) {
    const own = (moves || []).filter(move => move.turn === side);
    counts[side] = Object.fromEntries(REVIEW_QUALITIES.map(quality => [quality, own.filter(move => moveQuality(move) === quality).length]));
    for (const filter of ['book', 'beyond', 'trap']) counts[side][filter] = selectReviewMoves(own, side, filter).length;
    counts[side].total = own.length;
  }
  return counts;
}

export function canPractice(move) {
  return typeof move.fenBefore === 'string' && !['forced', 'unknown'].includes(moveQuality(move)) &&
    (['inaccuracy', 'mistake', 'blunder'].includes(moveQuality(move)) || !!(intuitionKind(move) && !move.isCombinationFollowup));
}

export function isKeyMoment(move) {
  return ['blunder', 'mistake'].includes(move.severity) ||
    ['beyond_intuition', 'intuition_trap'].includes(move.divergenceType);
}

export function qualifiesBeyond({ lossCp, maiaLossCp, probability, stableBest, verified }) {
  return verified && stableBest && Number.isFinite(lossCp) && lossCp <= 10 &&
    Number.isFinite(maiaLossCp) && maiaLossCp >= 50 &&
    Number.isFinite(probability) && probability >= 0 && probability <= 0.15;
}

export function retryVerdict(best, played) {
  if (!Number.isFinite(best?.scoreCp) || !Number.isFinite(played?.scoreCp) ||
      (!best.terminal && !(best.depth >= 12)) || (!played.terminal && !(played.depth >= 11))) return 'retryUncertain';
  return Math.max(0, best.scoreCp + played.scoreCp) <= 30 ? 'retryGood' : 'retryAgain';
}
