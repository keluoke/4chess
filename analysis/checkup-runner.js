import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { ChessBoard } from '../engine/chess-core.js?v=20261025-v115';
import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261118-summary-ai';
import { expectedScore } from '../engine/review-policy.js?v=20261117-review-policy';
import { buildTrapRecord, detectPhase, normalizeAlias } from './study-store.js?v=20261118-v12-p0';
import { t } from './i18n.js?v=20261118-summary-ai';

export const CHECKUP_ELOS = [1100, 1500, 1900, 2200];
const MAX_FETCH_GAMES = 10;
const MAX_LOCAL_GAMES = 15;
const MAX_ELO_SAMPLES = 24;
const VERIFY_ROOT_MIN_DEPTH = 14;
const VERIFY_AFTER_MIN_DEPTH = 13;
const LOG_PROB_FLOOR = 1e-4;

export function parsePgnMeta(pgnText = '') {
  const read = tag => pgnText.match(new RegExp(`^\\[${tag}\\s+"([^"]*)"\\]`, 'im'))?.[1]?.trim() || '';
  return {
    white: read('White'),
    black: read('Black'),
    result: read('Result') || '*',
    date: read('Date'),
    url: read('Site').startsWith('http') ? read('Site') : ''
  };
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

  const aliasKeys = new Set((profile?.aliases || []).map(normalizeAlias).filter(Boolean));
  const aliasMatch = candidates.find(item => aliasKeys.has(item.key));
  return {
    suggestedName: aliasMatch?.name || candidates[0]?.name || '',
    matchedAlias: aliasMatch?.name || null,
    candidates
  };
}

export async function fetchLichessRecentGames(username, { max = MAX_FETCH_GAMES, signal, fetchImpl = fetch } = {}) {
  const clean = String(username || '').trim();
  if (!clean) throw new Error('Username is required');
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(clean)}?max=${max}&pgnInJson=true&clocks=false&evals=false&perfType=bullet,blitz,rapid,classical`;
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
          games.push({ pgn: item.pgn, meta: parsePgnMeta(item.pgn) });
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
    games.push({ pgn: item.pgn, meta: parsePgnMeta(item.pgn) });
    if (games.length >= max) break;
  }
  return games;
}

export async function fetchChesscomRecentGames(username, { max = MAX_FETCH_GAMES, signal, fetchImpl = fetch } = {}) {
  const clean = String(username || '').trim().toLowerCase();
  if (!clean) throw new Error('Username is required');
  const archResp = await fetchImpl(`https://api.chess.com/pub/player/${encodeURIComponent(clean)}/games/archives`, { signal });
  if (!archResp.ok) throw new Error(`Chess.com HTTP ${archResp.status}`);
  const archData = await archResp.json();
  const archives = Array.isArray(archData?.archives) ? archData.archives.slice(-2).reverse() : [];
  const games = [];
  for (const archiveUrl of archives) {
    const resp = await fetchImpl(archiveUrl, { signal });
    if (!resp.ok) continue;
    const data = await resp.json();
    const list = Array.isArray(data?.games) ? data.games.slice().reverse() : [];
    for (const item of list) {
      if (item.rules && item.rules !== 'chess') continue;
      if (!item.pgn) continue;
      const verdict = FairPlayGuard.verifyConcludedGame({ pgn: item.pgn, isFinished: true, status: 'finished' });
      if (!verdict.ok) continue;
      games.push({ pgn: item.pgn, meta: parsePgnMeta(item.pgn) });
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
  now = Date.now()
} = {}) {
  const targetKey = normalizeAlias(targetPlayer);
  if (!targetKey) throw new Error('Target player name is required');
  if (!stockfish || !maiaEngine) throw new Error('Engines are required');

  const emptyResult = (partial = true) => ({
    id: `checkup_${now}_${Math.random().toString(36).slice(2, 7)}`,
    profileId,
    sourceLabel,
    playerName: targetPlayer.trim(),
    gameCount: 0,
    analyzedMoves: 0,
    eloFit: Object.fromEntries(CHECKUP_ELOS.map(r => [r, 0])),
    closestElo: null,
    phaseTraps: { opening: 0, middlegame: 0, endgame: 0 },
    topTrapIds: [],
    topTraps: [],
    partial,
    createdAt: now
  });

  if (isCancelled()) return emptyResult(true);
  await stockfish.initialize?.();
  if (isCancelled()) return emptyResult(true);
  await maiaEngine.initialize?.();
  if (isCancelled()) return emptyResult(true);

  const batch = games.slice(0, MAX_LOCAL_GAMES);
  const phaseTraps = { opening: 0, middlegame: 0, endgame: 0 };
  const eloLogSums = Object.fromEntries(CHECKUP_ELOS.map(r => [r, 0]));
  const collectedTraps = [];
  let analyzedGames = 0;
  let analyzedMoves = 0;
  let eloSampleCount = 0;
  let partial = false;

  for (let gi = 0; gi < batch.length; gi++) {
    if (isCancelled()) { partial = true; break; }
    const entry = batch[gi];
    const meta = entry.meta || parsePgnMeta(entry.pgn || '');
    const wKey = normalizeAlias(meta.white);
    const bKey = normalizeAlias(meta.black);
    const userSide = wKey === targetKey ? 'w' : bKey === targetKey ? 'b' : null;
    if (!userSide) continue;

    const parsedMoves = GameAnalyzer.parsePgn(entry.pgn || '');
    if (!parsedMoves?.length) continue;
    const positions = GameAnalyzer.buildPositionChain(parsedMoves);
    if (!positions || positions.length <= 1) continue;

    onProgress({ gameIndex: gi + 1, totalGames: batch.length, analyzedMoves });

    let gameMoves = 0;
    let gameEloSamples = 0;
    const gameEloLogSums = Object.fromEntries(CHECKUP_ELOS.map(r => [r, 0]));
    const gamePhaseTraps = { opening: 0, middlegame: 0, endgame: 0 };
    const gameTraps = [];
    let gameCancelled = false;

    const historyFens = [positions[0].fen];
    for (let mi = 0; mi < positions.length - 1; mi++) {
      if (isCancelled()) { gameCancelled = true; break; }
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

      gameMoves++;
      const sfBefore = await stockfish.evaluate(fenBefore, 10, 4000, 2);
      if (isCancelled()) { gameCancelled = true; break; }
      const historySlice = historyFens.slice(0, -1).slice(-7);
      const maiaPred = await maiaEngine.predict(fenBefore, elo, sfBefore, isCancelled, historySlice);
      if (isCancelled()) { gameCancelled = true; break; }

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
            const pred = await maiaEngine.predict(fenBefore, r, sfBefore, isCancelled, historySlice);
            if (isCancelled()) { gameCancelled = true; break; }
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

      if (sfBefore?.bestMove && sfBefore.bestMove.uci !== move.uci && humanRawProb >= 0.12) {
        const sfAfter = await stockfish.evaluate(fenAfter, 10, 4000, 1);
        if (isCancelled()) { gameCancelled = true; break; }
        if (sfAfter && Number.isFinite(sfAfter.scoreCp)) {
          const playedScoreCp = -sfAfter.scoreCp;
          const screenEsl = Math.max(0, expectedScore(sfBefore.scoreCp) - expectedScore(playedScoreCp)) * 100;
          if (screenEsl >= 6) {
            const verifyRoot = await stockfish.evaluate(fenBefore, 14, 6000, 2);
            if (isCancelled()) { gameCancelled = true; break; }
            if (isReliableVerificationRoot(verifyRoot) && verifyRoot.bestMove.uci !== move.uci) {
              const verifyAfter = await stockfish.evaluate(fenAfter, 14, 6000, 1);
              if (isCancelled()) { gameCancelled = true; break; }
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
                  const trap = buildTrapRecord(enrichedMove, { elo }, { profileId, source: meta, now });
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
      historyFens.push(fenAfter);
    }

    if (gameCancelled) {
      partial = true;
      break;
    }

    analyzedGames++;
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
    analyzedMoves,
    eloFit,
    closestElo,
    phaseTraps,
    topTrapIds: topTraps.map(item => item.id),
    topTraps,
    partial,
    createdAt: now
  };
}

export class IntuitionCheckup {
  source = 'lichess';
  openGeneration = 0;
  fileReadGeneration = 0;
  running = false;
  pendingBatch = null;
  latestReport = null;

  constructor(app) {
    this.app = app;
    this.supported = typeof location === 'undefined' || location.protocol !== 'chrome-extension:';
    this.button = document.getElementById('btn-intuition-checkup');
    this.dialog = document.getElementById('checkup-dialog');
    this.closeBtn = document.getElementById('btn-close-checkup');
    this.sourceTabs = [...document.querySelectorAll('#checkup-dialog [data-checkup-source]')];
    this.usernameRow = document.getElementById('checkup-username-row');
    this.usernameInput = document.getElementById('checkup-username');
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
    this.btnCancelRun = document.getElementById('btn-checkup-cancel');
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

  syncVisibility() {
    if (this.button) this.button.hidden = !this.allowed();
  }

  bindEvents() {
    if (this.button) {
      this.button.hidden = !this.allowed();
      this.button.onclick = () => this.open();
    }
    if (this.closeBtn) this.closeBtn.onclick = () => this.close();
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
        if (this.running) return;
        this.source = tab.dataset.checkupSource || 'lichess';
        this.pendingBatch = null;
        this.renderSourceControls();
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
    if (this.running || !this.allowed() || !files?.length) return;
    const generation = this.openGeneration;
    const readToken = ++this.fileReadGeneration;
    const profileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    const texts = await Promise.all([...files].slice(0, MAX_LOCAL_GAMES).map(file => file.text()));
    const currentProfileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    if (readToken !== this.fileReadGeneration || generation !== this.openGeneration || profileId !== currentProfileId || this.running || !this.allowed()) {
      return;
    }
    this.source = 'local';
    this.pendingBatch = null;
    if (this.localPgnInput) this.localPgnInput.value = texts.join('\n\n').trim();
    this.renderSourceControls();
    if (autoPrepare) await this.prepareBatch();
  }

  async receiveDroppedPgn(text) {
    if (this.running || !this.allowed()) return;
    this.fileReadGeneration++;
    this.source = 'local';
    this.pendingBatch = null;
    if (this.localPgnInput) this.localPgnInput.value = String(text || '').trim();
    this.renderSourceControls();
    await this.prepareBatch();
  }

  async open() {
    if (!this.allowed() || !this.dialog) return;
    const generation = ++this.openGeneration;
    this.fileReadGeneration++;
    await this.app.mistakeBank?.ready;
    if (generation !== this.openGeneration || !this.allowed()) return;
    const profile = this.app.mistakeBank?.activeProfile;
    const profileId = profile?.id || 'default';
    if (this.activeProfileId && this.activeProfileId !== profileId) {
      this.latestReport = null;
      this.pendingBatch = null;
      this.setStatus('');
      if (this.localPgnInput) this.localPgnInput.value = '';
      if (this.confirmNameInput) this.confirmNameInput.value = '';
    }
    this.activeProfileId = profileId;
    if (this.pendingBatch && this.pendingBatch.profileId !== profileId) {
      this.pendingBatch = null;
    }
    if (this.usernameInput) {
      this.usernameInput.value = profile?.aliases?.[0] || '';
    }
    const history = profile ? await this.app.mistakeBank.store.listCheckups(profile.id) : [];
    if (generation !== this.openGeneration || !this.allowed()) return;
    this.latestReport = history[0] || null;
    this.renderSourceControls();
    this.renderReport(this.latestReport);
    if (!this.dialog.open) this.dialog.showModal();
    this.closeBtn?.focus();
  }

  close() {
    this.openGeneration++;
    this.cancelRun();
    if (this.dialog?.open) this.dialog.close();
  }

  renderSourceControls() {
    for (const tab of this.sourceTabs) {
      tab.setAttribute('aria-pressed', String(tab.dataset.checkupSource === this.source));
    }
    const isLocal = this.source === 'local';
    if (this.usernameRow) this.usernameRow.hidden = isLocal;
    if (this.localRow) this.localRow.hidden = !isLocal;
    if (this.confirmBox) this.confirmBox.hidden = !this.pendingBatch;
    if (this.progressBox) this.progressBox.hidden = !this.running;
    if (this.btnFetch) {
      this.btnFetch.disabled = this.running;
      this.btnFetch.textContent = t(isLocal ? 'checkupParseLocal' : 'checkupFetchGames');
    }
  }

  setStatus(text = '') {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  async prepareBatch() {
    if (this.running || !this.allowed()) return;
    const generation = this.openGeneration;
    const startProfileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
    this.abortController?.abort();
    const controller = this.abortController = new AbortController();
    this.setStatus('');
    this.pendingBatch = null;
    try {
      let games = [];
      let sourceLabel = 'local-pgn-batch';
      let suggestedName = '';
      if (this.source === 'local') {
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
        this.setStatus(t('checkupFetching'));
        games = this.source === 'lichess'
          ? await fetchLichessRecentGames(username, { signal: controller.signal })
          : await fetchChesscomRecentGames(username, { signal: controller.signal });
        sourceLabel = `${this.source}:${username}`;
        suggestedName = username;
      }

      const currentProfileId = this.app.mistakeBank?.activeProfile?.id || this.activeProfileId || 'default';
      if (generation !== this.openGeneration || startProfileId !== currentProfileId || !this.allowed()) return;

      if (!games.length) {
        this.setStatus(t('checkupNoGames'));
        this.renderSourceControls();
        return;
      }

      this.pendingBatch = { games, sourceLabel, profileId: currentProfileId };
      if (this.confirmPrompt) {
        this.confirmPrompt.textContent = t('checkupConfirmPerspective', { count: games.length });
      }
      if (this.confirmNameInput) {
        this.confirmNameInput.value = suggestedName;
      }
      this.setStatus('');
      this.renderSourceControls();
      if (this.source !== 'local' && suggestedName) {
        await this.startRun();
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        this.setStatus(t('checkupFetchFailed', { error: err.message }));
      }
    }
  }

  async startRun() {
    if (this.running || !this.allowed() || !this.pendingBatch) return;
    const targetPlayer = this.confirmNameInput?.value?.trim() || '';
    if (!targetPlayer) {
      this.setStatus(t('checkupNeedPlayerName'));
      return;
    }
    this.running = true;
    this.cancelled = false;
    const runGeneration = ++this.openGeneration;
    this.renderSourceControls();
    this.setStatus('');
    try {
      const profile = this.app.mistakeBank?.activeProfile;
      const report = await runIntuitionCheckup({
        games: this.pendingBatch.games,
        targetPlayer,
        profileId: profile?.id || 'default',
        sourceLabel: this.pendingBatch.sourceLabel,
        elo: this.app.currentElo || 1900,
        stockfish: this.app.stockfish,
        maiaEngine: this.app.maiaEngine,
        isCancelled: () => this.cancelled || !this.allowed() || runGeneration !== this.openGeneration,
        onProgress: ({ gameIndex, totalGames, analyzedMoves }) => {
          if (this.progressText) {
            this.progressText.textContent = t('checkupProgress', { current: gameIndex, total: totalGames, moves: analyzedMoves });
          }
        }
      });

      if (!this.allowed() || runGeneration !== this.openGeneration) return;

      if (report.gameCount > 0) {
        this.latestReport = report;
        if (this.app.mistakeBank?.store) {
          await this.app.mistakeBank.store.saveCheckup({
            id: report.id,
            profileId: report.profileId,
            sourceLabel: report.sourceLabel,
            playerName: report.playerName,
            gameCount: report.gameCount,
            analyzedMoves: report.analyzedMoves,
            eloFit: report.eloFit,
            closestElo: report.closestElo,
            phaseTraps: report.phaseTraps,
            topTrapIds: report.topTrapIds,
            topTraps: report.topTraps,
            partial: !!report.partial,
            createdAt: report.createdAt
          });
        }
        this.renderReport(report);
        this.setStatus(report.partial ? t('checkupCancelledPartial') : t('checkupDone'));
      } else if (this.cancelled || report.partial) {
        this.setStatus(t('checkupCancelledEmpty'));
      } else {
        this.setStatus(t('checkupNoMatchedSide', { player: targetPlayer }));
      }
    } catch (err) {
      this.setStatus(t('checkupRunFailed', { error: err.message }));
    } finally {
      this.running = false;
      this.renderSourceControls();
    }
  }

  cancelRun() {
    this.cancelled = true;
    this.abortController?.abort();
    if (this.running) {
      this.app.stockfish?.stop?.();
    }
  }

  renderReport(report) {
    if (!this.reportBox) return;
    this.reportBox.replaceChildren();
    if (!report) {
      this.reportBox.hidden = true;
      return;
    }
    this.reportBox.hidden = false;

    const summary = document.createElement('div');
    summary.className = 'checkup-summary-card';
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
      summary.append(eloGrid);
    }

    const phaseLine = document.createElement('p');
    phaseLine.className = 'checkup-phase-line';
    phaseLine.textContent = t('checkupPhaseBreakdown', {
      opening: report.phaseTraps?.opening || 0,
      middlegame: report.phaseTraps?.middlegame || 0,
      endgame: report.phaseTraps?.endgame || 0
    });
    summary.append(phaseLine);
    this.reportBox.append(summary);

    const traps = report.topTraps || [];
    if (traps.length) {
      const list = document.createElement('div');
      list.className = 'checkup-top-traps';
      for (const trap of traps) {
        const row = document.createElement('div');
        row.className = 'checkup-trap-row';
        const left = document.createElement('strong');
        left.textContent = `${trap.moveNumber}${trap.turn === 'w' ? '. ' : '… '}${trap.playedSan} → ${trap.bestSan}`;
        const right = document.createElement('span');
        right.textContent = `${t(`bankPhase_${trap.phase || 'middlegame'}`)} · -${(trap.eslLoss || 0).toFixed(1)}%`;
        row.append(left, right);
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
        const activeId = bank.activeProfile?.id || report.profileId;
        let added = 0;
        for (const trap of traps) {
          const scoped = trap.profileId === activeId ? trap : { ...trap, profileId: activeId };
          const res = await bank.store.upsertTrap(scoped);
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
        const activeId = bank?.activeProfile?.id || report.profileId;
        const scopedTraps = traps.map(trap => trap.profileId === activeId ? trap : { ...trap, profileId: activeId });
        if (bank) {
          for (const trap of scopedTraps) await bank.store.upsertTrap(trap);
          await bank.refreshState();
        }
        this.close();
        this.app.mistakeBank?.startPracticeQueue(scopedTraps, scopedTraps[0]);
      };

      actions.append(btnSaveTop, btnPracticeTop);
      this.reportBox.append(actions);
    }
  }
}
