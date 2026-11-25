import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261125-game-story';
import { checkupReportMatchesAccount, normalizeAccount, normalizeAlias } from './study-store.js?v=20261124-checkup-cards-r2';
import { CHECKUP_CLOSE_LOG_GAP, summarizeCheckupFit } from './checkup-fit.js?v=20261124-checkup-cards-r2';
export { CHECKUP_ELOS, MAX_ELO_SAMPLES, planCheckupSamples } from './checkup-fit.js?v=20261124-checkup-cards-r2';
export const FEATURED_TRAPS = 5;
export const OVERVIEW_GAME_LIMIT = 100;
const WINDOW_SIZE = 10;

export function summarizeCheckupGames(games, fitMethod = 'standard') {
  const phaseTraps = { opening: 0, middlegame: 0, endgame: 0 };
  const dedup = new Map();
  let analyzedMoves = 0;
  let screenedMoves = 0;
  games.forEach((game, gameIndex) => {
    analyzedMoves += game.analyzedMoves || 0;
    screenedMoves += game.screenedMoves || 0;
    for (const trap of game.trapEvidence || []) {
      phaseTraps[trap.phase]++;
      const previous = dedup.get(trap.id);
      const best = !previous || trap.eslLoss > previous.eslLoss ? { ...trap, gameIndex } : previous;
      dedup.set(trap.id, { ...best, occurrences: [...(previous?.occurrences || []), { gameIndex, ply: trap.ply }] });
    }
  });
  const traps = [...dedup.values()].sort((a, b) => b.eslLoss - a.eslLoss);
  const highlights = games.flatMap((game, gameIndex) => (game.highlights || [])
    .map(move => ({ ...move, gameIndex }))).slice(0, 2);
  return {
    games, gameCount: games.length, analyzedMoves, screenedMoves, phaseTraps, traps, highlights,
    fitMethod, ...summarizeCheckupFit(games, fitMethod)
  };
}

export function buildCheckupWindow(ids, evidenceKey, reports, observedAt = Date.now(), archives = []) {
  const windowIds = [...new Set(ids.filter(Boolean))].slice(0, WINDOW_SIZE);
  const evidence = new Map();
  const compatible = reports.filter(report => report.evidenceKey === evidenceKey);
  for (const report of compatible) {
    for (const game of [...(report.games || []), ...(report.rolling?.games || [])]) {
      if (game.gameId && !evidence.has(game.gameId)) evidence.set(game.gameId, game);
    }
  }
  const archived = new Map(archives.map(game => [game.gameId, game]));
  const games = windowIds.flatMap(id => {
    const game = evidence.get(id);
    if (!game) return [];
    const recent = archived.get(id);
    if (!recent || game.clockSample?.observed) return [game];
    const side = game.orientation === 'white' ? 'w' : 'b';
    const moves = GameAnalyzer.parsePgn(recent.pgn, { clocks: true });
    const clockSample = checkupClockSample(moves, side, recent.clocks, recent.meta?.initialSeconds);
    return [{ ...game, clockSample, playedAt: game.playedAt ?? recent.meta?.playedAt }];
  });
  return { ...summarizeCheckupGames(games, compatible[0]?.fitMethod), windowIds, observedAt };
}

export const FIT_WINDOW_SIZE = 30;

function fitEvidenceKey(report) {
  // The fit uses the Maia model and the sample scheme independently of
  // Stockfish and the screening band. This also reads pre-window reports.
  const match = String(report.evidenceKey || '').match(/^(window-v1|window-fine-v1)\|[^|]+\|([^|]+)\|\d+$/);
  return match ? `${match[1]}|${match[2]}` : null;
}

export function checkupPlayedAt(game) {
  if (Number.isFinite(game.playedAt) && game.playedAt > 0) return game.playedAt;
  const date = String(game.date || '').replaceAll('.', '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date) || 0 : 0;
}

export function buildCheckupFitWindow(report, history, recentIds) {
  const account = normalizeAccount(String(report.sourceLabel || '').split(':')[0], report.playerName);
  const key = fitEvidenceKey(report);
  if (!key || !checkupReportMatchesAccount(report, account)) return { games: [] };
  const observedAt = report.rolling?.observedAt ?? report.createdAt;
  const seen = new Map();
  for (const entry of [report, ...history]) {
    if (entry.profileId !== report.profileId || !checkupReportMatchesAccount(entry, account) ||
        fitEvidenceKey(entry) !== key || entry.createdAt > observedAt) continue;
    const previous = entry.fitWindow?.observedAt > observedAt ? [] : entry.fitWindow?.games || [];
    for (const game of [...(entry.games || []), ...(entry.rolling?.games || []), ...previous]) {
      if (game.platform !== account.platform || !game.gameId || !game.fitSamples?.length || seen.has(game.gameId)) continue;
      const { gameId, platform, white, black, date, playedAt, orientation, playedRating, timeClass, pgn, fitSamples } = game;
      seen.set(gameId, { gameId, platform, white, black, date, playedAt, orientation, playedRating, timeClass, pgn, fitSamples });
    }
  }
  const order = new Map(recentIds.map((id, i) => [id, i]));
  const recent = game => order.get(game.gameId) ?? order.size;
  const games = [...seen.values()].sort((a, b) => recent(a) - recent(b) || checkupPlayedAt(b) - checkupPlayedAt(a));
  return { observedAt, games: games.slice(0, FIT_WINDOW_SIZE) };
}

export function checkupFitForSpeed(games, method, preferred) {
  const groups = new Map();
  for (const game of games) {
    const speed = game.timeClass || '';
    if (!groups.has(speed)) groups.set(speed, []);
    groups.get(speed).push(game);
  }
  const speeds = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length);
  const speed = groups.has(preferred) ? preferred : speeds[0];
  const selected = groups.get(speed) || [];
  return { ...summarizeCheckupFit(selected, method, { rolling: true }), games: selected, fitMethod: method, speed, speeds };
}

export function checkupTrend(reports, evidenceKey, timeClass) {
  const seen = new Set();
  return reports.filter(report => report.evidenceKey === evidenceKey && report.rolling?.games?.length)
    .flatMap(report => {
      const games = report.rolling.games.filter(game => !timeClass || game.timeClass === timeClass);
      const key = games.map(game => game.gameId).join('|');
      if (!games.length || seen.has(key)) return [];
      seen.add(key);
      const result = summarizeCheckupGames(games, report.fitMethod);
      const hits = Object.values(result.phaseTraps).reduce((sum, count) => sum + count, 0);
      const elo = result.fit?.logLead >= CHECKUP_CLOSE_LOG_GAP ? result.closestElo : null;
      return [{ time: report.rolling.observedAt, elo, count: games.length,
        density: result.screenedMoves ? hits * 100 / result.screenedMoves : null }];
    }).reverse();
}

const outcomes = ['win', 'draw', 'loss'];
const results = { '1-0': { w: 'win', b: 'loss' }, '0-1': { w: 'loss', b: 'win' }, '1/2-1/2': { w: 'draw', b: 'draw' } };
const emptyRecord = () => ({ count: 0, win: 0, draw: 0, loss: 0, points: 0 });
const emptyPressure = () => ({ observed: 0, low: 0, reviewedLow: 0, errors: 0, timeoutLosses: 0 });

function addResult(record, outcome) {
  record.count++;
  record[outcome]++;
  record.points += outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
}

function terminationGroup(reason) {
  if (/outoftime|time.?out|timevsinsufficient|time forfeit|flag/i.test(reason)) return 'timeout';
  if (/mate/i.test(reason) && !/stalemate/i.test(reason)) return 'mate';
  if (/resign/i.test(reason)) return 'resign';
  return 'other';
}

export function checkupClockSample(moves, side, clocks, initial) {
  const startsBlack = moves.startFen?.split(' ')[1] === 'b';
  const decisions = moves.flatMap(move => {
    const turn = startsBlack ? (move.turn === 'w' ? 'b' : 'w') : move.turn;
    if (turn !== side) return [];
    const rawClock = clocks?.[move.ply - 1];
    const clock = move.clockSeconds ?? (Number.isFinite(rawClock) ? rawClock / 100 : null);
    return [{ ply: move.ply, clock }];
  });
  const low = [];
  let observed = 0;
  if (!decisions.some(move => Number.isFinite(move.clock))) return { observed, low };
  let remaining = initial;
  for (const move of decisions) {
    if (Number.isFinite(remaining)) {
      observed++;
      if (remaining < 30) low.push(move.ply);
    }
    remaining = move.clock;
  }
  return { observed, low };
}

function clockPressure(game, side, review, timeoutLoss) {
  const pressure = emptyPressure();
  pressure.timeoutLosses = Number(timeoutLoss);
  const moves = GameAnalyzer.parsePgn(game.pgn, { clocks: true });
  const { observed, low } = checkupClockSample(moves, side, game.clocks, game.meta.initialSeconds);
  pressure.observed = observed;
  pressure.low = low.length;
  for (const ply of low) {
    const error = review?.errors?.[ply];
    if (typeof error !== 'boolean') continue;
    pressure.reviewedLow++;
    if (error) pressure.errors++;
  }
  return pressure;
}

export function checkupReportStability(report, reviews = {}) {
  const hits = Object.values(report.phaseTraps || {}).reduce((sum, count) => sum + count, 0);
  const games = report.games || [];
  const coverage = report.screenedMoves ?? (games.length && games.every(game => Number.isFinite(game.screenedMoves))
    ? games.reduce((total, game) => total + game.screenedMoves, 0) : null);
  const screened = Number.isFinite(coverage) && coverage > 0 ? coverage : 0;
  let observed = 0, low = 0, reviewed = 0, errors = 0;
  for (const game of report.games || []) {
    if (!game.clockSample || !Array.isArray(game.clockSample.low)) continue;
    const side = game.orientation === 'white' ? 'w' : 'b';
    const review = reviews[`${game.platform}:${game.gameId}`]?.[side];
    observed += game.clockSample.observed || 0;
    low += game.clockSample.low.length;
    for (const ply of game.clockSample.low) {
      const error = review?.errors?.[ply];
      if (typeof error !== 'boolean') continue;
      reviewed++;
      if (error) errors++;
    }
  }
  return { hits, screened, density: screened ? hits * 100 / screened : null,
    missingCoverage: coverage == null || (!screened && games.length > 0 &&
      games.every(game => !Number.isFinite(game.screenedMoves))), observed, low, reviewed, errors };
}

export function prepareCheckupOverview(games, username, reviews = {}) {
  const target = normalizeAlias(username);
  return games.flatMap(game => {
    const { meta } = game;
    const side = normalizeAlias(meta.white) === target ? 'w' : normalizeAlias(meta.black) === target ? 'b' : null;
    const outcome = results[meta.result]?.[side];
    if (!outcomes.includes(outcome)) return [];
    const ending = terminationGroup(meta.termination || '');
    const pressure = clockPressure(game, side, reviews[game.gameId]?.[side], ending === 'timeout' && outcome === 'loss');
    return [{ ...game, side, outcome, ending, pressure }];
  });
}

export function summarizeCheckupOverview(games, timeClass = '') {
  const total = emptyRecord();
  const colors = { w: emptyRecord(), b: emptyRecord() };
  const endings = { mate: 0, resign: 0, timeout: 0, other: 0 };
  const openings = new Map();
  const pressure = emptyPressure();
  const timeoutGames = [];
  for (const game of games) {
    const { meta, side, outcome } = game;
    if (timeClass && timeClass !== meta.timeClass) continue;
    addResult(total, outcome);
    addResult(colors[side], outcome);
    endings[game.ending]++;
    if (meta.eco) {
      const key = side + ':' + meta.eco;
      const opening = openings.get(key) || { ...emptyRecord(), key, side, eco: meta.eco, name: '', games: [] };
      opening.name ||= meta.opening;
      addResult(opening, outcome);
      if (opening.games.length < 3) opening.games.push(game);
      openings.set(key, opening);
    }
    for (const metric of Object.keys(pressure)) pressure[metric] += game.pressure[metric];
    if (game.pressure.timeoutLosses) timeoutGames.push(game);
  }
  return { count: total.count, total, colors, endings, pressure, timeoutGames, openings: [...openings.values()] };
}

export function rankCheckupOpenings(openings, side) {
  const popular = openings.filter(opening => opening.side === side)
    .sort((a, b) => b.count - a.count || a.eco.localeCompare(b.eco));
  const byScore = popular.filter(opening => opening.count >= 3)
    .sort((a, b) => b.points / b.count - a.points / a.count || b.count - a.count);
  const best = byScore[0];
  const worst = byScore.at(-1);
  const showWorst = worst && worst.points / worst.count < best.points / best.count;
  const highlights = new Map();
  for (const [opening, label] of [[popular[0], 'checkupOpeningPopular'], [best, 'checkupOpeningBest'], [showWorst && worst, 'checkupOpeningWorst']]) {
    if (!opening) continue;
    const item = highlights.get(opening.key) || { ...opening, labels: [] };
    item.labels.push(label);
    highlights.set(opening.key, item);
  }
  return [...highlights.values()];
}
