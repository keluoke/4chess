export const CHECKUP_ELOS = [1100, 1500, 1900, 2200];
export const FINE_CHECKUP_ELOS = [1000, 1300, 1600, 1900, 2200, 2500];
export const MAX_ELO_SAMPLES = 24;
export const LOG_PROB_FLOOR = 1e-4;
export const CHECKUP_CLOSE_LOG_GAP = Math.log(1.25);
export const CHECKUP_EXAMPLE_POLICY = 2;
const MIN_EXAMPLE_PROBABILITY = 0.08;

export function isCheckupFitExample(sample) {
  const { leaderProbability, runnerProbability } = sample;
  const high = Math.max(leaderProbability, runnerProbability);
  const low = Math.min(leaderProbability, runnerProbability);
  return high + 1e-12 >= MIN_EXAMPLE_PROBABILITY && high + 1e-12 >= low * 1.5;
}

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

export function summarizeCheckupFit(games, method, { rolling = false } = {}) {
  const bands = checkupFitBands(method);
  const grouped = games.map((game, gameIndex) => (game.fitSamples || []).filter(sample =>
    Array.isArray(sample?.scores) && sample.scores.length === bands.length && sample.scores.every(Number.isFinite))
    .map(sample => ({ ...sample, gameIndex })));
  const fitted = rolling ? grouped : planCheckupSamples(grouped);
  const samples = fitted.flat();
  const eloFit = Object.fromEntries(bands.map(band => [band, 0]));
  const summary = { fit: null, closestElo: null, eloSampleCount: samples.length, fitGameCount: fitted.filter(group => group.length).length, eloFit };
  if (!samples.length) return summary;

  // Use every cached move. Limit the statistical weight of a single game
  // when an older run spent much of its budget on that game alone.
  const gameScores = fitted.map(group => {
    const weight = rolling && group.length > 3 ? 3 / group.length : 1;
    return bands.map((_, i) => group.reduce((sum, sample) => sum + sample.scores[i], 0) * weight);
  });
  const totals = bands.map((_, i) => gameScores.reduce((sum, scores) => sum + scores[i], 0));
  const [leader, runner] = rank(totals);
  const relative = totals.map(value => Math.exp(value - totals[leader]));
  const sum = relative.reduce((a, b) => a + b, 0);
  const weights = relative.map(value => value / sum);
  const logLead = totals[leader] - totals[runner];
  const examples = samples.map(sample => ({
    gameIndex: sample.gameIndex, ply: sample.ply, moveNumber: sample.moveNumber, turn: sample.turn,
    san: sample.san, uci: sample.uci, fenBefore: sample.fenBefore,
    leaderProbability: Math.exp(sample.scores[leader]), runnerProbability: Math.exp(sample.scores[runner])
  })).filter(example => Number.isInteger(example.ply) && isCheckupFitExample(example))
    .sort((a, b) => Math.abs(b.leaderProbability - b.runnerProbability) - Math.abs(a.leaderProbability - a.runnerProbability));
  const supportsLeader = example => example.leaderProbability > example.runnerProbability;
  const first = examples.find(supportsLeader) || examples[0];
  const second = first && (
    examples.find(example => example.gameIndex !== first.gameIndex && supportsLeader(example) !== supportsLeader(first)) ||
    examples.find(example => example.gameIndex !== first.gameIndex) ||
    examples.find(example => supportsLeader(example) !== supportsLeader(first)) ||
    examples.find(example => example !== first));

  const supported = new Set();
  let mass = 0;
  let edge = totals[leader];
  for (const i of rank(totals)) {
    const tiedAtEdge = edge - totals[i] <= 1e-9;
    if (mass >= 0.8 && !tiedAtEdge && totals[leader] - totals[i] >= CHECKUP_CLOSE_LOG_GAP) break;
    supported.add(i);
    mass += weights[i];
    edge = totals[i];
  }

  let retained = 0, checked = 0;
  let influence = null;
  for (const [gameIndex, group] of fitted.entries()) {
    if (!group.length || group.length === samples.length) continue;
    const remaining = totals.map((total, i) => total - gameScores[gameIndex][i]);
    const [winner, other] = rank(remaining);
    if (remaining[winner] - remaining[other] > 1e-9) {
      supported.add(winner);
      if (winner === leader) retained++;
      else {
        const shift = bands[winner] - bands[leader];
        if (!influence || Math.abs(shift) > Math.abs(influence.shift)) {
          influence = { gameIndex, shift, elo: bands[winner] };
        }
      }
    }
    checked++;
  }

  const ranges = [];
  bands.forEach((band, i) => {
    if (!supported.has(i)) return;
    if (supported.has(i - 1)) ranges.at(-1).high = band;
    else ranges.push({ low: band, high: band });
  });
  const status = samples.length < 12 || checked < 3 ? 'limited'
    : ranges.length === 1 && retained / checked >= 0.8 && logLead >= CHECKUP_CLOSE_LOG_GAP ? 'stable' : 'variation';
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
  bands.forEach((band, i) => {
    const raw = samples.reduce((sum, sample) => sum + sample.scores[i], 0);
    eloFit[band] = Math.round(Math.exp(raw / samples.length) * 1000) / 1000;
  });
  return { ...summary, closestElo: bands[leader], fit: {
    bands, weights, logLead, runner: bands[runner], checked, retained, estimate, ranges, status, influence, examplePolicy: CHECKUP_EXAMPLE_POLICY, examples: [first, second].filter(Boolean)
  } };
}
