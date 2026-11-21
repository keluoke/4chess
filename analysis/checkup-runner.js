import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { ChessBoard } from '../engine/chess-core.js?v=20261025-v115';
import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261118-summary-ai';
import { expectedScore } from '../engine/review-policy.js?v=20261117-review-policy';
import { accountKey, buildTrapRecord, detectPhase, normalizeAccount, normalizeAlias, perspectiveNames, trapId } from './study-store.js?v=20261121-v127';
import { t } from './i18n.js?v=20261121-v127';
import { CHECKUP_GAME_LIMIT, LICHESS_CHECKUP_SPEEDS, checkupGameId, chesscomCheckupArchives } from '../engine/checkup-watch.js?v=20261121-v127';

export const CHECKUP_ELOS = [1100, 1500, 1900, 2200];
const MAX_LOCAL_GAMES = 15;
const MAX_ELO_SAMPLES = 24;
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

export function checkupGameContext(pgn, { source, orientation, white, black } = {}) {
  if (!pgn || !FairPlayGuard.verifyConcludedGame(pgn).ok) return null;
  const meta = parsePgnMeta(pgn);
  let site = meta.site.toLowerCase();
  if (meta.url) {
    try { site = new URL(meta.url).hostname.toLowerCase(); } catch { site = ''; }
  }
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

export async function fetchLichessRecentGames(username, { max = CHECKUP_GAME_LIMIT, signal, fetchImpl = fetch } = {}) {
  const clean = String(username || '').trim();
  if (!clean) throw new Error('Username is required');
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(clean)}?max=${max}&pgnInJson=true&clocks=false&evals=false&perfType=${LICHESS_CHECKUP_SPEEDS}`;
  const useBrowserProxy = fetchImpl === fetch && typeof location !== 'undefined' && location.protocol.startsWith('http');
  if (useBrowserProxy) {
    const proxyUrl = `/api/lichess?username=${encodeURIComponent(clean)}&max=${max}`;
    try {
      const resp = await fetchImpl(proxyUrl, { signal, cache: 'no-store' });
      const contentType = resp.headers?.get?.('content-type') || '';
      const isProxyResponse = contentType.includes('ndjson') || contentType.includes('json');
      if (resp.ok) {
        const text = await resp.text();
        const games = [];
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let item;
          try { item = JSON.parse(trimmed); } catch { continue; }
          if (item.variant && item.variant !== 'standard') continue;
          if (!item.pgn) continue;
          const verdict = FairPlayGuard.verifyConcludedGame(item);
          if (!verdict.ok) continue;
          games.push({ pgn: item.pgn, meta: parsePgnMeta(item.pgn), gameId: checkupGameId('lichess', item.id) });
          if (games.length >= max) break;
        }
        return games;
      }
      if (isProxyResponse && resp.status === 404) throw new Error('Lichess HTTP 404');
    } catch (err) {
      if (err?.name === 'AbortError' || String(err?.message).includes('Lichess HTTP 404')) throw err;
    }
  }
  const resp = await fetchImpl(url, {
    headers: { Accept: 'application/x-ndjson' },
    signal
  });
  if (!resp.ok) throw new Error(`Lichess HTTP ${resp.status}`);
  const text = await resp.text();
  const games = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let item;
    try { item = JSON.parse(trimmed); } catch { continue; }
    if (item.variant && item.variant !== 'standard') continue;
    if (!item.pgn) continue;
    const verdict = FairPlayGuard.verifyConcludedGame(item);
    if (!verdict.ok) continue;
    games.push({ pgn: item.pgn, meta: parsePgnMeta(item.pgn), gameId: checkupGameId('lichess', item.id) });
    if (games.length >= max) break;
  }
  return games;
}

export async function fetchChesscomRecentGames(username, { max = CHECKUP_GAME_LIMIT, signal, fetchImpl = fetch } = {}) {
  const clean = String(username || '').trim().toLowerCase();
  if (!clean) throw new Error('Username is required');
  const archives = await chesscomCheckupArchives(clean, { signal, fetchImpl });
  const games = [];
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
      games.push({ pgn: item.pgn, meta: parsePgnMeta(item.pgn), gameId: checkupGameId('chesscom', item.url) });
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

export async function runIntuitionCheckup({
  games = [],
  targetPlayer = '',
  profileId = 'default',
  sourceLabel = 'local-pgn-batch',
  elo = 1900,
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

  const emptyResult = (partial = true) => ({
    id: `checkup_${now}_${Math.random().toString(36).slice(2, 7)}`,
    profileId,
    sourceLabel,
    playerName: targetPlayer.trim(),
    gameCount: 0,
    analyzedGameIds: [],
    analyzedMoves: 0,
    eloFit: Object.fromEntries(CHECKUP_ELOS.map(r => [r, 0])),
    closestElo: null,
    screenElo: elo,
    phaseTraps: { opening: 0, middlegame: 0, endgame: 0 },
    topTrapIds: [],
    topTraps: [],
    partial,
    createdAt: now
  });

  const batch = games.slice(0, MAX_LOCAL_GAMES)
    .map(entry => {
      const meta = entry.meta || parsePgnMeta(entry.pgn || '');
      const wKey = normalizeAlias(meta.white);
      const bKey = normalizeAlias(meta.black);
      const userSide = wKey === targetKey ? 'w' : bKey === targetKey ? 'b' : null;
      if (!userSide) return null;
      const parsedMoves = GameAnalyzer.parsePgn(entry.pgn || '');
      if (!parsedMoves?.length) return null;
      const positions = GameAnalyzer.buildPositionChain(parsedMoves);
      if (!positions || positions.length <= 1 || positions.isPartial) return null;
      return { entry, meta, userSide, positions };
    })
    .filter(Boolean);
  if (!batch.length) return emptyResult(false);

  if (cancelled()) return emptyResult(true);
  onProgress({ phase: 'stockfish' });
  const stockfishReady = await initializeCheckupEngine(stockfish, signal);
  if (cancelled()) return emptyResult(true);
  if (stockfishReady === false) throw new Error(stockfish.lastError || 'Stockfish failed to start');
  onProgress({ phase: 'maia' });
  await initializeCheckupEngine(maiaEngine, signal);
  if (cancelled()) return emptyResult(true);

  const phaseTraps = { opening: 0, middlegame: 0, endgame: 0 };
  const eloLogSums = Object.fromEntries(CHECKUP_ELOS.map(r => [r, 0]));
  const collectedTraps = [];
  let analyzedGames = 0;
  const analyzedGameIds = new Set();
  let analyzedMoves = 0;
  let eloSampleCount = 0;
  let partial = false;

  for (let gi = 0; gi < batch.length; gi++) {
    if (cancelled()) { partial = true; break; }
    const { entry, meta, userSide, positions } = batch[gi];

    const reportProgress = (phase, decisions, checkedPlies = 0) => onProgress({
      phase, gameIndex: gi + 1, totalGames: batch.length, analyzedMoves: analyzedMoves + decisions,
      workDone: gi + checkedPlies / (positions.length - 1)
    });
    reportProgress('analyzing', 0);

    let gameMoves = 0;
    let gameEloSamples = 0;
    const gameEloLogSums = Object.fromEntries(CHECKUP_ELOS.map(r => [r, 0]));
    const gamePhaseTraps = { opening: 0, middlegame: 0, endgame: 0 };
    const gameTraps = [];
    let gameCancelled = false;

    const historyFens = [positions[0].fen];
    for (let mi = 0; mi < positions.length - 1; mi++) {
      if (cancelled()) { gameCancelled = true; break; }
      const move = positions[mi + 1];
      const fenBefore = positions[mi].fen;
      const fenAfter = move.fen;
      const turn = move.turn;
      const ply = move.ply;
      const moveNumber = move.moveNumber;

      if (turn !== userSide || ply <= 12) {
        historyFens.push(fenAfter);
        continue;
      }

      const board = new ChessBoard(fenBefore);
      const legalMoves = board.getLegalMoves();
      if (legalMoves.length <= 1) {
        historyFens.push(fenAfter);
        continue;
      }

      const historySlice = historyFens.slice(0, -1).slice(-7);
      const maiaPred = await maiaEngine.predict(fenBefore, elo, null, cancelled, historySlice);
      if (cancelled()) { gameCancelled = true; break; }

      const playedCandidate = maiaPred?.moves?.find(m => m.uci === move.uci);
      const humanRawProb = playedCandidate ? (playedCandidate.rawProb ?? (playedCandidate.prob / 100)) : 0;
      const maiaTop = maiaPred?.moves?.[0] || null;

      if (eloSampleCount + gameEloSamples < MAX_ELO_SAMPLES && maiaPred?.moves?.length) {
        const sampleProbs = {};
        let validAll = true;
        for (const r of CHECKUP_ELOS) {
          if (r === elo) {
            sampleProbs[r] = humanRawProb;
          } else {
            const pred = await maiaEngine.predict(fenBefore, r, null, cancelled, historySlice);
            if (cancelled()) { gameCancelled = true; break; }
            if (!pred?.moves?.length) { validAll = false; continue; }
            const hit = pred.moves.find(m => m.uci === move.uci);
            sampleProbs[r] = hit ? (hit.rawProb ?? (hit.prob / 100)) : 0;
          }
        }
        if (gameCancelled) break;
        if (validAll) {
          gameEloSamples++;
          for (const r of CHECKUP_ELOS) {
            gameEloLogSums[r] += Math.log(Math.max(sampleProbs[r], LOG_PROB_FLOOR));
          }
        }
      }

      // Stockfish is only needed for moves eligible for trap verification.
      const sfBefore = humanRawProb >= 0.12 ? await stockfish.evaluate(fenBefore, 10, 4000, 2) : null;
      if (cancelled()) { gameCancelled = true; break; }
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
                    gamePhaseTraps[trap.phase || detectPhase(enrichedMove)]++;
                    gameTraps.push(trap);
                  }
                }
              }
            }
          }
        }
      }
      reportProgress('analyzing', ++gameMoves, mi + 1);
      historyFens.push(fenAfter);
    }

    if (gameCancelled) {
      partial = true;
      break;
    }

    reportProgress('analyzing', gameMoves, positions.length - 1);
    analyzedGames++;
    if (entry.gameId) analyzedGameIds.add(entry.gameId);
    analyzedMoves += gameMoves;
    eloSampleCount += gameEloSamples;
    for (const r of CHECKUP_ELOS) eloLogSums[r] += gameEloLogSums[r];
    for (const phase of ['opening', 'middlegame', 'endgame']) phaseTraps[phase] += gamePhaseTraps[phase];
    collectedTraps.push(...gameTraps);
  }

  const eloFit = Object.fromEntries(
    CHECKUP_ELOS.map(r => [
      r,
      eloSampleCount ? Math.round(Math.exp(eloLogSums[r] / eloSampleCount) * 1000) / 1000 : 0
    ])
  );
  const closestElo = eloSampleCount
    ? CHECKUP_ELOS.slice().sort((a, b) => eloLogSums[b] - eloLogSums[a])[0]
    : null;

  const dedup = new Map();
  for (const trap of collectedTraps) {
    if (!dedup.has(trap.id) || trap.eslLoss > dedup.get(trap.id).eslLoss) {
      dedup.set(trap.id, trap);
    }
  }
  const topTraps = [...dedup.values()]
    .sort((a, b) => (b.eslLoss ?? 0) - (a.eslLoss ?? 0))
    .slice(0, 5);

  return {
    id: `checkup_${now}_${Math.random().toString(36).slice(2, 7)}`,
    profileId,
    sourceLabel,
    playerName: targetPlayer.trim(),
    gameCount: analyzedGames,
    analyzedGameIds: [...analyzedGameIds],
    analyzedMoves,
    eloFit,
    closestElo,
    screenElo: elo,
    phaseTraps,
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

  constructor(app) {
    this.app = app;
    this.supported = typeof location === 'undefined' || location.protocol !== 'chrome-extension:';
    this.button = document.getElementById('btn-intuition-checkup');
    this.dialog = document.getElementById('checkup-dialog');
    this.closeBtn = document.getElementById('btn-close-checkup');
    this.profileSelect = document.getElementById('checkup-profile-select');
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
    this.historyHintEl = document.getElementById('checkup-history-hint');
    this.reportBox = document.getElementById('checkup-report-box');
    this.statusEl = document.getElementById('checkup-status');

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
    return this.running && !this.cancelled;
  }

  get busy() {
    return this.running || this.fetching || this.updatingProfile;
  }

  syncVisibility() {
    if (this.button) this.button.hidden = !this.allowed();
    this.app.checkupReminders?.render();
  }

  bindEvents() {
    if (this.button) {
      this.button.hidden = !this.allowed();
      this.button.onclick = () => this.open();
    }
    if (this.closeBtn) this.closeBtn.onclick = () => this.close();
    if (this.profileSelect) this.profileSelect.onchange = () => this.switchProfile(this.profileSelect.value);
    if (this.btnSaveAccount) {
      this.btnSaveAccount.onclick = () => this.updateAccount(this.source, this.usernameInput.value);
    }
    if (this.dialog) {
      this.dialog.addEventListener('click', event => {
        if (event.target === this.dialog) {
          const rect = this.dialog.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            this.close();
          }
        }
      });
      this.dialog.addEventListener('cancel', () => {
        this.openGeneration++;
        this.fileReadGeneration++;
        this.cancelRun();
      });
      this.dialog.addEventListener('close', () => {
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
    if (this.btnCancelRun) this.btnCancelRun.onclick = () => this.cancelRun();
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
    this.renderSourceControls();
    if (autoPrepare) await this.prepareBatch();
  }

  async receiveDroppedPgn(text) {
    if (this.busy || !this.allowed()) return;
    this.fileReadGeneration++;
    this.source = 'local';
    this.pendingBatch = null;
    if (this.localPgnInput) this.localPgnInput.value = String(text || '').trim();
    this.renderSourceControls();
    await this.prepareBatch();
  }

  async open({ account } = {}) {
    if (!this.allowed() || !this.dialog) return;
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
      this.latestReport = null;
      this.pendingBatch = null;
      this.setStatus('');
      if (profileChanged && this.localPgnInput) this.localPgnInput.value = '';
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
    this.applyHistoryContext();
    this.renderAccounts();
    this.renderSourceControls();
    this.renderReport(this.latestReport);
    if (!this.dialog.open) {
      this.dialog.showModal();
      const selected = this.accountList?.querySelector('[data-selected="true"] button');
      (selected || this.accountList?.querySelector('button') || (this.usernameInput?.value ? this.btnFetch : this.usernameInput))?.focus();
    }
    this.app.checkupReminders?.refresh();
  }

  async switchProfile(id) {
    const bank = this.app.mistakeBank;
    if (!bank || this.busy || !this.allowed() || id === this.activeProfileId) return;
    const generation = ++this.openGeneration;
    this.updatingProfile = true;
    this.renderSourceControls();
    this.renderReport(null);
    try {
      await bank.selectProfile(id);
      if (generation === this.openGeneration && this.dialog.open) await this.open();
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
      await bank.updateProfileAccount(id, platform, username, { remove });
      if (generation !== this.openGeneration || !this.allowed()) return;
      if (bank.activeProfile?.id !== id) {
        await this.open();
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

  close() {
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

  renderAccounts() {
    const bank = this.app.mistakeBank;
    bank?.renderProfileOptions(this.profileSelect);
    if (!this.accountList) return;
    const accounts = bank?.activeProfile?.accounts || [];
    this.accountList.hidden = !accounts.length;
    this.accountList.replaceChildren();
    for (const account of accounts) {
      const label = this.accountLabel(account);
      const row = document.createElement('li');
      row.dataset.account = accountKey(account);
      const name = document.createElement('strong');
      name.className = 'checkup-account-name';
      name.textContent = label;
      const run = document.createElement('button');
      run.type = 'button';
      run.className = 'btn-header';
      run.textContent = t('checkupRunAccount');
      run.setAttribute('aria-label', t('checkupRunAccountLabel', { account: label }));
      run.onclick = () => {
        if (this.busy || !this.allowed()) return;
        this.source = account.platform;
        this.usernameInput.value = account.username;
        this.applyHistoryContext();
        this.renderReport(this.latestReport);
        this.prepareBatch();
      };
      const unlink = document.createElement('button');
      unlink.type = 'button';
      unlink.className = 'btn-header';
      unlink.textContent = t('checkupRemoveAccount');
      unlink.setAttribute('aria-label', t('checkupRemoveAccountLabel', { account: label }));
      unlink.onclick = () => this.updateAccount(account.platform, account.username, { remove: true });
      row.append(name, run, unlink);
      this.accountList.append(row);
    }
  }

  renderSourceControls() {
    const busy = this.busy;
    if (this.profileSelect) this.profileSelect.disabled = busy;
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
      this.btnFetch.textContent = t(isLocal ? 'checkupParseLocal' : 'checkupFetchGames');
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
    const { phase, gameIndex, totalGames, analyzedMoves, workDone } = this.progress;
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
        analyzing: 'checkupProgress', verifying: 'checkupVerifying', cancelling: 'checkupCancelling'
      }[phase];
      label = t(key, { current: gameIndex, total: totalGames, moves: analyzedMoves });
    }
    if (this.progressText.textContent !== label) this.progressText.textContent = label;
    if (this.progressBar) {
      if (totalGames) {
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

  async prepareBatch() {
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
        this.fetching = false;
        await this.startRun({ games, sourceLabel, profileId: startProfileId }, suggestedName);
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
        elo: this.app.currentElo || 1900,
        stockfish: this.app.stockfish,
        maiaEngine: this.app.maiaEngine,
        signal: controller.signal,
        isCancelled: () => this.cancelled || !current(),
        onProgress: progress => {
          if (!current() || this.cancelled) return;
          this.progress = progress;
          this.renderProgress();
        }
      });

      if (!current()) return;

      if (report.gameCount > 0) {
        const savedRecord = {
          id: report.id,
          profileId: report.profileId,
          sourceLabel: report.sourceLabel,
          playerName: report.playerName,
          gameCount: report.gameCount,
          analyzedGameIds: report.analyzedGameIds,
          analyzedMoves: report.analyzedMoves,
          eloFit: report.eloFit,
          closestElo: report.closestElo,
          screenElo: report.screenElo ?? (this.app.currentElo || 1900),
          phaseTraps: report.phaseTraps,
          topTrapIds: report.topTrapIds,
          topTraps: report.topTraps,
          partial: !!report.partial,
          createdAt: report.createdAt
        };
        this.history = [savedRecord, ...this.history.filter(item => item.id !== report.id)];
        this.applyHistoryContext();
        if (!this.scopedHistory.some(item => item.id === savedRecord.id)) {
          this.scopedHistory = [savedRecord, ...this.scopedHistory];
        }
        this.latestReport = savedRecord;
        this.fallbackReport = null;
        if (this.app.mistakeBank?.store) {
          await this.app.mistakeBank.store.saveCheckup(savedRecord);
          this.app.checkupReminders?.refresh();
        }
        if (!current()) return;
        this.renderReport(savedRecord);
        this.setStatus(report.partial ? t('checkupCancelledPartial') : t('checkupDone'));
      } else if (this.cancelled || report.partial) {
        this.setStatus(t('checkupCancelledEmpty'));
      } else {
        this.setStatus(t('checkupNoMatchedSide', { player: targetPlayer }));
      }
    } catch (err) {
      if (current()) this.setStatus(t('checkupRunFailed', { error: err.message }));
    } finally {
      this.runController = null;
      this.running = false;
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
      this.progress = { phase: 'cancelling' };
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
          this.renderReport(item);
        };
        this.historyHintEl.append(btn);
      }
    }

    if (!this.reportBox) return;
    this.reportBox.replaceChildren();
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
        opt.textContent = `${item.playerName} · ${formatSourceBadge(item.sourceLabel)}${rel ? ` (${rel})` : ''}`;
        if (item.id === report.id) opt.selected = true;
        select.append(opt);
      }
      select.onchange = () => {
        const picked = switcherList.find(item => item.id === select.value);
        if (picked) {
          this.latestReport = picked;
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
    }

    const phaseLine = document.createElement('p');
    phaseLine.className = 'checkup-phase-line';
    const phaseText = t('checkupPhaseBreakdown', {
      opening: report.phaseTraps?.opening || 0,
      middlegame: report.phaseTraps?.middlegame || 0,
      endgame: report.phaseTraps?.endgame || 0
    });
    phaseLine.textContent = Number.isFinite(report.screenElo)
      ? `${phaseText} · ${t('checkupScreenElo', { elo: report.screenElo })}`
      : phaseText;
    summary.append(phaseLine);
    this.reportBox.append(summary);

    const scopeTrap = (trap, activeId) => {
      if (trap.profileId === activeId && String(trap.id || '').startsWith(`${activeId}|`)) return trap;
      const playedUci = trap.playedUci || trap.uci;
      return { ...trap, profileId: activeId, id: trapId(activeId, trap.fenBefore, playedUci) };
    };

    const traps = report.topTraps || [];
    if (traps.length) {
      const list = document.createElement('div');
      list.className = 'checkup-top-traps';
      for (const trap of traps) {
        const row = document.createElement('div');
        row.className = 'checkup-trap-row';
        const main = document.createElement('div');
        main.className = 'checkup-trap-main';
        const left = document.createElement('strong');
        left.textContent = `${trap.moveNumber}${trap.turn === 'w' ? '. ' : '… '}${trap.playedSan} → ${trap.bestSan}`;
        const opp = [trap.source?.white, trap.source?.black].find(name => name && normalizeAlias(name) !== normalizeAlias(report.playerName)) || '';
        const sub = document.createElement('small');
        sub.textContent = [t(`bankPhase_${trap.phase || 'middlegame'}`), `-${(trap.eslLoss || 0).toFixed(1)}%`, opp ? `vs ${opp}` : '', trap.source?.date || ''].filter(Boolean).join(' · ');
        main.append(left, sub);
        const oneBtn = document.createElement('button');
        oneBtn.type = 'button';
        oneBtn.className = 'btn-header checkup-trap-practice-btn';
        oneBtn.textContent = t('checkupTrapPracticeOne');
        oneBtn.onclick = async () => {
          const bank = this.app.mistakeBank;
          const startGen = this.openGeneration;
          const activeId = bank?.activeProfile?.id || this.activeProfileId || report.profileId;
          if (report.profileId && report.profileId !== activeId) return;
          const scoped = scopeTrap(trap, activeId);
          if (bank) {
            await bank.store.upsertTrap(scoped);
            await bank.refreshState();
          }
          const currentId = bank?.activeProfile?.id || this.activeProfileId || report.profileId;
          if (!this.allowed() || !this.dialog?.open || startGen !== this.openGeneration || currentId !== activeId) return;
          this.close();
          bank?.startPracticeQueue([scoped], scoped);
        };
        row.append(main, oneBtn);
        list.append(row);
      }
      this.reportBox.append(list);

      const actions = document.createElement('div');
      actions.className = 'checkup-report-actions';

      const btnSaveTop = document.createElement('button');
      btnSaveTop.type = 'button';
      btnSaveTop.className = 'btn-header';
      btnSaveTop.textContent = t('checkupSaveTop', { count: traps.length });
      btnSaveTop.onclick = async () => {
        const bank = this.app.mistakeBank;
        if (!bank) return;
        const activeId = bank.activeProfile?.id || this.activeProfileId || report.profileId;
        if (report.profileId && report.profileId !== activeId) return;
        let added = 0;
        for (const trap of traps) {
          const res = await bank.store.upsertTrap(scopeTrap(trap, activeId));
          if (res?.added) added++;
        }
        await bank.refreshState();
        this.app.showToast?.(t('bankSavedBatchToast', { count: added }));
      };

      const btnPracticeTop = document.createElement('button');
      btnPracticeTop.type = 'button';
      btnPracticeTop.className = 'btn-header btn-primary';
      btnPracticeTop.textContent = t('checkupPracticeTop', { count: traps.length });
      btnPracticeTop.onclick = async () => {
        const bank = this.app.mistakeBank;
        const startGen = this.openGeneration;
        const activeId = bank?.activeProfile?.id || this.activeProfileId || report.profileId;
        if (report.profileId && report.profileId !== activeId) return;
        const scopedTraps = traps.map(trap => scopeTrap(trap, activeId));
        if (bank) {
          for (const trap of scopedTraps) await bank.store.upsertTrap(trap);
          await bank.refreshState();
        }
        const currentId = bank?.activeProfile?.id || this.activeProfileId || report.profileId;
        if (!this.allowed() || !this.dialog?.open || startGen !== this.openGeneration || currentId !== activeId) return;
        this.close();
        bank?.startPracticeQueue(scopedTraps, scopedTraps[0]);
      };

      actions.append(btnSaveTop, btnPracticeTop);
      this.reportBox.append(actions);
    }
  }
}
