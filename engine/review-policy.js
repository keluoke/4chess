// Shared review policy: unknown evaluations never become teaching claims.
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
