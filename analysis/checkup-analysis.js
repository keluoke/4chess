import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { ChessBoard } from '../engine/chess-core.js?v=20261025-v115';
import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261123-checkup-opening-names';
import { readPgnTags } from '../engine/chess-notation.js?v=20261120-import';
import { expectedScore, isLessLikelyChoice, positiveIntuition } from '../engine/review-policy.js?v=20261117-review-policy';
import { buildTrapRecord, normalizeAlias } from './study-store.js?v=20261123-checkup-opening-names';
import { MAX_LOCAL_GAMES, checkupReplayUrl, checkupSourceType, parsePgnMeta } from './checkup-archives.js?v=20261123-checkup-opening-names';
import { CHECKUP_ELOS, FEATURED_TRAPS, planCheckupSamples, summarizeCheckupGames } from './checkup-insights.js?v=20261123-checkup-opening-names';

const VERIFY_ROOT_MIN_DEPTH = 14;
const VERIFY_AFTER_MIN_DEPTH = 13;
const LOG_PROB_FLOOR = 1e-4;

function isReliableVerificationRoot(res) {
  return !!(
    res?.bestMove?.uci &&
    Number.isFinite(res.scoreCp) &&
    (res.terminal || res.depth >= VERIFY_ROOT_MIN_DEPTH) &&
    !res.isBound &&
    res.pv?.[0] === res.bestMove.uci
  );
}

function isReliableVerificationReply(res) {
  return !!(
    res &&
    Number.isFinite(res.scoreCp) &&
    !res.isBound &&
    (res.terminal || res.depth >= VERIFY_AFTER_MIN_DEPTH)
  );
}

async function verifyCheckupHighlight(stockfish, move, fenBefore, maiaTop, probability, maiaProbability, cancelled) {
  const root = await stockfish.evaluate(fenBefore, 14, 6000, 2);
  if (cancelled() || !isReliableVerificationRoot(root) || root.bestMove.uci !== move.uci) return null;
  const board = new ChessBoard(fenBefore);
  const alternative = board.getLegalMoves().find(legal => legal.uci === maiaTop.uci);
  if (!alternative) return null;
  const alternativeSan = maiaTop.san || board.moveToSan(alternative);
  board.makeMove(alternative);
  const reply = await stockfish.evaluate(board.getFen(), 14, 6000, 1);
  if (cancelled() || !isReliableVerificationReply(reply)) return null;
  const advantage = (expectedScore(root.scoreCp) - expectedScore(-reply.scoreCp)) * 100;
  const kind = positiveIntuition({
    lossCp: 0, stableBest: true, probability, maiaProbability,
    maiaAdvantageCp: root.scoreCp + reply.scoreCp,
    maiaESL: advantage
  });
  if (!kind) return null;
  const { ply, moveNumber, turn, san, uci } = move;
  return {
    ply, moveNumber, turn, san, uci, fenBefore, kind: kind === 'beyond_intuition' ? 'beyond' : 'precise',
    evidence: { probability, maiaProbability, alternative: alternativeSan, advantage }
  };
}

async function initializeCheckupEngine(engine, signal) {
  if (!signal) return engine.initialize?.();
  if (signal.aborted) return;
  let abort;
  const cancelled = new Promise(resolve => { abort = () => resolve(); });
  signal.addEventListener('abort', abort, { once: true });
  try {
    return await Promise.race([engine.initialize?.(), cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

function* checkupDecisions(positions, userSide) {
  for (let mi = 0; mi < positions.length - 1; mi++) {
    const move = positions[mi + 1];
    if (move.turn !== userSide || move.ply <= 12) continue;
    const fenBefore = positions[mi].fen;
    if (new ChessBoard(fenBefore).getLegalMoves().length <= 1) continue;
    const historySlice = positions.slice(Math.max(0, mi - 7), mi).map(pos => pos.fen);
    yield { move, mi, fenBefore, historySlice };
  }
}

export function checkupEvidenceBase(stockfish, maia) {
  return `window-v1|${stockfish?.engineKey || 'stockfish'}|${maia?.modelKey || 'maia'}`;
}

function checkupReplay(pgn, positions, result) {
  const tags = readPgnTags(pgn);
  const fen = positions[0].fen === ChessBoard.INITIAL_FEN ? '' : positions[0].fen;
  const fields = {
    White: tags.white, Black: tags.black, WhiteElo: tags.whiteelo, BlackElo: tags.blackelo,
    Date: tags.date, Result: result, Termination: tags.termination,
    SetUp: fen ? '1' : '', FEN: fen
  };
  const header = Object.entries(fields).filter(([, value]) => value)
    .map(([key, value]) => `[${key} ${JSON.stringify(value)}]`).join('\n');
  const moves = positions.slice(1).map(({ san, turn, moveNumber }, index) =>
    (turn === 'w' ? `${moveNumber}. ` : index === 0 ? `${moveNumber}... ` : '') + san);
  return `${header}\n\n${moves.join(' ')} ${result}`;
}

function classifyCheckupTrap(trap, move, bestCp, playedCp) {
  const topics = [];
  if (trap.humanProb >= 0.40) topics.push('tempting');
  const reply = trap.playedPv[1];
  if (trap.playedSan.includes('x') && reply?.slice(2, 4) === move.to &&
    new ChessBoard(move.fen).getLegalMoves().some(candidate => candidate.uci === reply && candidate.captured)) {
    topics.push('recapture');
  }
  if (trap.phase === 'endgame' && bestCp >= 200 && playedCp < 100) topics.push('endgameAdvantage');
  return topics;
}

function playedProbability(prediction, uci) {
  const candidate = prediction?.moves?.find(move => move.uci === uci);
  return candidate ? (candidate.rawProb ?? (candidate.prob / 100)) : 0;
}

export async function runIntuitionCheckup({
  games = [],
  targetPlayer = '',
  profileId = 'default',
  sourceLabel = 'local-pgn-batch',
  elo,
  reusedScreen,
  defaultElo = 1900,
  stockfish,
  maiaEngine,
  onProgress = () => {},
  isCancelled = () => false,
  signal,
  now = Date.now()
} = {}) {
  const targetKey = normalizeAlias(targetPlayer);
  if (!targetKey) throw new Error('Target player name is required');
  if (!stockfish || !maiaEngine) throw new Error('Engines are required');
  const cancelled = () => signal?.aborted || isCancelled();
  const manual = Number.isFinite(elo) && elo > 0;
  if (!manual) elo = reusedScreen?.elo ?? defaultElo;
  let screenEloSource = manual ? 'manual' : reusedScreen ? 'rolling' : 'default';

  const emptyResult = (partial = true) => ({
    id: `checkup_${now}_${Math.random().toString(36).slice(2, 7)}`,
    profileId,
    sourceLabel,
    playerName: targetPlayer.trim(),
    gameCount: 0,
    analyzedGameIds: [],
    games: [],
    analyzedMoves: 0,
    fitGameCount: 0,
    eloSampleCount: 0,
    eloFit: Object.fromEntries(CHECKUP_ELOS.map(r => [r, 0])),
    closestElo: null,
    screenElo: elo,
    screenEloSource,
    phaseTraps: { opening: 0, middlegame: 0, endgame: 0 },
    traps: [],
    topTrapIds: [],
    topTraps: [],
    partial,
    createdAt: now
  });

  const batch = games.slice(0, MAX_LOCAL_GAMES)
    .map(entry => {
      const conclusion = FairPlayGuard.verifyConcludedGame(entry.pgn);
      if (!conclusion.ok) return null;
      const meta = { ...(entry.meta || parsePgnMeta(entry.pgn)), result: conclusion.result };
      const wKey = normalizeAlias(meta.white);
      const bKey = normalizeAlias(meta.black);
      const userSide = wKey === targetKey ? 'w' : bKey === targetKey ? 'b' : null;
      if (!userSide) return null;
      const parsedMoves = GameAnalyzer.parsePgn(entry.pgn || '');
      if (!parsedMoves?.length) return null;
      const positions = GameAnalyzer.buildPositionChain(parsedMoves);
      if (!positions || positions.length <= 1 || positions.isPartial) return null;
      const rating = userSide === 'w' ? parsedMoves.whiteElo : parsedMoves.blackElo;
      const decisions = [...checkupDecisions(positions, userSide)];
      return { entry, meta, userSide, positions, decisions, rating: /^\d{3,4}$/.test(rating) ? Number(rating) : 0 };
    })
    .filter(Boolean);
  if (!batch.length) return emptyResult(false);

  const ratings = batch.map(game => game.rating).filter(Boolean).sort((a, b) => a - b);
  if (!manual && !reusedScreen && ratings.length) {
    const midpoint = Math.floor(ratings.length / 2);
    const median = (ratings[midpoint] + ratings[Math.floor((ratings.length - 1) / 2)]) / 2;
    elo = CHECKUP_ELOS.reduce((best, rating) => Math.abs(rating - median) < Math.abs(best - median) ? rating : best);
    screenEloSource = 'pgn';
  }

  if (cancelled()) return emptyResult(true);
  const startupProgress = phase => onProgress({ phase, totalGames: batch.length, completedGames: 0 });
  startupProgress('stockfish');
  const stockfishReady = await initializeCheckupEngine(stockfish, signal);
  if (cancelled()) return emptyResult(true);
  if (stockfishReady === false) throw new Error(stockfish.lastError || 'Stockfish failed to start');
  startupProgress('maia');
  await initializeCheckupEngine(maiaEngine, signal);
  if (cancelled()) return emptyResult(true);

  const gameReports = [];
  const analyzedGameIds = new Set();
  let analyzedMoves = 0;
  let partial = false;
  let highlightAttempts = 0;
  let highlightCount = 0;

  const needsEarlyFit = !manual && !reusedScreen && !ratings.length;
  const fitPlan = planCheckupSamples(batch.map(game => game.decisions)).map(group => new Set(group));
  const prefit = new Map();
  const predict = (fen, rating, history) => maiaEngine.predict(fen, rating, null, cancelled, history);
  const fitScores = async ({ move, fenBefore, historySlice }, predictions) => {
    const values = [];
    for (const rating of CHECKUP_ELOS) {
      if (!predictions.has(rating)) predictions.set(rating, await predict(fenBefore, rating, historySlice));
      if (cancelled()) return null;
      const prediction = predictions.get(rating);
      if (!prediction?.moves?.length) return null;
      values.push(Math.log(Math.max(playedProbability(prediction, move.uci), LOG_PROB_FLOOR)));
    }
    return values;
  };
  const closestRating = sums =>
    CHECKUP_ELOS.reduce((best, rating) => sums[rating] > sums[best] ? rating : best);
  const addScores = (sums, values) => {
    CHECKUP_ELOS.forEach((rating, index) => { sums[rating] += values[index]; });
  };

  if (needsEarlyFit) {
    startupProgress('fitting');
    const sums = Object.fromEntries(CHECKUP_ELOS.map(rating => [rating, 0]));
    let valid = 0;
    for (const selection of fitPlan) {
      for (const decision of selection) {
        if (cancelled()) return emptyResult(true);
        const predictions = new Map();
        const scores = await fitScores(decision, predictions);
        prefit.set(decision, { predictions, scores });
        if (scores) {
          addScores(sums, scores);
          valid++;
        }
      }
    }
    if (cancelled()) return emptyResult(true);
    if (valid) {
      elo = closestRating(sums);
      screenEloSource = 'fit';
    }
  }

  for (let gi = 0; gi < batch.length; gi++) {
    if (cancelled()) { partial = true; break; }
    const { entry, meta, userSide, positions, decisions } = batch[gi];

    const reportProgress = (phase, decisions, checkedPlies = 0) => onProgress({
      phase, gameIndex: gi + 1, totalGames: batch.length, analyzedMoves: analyzedMoves + decisions,
      completedGames: gameReports.length, workDone: gi + checkedPlies / (positions.length - 1)
    });
    reportProgress('analyzing', 0);

    let gameMoves = 0;
    let screenedMoves = 0;
    const fitSamples = [];
    const gameTraps = [];
    const highlights = [];
    let gameCancelled = false;

    for (const decision of decisions) {
      if (cancelled()) { gameCancelled = true; break; }
      const { move, mi, fenBefore, historySlice } = decision;
      const { fen: fenAfter, turn, ply, moveNumber } = move;
      const predictions = prefit.get(decision)?.predictions;
      const maiaPred = predictions?.has(elo) ? predictions.get(elo) : await predict(fenBefore, elo, historySlice);
      if (cancelled()) { gameCancelled = true; break; }

      if (maiaPred?.moves?.length) screenedMoves++;
      const humanRawProb = playedProbability(maiaPred, move.uci);
      const maiaTop = maiaPred?.moves?.[0] || null;
      const maiaTopProbability = maiaTop ? playedProbability(maiaPred, maiaTop.uci) : 0;

      if (fitPlan[gi].has(decision)) {
        const scores = needsEarlyFit ? prefit.get(decision)?.scores
          : await fitScores(decision, new Map([[elo, maiaPred]]));
        if (cancelled()) { gameCancelled = true; break; }
        if (scores) fitSamples.push({ ply, scores });
      }

      // Positive examples reuse the trap screen's root and have a small verification budget.
      const sfBefore = humanRawProb >= 0.12 ? await stockfish.evaluate(fenBefore, 10, 4000, 2) : null;
      if (cancelled()) { gameCancelled = true; break; }
      if (highlightAttempts < 4 && highlightCount < 2 && sfBefore?.bestMove?.uci === move.uci &&
          maiaTop?.uci && maiaTop.uci !== move.uci && isLessLikelyChoice(humanRawProb, maiaTopProbability)) {
        highlightAttempts++;
        reportProgress('verifying', gameMoves, mi);
        const highlight = await verifyCheckupHighlight(stockfish, move, fenBefore, maiaTop, humanRawProb, maiaTopProbability, cancelled);
        if (cancelled()) { gameCancelled = true; break; }
        if (highlight) {
          highlights.push(highlight);
          highlightCount++;
        }
      }
      if (sfBefore?.bestMove && sfBefore.bestMove.uci !== move.uci) {
        const sfAfter = await stockfish.evaluate(fenAfter, 10, 4000, 1);
        if (cancelled()) { gameCancelled = true; break; }
        if (sfAfter && Number.isFinite(sfAfter.scoreCp)) {
          const playedScoreCp = -sfAfter.scoreCp;
          const screenEsl = Math.max(0, expectedScore(sfBefore.scoreCp) - expectedScore(playedScoreCp)) * 100;
          if (screenEsl >= 6) {
            reportProgress('verifying', gameMoves, mi);
            const verifyRoot = await stockfish.evaluate(fenBefore, 14, 6000, 2);
            if (cancelled()) { gameCancelled = true; break; }
            if (isReliableVerificationRoot(verifyRoot) && verifyRoot.bestMove.uci !== move.uci) {
              const verifyAfter = await stockfish.evaluate(fenAfter, 14, 6000, 1);
              if (cancelled()) { gameCancelled = true; break; }
              if (isReliableVerificationReply(verifyAfter)) {
                const verifiedPlayedCp = -verifyAfter.scoreCp;
                const verifiedEsl = Math.max(0, expectedScore(verifyRoot.scoreCp) - expectedScore(verifiedPlayedCp)) * 100;
                const verifiedLossCp = Math.max(0, verifyRoot.scoreCp - verifiedPlayedCp);
                if (verifiedEsl >= 7 && verifiedLossCp >= 70) {
                  const enrichedMove = {
                    ply,
                    moveNumber,
                    turn,
                    fenBefore,
                    uci: move.uci,
                    san: move.san,
                    divergenceType: 'intuition_trap',
                    divergenceStatus: 'confirmed',
                    verifiedBestUci: verifyRoot.bestMove.uci,
                    verifiedBestSan: verifyRoot.bestMove.san,
                    verifiedBestPv: verifyRoot.pv?.length ? verifyRoot.pv.slice(0, 3) : [verifyRoot.bestMove.uci],
                    verifiedPlayedPv: verifyAfter.pv?.length ? [move.uci, ...verifyAfter.pv.slice(0, 2)] : [move.uci],
                    verifiedExpectedScoreLoss: Math.round(verifiedEsl * 10) / 10,
                    verifiedLossCp,
                    humanRawProbability: humanRawProb,
                    maiaTopSan: maiaTop?.san || null
                  };
                  const prevMove = mi > 0 ? positions[mi] : null;
                  const triggerMove = prevMove?.from && prevMove?.to ? { from: prevMove.from, to: prevMove.to, san: prevMove.san || '' } : null;
                  const trap = buildTrapRecord(enrichedMove, { elo }, { profileId, source: meta, triggerMove, now });
                  if (trap) {
                    gameTraps.push({
                      ...trap, gameIndex: gi,
                      topics: classifyCheckupTrap(trap, move, verifyRoot.scoreCp, verifiedPlayedCp)
                    });
                  }
                }
              }
            }
          }
        }
      }
      reportProgress('analyzing', ++gameMoves, mi + 1);
    }

    if (gameCancelled || cancelled()) {
      partial = true;
      break;
    }

    const platform = checkupSourceType(sourceLabel);
    gameReports.push({
      gameId: entry.gameId || null, platform, url: checkupReplayUrl(platform, entry.gameId),
      white: meta.white, black: meta.black, result: meta.result, date: meta.date,
      orientation: userSide === 'w' ? 'white' : 'black',
      analyzedMoves: gameMoves, screenedMoves, trapCount: gameTraps.length, timeClass: meta.timeClass || '',
      eloSampleCount: fitSamples.length, fitSamples, trapEvidence: gameTraps, highlights,
      pgn: checkupReplay(entry.pgn, positions, meta.result)
    });
    reportProgress('analyzing', gameMoves, positions.length - 1);
    if (entry.gameId) analyzedGameIds.add(entry.gameId);
    analyzedMoves += gameMoves;
  }

  const summary = summarizeCheckupGames(gameReports);
  const topTraps = summary.traps.slice(0, FEATURED_TRAPS);
  return {
    id: `checkup_${now}_${Math.random().toString(36).slice(2, 7)}`,
    profileId,
    sourceLabel,
    playerName: targetPlayer.trim(),
    ...summary,
    analyzedGameIds: [...analyzedGameIds],
    evidenceKey: `${checkupEvidenceBase(stockfish, maiaEngine)}|${elo}`,
    screenElo: elo,
    screenEloSource,
    topTrapIds: topTraps.map(item => item.id),
    topTraps,
    partial,
    createdAt: now
  };
}
