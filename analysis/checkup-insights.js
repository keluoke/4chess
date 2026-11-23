import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261123-checkup-window';
import { normalizeAlias } from './study-store.js?v=20261123-checkup-window';

export const CHECKUP_ELOS = [1100, 1500, 1900, 2200];
export const MAX_ELO_SAMPLES = 24;
export const FEATURED_TRAPS = 5;
export const OVERVIEW_GAME_LIMIT = 100;
const WINDOW_SIZE = 10;

export function planCheckupSamples(groups) {
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
  return groups.map((group, index) => {
    const count = quotas[index];
    return Array.from({ length: count }, (_, i) => group[Math.floor((i + 0.5) * group.length / count)]);
  });
}

export function summarizeCheckupGames(games) {
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
  const fitted = planCheckupSamples(games.map(game => game.fitSamples || []));
  const samples = fitted.flat();
  const sums = CHECKUP_ELOS.map((_, i) => samples.reduce((sum, sample) => sum + sample.scores[i], 0));
  const best = sums.reduce((index, score, i) => score > sums[index] ? i : index, 0);
  const traps = [...dedup.values()].sort((a, b) => b.eslLoss - a.eslLoss);
  const highlights = games.flatMap((game, gameIndex) => (game.highlights || [])
    .map(move => ({ ...move, gameIndex }))).slice(0, 2);
  return {
    games, gameCount: games.length, analyzedMoves, screenedMoves, phaseTraps, traps, highlights,
    eloSampleCount: samples.length, fitGameCount: fitted.filter(group => group.length).length,
    closestElo: samples.length ? CHECKUP_ELOS[best] : null,
    eloFit: Object.fromEntries(CHECKUP_ELOS.map((elo, i) => [
      elo, samples.length ? Math.round(Math.exp(sums[i] / samples.length) * 1000) / 1000 : 0
    ]))
  };
}

export function buildCheckupWindow(ids, evidenceKey, reports, observedAt = Date.now()) {
  const windowIds = [...new Set(ids.filter(Boolean))].slice(0, WINDOW_SIZE);
  const evidence = new Map();
  for (const report of reports) {
    if (report.evidenceKey !== evidenceKey) continue;
    for (const game of [...(report.games || []), ...(report.rolling?.games || [])]) {
      if (game.gameId && !evidence.has(game.gameId)) evidence.set(game.gameId, game);
    }
  }
  const games = windowIds.map(id => evidence.get(id)).filter(Boolean);
  return { ...summarizeCheckupGames(games), windowIds, observedAt };
}

export function checkupTrend(reports, evidenceKey, timeClass) {
  const seen = new Set();
  return reports.filter(report => report.evidenceKey === evidenceKey && report.rolling?.games?.length)
    .flatMap(report => {
      const games = report.rolling.games.filter(game => !timeClass || game.timeClass === timeClass);
      const key = games.map(game => game.gameId).join('|');
      if (!games.length || seen.has(key)) return [];
      seen.add(key);
      const result = summarizeCheckupGames(games);
      const hits = Object.values(result.phaseTraps).reduce((sum, count) => sum + count, 0);
      return [{ time: report.rolling.observedAt, elo: result.closestElo, count: games.length,
        density: result.screenedMoves ? hits * 100 / result.screenedMoves : null }];
    }).reverse();
}

function winFor(result, side) {
  return result === '1/2-1/2' ? 0.5 : Number(result === (side === 'w' ? '1-0' : '0-1'));
}

function terminationGroup(reason) {
  if (/outoftime|time.?out|timevsinsufficient|time forfeit|flag/i.test(reason)) return 'timeout';
  if (/mate/i.test(reason) && !/stalemate/i.test(reason)) return 'mate';
  if (/resign/i.test(reason)) return 'resign';
  return 'other';
}

export function summarizeCheckupOverview(games, username, reviews = {}, timeClass = '') {
  const target = normalizeAlias(username);
  const colors = { w: { count: 0, wins: 0 }, b: { count: 0, wins: 0 } };
  const endings = { mate: 0, resign: 0, timeout: 0, other: 0 };
  const openings = new Map();
  const pressure = { observed: 0, low: 0, reviewedLow: 0, errors: 0, timeoutLosses: 0 };
  let count = 0;
  for (const game of games) {
    const { meta } = game;
    if (timeClass && timeClass !== meta.timeClass) continue;
    const side = normalizeAlias(meta.white) === target ? 'w' : normalizeAlias(meta.black) === target ? 'b' : null;
    if (!side) continue;
    const score = winFor(meta.result, side);
    count++;
    colors[side].count++;
    if (score === 1) colors[side].wins++;
    const ending = terminationGroup(meta.termination || '');
    endings[ending]++;
    if (ending === 'timeout' && score === 0) pressure.timeoutLosses++;
    if (meta.eco) {
      const key = JSON.stringify([side, meta.timeClass || '', meta.eco]);
      const opening = openings.get(key) || { side, timeClass: meta.timeClass, eco: meta.eco, name: meta.opening, count: 0, points: 0 };
      opening.count++;
      opening.points += score;
      openings.set(key, opening);
    }

    const moves = GameAnalyzer.parsePgn(game.pgn, { clocks: true });
    const review = reviews[game.gameId]?.[side];
    const startsBlack = moves.startFen?.split(' ')[1] === 'b';
    const decisions = moves.flatMap(move => {
      const turn = startsBlack ? (move.turn === 'w' ? 'b' : 'w') : move.turn;
      const rawClock = game.clocks?.[move.ply - 1];
      const clock = move.clockSeconds ?? (Number.isFinite(rawClock) ? rawClock / 100 : null);
      return turn === side ? [{ ply: move.ply, clock }] : [];
    });
    if (!decisions.some(move => Number.isFinite(move.clock))) continue;
    let remaining = meta.initialSeconds;
    for (const move of decisions) {
      if (Number.isFinite(remaining)) {
        pressure.observed++;
        if (remaining < 30) {
          pressure.low++;
          const error = review?.errors?.[move.ply];
          if (error !== undefined) {
            pressure.reviewedLow++;
            if (error) pressure.errors++;
          }
        }
      }
      remaining = move.clock;
    }
  }
  return { count, colors, endings, pressure, openings: [...openings.values()] };
}
