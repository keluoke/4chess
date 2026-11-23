import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261123-checkup-windows';
import { readPgnTags } from '../engine/chess-notation.js?v=20261120-import';
import { getLang, t } from './i18n.js?v=20261123-checkup-windows';
import { checkupPlayedAt, FIT_WINDOW_SIZE } from './checkup-insights.js?v=20261123-checkup-windows';
import { CHECKUP_CLOSE_LOG_GAP, checkupFitBands, summarizeCheckupFit } from './checkup-fit.js?v=20261123-checkup-windows';

export function withCheckupFit(report) {
  if (report.fit?.ranges || !report.games?.some(game => game.fitSamples?.length)) return report;
  const result = summarizeCheckupFit(report.games, report.fitMethod);
  return result.fit ? { ...report, ...result } : report;
}

export function pgnRatingGroups(games = []) {
  const groups = new Map();
  for (const game of games) {
    const key = game.orientation === 'white' ? 'whiteelo' : game.orientation === 'black' ? 'blackelo' : '';
    const raw = game.playedRating ?? (key && game.pgn ? readPgnTags(game.pgn)[key] : '');
    if (!/^\d{3,4}$/.test(raw) || Number(raw) <= 0) continue;
    const speed = game.timeClass || '';
    if (!groups.has(speed)) groups.set(speed, []);
    groups.get(speed).push(Number(raw));
  }
  return [...groups].map(([speed, ratings]) => {
    ratings.sort((a, b) => a - b);
    const count = ratings.length;
    return { speed, count, elo: (ratings[Math.floor((count - 1) / 2)] + ratings[Math.floor(count / 2)]) / 2 };
  }).sort((a, b) => b.count - a.count);
}

export function formatPgnRatings(games, speedLabel) {
  return pgnRatingGroups(games).map(({ elo, speed, count }) => t('checkupFitRatingValue', {
    elo, speed: speed ? speedLabel(speed) : t('checkupFitUnknownSpeed'), count
  }));
}

const percent = probability => probability < .0001 ? '<0.01%' : (probability * 100).toFixed(probability < .001 ? 2 : 1) + '%';
const node = (tag, value, className) => {
  const element = document.createElement(tag);
  if (value) element.textContent = value;
  if (className) element.className = className;
  return element;
};

export function checkupFitHeadline(report) {
  if (report.closestElo == null) return t('checkupNoEloFit');
  if (report.fit?.ranges?.length) {
    const ranges = report.fit.ranges.map(({ low, high }) => low === high ? String(low) : `${low}–${high}`).join(' / ');
    return t(report.fit.status === 'limited' ? 'checkupFitProvisional' : 'checkupFitMainRange', { ranges });
  }
  if (report.fit && report.fit.logLead < CHECKUP_CLOSE_LOG_GAP) {
    const max = Math.max(...report.fit.weights);
    if (report.fit.weights.filter(weight => weight * 1.25 >= max).length > 2) return t('checkupFitCloseSeveral');
    return t('checkupFitClose', { leader: report.closestElo, runner: report.fit.runner });
  }
  return t('checkupClosestElo', { elo: report.closestElo });
}

function replaySample(game, sample) {
  if (!game?.pgn) return null;
  if (sample.san && sample.fenBefore && sample.uci) return sample;
  const positions = GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn(game.pgn));
  if (!positions || positions.isPartial) return null;
  const index = positions.findIndex(position => position.ply === sample.ply);
  return index > 0 ? { ...positions[index], fenBefore: positions[index - 1].fen } : null;
}

const statusKey = { stable: 'checkupFitStatusStable', variation: 'checkupFitStatusVariation', limited: 'checkupFitStatusLimited' };
export const checkupFitStatusLabel = fit => statusKey[fit?.status] ? t(statusKey[fit.status]) : '';

export function checkupFitScope(report, speedLabel) {
  return t('checkupFitWindowScope', { count: report.fitGameCount || 0, limit: FIT_WINDOW_SIZE,
    speed: speedLabel(report.speed) });
}

export function renderCheckupFit(report, openMove, speedLabel, changeSpeed) {
  const section = node('section', '', 'checkup-fit-section');
  if (report.isFitWindow) {
    const context = node('div', '', 'checkup-fit-context');
    context.append(node('p', checkupFitScope(report, speedLabel), 'checkup-profile-label'));
    if (report.speeds?.length > 1) {
      const mode = node('select', '', 'btn-header checkup-fit-speed');
      mode.setAttribute('aria-label', t('checkupFitSpeed'));
      for (const value of report.speeds) mode.add(new Option(speedLabel(value), value));
      mode.value = report.speed;
      mode.onchange = () => changeSpeed(mode.value);
      context.append(mode);
    }
    section.append(context);
    const dates = report.games.map(checkupPlayedAt);
    if (dates.length && dates.every(Boolean)) {
      const fmt = new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeZone: 'UTC' });
      const from = fmt.format(Math.min(...dates)), to = fmt.format(Math.max(...dates));
      section.append(node('p', from === to ? from : `${from} – ${to}`, 'checkup-elo-note'));
    }
  } else {
    section.append(node('p', t('checkupFitBatchLabel'), 'checkup-profile-label'));
  }
  const fit = report.fit;
  const heading = node('div', '', 'checkup-fit-context');
  heading.append(node('h3', checkupFitHeadline(report), 'checkup-fit-title'));
  if (fit?.status) {
    heading.append(node('span', checkupFitStatusLabel(fit), `checkup-fit-status ${fit.status}`));
  }
  section.append(heading);
  const bands = fit?.bands || checkupFitBands(report.fitMethod);
  const raw = () => node('p', bands.map(band => `${band} · ${((report.eloFit?.[band] || 0) * 100).toFixed(1)}%`).join('   /   '), 'checkup-fit-raw');
  if (fit) {
    const grid = node('div', '', 'checkup-fit-bars');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', t('checkupFitWeights'));
    bands.forEach((band, index) => {
      const weight = fit.weights[index];
      const row = node('div', '', `checkup-fit-bar${band === report.closestElo && fit.logLead >= CHECKUP_CLOSE_LOG_GAP ? ' best' : ''}`);
      const meter = node('span', '', 'checkup-fit-meter');
      meter.setAttribute('aria-hidden', 'true');
      const fill = node('i');
      fill.style.width = `${weight * 100}%`;
      meter.append(fill);
      row.append(node('span', `Maia ${band}`), meter, node('strong', percent(weight)));
      grid.append(row);
    });
    section.append(grid);
    const lead = Math.exp(fit.logLead);
    if (!report.isFitWindow && fit.logLead >= CHECKUP_CLOSE_LOG_GAP) section.append(node('p', t('checkupFitLead', {
      winner: report.closestElo, runner: fit.runner,
      ratio: lead >= 1000 ? '1,000+' : lead.toFixed(lead >= 10 ? 0 : 1)
    }), 'checkup-elo-note'));
  } else if (report.closestElo != null) {
    section.append(node('p', t('checkupFitLegacy'), 'checkup-elo-note'), raw());
  }
  if (report.eloSampleCount && Number.isInteger(report.fitGameCount)) {
    section.append(node('p', t(report.fitGameCount === 1 ? 'checkupFitCoverageSingle' : 'checkupFitCoverage', {
      moves: report.eloSampleCount, games: report.fitGameCount
    }), 'checkup-elo-note'));
  }
  if (fit?.checked) section.append(node('p', t('checkupFitStability', { kept: fit.retained, total: fit.checked }), 'checkup-elo-note'));

  if (fit?.status === 'variation' && fit.influence) {
    const { gameIndex, shift, elo } = fit.influence;
    const game = report.games?.[gameIndex];
    if (game?.pgn) {
      const row = node('div', '', 'checkup-fit-evidence-row checkup-fit-influence');
      row.append(node('span', t('checkupFitInfluence', { game: `${game.white} – ${game.black}`,
        delta: (shift > 0 ? '+' : '−') + Math.abs(shift), elo })));
      const open = node('button', t('checkupFitInspectGame'), 'btn-header');
      open.type = 'button';
      open.onclick = () => openMove(game);
      row.append(open);
      section.append(row);
    }
  }

  const ratings = formatPgnRatings(report.games, speedLabel);
  if (ratings.length) {
    section.append(node('p', t('checkupFitRatingLine', { ratings: ratings.join(' · ') }), 'checkup-fit-rating'));
  }

  if (fit?.examples?.length) {
    const evidence = node('div', '', 'checkup-fit-evidence');
    evidence.append(node('h4', t('checkupFitEvidence')));
    for (const sample of fit.examples) {
      const game = report.games?.[sample.gameIndex];
      const move = replaySample(game, sample);
      if (!move) continue;
      const row = node('div', '', 'checkup-fit-evidence-row');
      row.append(node('span', t('checkupFitExample', {
        move: `${move.moveNumber}${move.turn === 'b' ? '...' : '.'} ${move.san}`, leader: report.closestElo,
        runner: fit.runner, p1: percent(sample.leaderProbability), p2: percent(sample.runnerProbability)
      })));
      const button = node('button', t('checkupOpenMove'), 'btn-header');
      button.type = 'button';
      button.onclick = () => openMove(game, move);
      row.append(button);
      evidence.append(row);
    }
    if (evidence.children.length > 1) section.append(evidence);
  }
  if (fit) {
    const details = node('details', '', 'checkup-fit-details');
    details.append(node('summary', t('checkupFitMethodology')), node('p', t('checkupFitExplanation')),
      node('p', t('checkupFitRangeExplanation')), raw());
    if (report.isFitWindow) details.append(node('p', t('checkupFitWindowWeight')));
    section.append(details);
  }
  return section;
}

export const densityText = density => density == null ? '—' : density.toFixed(1);
export const lowClockRate = stability => stability?.reviewed >= 5 ? Math.round(stability.errors * 100 / stability.reviewed) + '%' : null;

export function renderCheckupStability(stability, count) {
  const section = node('section', '', 'checkup-stability-section');
  section.append(node('p', t(count === 1 ? 'checkupStabilityScopeOne' : 'checkupStabilityScope', { count }), 'checkup-profile-label'));
  section.append(node('h3', t('checkupStabilityTitle'), 'checkup-fit-title'));
  section.append(node('strong', densityText(stability.density), 'checkup-stability-value'));
  section.append(node('p', t('checkupStabilityDensity'), 'checkup-stability-label'));
  if (stability.screened) {
    section.append(node('p', t('checkupStabilityCoverage', stability), 'checkup-elo-note'));
  }
  const clock = node('div', '', 'checkup-stability-clock');
  const rate = lowClockRate(stability);
  clock.append(node('p', t('checkupClockErrorRate'), 'checkup-stability-label'));
  if (rate) clock.append(node('strong', rate, 'checkup-stability-value'));
  const key = stability.reviewed ? 'checkupClockCoverage' : stability.low ? 'checkupClockNoReviews'
    : stability.observed ? 'checkupStabilityClockNone' : 'checkupClockUnavailable';
  clock.append(node('p', t(key, stability), 'checkup-elo-note'));
  if (stability.reviewed && !rate) clock.append(node('p', t('checkupStabilityClockFew'), 'checkup-elo-note'));
  section.append(clock);
  return section;
}
