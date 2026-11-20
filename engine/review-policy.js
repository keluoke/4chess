// Shared review policy: unknown evaluations never become teaching claims.
export const REVIEW_QUALITIES = ['best', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced', 'unknown'];
export const INTUITION_KINDS = ['beyond', 'precise', 'trap'];

export function expectedScore(cp) {
  if (!Number.isFinite(cp)) return null;
  return 1 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp))));
}

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
  if (move.divergenceType === 'precise_intuition') return 'precise';
  if (move.divergenceType === 'intuition_trap' || move.isHumanTrap) return 'trap';
  return null;
}

function isKeyError(move) {
  const quality = moveQuality(move);
  if (['unknown', 'forced', 'best'].includes(quality)) return false;
  const before = move.evalBeforeCp, after = -move.evalAfterCp;
  const beforeMate = (move.evalBeforeIsMate || /^[M#]/i.test(move.evalBefore)) ? Math.sign(before) : 0;
  const afterMate = (move.evalAfterIsMate || /^[M#]/i.test(move.evalAfter)) ? Math.sign(after) : 0;
  if (beforeMate > afterMate) return true;
  if (!Number.isFinite(move.expectedScoreLoss)) return ['mistake', 'blunder'].includes(quality);
  const loss = move.expectedScoreLoss;
  const balanced = Math.abs(before) <= 200;
  return loss >= 10 || (balanced && loss >= 8 && move.lossCp >= 80);
}

export function isKeyMoment(move) {
  return isKeyError(move) || (!move.isCombinationFollowup && ['beyond', 'trap'].includes(intuitionKind(move)));
}

export function coreTurningPoints(moves) {
  return new Set(moves.filter(isKeyMoment).map(move => {
    const kind = intuitionKind(move);
    const probability = Number.isFinite(move.humanRawProbability) ? move.humanRawProbability : 0;
    const loss = Math.max(move.expectedScoreLoss ?? 0, kind === 'trap' ? move.verifiedExpectedScoreLoss ?? 0 : 0);
    const errorImpact = isKeyError(move) ? Math.max(loss, 8) : loss;
    const intuitionImpact = kind === 'beyond' ? (move.maiaESL ?? 0) * (1 - 0.2 * probability) : 0;
    return { ply: move.ply, impact: Math.max(errorImpact * (1 + 0.2 * probability), intuitionImpact) };
  }).sort((a, b) => b.impact - a.impact || a.ply - b.ply).slice(0, 3).map(move => move.ply));
}

export function selectReviewMoves(moves, side = 'all', filter = 'all') {
  return (moves || []).filter(move => ['w', 'b'].includes(move.turn) && (side === 'all' || move.turn === side) && (
    filter === 'moves' || (filter === 'all' ? isKeyMoment(move) : filter === 'mistakes' ? ['mistake', 'blunder'].includes(moveQuality(move)) :
      filter === 'book' ? move.isBookMove : INTUITION_KINDS.includes(filter) ? intuitionKind(move) === filter && !move.isCombinationFollowup :
        filter.startsWith('quality:') && moveQuality(move) === filter.slice(8))
  )).sort((a, b) => a.ply - b.ply);
}

export function selectReviewObservations(moves, side, evaluations) {
  const remaining = 2 - selectReviewMoves(moves, side).length;
  if (remaining <= 0 || !evaluations?.length) return [];
  const candidates = selectReviewMoves(moves, side, 'moves').filter(move => {
    const before = evaluations[move.ply - 1], after = evaluations[move.ply];
    return !isKeyMoment(move) && !move.isBookMove && !move.isCombinationFollowup &&
      !['unknown', 'forced', 'best'].includes(moveQuality(move)) && Number.isFinite(move.expectedScoreLoss) && move.expectedScoreLoss >= 1.5 &&
      !!move.bestSan && move.bestSan !== '?' && move.san !== move.bestSan &&
      Array.isArray(before?.pv) && before.pv.length >= 2 && Array.isArray(after?.pv) && after.pv.length >= 1 &&
      [before, after].every(score =>
        Number.isFinite(score.scoreCp) && !score.isMate && !score.isBound);
  }).sort((a, b) => b.expectedScoreLoss - a.expectedScoreLoss || b.lossCp - a.lossCp || a.ply - b.ply);
  const observations = [];
  for (const move of candidates) {
    if (observations.every(other => Math.abs(move.ply - other.ply) >= 4)) observations.push(move);
    if (observations.length === remaining) break;
  }
  return observations;
}

export function reviewCounts(moves) {
  const counts = {};
  for (const side of ['w', 'b']) {
    const own = (moves || []).filter(move => move.turn === side);
    counts[side] = Object.fromEntries(REVIEW_QUALITIES.map(quality => [quality, own.filter(move => moveQuality(move) === quality).length]));
    for (const filter of ['book', ...INTUITION_KINDS]) counts[side][filter] = selectReviewMoves(own, side, filter).length;
    counts[side].total = own.length;
  }
  return counts;
}

export function canPractice(move) {
  return typeof move.fenBefore === 'string' && !['forced', 'unknown'].includes(moveQuality(move)) &&
    (['inaccuracy', 'mistake', 'blunder'].includes(moveQuality(move)) || !!(intuitionKind(move) && !move.isCombinationFollowup));
}

export function isLessLikelyChoice(probability, maiaProbability) {
  return Number.isFinite(probability) && probability >= 0 && Number.isFinite(maiaProbability) &&
    probability < maiaProbability && (probability <= 0.25 || probability < 0.6 * maiaProbability);
}

export function positiveIntuition({ lossCp, maiaAdvantageCp, maiaESL, probability, maiaProbability, stableBest }) {
  if (!Number.isFinite(lossCp) || lossCp > 15 || !isLessLikelyChoice(probability, maiaProbability)) return null;
  if (stableBest && probability <= 0.15 && (maiaESL >= 8 || maiaAdvantageCp >= 70)) return 'beyond_intuition';
  if (maiaESL >= 3 || maiaAdvantageCp >= 25) return 'precise_intuition';
  return null;
}

export function isHighTendency(probability, rank) {
  return Number.isFinite(probability) && (probability >= 0.20 || (rank > 0 && rank <= 2 && probability >= 0.12));
}

export function qualifiesTrap({ lossCp, scoreLoss, probability, rank, knownOpeningTrap }) {
  return lossCp >= 70 && scoreLoss >= 7 && (knownOpeningTrap || isHighTendency(probability, rank));
}

export function retryVerdict(best, played) {
  if (!Number.isFinite(best?.scoreCp) || !Number.isFinite(played?.scoreCp) ||
      (!best.terminal && !(best.depth >= 12)) || (!played.terminal && !(played.depth >= 11))) return 'retryUncertain';
  return Math.max(0, best.scoreCp + played.scoreCp) <= 30 ? 'retryGood' : 'retryAgain';
}
