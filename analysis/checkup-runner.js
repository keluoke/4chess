import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { ChessBoard } from '../engine/chess-core.js?v=20261025-v115';
import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261123-checkup-window';
import { readPgnTags } from '../engine/chess-notation.js?v=20261120-import';
import { expectedScore, isLessLikelyChoice, positiveIntuition } from '../engine/review-policy.js?v=20261117-review-policy';
import { accountKey, buildTrapRecord, checkupReportMatchesAccount, normalizeAccount, normalizeAlias, perspectiveNames, trapId } from './study-store.js?v=20261123-checkup-window';
import { t } from './i18n.js?v=20261123-checkup-window';
import {
  CHECKUP_ELOS, FEATURED_TRAPS, OVERVIEW_GAME_LIMIT, buildCheckupWindow, checkupTrend,
  planCheckupSamples, summarizeCheckupGames, summarizeCheckupOverview
} from './checkup-insights.js?v=20261123-checkup-window';
export { CHECKUP_ELOS } from './checkup-insights.js?v=20261123-checkup-window';
import { CHECKUP_GAME_LIMIT, LICHESS_CHECKUP_SPEEDS, checkupGameId, chesscomCheckupArchives } from '../engine/checkup-watch.js?v=20261123-checkup-window';

const MAX_LOCAL_GAMES = 15;
const TRAP_TOPICS = ['tempting', 'recapture', 'endgameAdvantage'];
const VERIFY_ROOT_MIN_DEPTH = 14;
const VERIFY_AFTER_MIN_DEPTH = 13;
const LOG_PROB_FLOOR = 1e-4;

export function parsePgnMeta(pgnText = '') {
  const read = tag => pgnText.match(new RegExp(`^\\[${tag}\\s+"([^"]*)"\\]`, 'im'))?.[1]?.trim() || '';
  const site = read('Site');
  return {
    white: read('White'),
    black: read('Black'),
    result: read('Result') || '*',
    date: read('Date'),
    url: site.startsWith('http') ? site : '',
    site
  };
}

export function checkupGameContext(pgn, { source, publicGameUrl, orientation, white, black } = {}) {
  if (!pgn || !FairPlayGuard.verifyConcludedGame(pgn).ok) return null;
  const meta = parsePgnMeta(pgn);
  const link = pgn.match(/^\[Link\s+"([^"]*)"\]/im)?.[1];
  const urls = [publicGameUrl, meta.url, link].flatMap(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? [url] : [];
    } catch {
      return [];
    }
  });
  const site = urls.find(url => ['www.chess.com', 'chess.com', 'lichess.org'].includes(url.hostname))?.hostname || meta.site.toLowerCase();
  const platform = ['chesscom', 'lichess'].includes(source) ? source
    : /(^|\.)chess\.com$/.test(site) ? 'chesscom'
    : /(^|\.)lichess\.org$|^lichess$/.test(site) ? 'lichess' : null;
  if (!platform) return null;
  const cleanName = name => {
    const value = String(name || '').trim();
    return /^[a-z0-9][a-z0-9_-]*$/i.test(value) && !/^(?:white|black|anonymous|guest)$/i.test(value) ? value : '';
  };
  return {
    platform,
    orientation,
    gameId: urls.map(url => platform === 'lichess'
      ? url.hostname === 'lichess.org' && checkupGameId(platform, url.pathname.match(/^\/([a-z0-9]{8})(?:\/(?:white|black))?\/?$/i)?.[1])
      : checkupGameId(platform, url.href)).find(Boolean) || null,
    gameRef: GameAnalyzer.hashString(pgn),
    white: cleanName(meta.white) || cleanName(white),
    black: cleanName(meta.black) || cleanName(black)
  };
}

export function suggestCheckupPlayer(game, profile) {
  if (!game) return '';
  const aliases = new Set(perspectiveNames(profile, game.platform).map(normalizeAlias));
  const matches = [game.white, game.black].filter(name => name && aliases.has(normalizeAlias(name)));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return '';
  return ['white', 'black'].includes(game.orientation) ? game[game.orientation] : '';
}

export function splitMultiPgn(text = '') {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const chunks = normalized.split(/(?=^\[Event\s+")/m).map(s => s.trim()).filter(Boolean);
  return chunks.length ? chunks : [normalized];
}

export function detectBatchPlayer(games = [], profile = null) {
  const counts = new Map();
  const display = new Map();
  const add = (name) => {
    const key = normalizeAlias(name);
    if (!key || key === 'white' || key === 'black' || key === '?') return;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!display.has(key)) display.set(key, name.trim());
  };
  for (const game of games) {
    const meta = game.meta || parsePgnMeta(game.pgn || '');
    add(meta.white);
    add(meta.black);
  }
  const candidates = [...counts.entries()]
    .map(([key, count]) => ({ key, name: display.get(key), count }))
    .sort((a, b) => b.count - a.count);

  const profileNames = [...(profile?.aliases || []), ...(profile?.accounts || []).map(account => account.username)];
  const aliasKeys = new Set(profileNames.map(normalizeAlias).filter(Boolean));
  const aliasMatch = candidates.find(item => aliasKeys.has(item.key));
  return {
    suggestedName: aliasMatch?.name || candidates[0]?.name || '',
    matchedAlias: aliasMatch?.name || null,
    candidates
  };
}

function archivedCheckupGame(platform, item, pgn, result) {
  const tags = readPgnTags(pgn);
  const meta = parsePgnMeta(pgn);
  const loser = result === '1-0' ? item.black : result === '0-1' ? item.white : null;
  const initial = tags.timecontrol?.match(/^(\d+)(?:[+|]\d+)?$/)?.[1];
  const openingPath = tags.ecourl?.match(/^https:\/\/(?:www\.)?chess\.com\/openings\/([A-Za-z0-9-]+)\/?$/i)?.[1];
  return {
    pgn,
    gameId: checkupGameId(platform, platform === 'lichess' ? item.id : item.url),
    clocks: Array.isArray(item.clocks) ? item.clocks : null,
    meta: {
      ...meta, result, timeClass: item.speed || item.time_class || '',
      eco: item.opening?.eco || tags.eco || '',
      opening: item.opening?.name || tags.opening || openingPath?.replaceAll('-', ' ') || '',
      termination: item.status?.name || item.status || loser?.result || tags.termination || '',
      initialSeconds: item.clock?.initial ?? (initial !== undefined ? Number(initial) : null)
    }
  };
}

function lichessCheckupGames(text, max) {
  const games = [];
  for (const line of text.split('\n')) {
    let item;
    try { item = JSON.parse(line); } catch { continue; }
    if (!item?.pgn || (item.variant && item.variant !== 'standard')) continue;
    const verdict = FairPlayGuard.verifyConcludedGame(item);
    if (!verdict.ok) continue;
    games.push(archivedCheckupGame('lichess', item, item.pgn, verdict.result));
    if (games.length >= max) break;
  }
  return games;
}

export async function fetchLichessRecentGames(username, { max = CHECKUP_GAME_LIMIT, clocks = false, signal, fetchImpl = fetch } = {}) {
  const clean = String(username || '').trim();
  if (!clean) throw new Error('Username is required');
  const query = new URLSearchParams({ max: String(max), pgnInJson: 'true', clocks: String(clocks),
    opening: String(clocks), evals: 'false', finished: 'true', ongoing: 'false', perfType: LICHESS_CHECKUP_SPEEDS });
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(clean)}?${query}`;
  const useBrowserProxy = fetchImpl === fetch && typeof location !== 'undefined' && location.protocol.startsWith('http');
  if (useBrowserProxy) {
    const proxyUrl = `/api/lichess?username=${encodeURIComponent(clean)}&max=${max}${clocks ? '&clocks=true' : ''}`;
    try {
      const resp = await fetchImpl(proxyUrl, { signal, cache: 'no-store' });
      const contentType = resp.headers?.get?.('content-type') || '';
      if (resp.ok) return lichessCheckupGames(await resp.text(), max);
      if ((contentType.includes('ndjson') || contentType.includes('json')) && resp.status === 404) throw new Error('Lichess HTTP 404');
    } catch (err) {
      if (err?.name === 'AbortError' || String(err?.message).includes('Lichess HTTP 404')) throw err;
    }
  }
  const resp = await fetchImpl(url, { headers: { Accept: 'application/x-ndjson' }, signal });
  if (!resp.ok) throw new Error(`Lichess HTTP ${resp.status}`);
  return lichessCheckupGames(await resp.text(), max);
}

export async function fetchChesscomRecentGames(username, { max = CHECKUP_GAME_LIMIT, signal, fetchImpl = fetch } = {}) {
  const clean = String(username || '').trim().toLowerCase();
  if (!clean) throw new Error('Username is required');
  const archives = await chesscomCheckupArchives(clean, { signal, fetchImpl, limit: max > CHECKUP_GAME_LIMIT ? 12 : 6 });
  const games = [];
  const seen = new Set();
  for (const { url } of archives) {
    const resp = await fetchImpl(url, { signal });
    if (!resp.ok) continue;
    const data = await resp.json();
    const list = Array.isArray(data?.games) ? data.games.slice().reverse() : [];
    for (const item of list) {
      if (item.rules && item.rules !== 'chess') continue;
      if (!item.pgn) continue;
      const verdict = FairPlayGuard.verifyConcludedGame({ pgn: item.pgn, isFinished: true, status: 'finished' });
      if (!verdict.ok) continue;
      const game = archivedCheckupGame('chesscom', item, item.pgn, verdict.result);
      if (game.gameId && seen.has(game.gameId)) continue;
      if (game.gameId) seen.add(game.gameId);
      games.push(game);
      if (games.length >= max) return games;
    }
  }
  return games;
}

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
  board.makeMove(alternative);
  const reply = await stockfish.evaluate(board.getFen(), 14, 6000, 1);
  if (cancelled() || !isReliableVerificationReply(reply)) return null;
  const kind = positiveIntuition({
    lossCp: 0, stableBest: true, probability, maiaProbability,
    maiaAdvantageCp: root.scoreCp + reply.scoreCp,
    maiaESL: (expectedScore(root.scoreCp) - expectedScore(-reply.scoreCp)) * 100
  });
  if (!kind) return null;
  const { ply, moveNumber, turn, san, uci } = move;
  return { ply, moveNumber, turn, san, uci, fenBefore, kind: kind === 'beyond_intuition' ? 'beyond' : 'precise' };
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

function checkupEvidenceBase(stockfish, maia) {
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

function checkupReplayUrl(platform, id) {
  if (platform === 'lichess' && checkupGameId(platform, id)) return `https://lichess.org/${id}`;
  const match = platform === 'chesscom' && typeof id === 'string' && id.match(/^(live|daily):(\d{1,16})$/);
  return match ? `https://www.chess.com/game/${match[1]}/${match[2]}` : null;
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

function checkupTrapTopics(trap) {
  return Array.isArray(trap.topics) ? trap.topics : trap.humanProb >= 0.40 ? ['tempting'] : [];
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

export function checkupSourceType(sourceLabel = '') {
  if (sourceLabel === 'local-pgn-batch') return 'local';
  const prefix = String(sourceLabel || '').split(':')[0];
  return ['lichess', 'chesscom'].includes(prefix) ? prefix : 'local';
}

export function selectCheckupHistory(history = [], { source = 'lichess', gameContext = null, suggestedPlayer = '' } = {}) {
  const list = Array.isArray(history) ? history : [];
  const scoped = list.filter(item => checkupSourceType(item?.sourceLabel) === source);
  if (source !== 'local' && (gameContext || suggestedPlayer)) {
    const targetKey = normalizeAlias(suggestedPlayer);
    const matched = targetKey
      ? scoped.filter(item => normalizeAlias(item?.playerName) === targetKey)
      : [];
    return {
      primary: matched[0] || null,
      scopedHistory: matched,
      fallbackReport: matched.length ? null : (list[0] || null)
    };
  }
  return {
    primary: scoped[0] || null,
    scopedHistory: scoped,
    fallbackReport: scoped.length ? null : (list[0] || null)
  };
}

export function formatRelativeTime(createdAt) {
  if (!Number.isFinite(createdAt)) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  if (diffMin < 1) return t('checkupJustNow');
  if (diffMin < 60) return t('checkupMinutesAgo', { n: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('checkupHoursAgo', { n: diffHr });
  return t('checkupDaysAgo', { n: Math.floor(diffHr / 24) });
}

function formatSourceBadge(sourceLabel = '') {
  const type = checkupSourceType(sourceLabel);
  if (type === 'lichess') return 'Lichess';
  if (type === 'chesscom') return 'Chess.com';
  return t('checkupSourceLocal');
}

export class IntuitionCheckup {
  source = 'lichess';
  openGeneration = 0;
  fileReadGeneration = 0;
  running = false;
  fetching = false;
  updatingProfile = false;
  pendingBatch = null;
  latestReport = null;
  history = [];
  scopedHistory = [];
  fallbackReport = null;
  view = 'settings';
  reportScope = 'rolling';
  overviewCache = new Map();

  constructor(app) {
    this.app = app;
    this.supported = typeof location === 'undefined' || location.protocol !== 'chrome-extension:';
    this.button = document.getElementById('btn-intuition-checkup');
    this.dialog = document.getElementById('checkup-dialog');
    this.closeBtn = document.getElementById('btn-close-checkup');
    this.profileSelect = document.getElementById('checkup-profile-select');
    this.profileName = document.getElementById('checkup-profile-name');
    this.newProfileBtn = document.getElementById('btn-checkup-new-profile');
    this.screenEloSelect = document.getElementById('checkup-screen-elo');
    for (const rating of CHECKUP_ELOS) this.screenEloSelect?.add(new Option(`Maia ${rating}`, String(rating)));
    this.accountList = document.getElementById('checkup-accounts');
    this.btnSaveAccount = document.getElementById('btn-checkup-save-account');
    this.sourceTabs = [...document.querySelectorAll('#checkup-dialog [data-checkup-source]')];
    this.usernameRow = document.getElementById('checkup-username-row');
    this.usernameInput = document.getElementById('checkup-username');
    this.playerChoices = document.getElementById('checkup-player-choices');
    this.localRow = document.getElementById('checkup-local-row');
    this.localFilesInput = document.getElementById('checkup-pgn-files');
    this.btnSelectFiles = document.getElementById('btn-checkup-files');
    this.localPgnInput = document.getElementById('checkup-pgn-text');
    this.btnFetch = document.getElementById('btn-checkup-fetch');
    this.confirmBox = document.getElementById('checkup-confirm-box');
    this.confirmPrompt = document.getElementById('checkup-confirm-prompt');
    this.confirmNameInput = document.getElementById('checkup-confirm-name');
    this.btnStart = document.getElementById('btn-checkup-start');
    this.progressBox = document.getElementById('checkup-progress-box');
    this.progressText = document.getElementById('checkup-progress-text');
    this.progressBar = document.getElementById('checkup-progress-bar');
    this.btnCancelRun = document.getElementById('btn-checkup-cancel');
    this.eta = document.getElementById('checkup-eta');
    this.progressDetails = document.getElementById('checkup-progress-details');
    this.stopDialog = document.getElementById('checkup-stop-dialog');
    this.stopMessage = document.getElementById('checkup-stop-message');
    this.historyHintEl = document.getElementById('checkup-history-hint');
    this.reportBox = document.getElementById('checkup-report-box');
    this.statusEl = document.getElementById('checkup-status');
    this.viewTabs = [...document.querySelectorAll('[data-checkup-view]')];
    this.reportTools = document.getElementById('checkup-report-tools');
    this.reportEmpty = document.getElementById('checkup-report-empty');
    this.replayBanner = document.getElementById('checkup-replay-banner');
    this.overviewAccount = document.getElementById('checkup-overview-account');
    this.overviewButton = document.getElementById('btn-checkup-overview');
    this.overviewStatus = document.getElementById('checkup-overview-status');
    this.overviewBody = document.getElementById('checkup-overview-body');

    if (!this.supported) {
      if (this.button) this.button.hidden = true;
      return;
    }
    this.bindEvents();
    this.syncVisibility();
  }

  allowed() {
    return this.supported && !this.app.scanSourceLocked && !FairPlayGuard.isLiveGameInProgress();
  }

  get ownsEngines() {
    return this.running;
  }

  get busy() {
    return this.running || this.fetching || this.updatingProfile;
  }

  syncVisibility() {
    if (this.button) this.button.hidden = !this.allowed();
    this.app.checkupReminders?.render();
    this.syncReplayBanner();
  }

  syncReplayBanner() {
    const back = this.replayReturn;
    if (this.replayBanner) this.replayBanner.hidden = !back || !this.allowed() ||
      this.app.gameEpoch !== back.epoch || this.app.mistakeBank?.activeProfile?.id !== back.profileId;
  }

  setView(view, focus = false) {
    this.view = view;
    for (const tab of this.viewTabs) {
      const selected = tab.dataset.checkupView === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    }
    if (this.dialog) this.dialog.scrollTop = 0;
    if (view === 'overview') {
      this.refreshOverviewAccounts();
      this.renderOverview();
    }
    if (focus && view === 'report' && this.latestReport) this.reportBox?.focus({ preventScroll: true });
  }

  bindEvents() {
    if (this.button) {
      this.button.hidden = !this.allowed();
      this.button.onclick = () => this.open();
    }
    for (const [index, tab] of this.viewTabs.entries()) {
      tab.onclick = () => this.setView(tab.dataset.checkupView);
      tab.onkeydown = event => {
        const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
        if (!delta) return;
        event.preventDefault();
        const target = this.viewTabs[(index + delta + this.viewTabs.length) % this.viewTabs.length];
        this.setView(target.dataset.checkupView);
        target.focus();
      };
    }
    const replayBack = document.getElementById('btn-checkup-replay-back');
    if (replayBack) replayBack.onclick = () => this.open();
    if (this.overviewButton) this.overviewButton.onclick = () => this.loadOverview();
    if (this.overviewAccount) this.overviewAccount.onchange = () => this.renderOverview();
    if (this.closeBtn) this.closeBtn.onclick = () => this.requestStop({ close: true });
    if (this.profileSelect) this.profileSelect.onchange = () => this.switchProfile(this.profileSelect.value);
    if (this.newProfileBtn) this.newProfileBtn.onclick = () => this.changeProfile(() => this.app.studyProfiles.createProfile());
    document.getElementById('btn-checkup-continue')?.addEventListener('click', () => this.stopDialog.close());
    document.getElementById('btn-checkup-stop-confirm')?.addEventListener('click', () => {
      const close = this.closeAfterConfirmation;
      this.stopDialog.close();
      this.closeWhenStopped = close;
      this.cancelRun();
    });
    if (this.btnSaveAccount) {
      this.btnSaveAccount.onclick = () => this.updateAccount(this.source, this.usernameInput.value);
    }
    if (this.dialog) {
      this.dialog.addEventListener('click', event => {
        if (event.target === this.dialog) {
          const rect = this.dialog.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            if (!this.running) this.close();
          }
        }
      });
      this.dialog.addEventListener('cancel', event => {
        event.preventDefault();
        this.requestStop({ close: true });
      });
      this.dialog.addEventListener('close', () => {
        this.lastRunReportId = null;
        this.overviewController?.abort();
        this.overviewController = null;
        if (this.updatingProfile && this.app.studyProfiles?.editor.open) this.app.studyProfiles.editor.close();
        if (this.stopDialog?.open) this.stopDialog.close();
        this.openGeneration++;
        this.fileReadGeneration++;
        this.cancelRun();
        this.button?.focus({ preventScroll: true });
      });
      this.dialog.addEventListener('dragover', event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      });
      this.dialog.addEventListener('drop', async event => {
        event.preventDefault();
        event.stopPropagation();
        const files = [...(event.dataTransfer?.files || [])];
        if (files.length) {
          await this.readFilesForBatch(files, { autoPrepare: true });
          return;
        }
        const text = event.dataTransfer?.getData('text');
        if (text) await this.receiveDroppedPgn(text);
      });
    }
    for (const tab of this.sourceTabs) {
      tab.onclick = () => {
        const source = tab.dataset.checkupSource;
        if (this.busy || source === this.source) return;
        this.source = source;
        this.pendingBatch = null;
        if (this.usernameInput) {
          this.usernameInput.value = this.suggestUsername(this.app.mistakeBank?.activeProfile);
        }
        this.setStatus('');
        this.applyHistoryContext();
        this.renderSourceControls();
        this.renderReport(this.latestReport);
      };
    }
    if (this.usernameInput) {
      this.usernameInput.oninput = () => {
        this.setStatus('');
        this.applyHistoryContext();
        this.renderSourceControls();
        this.renderReport(this.latestReport);
      };
    }
    if (this.btnSelectFiles && this.localFilesInput) {
      this.btnSelectFiles.onclick = () => this.localFilesInput.click();
      this.localFilesInput.onchange = async event => {
        const files = [...(event.target.files || [])];
        this.localFilesInput.value = '';
        if (!files.length) return;
        await this.readFilesForBatch(files, { autoPrepare: false });
      };
    }
    if (this.btnFetch) this.btnFetch.onclick = () => this.prepareBatch();
    if (this.btnStart) this.btnStart.onclick = () => this.startRun();
    if (this.btnCancelRun) this.btnCancelRun.onclick = () => this.requestStop();
  }

  async readFilesForBatch(files, { autoPrepare = false } = {}) {
    if (this.busy || !this.allowed() || !files?.length) return;
    const generation = this.openGeneration;
    const readToken = ++this.fileReadGeneration;
    const profileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    const texts = await Promise.all([...files].slice(0, MAX_LOCAL_GAMES).map(file => file.text()));
    const currentProfileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    if (readToken !== this.fileReadGeneration || generation !== this.openGeneration || profileId !== currentProfileId || this.busy || !this.allowed()) {
      return;
    }
    this.source = 'local';
    this.pendingBatch = null;
    if (this.localPgnInput) this.localPgnInput.value = texts.join('\n\n').trim();
    this.setView('settings');
    this.renderSourceControls();
    if (autoPrepare) await this.prepareBatch();
  }

  async receiveDroppedPgn(text) {
    if (this.busy || !this.allowed()) return;
    this.fileReadGeneration++;
    this.source = 'local';
    this.pendingBatch = null;
    if (this.localPgnInput) this.localPgnInput.value = String(text || '').trim();
    this.setView('settings');
    this.renderSourceControls();
    await this.prepareBatch();
  }

  async open({ account } = {}) {
    if (!this.allowed() || !this.dialog || this.running || this.fetching) return;
    const generation = ++this.openGeneration;
    const epoch = this.app.gameEpoch;
    this.fileReadGeneration++;
    const bank = this.app.mistakeBank;
    await bank?.ready;
    if (!this.dialog.open) await bank?.refreshState();
    if (generation !== this.openGeneration || epoch !== this.app.gameEpoch || !this.allowed()) return;
    const profile = bank?.activeProfile;
    const profileId = profile?.id || 'default';
    const gameChanged = this.gameContext !== this.app.checkupGame;
    const profileChanged = this.activeProfileId !== profileId;
    if (gameChanged || profileChanged) {
      this.lastRunReportId = null;
      this.latestReport = null;
      this.pendingBatch = null;
      this.setStatus('');
      if (profileChanged && this.localPgnInput) this.localPgnInput.value = '';
      if (this.screenEloSelect) this.screenEloSelect.value = '';
      if (this.confirmNameInput) this.confirmNameInput.value = '';
      this.gameContext = this.app.checkupGame;
      this.source = this.gameContext?.platform || profile?.accounts?.[0]?.platform || 'lichess';
      if (this.usernameInput) this.usernameInput.value = this.suggestUsername(profile);
    }
    if (account && profile?.accounts?.some(item => accountKey(item) === accountKey(account))) {
      this.source = account.platform;
      this.usernameInput.value = account.username;
    }
    this.activeProfileId = profileId;
    if (this.pendingBatch && this.pendingBatch.profileId !== profileId) {
      this.pendingBatch = null;
    }
    const loadedHistory = profile ? await this.app.mistakeBank.store.listCheckups(profile.id) : [];
    const currentProfileId = this.app.mistakeBank?.activeProfile?.id || 'default';
    if (generation !== this.openGeneration || epoch !== this.app.gameEpoch || currentProfileId !== profileId || !this.allowed()) return;
    this.history = loadedHistory;
    this.reportScope = 'rolling';
    const replay = this.replayReturn;
    const returnReport = !account && replay?.epoch === epoch && replay.profileId === profileId
      ? loadedHistory.find(item => item.id === replay.reportId) : null;
    if (returnReport) {
      this.source = checkupSourceType(returnReport.sourceLabel);
      if (this.usernameInput) this.usernameInput.value = returnReport.playerName;
    }
    this.applyHistoryContext();
    if (returnReport) {
      this.latestReport = returnReport;
      this.reportScope = replay.scope;
    }
    this.renderAccounts();
    this.renderSourceControls();
    this.renderReport(this.latestReport);
    if (!this.dialog.open) {
      this.dialog.showModal();
      this.setView(!account && (this.latestReport || this.fallbackReport) ? 'report' : 'settings', !!this.latestReport && !account);
    } else if (returnReport) {
      this.setView('report', true);
    } else {
      this.setView(this.view);
    }
    this.syncReplayBanner();
    this.app.checkupReminders?.refresh();
  }

  switchProfile(id) {
    if (id === this.activeProfileId) return;
    return this.changeProfile(() => this.app.mistakeBank.selectProfile(id));
  }

  async changeProfile(operation, account) {
    if (this.busy || !this.allowed() || !this.dialog?.open) return;
    const generation = ++this.openGeneration;
    this.updatingProfile = true;
    this.renderSourceControls();
    this.renderReport(null);
    try {
      await operation();
      if (generation === this.openGeneration && this.dialog.open) await this.open({ account });
    } catch {
      if (generation === this.openGeneration) {
        this.renderAccounts();
        this.setStatus(t('checkupAccountError'));
      }
    } finally {
      this.updatingProfile = false;
      this.renderSourceControls();
      this.renderReport(this.latestReport);
    }
  }

  async updateAccount(platform, username, { remove = false } = {}) {
    const bank = this.app.mistakeBank;
    const id = this.activeProfileId;
    const account = normalizeAccount(platform, username);
    if (!account || !id || !bank || this.busy || !this.dialog?.open || !this.allowed()) return;
    const generation = this.openGeneration;
    this.updatingProfile = true;
    this.renderSourceControls();
    try {
      if (remove) await bank.updateProfileAccount(id, platform, username, { remove });
      else {
        const report = this.history.find(item => item.id === this.lastRunReportId);
        const reportId = checkupReportMatchesAccount(report, account) ? report.id : null;
        if (!await this.app.studyProfiles.linkAccount(account, { reportId })) return;
      }
      if (generation !== this.openGeneration || !this.allowed()) return;
      if (bank.activeProfile?.id !== id) {
        await this.open({ account });
        return;
      }
      this.renderAccounts();
      const key = remove ? 'checkupAccountRemoved' : 'checkupAccountSaved';
      this.setStatus(t(key, { account: this.accountLabel(account) }));
    } catch {
      if (generation === this.openGeneration) this.setStatus(t('checkupAccountError'));
    } finally {
      this.updatingProfile = false;
      this.renderSourceControls();
    }
  }

  requestStop({ close = false } = {}) {
    if (!this.running) {
      if (close) this.close();
      else this.cancelRun();
      return;
    }
    if (this.cancelled || this.stopDialog.open) return;
    this.closeAfterConfirmation = close;
    this.renderStopMessage();
    this.stopDialog.showModal();
  }

  renderStopMessage() {
    if (!this.stopMessage) return;
    const { completedGames: completed = 0, totalGames: total } = this.progress || {};
    this.stopMessage.textContent = t(total ? 'checkupStopProgress' : 'checkupStopStarting', { completed, total });
  }

  close() {
    if (this.stopDialog?.open) this.stopDialog.close();
    this.openGeneration++;
    this.cancelRun();
    if (this.dialog?.open) this.dialog.close();
  }

  applyHistoryContext() {
    const profile = this.app.mistakeBank?.activeProfile;
    const suggestedPlayer = this.usernameInput ? this.usernameInput.value.trim() : this.suggestUsername(profile);
    const selection = selectCheckupHistory(this.history, {
      source: this.source,
      gameContext: this.gameContext,
      suggestedPlayer
    });
    this.latestReport = selection.primary;
    this.scopedHistory = selection.scopedHistory;
    this.fallbackReport = selection.fallbackReport;
  }

  suggestUsername(profile) {
    if (this.gameContext?.platform === this.source) return suggestCheckupPlayer(this.gameContext, profile);
    const preferred = profile?.accounts?.find(account => account.platform === this.source);
    return preferred?.username || (!this.gameContext && !profile?.accounts?.length ? profile?.aliases?.[0] : '') || '';
  }

  accountLabel(account) {
    return `${formatSourceBadge(account.platform)} · ${account.username}`;
  }

  refreshOverviewAccounts() {
    const profile = this.app.mistakeBank?.activeProfile;
    const selected = this.overviewAccount.value;
    const current = normalizeAccount(this.source, this.usernameInput?.value);
    const reported = this.latestReport && normalizeAccount(checkupSourceType(this.latestReport.sourceLabel), this.latestReport.playerName);
    const candidates = [...(profile?.accounts || []), reported, current].filter(Boolean);
    const unique = new Map(candidates.map(account => [accountKey(account), account]));
    this.overviewAccounts = unique;
    this.overviewAccount.replaceChildren(...[...unique].map(([key, account]) => new Option(this.accountLabel(account), key)));
    if (unique.has(selected)) this.overviewAccount.value = selected;
    else if (reported) this.overviewAccount.value = accountKey(reported);
  }

  overviewKey() {
    const profileId = this.app.mistakeBank?.activeProfile?.id;
    return profileId && this.overviewAccount.value ? JSON.stringify([profileId, this.overviewAccount.value]) : '';
  }

  async loadOverview() {
    const key = this.overviewKey();
    const bank = this.app.mistakeBank;
    const profileId = bank?.activeProfile?.id;
    const account = this.overviewAccounts?.get(this.overviewAccount.value);
    if (!key || !account || this.busy || this.overviewController || !this.dialog.open || !this.allowed()) return;
    const controller = this.overviewController = new AbortController();
    this.overviewPendingKey = key;
    this.overviewCache.delete(key);
    const current = () => this.overviewController === controller && this.dialog.open && this.allowed() &&
      bank.activeProfile?.id === profileId;
    this.renderOverview();
    try {
      const options = { max: OVERVIEW_GAME_LIMIT, signal: controller.signal };
      const games = account.platform === 'lichess'
        ? await fetchLichessRecentGames(account.username, { ...options, clocks: true })
        : await fetchChesscomRecentGames(account.username, options);
      if (!current()) return;
      const profile = await bank.store.get('profiles', profileId);
      if (!current()) return;
      const reviews = {};
      for (const game of games) {
        const review = profile?.checkupReviews?.[`${account.platform}:${game.gameId}`];
        if (review) reviews[game.gameId] = review;
      }
      if (this.overviewCache.size >= 12) this.overviewCache.delete(this.overviewCache.keys().next().value);
      this.overviewCache.set(key, { games, account, reviews });
    } catch (error) {
      if (current() && error?.name !== 'AbortError') this.overviewCache.set(key, { error: error.message });
    } finally {
      if (this.overviewController === controller) {
        this.overviewController = null;
        if (this.dialog.open && this.view === 'overview') this.renderOverview();
      }
    }
  }

  renderOverview() {
    const key = this.overviewKey();
    const cached = this.overviewCache.get(key);
    this.overviewAccount.disabled = !key || !!this.overviewController;
    this.renderSourceControls();
    this.overviewBody.replaceChildren();
    this.overviewStatus.textContent = !key ? t('checkupOverviewNoAccount')
      : this.overviewController && this.overviewPendingKey === key ? t('checkupOverviewLoading')
      : cached?.error ? t('checkupFetchFailed', { error: cached.error })
      : !cached ? t('checkupOverviewHelp') : !cached.games.length ? t('checkupNoGames') : '';
    if (!cached?.games?.length) return;
    const speeds = [...new Set(cached.games.map(game => game.meta.timeClass).filter(Boolean))];
    const mode = document.createElement('select');
    mode.className = 'btn-header';
    mode.setAttribute('aria-label', t('checkupTimeClass'));
    mode.add(new Option(t('checkupAllSpeeds'), ''));
    for (const value of speeds) mode.add(new Option(this.speedLabel(value), value));
    const stats = document.createElement('div');
    stats.className = 'checkup-overview-grid';
    this.overviewBody.append(mode, stats);
    const render = () => {
      const result = summarizeCheckupOverview(cached.games, cached.account.username, cached.reviews, mode.value);
      this.overviewStatus.textContent = t('checkupOverviewSample', { count: result.count });
      const color = side => t(side === 'w' ? 'checkupColorWhite' : 'checkupColorBlack');
      const percent = (n, d) => d ? `${Math.round(n * 100 / d)}%` : '—';
      const card = (title, rows) => {
        const section = document.createElement('section');
        section.className = 'checkup-insight-section';
        const heading = document.createElement('h3');
        heading.className = 'checkup-report-section-title';
        heading.textContent = t(title);
        const list = document.createElement('ul');
        for (const text of rows) {
          const row = document.createElement('li');
          row.textContent = text;
          list.append(row);
        }
        section.append(heading, list);
        return section;
      };
      const wins = Object.entries(result.colors).map(([side, { count, wins }]) =>
        t('checkupOverviewWinRow', { side: color(side), wins, count, rate: percent(wins, count) }));
      const endings = Object.entries(result.endings).map(([kind, n]) =>
        `${t(`checkupEnding_${kind}`)} · ${n} · ${percent(n, result.count)}`);
      const rank = result.openings.filter(opening => opening.count >= 3)
        .sort((a, b) => b.points / b.count - a.points / a.count || b.count - a.count);
      const openings = [];
      for (const side of ['w', 'b']) {
        const popular = result.openings.filter(item => item.side === side).sort((a, b) => b.count - a.count)[0];
        if (popular) openings.push(t('checkupOverviewOpeningRow', {
          label: t('checkupOpeningPopular'), side: color(side), eco: popular.eco, name: popular.name || popular.eco,
          speed: this.speedLabel(popular.timeClass), count: popular.count, rate: percent(popular.points, popular.count)
        }));
        const choices = rank.filter(item => item.side === side);
        const best = choices[0];
        const worst = choices.at(-1);
        for (const [item, label] of [[best, 'checkupOpeningBest'], [worst !== best ? worst : null, 'checkupOpeningWorst']]) {
          if (!item) continue;
          openings.push(t('checkupOverviewOpeningRow', { label: t(label), side: color(side), eco: item.eco,
            name: item.name || item.eco, speed: this.speedLabel(item.timeClass), count: item.count,
            rate: percent(item.points, item.count) }));
        }
      }
      if (!rank.length) openings.push(t('checkupOpeningFew'));
      const { low, observed, reviewedLow, errors, timeoutLosses } = result.pressure;
      const clock = [
        observed ? t('checkupClockLow', { low, observed, rate: percent(low, observed) }) : t('checkupClockUnavailable'),
        t('checkupClockTimeoutLosses', { count: timeoutLosses }),
        reviewedLow ? t('checkupClockErrors', { errors, reviewed: reviewedLow, low, rate: percent(errors, reviewedLow) }) : t('checkupClockNoReviews')
      ];
      stats.replaceChildren(card('checkupOverviewWins', wins), card('checkupOverviewEndings', endings),
        card('checkupOverviewOpenings', openings), card('checkupOverviewPressure', clock));
    };
    mode.onchange = render;
    render();
  }

  speedLabel(value) {
    if (!value) return t('checkupUnknownSpeed');
    const key = `checkupSpeed_${value}`;
    const label = t(key);
    return label === key ? value : label;
  }

  renderAccounts() {
    const bank = this.app.mistakeBank;
    if (bank) bank.renderProfilePicker(this.profileSelect, this.profileName);
    if (!this.accountList) return;
    const accounts = bank?.activeProfile?.accounts || [];
    this.accountList.hidden = !accounts.length;
    this.accountList.replaceChildren();
    for (const account of accounts) {
      const label = this.accountLabel(account);
      const row = document.createElement('li');
      row.dataset.account = accountKey(account);
      const identity = document.createElement('div');
      identity.className = 'checkup-account-identity';
      const name = document.createElement('strong');
      name.className = 'checkup-account-name';
      name.textContent = label;
      const selectAccount = () => {
        this.source = account.platform;
        this.usernameInput.value = account.username;
        this.setStatus('');
        this.applyHistoryContext();
        this.renderSourceControls();
        this.renderReport(this.latestReport);
      };
      const run = document.createElement('button');
      run.type = 'button';
      run.className = 'btn-header';
      run.onclick = () => {
        if (this.busy || !this.allowed()) return;
        selectAccount();
        const { record, pending } = this.app.checkupReminders?.accountState(account) || {};
        this.prepareBatch({ onlyNew: !!(pending?.length || record?.lastDiagnosedAt || this.latestReport) });
      };
      const unlink = document.createElement('button');
      unlink.type = 'button';
      unlink.className = 'btn-header';
      unlink.textContent = t('checkupRemoveAccount');
      unlink.setAttribute('aria-label', t('checkupRemoveAccountLabel', { account: label }));
      unlink.onclick = () => this.updateAccount(account.platform, account.username, { remove: true });
      const status = document.createElement('span');
      status.className = 'checkup-account-status';
      const ignore = document.createElement('button');
      ignore.type = 'button';
      ignore.className = 'btn-header checkup-ignore';
      ignore.hidden = true;
      ignore.textContent = t('checkupIgnore');
      ignore.setAttribute('aria-label', t('checkupIgnoreAccount', { account: label }));
      ignore.onclick = async () => {
        if (this.busy || !this.allowed()) return;
        ignore.disabled = true;
        try {
          await this.app.checkupReminders?.ignore(account);
        } catch {
          this.setStatus(t('checkupAccountError'));
        } finally {
          ignore.disabled = this.busy;
        }
      };
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn-header checkup-view-report';
      view.textContent = t('checkupViewReport');
      view.setAttribute('aria-label', `${t('checkupViewReport')} · ${label}`);
      view.onclick = () => {
        if (this.busy || !this.allowed()) return;
        selectAccount();
        this.reportScope = 'rolling';
        this.renderReport(this.latestReport);
        this.setView('report', true);
      };
      identity.append(name, status);
      row.append(identity, run, view, ignore);
      if (accounts.length > 1) {
        const move = document.createElement('button');
        move.type = 'button';
        move.className = 'btn-header';
        move.textContent = t('studyMoveProfile');
        move.setAttribute('aria-label', t('studyMoveAccount', { account: label }));
        move.onclick = () => this.changeProfile(() => this.app.studyProfiles.createProfile({ account, move: true }), account);
        row.append(move);
      }
      row.append(unlink);
      this.accountList.append(row);
    }
    this.renderAccountStatus();
  }

  renderAccountStatus() {
    if (!this.accountList) return;
    const accounts = this.app.mistakeBank?.activeProfile?.accounts || [];
    const states = new Map(accounts.map(account => [
      accountKey(account), { account, ...this.app.checkupReminders?.accountState(account) }
    ]));
    const rows = [...this.accountList.children];
    for (const row of rows) {
      const state = states.get(row.dataset.account);
      if (!state) continue;
      const { account, record, pending } = state;
      const count = pending?.length || 0;
      const status = row.querySelector('.checkup-account-status');
      const checked = record?.checkedAt;
      const report = this.history.find(item => checkupReportMatchesAccount(item, account));
      const diagnosed = Math.max(record?.lastDiagnosedAt || 0, report?.createdAt || 0);
      status.dataset.pending = String(count > 0);
      const recent = diagnosed ? t('checkupLastDiagnosis', { when: formatRelativeTime(diagnosed) }) : '';
      status.textContent = count ? t('checkupAccountPending', { count })
        : checked ? [t('checkupCaughtUp'), recent].filter(Boolean).join(' · ')
        : recent || t('checkupAwaitingCheck');
      row.querySelector('.checkup-ignore').hidden = count === 0;
      row.querySelector('.checkup-view-report').hidden = !report;
      const run = row.querySelector('button');
      const action = count ? 'checkupRunNew' : diagnosed ? 'checkupFindNew' : 'checkupRunFirst';
      run.textContent = t(action);
      run.classList.add('btn-primary');
      run.setAttribute('aria-label', `${t(action)} · ${this.accountLabel(account)}`);
    }
    const count = row => states.get(row.dataset.account)?.pending?.length || 0;
    const ordered = [...rows].sort((a, b) => Number(count(b) > 0) - Number(count(a) > 0));
    const focused = this.accountList.contains(document.activeElement) ? document.activeElement : null;
    ordered.forEach((row, index) => {
      if (this.accountList.children[index] !== row) this.accountList.insertBefore(row, this.accountList.children[index]);
    });
    const nextFocus = focused?.hidden ? focused.closest('li').querySelector('button') : focused;
    if (nextFocus && document.activeElement !== nextFocus) nextFocus.focus({ preventScroll: true });
  }

  renderSourceControls() {
    const busy = this.busy;
    if (this.profileSelect) this.profileSelect.disabled = busy;
    if (this.newProfileBtn) this.newProfileBtn.disabled = busy;
    if (this.screenEloSelect) this.screenEloSelect.disabled = busy;
    if (this.btnCancelRun) {
      this.btnCancelRun.disabled = this.running && this.cancelled;
      this.btnCancelRun.textContent = t(this.running ? 'checkupStop' : 'btnCancel');
    }
    for (const button of this.accountList?.querySelectorAll('button') || []) button.disabled = busy;
    const account = normalizeAccount(this.source, this.usernameInput?.value);
    for (const row of this.accountList?.children || []) {
      row.dataset.selected = String(!!account && row.dataset.account === accountKey(account));
    }
    for (const tab of this.sourceTabs) {
      tab.setAttribute('aria-pressed', String(tab.dataset.checkupSource === this.source));
      tab.disabled = busy;
    }
    const isLocal = this.source === 'local';
    if (this.usernameRow) this.usernameRow.hidden = isLocal;
    if (this.localRow) this.localRow.hidden = !isLocal;
    if (this.confirmBox) this.confirmBox.hidden = busy || !this.pendingBatch;
    if (this.progressBox) this.progressBox.hidden = !this.running && !this.fetching;
    if (this.reportBox) this.reportBox.hidden = busy || !this.latestReport;
    if (this.reportEmpty) this.reportEmpty.hidden = busy || !!this.latestReport || !!this.fallbackReport;
    if (this.reportTools) this.reportTools.hidden = busy;
    for (const button of this.reportTools?.querySelectorAll('button') || []) button.disabled = busy;
    if (this.overviewButton) this.overviewButton.disabled = busy || !this.overviewAccount?.value || !!this.overviewController;
    if (this.usernameInput) this.usernameInput.disabled = busy;
    if (this.localPgnInput) this.localPgnInput.disabled = busy;
    if (this.btnSelectFiles) this.btnSelectFiles.disabled = busy;
    if (this.btnSaveAccount) {
      const accounts = this.app.mistakeBank?.activeProfile?.accounts || [];
      this.btnSaveAccount.hidden = isLocal;
      this.btnSaveAccount.disabled = busy || !account || accounts.some(item => accountKey(item) === accountKey(account));
      this.btnSaveAccount.textContent = account ? t('checkupSaveNamedAccount', { player: account.username }) : t('checkupSaveAccount');
    }
    if (this.btnFetch) {
      this.btnFetch.disabled = busy;
      const hasReport = account && this.history.some(item => checkupReportMatchesAccount(item, account));
      this.btnFetch.textContent = t(isLocal ? 'checkupParseLocal' : hasReport ? 'checkupRerunWindow' : 'checkupFetchGames');
      this.btnFetch.classList.toggle('btn-primary', isLocal || !hasReport);
    }
    if (this.playerChoices) {
      this.playerChoices.replaceChildren();
      this.playerChoices.hidden = busy || this.gameContext?.platform !== this.source;
      if (!this.playerChoices.hidden) {
        for (const name of new Set([this.gameContext.white, this.gameContext.black].filter(Boolean))) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn-header';
          button.textContent = t('checkupChoosePlayer', { player: name });
          button.onclick = () => {
            this.usernameInput.value = name;
            this.usernameInput.oninput();
            this.usernameInput.focus();
          };
          this.playerChoices.append(button);
        }
        this.playerChoices.hidden = !this.playerChoices.childElementCount;
      }
    }
    this.renderProgress();
  }

  renderProgress() {
    if (!this.progressText || !this.progress) return;
    const { phase, gameIndex, totalGames, analyzedMoves, workDone, completedGames = 0 } = this.progress;
    if (this.progressDetails) this.progressDetails.hidden = !this.running;
    if (this.stopDialog?.open) this.renderStopMessage();
    if (this.eta) {
      let estimate = '';
      if (this.running && phase !== 'cancelling') {
        if (completedGames && completedGames < totalGames) {
          const remaining = Math.max(1, Math.ceil(this.averageGameMs * (totalGames - workDone) / 1000));
          estimate = t('checkupEta', { seconds: remaining });
        } else if (totalGames && !completedGames) {
          estimate = t('checkupEtaAfterFirst', { count: totalGames });
        }
      }
      this.eta.hidden = !estimate;
      if (this.eta.textContent !== estimate) this.eta.textContent = estimate;
    }
    const stockfish = this.app.stockfish?.downloadProgress;
    const maia = this.app.maiaEngine?.status?.maia;
    let label;
    let downloadPercent;
    if (phase === 'stockfish' && Number.isFinite(stockfish?.percent)) {
      downloadPercent = Math.round(stockfish.percent);
      label = t('checkupDownloadingStockfish', { percent: downloadPercent });
    } else if (phase === 'maia' && maia?.stage === 'download') {
      if (Number.isFinite(maia.percent)) downloadPercent = Math.round(maia.percent);
      label = downloadPercent === undefined
        ? t('checkupDownloadingMaiaUnknown') : t('checkupDownloadingMaia', { percent: downloadPercent });
    } else if (phase === 'maia' && maia?.stage === 'preparing') {
      label = t('checkupPreparingMaia');
    } else {
      const key = {
        fetching: 'checkupFetching', stockfish: 'checkupStartingStockfish', maia: 'checkupStartingMaia',
        fitting: 'checkupFitting', analyzing: 'checkupProgress', verifying: 'checkupVerifying', cancelling: 'checkupCancelling'
      }[phase];
      label = t(key, { current: gameIndex, total: totalGames, moves: analyzedMoves });
    }
    if (this.progressText.textContent !== label) this.progressText.textContent = label;
    if (this.progressBar) {
      if (Number.isFinite(workDone)) {
        this.progressBar.max = totalGames;
        this.progressBar.value = workDone;
      } else if (downloadPercent !== undefined) {
        this.progressBar.max = 100;
        this.progressBar.value = downloadPercent;
      } else {
        this.progressBar.removeAttribute('value');
      }
    }
  }

  setStatus(text = '') {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  async prepareBatch({ onlyNew = false } = {}) {
    if (this.busy || !this.allowed()) return;
    const generation = this.openGeneration;
    const source = this.source;
    const startProfileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    const controller = this.abortController = new AbortController();
    const current = () => this.abortController === controller && generation === this.openGeneration
      && startProfileId === (this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default') && this.allowed();
    this.setStatus('');
    this.pendingBatch = null;
    try {
      let games = [];
      let sourceLabel = 'local-pgn-batch';
      let suggestedName = '';
      if (source === 'local') {
        const raw = this.localPgnInput?.value?.trim() || '';
        const chunks = splitMultiPgn(raw).slice(0, MAX_LOCAL_GAMES);
        games = chunks
          .map(pgn => ({ pgn, meta: parsePgnMeta(pgn) }))
          .filter(item => FairPlayGuard.verifyConcludedGame(item.pgn).ok);
        const profile = this.app.mistakeBank?.activeProfile;
        suggestedName = detectBatchPlayer(games, profile).suggestedName;
      } else {
        const username = this.usernameInput?.value?.trim() || '';
        if (!username) {
          this.setStatus(t('checkupNeedUsername'));
          return;
        }
        this.fetching = true;
        this.progress = { phase: 'fetching' };
        this.renderSourceControls();
        games = source === 'lichess'
          ? await fetchLichessRecentGames(username, { signal: controller.signal })
          : await fetchChesscomRecentGames(username, { signal: controller.signal });
        sourceLabel = `${source}:${username}`;
        suggestedName = username;
      }

      if (!current()) return;

      if (!games.length) {
        this.setStatus(t('checkupNoGames'));
        this.renderSourceControls();
        return;
      }

      if (source !== 'local') {
        const windowIds = games.map(game => game.gameId);
        let reusedScreen;
        const account = onlyNew && normalizeAccount(source, suggestedName);
        if (account) {
          const state = await this.app.mistakeBank?.store.loadCheckupProfile(startProfileId);
          if (!current()) return;
          if (state) this.history = state.reports;
          const reports = this.history.filter(item => checkupReportMatchesAccount(item, account));
          const evidenceBase = checkupEvidenceBase(this.app.stockfish, this.app.maiaEngine);
          const compatible = reports.find(item => item.evidenceKey?.startsWith(evidenceBase + '|'));
          if (!this.screenEloSelect?.value && compatible) reusedScreen = { elo: compatible.screenElo };
          const record = state?.profile?.checkupReminders?.[accountKey(account)];
          const known = new Set([...(record?.baseline || []), ...(record?.diagnosed || []),
            ...reports.flatMap(report => report.analyzedGameIds || [])]);
          games = games.filter(game => !game.gameId || !known.has(game.gameId));
          if (!games.length) {
            this.applyHistoryContext();
            this.latestReport = reports.find(item => !item.partial) || reports[0] || null;
            if (compatible && this.latestReport?.evidenceKey === compatible.evidenceKey) {
              const rolling = buildCheckupWindow(windowIds, compatible.evidenceKey, reports);
              this.latestReport = { ...this.latestReport, rolling };
              await this.app.mistakeBank.store.put('checkups', this.latestReport);
              if (!current()) return;
              this.history = this.history.map(report => report.id === this.latestReport.id ? this.latestReport : report);
              this.scopedHistory = this.scopedHistory.map(report => report.id === this.latestReport.id ? this.latestReport : report);
            }
            this.fallbackReport = null;
            this.reportScope = 'rolling';
            this.renderReport(this.latestReport);
            this.setView('report', true);
            this.setStatus(t('checkupNoNewGames'));
            return;
          }
        }
        this.fetching = false;
        await this.startRun({ games, sourceLabel, profileId: startProfileId, windowIds, reusedScreen }, suggestedName);
        return;
      }
      this.pendingBatch = { games, sourceLabel, profileId: startProfileId };
      if (this.confirmPrompt) {
        this.confirmPrompt.textContent = t('checkupConfirmPerspective', { count: games.length });
      }
      if (this.confirmNameInput) {
        this.confirmNameInput.value = suggestedName;
      }
      this.setStatus('');
      this.renderSourceControls();
    } catch (err) {
      if (current() && err?.name !== 'AbortError') {
        this.setStatus(t('checkupFetchFailed', { error: err.message }));
      }
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
        this.fetching = false;
        this.renderSourceControls();
      }
    }
  }

  async startRun(batch = this.pendingBatch, targetPlayer = this.confirmNameInput?.value?.trim() || '') {
    if (this.busy || !this.allowed() || !batch) return;
    const activeId = () => this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    if (batch.profileId !== activeId()) return;
    if (!targetPlayer) {
      this.setStatus(t('checkupNeedPlayerName'));
      return;
    }
    this.running = true;
    this.cancelled = false;
    this.closeWhenStopped = false;
    this.analysisStartedAt = null;
    this.averageGameMs = 0;
    const controller = this.runController = new AbortController();
    const runGeneration = ++this.openGeneration;
    const current = () => this.allowed() && runGeneration === this.openGeneration && batch.profileId === activeId();
    this.progress = { phase: 'stockfish' };
    this.renderSourceControls();
    this.setStatus('');
    let restoreReview;
    try {
      restoreReview = this.app.pauseForCheckup?.();
      const report = await runIntuitionCheckup({
        games: batch.games,
        targetPlayer,
        profileId: batch.profileId,
        sourceLabel: batch.sourceLabel,
        elo: Number(this.screenEloSelect?.value) || undefined,
        reusedScreen: batch.reusedScreen,
        defaultElo: this.app.profileDefaultElo?.() || 1900,
        stockfish: this.app.stockfish,
        maiaEngine: this.app.maiaEngine,
        signal: controller.signal,
        isCancelled: () => this.cancelled || !current(),
        onProgress: progress => {
          if (!current() || this.cancelled) return;
          if (progress.phase === 'analyzing' && this.analysisStartedAt === null) this.analysisStartedAt = performance.now();
          if (progress.completedGames > (this.progress.completedGames || 0)) {
            this.averageGameMs = (performance.now() - this.analysisStartedAt) / progress.completedGames;
          }
          this.progress = progress;
          this.renderProgress();
        }
      });

      if (!current()) return;

      if (report.gameCount > 0) {
        const account = normalizeAccount(checkupSourceType(report.sourceLabel), report.playerName);
        if (account && batch.windowIds?.some(Boolean)) {
          const reports = this.history.filter(item => checkupReportMatchesAccount(item, account));
          report.rolling = buildCheckupWindow(batch.windowIds, report.evidenceKey, [report, ...reports]);
        }
        if (!current()) return;
        const savedRecord = report;
        this.reportScope = 'rolling';
        this.history = [savedRecord, ...this.history.filter(item => item.id !== report.id)];
        this.applyHistoryContext();
        if (!this.scopedHistory.some(item => item.id === savedRecord.id)) {
          this.scopedHistory = [savedRecord, ...this.scopedHistory];
        }
        this.latestReport = savedRecord;
        this.fallbackReport = null;
        if (this.app.mistakeBank?.store) {
          await this.app.mistakeBank.store.saveCheckup(savedRecord);
          if (current()) this.lastRunReportId = savedRecord.id;
          await this.app.checkupReminders?.reload(batch.profileId);
          this.app.checkupReminders?.syncBackground();
        }
        if (!current()) return;
        this.renderReport(savedRecord);
        this.setView('report');
        this.setStatus(report.partial ? t('checkupCancelledPartial') : t('checkupDone'));
      } else if (this.cancelled || report.partial) {
        this.setStatus(t('checkupCancelledEmpty'));
      } else {
        this.setStatus(t('checkupNoMatchedSide', { player: targetPlayer }));
      }
    } catch (err) {
      this.closeWhenStopped = false;
      if (current()) this.setStatus(t('checkupRunFailed', { error: err.message }));
    } finally {
      this.runController = null;
      this.running = false;
      if (this.stopDialog?.open) this.stopDialog.close();
      if (this.closeWhenStopped && current()) this.close();
      this.renderSourceControls();
      restoreReview?.();
    }
  }

  cancelRun() {
    this.cancelled = true;
    this.abortController?.abort();
    this.abortController = null;
    if (this.fetching) {
      this.fetching = false;
      this.setStatus(t('checkupFetchCancelled'));
    }
    if (this.running) {
      this.progress = { ...this.progress, phase: 'cancelling' };
      this.runController?.abort();
      this.app.stockfish?.stop?.();
    }
    this.renderSourceControls();
  }

  renderReport(report) {
    if (this.historyHintEl) {
      this.historyHintEl.replaceChildren();
      const showFallback = !report && this.fallbackReport && !this.busy;
      this.historyHintEl.hidden = !showFallback;
      if (showFallback) {
        const item = this.fallbackReport;
        const time = formatRelativeTime(item.createdAt);
        const label = `${item.playerName} (${formatSourceBadge(item.sourceLabel)}${time ? ` · ${time}` : ''})`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-header checkup-history-btn';
        btn.textContent = t('checkupHistoryView', { label });
        btn.onclick = () => {
          this.latestReport = item;
          this.reportScope = 'rolling';
          this.renderReport(item);
        };
        this.historyHintEl.append(btn);
      }
    }

    if (!this.reportBox) return;
    this.reportBox.replaceChildren();
    this.renderReportTools(report);
    if (this.reportEmpty) this.reportEmpty.hidden = this.busy || !!report || !!this.fallbackReport;
    if (!report) {
      this.reportBox.hidden = true;
      return;
    }
    this.reportBox.hidden = this.busy;

    const summary = document.createElement('div');
    summary.className = 'checkup-summary-card';

    const metaRow = document.createElement('div');
    metaRow.className = 'checkup-report-meta';
    const badge = document.createElement('span');
    badge.className = 'checkup-source-badge';
    const timeStr = formatRelativeTime(report.createdAt);
    badge.textContent = `${formatSourceBadge(report.sourceLabel)}${timeStr ? ` · ${timeStr}` : ''}`;
    metaRow.append(badge);

    const metaActions = document.createElement('div');
    metaActions.className = 'checkup-meta-actions';
    const switcherList = this.scopedHistory.length > 1 ? this.scopedHistory : this.history;
    if (switcherList.length > 1) {
      const select = document.createElement('select');
      select.className = 'btn-header checkup-history-select';
      select.setAttribute('aria-label', t('checkupHistorySelect'));
      for (const item of switcherList.slice(0, 8)) {
        const opt = document.createElement('option');
        opt.value = item.id;
        const rel = formatRelativeTime(item.createdAt);
        const scope = item.rolling ? t('checkupWindowCoverage', { count: item.rolling.gameCount }) : t('checkupBatchScope', { count: item.gameCount });
        opt.textContent = [item.playerName, formatSourceBadge(item.sourceLabel), scope, rel].filter(Boolean).join(' · ');
        if (item.id === report.id) opt.selected = true;
        select.append(opt);
      }
      select.onchange = () => {
        const picked = switcherList.find(item => item.id === select.value);
        if (picked) {
          this.latestReport = picked;
          this.reportScope = 'rolling';
          this.renderReport(picked);
        }
      };
      metaActions.append(select);
    }
    if (this.app.mistakeBank?.store) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-header checkup-delete-btn';
      delBtn.textContent = '×';
      delBtn.title = t('checkupDeleteReport');
      delBtn.setAttribute('aria-label', t('checkupDeleteReport'));
      delBtn.onclick = async () => {
        await this.app.mistakeBank.store.deleteCheckup(report.id);
        this.history = this.history.filter(item => item.id !== report.id);
        this.applyHistoryContext();
        this.renderReport(this.latestReport);
      };
      metaActions.append(delBtn);
    }
    metaRow.append(metaActions);
    summary.append(metaRow);
    const archivedReport = report;
    if (report.rolling && this.reportScope === 'rolling') {
      report = { ...report, ...report.rolling, highlights: report.rolling.highlights || [] };
      const coverage = document.createElement('p');
      coverage.className = 'checkup-elo-note checkup-window-coverage';
      coverage.textContent = t('checkupWindowCoverage', { count: report.gameCount });
      summary.append(coverage);
    }

    const title = document.createElement('strong');
    title.textContent = t('checkupSummaryTitle', {
      player: report.playerName,
      games: report.gameCount,
      moves: report.analyzedMoves
    });
    const eloLine = document.createElement('p');
    eloLine.textContent = report.closestElo != null
      ? t('checkupClosestElo', { elo: report.closestElo })
      : t('checkupNoEloFit');
    summary.append(title, eloLine);

    if (report.closestElo != null) {
      const eloGrid = document.createElement('div');
      eloGrid.className = 'checkup-elo-grid';
      for (const r of CHECKUP_ELOS) {
        const cell = document.createElement('div');
        cell.className = `checkup-elo-pill${r === report.closestElo ? ' best' : ''}`;
        cell.textContent = `${r}: ${((report.eloFit?.[r] || 0) * 100).toFixed(1)}%`;
        eloGrid.append(cell);
      }
      const eloNote = document.createElement('small');
      eloNote.className = 'checkup-elo-note';
      eloNote.textContent = t('checkupEloFitNote');
      summary.append(eloGrid, eloNote);
      if (Number.isInteger(report.eloSampleCount) && Number.isInteger(report.fitGameCount)) {
        const coverage = document.createElement('small');
        coverage.className = 'checkup-elo-note';
        coverage.textContent = t(report.fitGameCount === 1 ? 'checkupFitCoverageSingle' : 'checkupFitCoverage', {
          moves: report.eloSampleCount, games: report.fitGameCount
        });
        summary.append(coverage);
      }
    }

    const phaseLine = document.createElement('p');
    phaseLine.className = 'checkup-phase-line';
    const phaseText = t('checkupPhaseBreakdown', {
      opening: report.phaseTraps?.opening || 0,
      middlegame: report.phaseTraps?.middlegame || 0,
      endgame: report.phaseTraps?.endgame || 0
    });
    const screenLabel = { pgn: 'checkupScreenPgn', fit: 'checkupScreenFit', manual: 'checkupScreenManual',
      default: 'checkupScreenDefault', rolling: 'checkupScreenRolling' };
    phaseLine.textContent = Number.isFinite(report.screenElo)
      ? `${phaseText} · ${t(screenLabel[report.screenEloSource] || 'checkupScreenElo', { elo: report.screenElo })}`
      : phaseText;
    summary.append(phaseLine);
    this.reportBox.append(summary);

    this.renderHighlights(report);
    this.renderReportTraps(report);
    this.renderReportGames(report);
    this.renderTrends(archivedReport);
  }

  renderReportTools(report) {
    if (!this.reportTools) return;
    this.reportTools.replaceChildren();
    const platform = checkupSourceType(report?.sourceLabel);
    const account = report && normalizeAccount(platform, report.playerName);
    if (account) {
      const update = this.reportButton(t('checkupFindNew'), () => {
        if (this.busy || !this.allowed()) return;
        this.source = account.platform;
        this.usernameInput.value = account.username;
        this.prepareBatch({ onlyNew: true });
      }, 'btn-primary');
      update.disabled = this.busy;
      this.reportTools.append(update);
    }
    if (report?.rolling) {
      const view = document.createElement('select');
      view.className = 'btn-header';
      view.setAttribute('aria-label', t('checkupReportScope'));
      view.add(new Option(t('checkupWindowScope'), 'rolling'));
      view.add(new Option(t('checkupBatchScope', { count: report.gameCount }), 'batch'));
      view.value = this.reportScope;
      view.onchange = () => {
        this.reportScope = view.value;
        this.renderReport(report);
        this.reportTools.querySelector('select')?.focus();
      };
      this.reportTools.append(view);
    }
  }

  renderHighlights(report) {
    if (!report.highlights?.length) return;
    const section = document.createElement('section');
    section.className = 'checkup-insight-section';
    const heading = document.createElement('h3');
    heading.className = 'checkup-report-section-title';
    heading.textContent = t('checkupHighlights');
    section.append(heading);
    for (const move of report.highlights) {
      const game = report.games?.[move.gameIndex];
      const label = `${move.moveNumber}${move.turn === 'w' ? '. ' : '… '}${move.san} · ${t(`checkupHighlight_${move.kind}`)}`;
      section.append(this.reportButton(label, () => this.openReportGame(report, game, move)));
    }
    this.reportBox.append(section);
  }

  renderTrends(report) {
    if (!report.rolling || !report.evidenceKey) return;
    const account = normalizeAccount(checkupSourceType(report.sourceLabel), report.playerName);
    const history = this.history.filter(item => checkupReportMatchesAccount(item, account));
    if (checkupTrend(history, report.evidenceKey).length < 2) return;
    const section = document.createElement('section');
    section.className = 'checkup-insight-section';
    const title = document.createElement('h3');
    title.className = 'checkup-report-section-title';
    title.textContent = t('checkupTrendTitle');
    const mode = document.createElement('select');
    mode.className = 'btn-header';
    mode.setAttribute('aria-label', t('checkupTimeClass'));
    const classes = [...new Set(history.flatMap(item => (item.rolling?.games || []).map(game => game.timeClass)).filter(Boolean))];
    mode.add(new Option(t('checkupAllSpeeds'), ''));
    for (const value of classes) mode.add(new Option(this.speedLabel(value), value));
    const charts = document.createElement('div');
    charts.className = 'checkup-charts';
    const update = () => {
      charts.replaceChildren();
      const points = checkupTrend(history, report.evidenceKey, mode.value);
      if (points.length < 2) {
        charts.textContent = t('checkupTrendFew');
        return;
      }
      for (const [metric, label] of [['elo', 'checkupTrendElo'], ['density', 'checkupTrendDensity']]) {
        charts.append(this.renderTrendChart(points, metric, t(label)));
      }
    };
    mode.onchange = update;
    section.append(title, mode, charts);
    update();
    this.reportBox.append(section);
  }

  renderTrendChart(points, metric, title) {
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = title;
    figure.append(caption);
    const valid = points.filter(point => Number.isFinite(point[metric]));
    if (!valid.length) {
      figure.append(document.createTextNode(t('checkupTrendFew')));
      return figure;
    }
    const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chart.setAttribute('viewBox', '0 0 240 60');
    chart.setAttribute('role', 'img');
    const format = value => metric === 'density' ? value.toFixed(1) : String(value);
    chart.setAttribute('aria-label', `${title} · ${valid.map(point => `${format(point[metric])} (${t('checkupWindowCoverage', { count: point.count })})`).join(' / ')}`);
    const lo = metric === 'elo' ? CHECKUP_ELOS[0] : 0;
    const hi = metric === 'elo' ? CHECKUP_ELOS.at(-1) : Math.max(1, ...valid.map(point => point.density));
    let path = '';
    let previous = false;
    for (const [i, point] of points.entries()) {
      if (!Number.isFinite(point[metric])) {
        previous = false;
        continue;
      }
      const x = 7 + i * 226 / (points.length - 1);
      const y = 53 - 46 * (point[metric] - lo) / (hi - lo);
      path += `${previous ? 'L' : 'M'}${x} ${y} `;
      previous = true;
      const dot = document.createElementNS(chart.namespaceURI, 'circle');
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', 3);
      const label = document.createElementNS(chart.namespaceURI, 'title');
      label.textContent = `${new Date(point.time).toLocaleDateString()} · ${format(point[metric])} · ${t('checkupWindowCoverage', { count: point.count })}`;
      dot.append(label);
      chart.append(dot);
    }
    const line = document.createElementNS(chart.namespaceURI, 'path');
    line.setAttribute('d', path);
    chart.prepend(line);
    const last = valid.at(-1);
    const note = document.createElement('small');
    note.textContent = `${format(last[metric])} · ${t('checkupWindowCoverage', { count: last.count })}`;
    figure.append(chart, note);
    return figure;
  }

  reportButton(label, action, classes = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn-header ${classes}`.trim();
    button.textContent = label;
    button.onclick = action;
    return button;
  }

  async saveReportTraps(report, traps, { practice = false } = {}) {
    const bank = this.app.mistakeBank;
    const profileId = bank?.activeProfile?.id;
    const generation = this.openGeneration;
    const current = () => this.allowed() && !this.busy && this.dialog?.open &&
      this.openGeneration === generation && bank?.activeProfile?.id === profileId;
    if (!bank || !profileId || !current() || this.savingTraps || (report.profileId && report.profileId !== profileId)) return;
    this.savingTraps = true;
    try {
      let added = 0;
      const queue = [];
      for (const trap of traps) {
        if (!current()) return;
        const scoped = { ...trap, profileId, id: trapId(profileId, trap.fenBefore, trap.playedUci || trap.uci) };
        const saved = await bank.store.upsertTrap(scoped);
        if (saved?.record) queue.push(saved.record);
        if (saved?.added) added++;
      }
      await bank.refreshState();
      if (!current()) return;
      if (practice && queue.length) {
        this.close();
        await bank.startPracticeQueue(queue);
      } else {
        this.app.showToast?.(t('bankSavedBatchToast', { count: added }));
      }
    } catch {
      if (current()) this.setStatus(t('checkupTrapSaveError'));
    } finally {
      this.savingTraps = false;
    }
  }

  openReportGame(report, game, trap) {
    if (this.busy || !this.allowed() || !this.dialog?.open || this.activeProfileId !== report.profileId) return;
    if (typeof game?.pgn !== 'string' || !FairPlayGuard.verifyConcludedGame(game.pgn).ok) return;
    const focusMove = trap ? { ply: trap.ply, uci: trap.playedUci || trap.uci, fenBefore: trap.fenBefore } : null;
    const opened = this.app.startNewSession({
      pgn: game.pgn, white: game.white, black: game.black, orientation: game.orientation,
      publicGameUrl: checkupReplayUrl(game.platform, game.gameId), checkupSource: game.platform,
      focusMove, autoReview: false
    });
    if (opened) {
      this.replayReturn = { reportId: report.id, profileId: report.profileId, epoch: this.app.gameEpoch, scope: this.reportScope };
      this.syncReplayBanner();
    } else {
      this.setStatus(t('checkupReplayUnavailable'));
    }
  }

  renderTrapRows(report, traps) {
    const list = document.createElement('div');
    list.className = 'checkup-top-traps';
    for (const trap of traps) {
      const row = document.createElement('div');
      row.className = 'checkup-trap-row';
      const main = document.createElement('div');
      main.className = 'checkup-trap-main';
      const title = document.createElement('strong');
      title.textContent = `${trap.moveNumber}${trap.turn === 'w' ? '. ' : '… '}${trap.playedSan} → ${trap.bestSan}`;
      const opponent = [trap.source?.white, trap.source?.black].find(name => name && normalizeAlias(name) !== normalizeAlias(report.playerName));
      const detail = document.createElement('small');
      const repeats = trap.occurrences?.length || 0;
      detail.textContent = [
        t(`bankPhase_${trap.phase || 'middlegame'}`),
        t('checkupTrapLoss', { loss: (trap.eslLoss || 0).toFixed(1) }),
        opponent ? t('checkupTrapOpponent', { opponent }) : '',
        trap.source?.date, repeats > 1 ? t('checkupTrapRepeats', { count: repeats }) : ''
      ].filter(Boolean).join(' · ');
      main.append(title, detail);
      const topics = checkupTrapTopics(trap);
      if (topics.length) {
        const labels = document.createElement('small');
        labels.className = 'checkup-trap-topics';
        labels.textContent = topics.map(topic => t(`checkupTopic_${topic}`)).join(' · ');
        main.append(labels);
      }
      row.append(main);
      const actions = document.createElement('div');
      actions.className = 'checkup-trap-actions';
      const game = report.games?.[trap.gameIndex];
      if (game?.pgn) {
        const jump = this.reportButton(t('checkupOpenMove'), () => this.openReportGame(report, game, trap), 'checkup-trap-practice-btn');
        jump.setAttribute('aria-label', `${jump.textContent} · ${title.textContent}`);
        actions.append(jump);
      }
      actions.append(this.reportButton(t('checkupTrapPracticeOne'),
        () => this.saveReportTraps(report, [trap], { practice: true }), 'checkup-trap-practice-btn'));
      row.append(actions);
      list.append(row);
    }
    return list;
  }

  renderReportTraps(report) {
    const traps = report.traps || report.topTraps || [];
    if (!traps.length) return;
    const featured = traps.slice(0, FEATURED_TRAPS);
    if (Array.isArray(report.traps)) {
      const count = document.createElement('h3');
      count.className = 'checkup-report-section-title';
      count.textContent = t('checkupTrapTotals', {
        hits: Object.values(report.phaseTraps || {}).reduce((sum, count) => sum + count, 0),
        unique: traps.length
      });
      this.reportBox.append(count);
    }
    this.reportBox.append(this.renderTrapRows(report, featured));
    if (traps.length > featured.length) {
      const details = document.createElement('details');
      details.className = 'checkup-report-details';
      const summary = document.createElement('summary');
      summary.textContent = t('checkupMoreTraps', { count: traps.length - featured.length });
      details.append(summary);
      details.ontoggle = () => {
        if (!details.open) return;
        details.ontoggle = null;
        details.append(this.renderTrapRows(report, traps.slice(featured.length)));
      };
      const saveAll = this.reportButton(t('checkupSaveAll', { count: traps.length }),
        () => this.saveReportTraps(report, traps));
      details.append(saveAll);
      this.reportBox.append(details);
    }

    const actions = document.createElement('div');
    actions.className = 'checkup-report-actions';
    actions.append(
      this.reportButton(t('checkupSaveTop', { count: featured.length }), () => this.saveReportTraps(report, featured)),
      this.reportButton(t('checkupPracticeTop', { count: featured.length }),
        () => this.saveReportTraps(report, featured, { practice: true }), 'btn-primary')
    );
    this.reportBox.append(actions);

    const topics = document.createElement('div');
    topics.className = 'checkup-report-actions checkup-report-topics';
    for (const topic of TRAP_TOPICS) {
      const matching = traps.filter(trap => checkupTrapTopics(trap).includes(topic));
      if (!matching.length) continue;
      topics.append(this.reportButton(t('checkupPracticeTopic', {
        topic: t(`checkupTopic_${topic}`), count: matching.length
      }), () => this.saveReportTraps(report, matching, { practice: true })));
    }
    if (topics.childElementCount) this.reportBox.append(topics);
  }

  renderReportGames(report) {
    if (!report.games?.length) return;
    const details = document.createElement('details');
    details.className = 'checkup-report-details';
    const summary = document.createElement('summary');
    summary.textContent = t(report.games.length === 1 ? 'checkupGamesDetailsSingle' : 'checkupGamesDetails', { count: report.games.length });
    details.append(summary);
    const rows = document.createElement('div');
    rows.className = 'checkup-top-traps';
    for (const game of report.games) {
      const row = document.createElement('div');
      row.className = 'checkup-trap-row';
      const main = document.createElement('div');
      main.className = 'checkup-trap-main';
      const title = document.createElement('strong');
      title.textContent = `${game.white || t('whitePlayer')} – ${game.black || t('blackPlayer')} · ${game.result}`;
      const detail = document.createElement('small');
      detail.textContent = [game.date, t('checkupGameDetails', { moves: game.analyzedMoves, traps: game.trapCount })]
        .filter(Boolean).join(' · ');
      main.append(title, detail);
      row.append(main);
      if (game.pgn) row.append(this.reportButton(t('checkupOpenGame'), () => this.openReportGame(report, game), 'checkup-trap-practice-btn'));
      rows.append(row);
    }
    details.append(rows);
    this.reportBox.append(details);
  }
}
