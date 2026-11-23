import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261123-checkup-fit';
import { normalizeAlias } from './study-store.js?v=20261123-checkup-fit';
import { CHECKUP_CLOSE_LOG_GAP, summarizeCheckupFit } from './checkup-fit.js?v=20261123-checkup-fit';
export { CHECKUP_ELOS, MAX_ELO_SAMPLES, planCheckupSamples } from './checkup-fit.js?v=20261123-checkup-fit';
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

export function buildCheckupWindow(ids, evidenceKey, reports, observedAt = Date.now()) {
  const windowIds = [...new Set(ids.filter(Boolean))].slice(0, WINDOW_SIZE);
  const evidence = new Map();
  const compatible = reports.filter(report => report.evidenceKey === evidenceKey);
  for (const report of compatible) {
    for (const game of [...(report.games || []), ...(report.rolling?.games || [])]) {
      if (game.gameId && !evidence.has(game.gameId)) evidence.set(game.gameId, game);
    }
  }
  const games = windowIds.map(id => evidence.get(id)).filter(Boolean);
  return { ...summarizeCheckupGames(games, compatible[0]?.fitMethod), windowIds, observedAt };
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

function clockPressure(game, side, review, timeoutLoss) {
  const pressure = emptyPressure();
  pressure.timeoutLosses = Number(timeoutLoss);
  const moves = GameAnalyzer.parsePgn(game.pgn, { clocks: true });
  const startsBlack = moves.startFen?.split(' ')[1] === 'b';
  const decisions = moves.flatMap(move => {
    const turn = startsBlack ? (move.turn === 'w' ? 'b' : 'w') : move.turn;
    if (turn !== side) return [];
    const rawClock = game.clocks?.[move.ply - 1];
    const clock = move.clockSeconds ?? (Number.isFinite(rawClock) ? rawClock / 100 : null);
    return [{ ply: move.ply, clock }];
  });
  if (!decisions.some(move => Number.isFinite(move.clock))) return pressure;
  let remaining = game.meta.initialSeconds;
  for (const move of decisions) {
    if (Number.isFinite(remaining)) {
      pressure.observed++;
      if (remaining < 30) {
        pressure.low++;
        const error = review?.errors?.[move.ply];
        if (typeof error === 'boolean') {
          pressure.reviewedLow++;
          if (error) pressure.errors++;
        }
      }
    }
    remaining = move.clock;
  }
  return pressure;
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
