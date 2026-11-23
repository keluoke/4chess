export const CHECKUP_ELOS = [1100, 1500, 1900, 2200];
export const FINE_CHECKUP_ELOS = [1000, 1300, 1600, 1900, 2200, 2500];
export const MAX_ELO_SAMPLES = 24;
export const LOG_PROB_FLOOR = 1e-4;
export const CHECKUP_CLOSE_LOG_GAP = Math.log(1.25);

export function checkupFitBands(method) {
  return method === 'fine' ? FINE_CHECKUP_ELOS : CHECKUP_ELOS;
}

function sampleQuotas(groups) {
  const quotas = groups.map(() => 0);
  let remaining = Math.min(MAX_ELO_SAMPLES, groups.reduce((sum, group) => sum + group.length, 0));
  while (remaining) {
    groups.forEach((group, index) => {
      if (remaining && quotas[index] < group.length) {
        quotas[index]++;
        remaining--;
      }
    });
  }
  return quotas;
}

export function planCheckupSamples(groups) {
  return sampleQuotas(groups).map((count, i) =>
    Array.from({ length: count }, (_, j) => groups[i][Math.floor((j + 0.5) * groups[i].length / count)]));
}

const rank = scores => scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);

export function summarizeCheckupFit(games, method) {
  const bands = checkupFitBands(method);
  const grouped = games.map((game, gameIndex) => (game.fitSamples || []).filter(sample =>
    Array.isArray(sample?.scores) && sample.scores.length === bands.length && sample.scores.every(Number.isFinite))
    .map(sample => ({ ...sample, gameIndex })));
  const fitted = planCheckupSamples(grouped);
  const samples = fitted.flat();
  const eloFit = Object.fromEntries(bands.map(band => [band, 0]));
  const summary = { fit: null, closestElo: null, eloSampleCount: samples.length, fitGameCount: fitted.filter(group => group.length).length, eloFit };
  if (!samples.length) return summary;

  const totals = bands.map((_, i) => samples.reduce((sum, sample) => sum + sample.scores[i], 0));
  const [leader, runner] = rank(totals);
  const relative = totals.map(value => Math.exp(value - totals[leader]));
  const sum = relative.reduce((a, b) => a + b, 0);
  const weights = relative.map(value => value / sum);
  const logLead = totals[leader] - totals[runner];
  const examples = samples.map(sample => ({
    gameIndex: sample.gameIndex, ply: sample.ply, moveNumber: sample.moveNumber, turn: sample.turn,
    san: sample.san, uci: sample.uci, fenBefore: sample.fenBefore,
    leaderProbability: Math.exp(sample.scores[leader]), runnerProbability: Math.exp(sample.scores[runner]),
    gap: Math.abs(sample.scores[leader] - sample.scores[runner])
  })).filter(example => Number.isInteger(example.ply) && example.gap >= Math.log(1.5))
    .sort((a, b) => b.gap - a.gap);
  const first = examples[0];
  const second = first && (examples.find(example => example.gameIndex !== first.gameIndex) || examples[1]);

  let retained = 0, checked = 0;
  for (const group of fitted) {
    if (!group.length || group.length === samples.length) continue;
    const remaining = totals.map((total, i) => group.reduce((acc, sample) => acc - sample.scores[i], total));
    const [winner, other] = rank(remaining);
    if (winner === leader && remaining[winner] - remaining[other] > 1e-9) retained++;
    checked++;
  }
  const separated = Math.abs(leader - runner) > 1 && weights[runner] >= 0.2;
  let estimate = null;
  if (method === 'fine' && samples.length >= 12 && checked >= 3 && retained === checked && logLead >= CHECKUP_CLOSE_LOG_GAP && !separated) {
    const mean = weights.reduce((value, weight, i) => value + weight * bands[i], 0);
    let cumulative = 0;
    const limits = weights.map(weight => (cumulative += weight));
    const value = Math.round(mean / 50) * 50;
    const low = bands[limits.findIndex(p => p >= 0.1)];
    const high = bands[limits.findIndex(p => p >= 0.9)];
    if (value >= low && value <= high) estimate = { value, low, high };
  }
  bands.forEach((band, i) => { eloFit[band] = Math.round(Math.exp(totals[i] / samples.length) * 1000) / 1000; });
  return { ...summary, closestElo: bands[leader], fit: {
    bands, weights, logLead, runner: bands[runner], checked, retained, estimate, examples: [first, second].filter(Boolean)
  } };
}
