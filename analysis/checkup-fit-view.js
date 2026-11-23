import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261123-fit-report';
import { readPgnTags } from '../engine/chess-notation.js?v=20261120-import';
import { getLang, t } from './i18n.js?v=20261123-fit-report';
import { checkupPlayedAt, FIT_WINDOW_SIZE } from './checkup-insights.js?v=20261123-fit-report';
import {
  CHECKUP_CLOSE_LOG_GAP, CHECKUP_EXAMPLE_POLICY, checkupFitBands, isCheckupFitExample, summarizeCheckupFit
} from './checkup-fit.js?v=20261123-fit-report';

export function withCheckupFit(report) {
  if (report.fit?.examplePolicy === CHECKUP_EXAMPLE_POLICY || !report.games?.some(game => game.fitSamples?.length)) return report;
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

export function checkupReportDateRange(games = []) {
  const dates = games.map(checkupPlayedAt);
  if (!dates.length || !dates.every(date => date && Math.abs(date) <= 8.64e15)) return '';
  const fmt = new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeZone: 'UTC' });
  return fmt.formatRange(Math.min(...dates), Math.max(...dates));
}

const percent = probability => probability < .0001 ? '<0.01%' : (probability * 100).toFixed(probability < .001 ? 2 : 1) + '%';
const node = (tag, value, className) => {
  const element = document.createElement(tag);
  if (value) element.textContent = value;
  if (className) element.className = className;
  return element;
};

function checkupFitRangeLabel(fit) {
  return (fit?.ranges || []).map(({ low, high }) => low === high ? String(low) : `${low}–${high}`).join(' / ');
}

function hasCloseFit(fit) {
  return fit && fit.logLead < CHECKUP_CLOSE_LOG_GAP;
}

export function checkupFitBandLabel(report) {
  if (report.closestElo == null) return '';
  if (hasCloseFit(report.fit)) return checkupFitRangeLabel(report.fit) || `${report.closestElo} / ${report.fit.runner}`;
  return String(report.closestElo);
}

export function checkupFitHeadline(report) {
  if (report.closestElo == null) return t('checkupNoEloFit');
  if (hasCloseFit(report.fit)) {
    const max = Math.max(...report.fit.weights);
    if (report.fit.weights.filter(weight => weight * 1.25 >= max).length > 2) return t('checkupFitCloseSeveral');
    return t('checkupFitClose', { leader: report.closestElo, runner: report.fit.runner });
  }
  return t(report.fit?.status === 'limited' ? 'checkupFitProvisional' : 'checkupClosestElo', { elo: report.closestElo });
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

export function renderCheckupFit(report, { openMove, speedLabel, changeSpeed, viewCount }) {
  const section = node('section', '', 'checkup-fit-section');
  const fit = report.fit;
  const heading = node('div', '', 'checkup-fit-context');
  heading.append(node('h3', checkupFitHeadline(report), 'checkup-fit-title'));
  if (fit?.status) heading.append(node('span', checkupFitStatusLabel(fit), `checkup-fit-status ${fit.status}`));
  if (report.speeds?.length > 1) {
    const mode = node('select', '', 'btn-header checkup-fit-speed');
    mode.setAttribute('aria-label', t('checkupFitSpeed'));
    for (const value of report.speeds) mode.add(new Option(speedLabel(value), value));
    mode.value = report.speed;
    mode.onchange = () => changeSpeed(mode.value);
    heading.append(mode);
  }
  section.append(heading);
  const context = node('div', '', 'checkup-fit-metadata');
  const ratings = pgnRatingGroups(report.games);
  if (ratings.length) {
    const line = node('p', ratings.map(({ elo, speed }) => speed
      ? t('checkupFitRatedSpeed', { elo, speed: speedLabel(speed) })
      : t('checkupFitRatedUnknown', { elo })).join(' · '), 'checkup-fit-rating');
    line.title = ratings.map(({ elo, speed, count }) => t('checkupFitRatingValue', { elo, count, speed: speedLabel(speed) })).join(' · ');
    context.append(line);
  }
  const ranges = checkupFitRangeLabel(fit);
  if (ranges && ranges !== String(report.closestElo)) {
    context.append(node('p', t('checkupFitSupportRange', { ranges }), 'checkup-elo-note'));
  }
  if (context.children.length) section.append(context);

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
  const detailsLine = [];
  if (report.eloSampleCount) {
    const params = { moves: report.eloSampleCount, games: report.fitGameCount };
    const scopeDiffers = report.isFitWindow && report.fitGameCount < viewCount;
    const key = scopeDiffers ? (report.fitGameCount === 1 ? 'checkupFitCoverageSingle' : 'checkupFitCoverage') : 'checkupFitCoverageMoves';
    detailsLine.push(t(key, params));
  }
  if (fit?.checked) detailsLine.push(t('checkupFitStability', { kept: fit.retained, total: fit.checked, elo: report.closestElo }));
  if (detailsLine.length) section.append(node('p', detailsLine.join(' · '), 'checkup-elo-note'));

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

  if (fit?.examples?.length) {
    const evidence = node('div', '', 'checkup-fit-evidence');
    evidence.append(node('h4', t('checkupFitEvidence', { leader: report.closestElo, runner: fit.runner })));
    for (const sample of fit.examples) {
      if (!isCheckupFitExample(sample)) continue;
      const game = report.games?.[sample.gameIndex];
      const move = replaySample(game, sample);
      if (!move) continue;
      const row = node('div', '', 'checkup-fit-evidence-row');
      const favorsLeader = sample.leaderProbability > sample.runnerProbability;
      const moveLabel = `${move.moveNumber}${move.turn === 'b' ? '...' : '.'} ${move.san}`;
      const description = node('div', '', 'checkup-fit-evidence-description');
      const top = node('div', '', 'checkup-fit-evidence-heading');
      top.append(node('strong', moveLabel), node('span', t('checkupFitEvidenceFavors', { elo: favorsLeader ? report.closestElo : fit.runner }),
        `checkup-fit-direction ${favorsLeader ? 'leader' : 'runner'}`));
      description.append(top, node('p', t('checkupFitExample', {
        leader: report.closestElo, runner: fit.runner, p1: percent(sample.leaderProbability), p2: percent(sample.runnerProbability)
      }), 'checkup-elo-note'));
      row.append(description);
      const button = node('button', t('checkupOpenMove'), 'btn-header checkup-review-move');
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

export const densityText = density => density.toFixed(1);
export const lowClockRate = stability => stability?.reviewed >= 5 ? Math.round(stability.errors * 100 / stability.reviewed) + '%' : null;

export function renderCheckupStability(report, rerun) {
  const { stability, gameCount: count, phaseTraps, screenElo, screenEloSource } = report;
  const section = node('section', '', 'checkup-stability-section');
  section.append(node('h3', t('checkupStabilityTitle'), 'checkup-fit-title'));
  if (stability.density == null) {
    const empty = node('div', '', 'checkup-stability-empty');
    empty.append(node('p', t(stability.missingCoverage ? 'checkupStabilityLegacy' : 'checkupStabilityNotScreened'), 'checkup-elo-note'));
    const button = node('button', t(rerun.label), 'btn-header btn-primary');
    button.type = 'button';
    button.onclick = rerun.run;
    empty.append(button);
    section.append(empty);
  } else if (!stability.hits) {
    section.append(node('p', t('checkupStabilityNoTraps'), 'checkup-stability-label'),
      node('p', t('checkupStabilityCoverage', stability), 'checkup-elo-note'));
  } else {
    section.append(node('strong', densityText(stability.density), 'checkup-stability-value'),
      node('p', t('checkupStabilityDensity'), 'checkup-stability-label'));
    if (count > 0) {
      section.append(node('p', t('checkupStabilityPerGame', { average: (stability.hits / count).toFixed(1) }), 'checkup-stability-per-game'));
    }
    section.append(node('p', t('checkupStabilityCoverage', stability), 'checkup-elo-note'));
  }
  if (phaseTraps && (stability.hits || stability.screened)) {
    const phases = node('div', '', 'checkup-stability-phases');
    phases.append(node('h4', t('checkupStabilityPhases'), 'checkup-stability-label'));
    for (const phase of ['opening', 'middlegame', 'endgame']) {
      const hits = phaseTraps[phase] || 0;
      const row = node('div', '', 'checkup-stability-phase');
      const meter = node('span', '', 'checkup-fit-meter');
      const fill = node('i');
      fill.style.width = `${stability.hits ? 100 * hits / stability.hits : 0}%`;
      meter.append(fill);
      meter.setAttribute('aria-hidden', 'true');
      row.append(node('span', t(`bankPhase_${phase}`)), meter, node('strong', String(hits)));
      phases.append(row);
    }
    section.append(phases);
  }
  if (Number.isFinite(screenElo)) {
    const source = { pgn: 'checkupScreenPgn', fit: 'checkupScreenFit', manual: 'checkupScreenManual',
      default: 'checkupScreenDefault', rolling: 'checkupScreenRolling' };
    section.append(node('p', t(source[screenEloSource] || 'checkupScreenElo', { elo: screenElo }),
      'checkup-elo-note checkup-stability-screen'));
  }
  if (!stability.observed && stability.density == null) return section;
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
