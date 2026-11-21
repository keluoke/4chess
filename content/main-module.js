/**
 * Main Content Module for Maia-3 Chrome Extension (Scheme 0: Pure Standalone)
 * Coordinates BoardDetector, MaiaEngine, HeatmapOverlay, and IntuitionPanel.
 * Browser-based inference; model downloads and public-game imports use network services.
 */

import { legalVariation } from '../engine/position-lines.js';
import { MaiaEngine } from '../engine/maia-engine.js';
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { BoardDetector } from './board-detector.js';
import { HeatmapOverlay } from './heatmap-overlay.js';
import { IntuitionPanel } from './intuition-panel.js';
import { FairPlayGuard } from './fair-play-guard.js';
import { readEnginePreferences } from '../engine/engine-preferences.js';

export async function initMaiaExtension() {
  console.log('[Maia-3] 🚀 Starting Human Intuition Extension (Scheme 0 Standalone)...');

  let currentFen = null;
  let currentOrientation = 'white';
  let liveEvaluationEnabled = true;
  const overlay = new HeatmapOverlay();
  let panel = null;
  let detector = null;
  let actionPath = '';
  let predictionEpoch = 0;
  let rootSearch = null;
  let engineInitStarted = false;
  let preferences = await readEnginePreferences();

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['liveEvaluation'], (res) => {
      if (res && typeof res.liveEvaluation === 'boolean') {
        liveEvaluationEnabled = res.liveEvaluation;
        overlay.setLiveEvaluation(liveEvaluationEnabled);
      }
    });
  }

  let engine = new MaiaEngine((status) => {
    if (panel) {
      panel.updateEngineStatus(status);
    }
  }, null, { variant: preferences.maiaVariant });

  let analyzer = new GameAnalyzer(engine.stockfishInBrowser, engine);

  panel = new IntuitionPanel({
    onEloChange: async (elo) => {
      engine.setElo(elo);
      if (currentFen) {
        await runPrediction(currentFen);
      }
    },
    onToggleChange: (toggles) => {
      overlay.setToggles(toggles);
    },
    onMoveHover: (moveUci, source, fen) => {
      overlay.setHoverMove(moveUci, source, fen);
    },
    onModelLoaded: async () => {
      if (FairPlayGuard.isLiveGameInProgress()) return;
      engineInitStarted = false;
      return ensureEngineInitialized();
    },
    onRetryEngine: async (name) => {
      if (FairPlayGuard.isLiveGameInProgress()) return;
      if (name === 'maia') {
        engineInitStarted = false;
        return ensureEngineInitialized();
      }
      const owner = engine;
      const retryEpoch = owner.lifecycleEpoch;
      owner.status.stockfish = { state: 'initializing', error: null };
      owner.notifyStatus();
      try {
        rootSearch = null;
        owner.stockfishInBrowser.reset();
        const ready = await owner.stockfishInBrowser.initialize();
        if (owner !== engine || owner.lifecycleEpoch !== retryEpoch || FairPlayGuard.isLiveGameInProgress()) return;
        if (!ready && !owner.stockfishInBrowser.isReady) throw new Error('Engine initialization failed');
        owner.status.stockfish = { state: 'ready', error: null };
        owner.notifyStatus();
        if (currentFen) await runPrediction(currentFen);
      } catch (error) {
        if (owner !== engine || owner.lifecycleEpoch !== retryEpoch || FairPlayGuard.isLiveGameInProgress()) return;
        owner.status.stockfish = { state: 'error', error: error?.message || String(error) };
        owner.notifyStatus();
        throw error;
      }
    },
    onCdnSave: async (newUrl) => {
      await applyEnginePreferences();
    },
    onOpenStandaloneAnalysis: async (mode = 'auto') => {
      if (FairPlayGuard.isLiveGameInProgress()) {
        panel.showToast(panel.lang === 'zh'
          ? '🔒 当前对局仍在进行中，为恪守公平竞技守则，请待对局结束后开启全盘分析。'
          : '🔒 Match in progress. Full game analysis will unlock after the game.');
        return;
      }

      const sourcePath = location.pathname;
      const gameSource = GameAnalyzer.gameSource(location);
      // Snapshot the displayed board now, before asynchronous PGN extraction.
      // A flip may have happened before the detector's debounced update.
      const hasSourceBoard = detector?.findBoard();
      if (hasSourceBoard) detector.detectOrientation();
      const openingOrientation = hasSourceBoard ? detector.orientation : currentFen ? currentOrientation : null;
      const openStudio = async gameData => {
        // Extraction and engine work may yield while a new live game starts.
        if (location.pathname !== sourcePath || FairPlayGuard.isLiveGameInProgress()) return;
        panel.setActionBusy('opening');
        if (!globalThis.chrome?.runtime?.sendMessage) throw new Error(panel.t('openFailed'));
        if (openingOrientation) gameData = { ...gameData, orientation: openingOrientation };
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'OPEN_ANALYSIS_TAB', gameData }, response => {
            const failure = chrome.runtime.lastError;
            if (failure || !response?.ok || !response.tabId) reject(new Error(panel.t('openFailed')));
            else resolve(response);
          });
        });
        panel.showToast(panel.t(gameData.fen ? 'positionOpened' : gameData.empty ? 'studioOpened' : 'gameOpened'));
      };
      if (mode === 'position' || mode === 'empty') {
        if (mode === 'empty') return openStudio({ empty: true, lang: panel.lang });
        const fen = hasSourceBoard ? detector.extractFen() : currentFen;
        if (!fen) throw new Error(panel.t('noMoves'));
        return openStudio({ fen, orientation: currentOrientation, lang: panel.lang });
      }

      panel.showToast(panel.lang === 'zh' ? '正在提取棋谱数据...' : 'Extracting game moves...');
      const platform = detector ? detector.platform : (window.location.hostname.includes('lichess') ? 'lichess' : 'chesscom');
      const moves = await GameAnalyzer.extractPageMoves();

      if (location.pathname !== sourcePath || FairPlayGuard.isLiveGameInProgress()) return;
      if (!moves?.length) throw new Error(panel.t('noMoves'));
      // An unfinished variation on a permitted study board is a position input,
      // never a fabricated completed PGN or an exception to the review guard.
      if (currentFen && (!moves.result || moves.result === '*') && /\/(analysis|editor|study|practice|puzzles|lessons|classroom)(\/|$)/.test(location.pathname)) {
        panel.setPositionContext(currentFen, 'position');
        return openStudio({ fen: currentFen, orientation: currentOrientation, lang: panel.lang });
      }

      let whitePlayer = moves.white || '白方';
      let blackPlayer = moves.black || '黑方';
      let gameResult = moves.result || '*';

      try {
        if (platform === 'chesscom' && (whitePlayer === '白方' || blackPlayer === '黑方')) {
          const extractName = (container) => {
            if (!container) return null;
            const el = container.querySelector(
              '[data-test-element="user-tagline-username"], ' +
              '[data-cy="user-tagline-username"], ' +
              '.user-username-component, ' +
              '.user-tagline-username, ' +
              'a.user-username-link, ' +
              'a[data-test="player-avatar-username"], ' +
              '.user-tagline-rating + a, ' +
              'a[href*="/member/"], ' +
              '.player-name, .user-name'
            );
            let name = el?.textContent?.trim() || null;
            if (name) {
              name = name.replace(/^(GM|WGM|IM|WIM|FM|WFM|CM|WCM|NM|WNM)\s+/i, '').trim();
            }
            return name;
          };

          // 1. Direct explicit white / black player container
          const wContainer = document.querySelector(
            '.board-layout-player.player-white, .player-component.player-white, [data-player-color="white"], .user-tagline-white, .game-over-player-white'
          );
          const bContainer = document.querySelector(
            '.board-layout-player.player-black, .player-component.player-black, [data-player-color="black"], .user-tagline-black, .game-over-player-black'
          );
          let wName = extractName(wContainer);
          let bName = extractName(bContainer);

          // 2. Spatial layout detection: top vs bottom container + flipped state
          if (!wName || !bName) {
            const topContainer = document.querySelector(
              '#board-layout-player-top, .board-layout-player.player-top, .board-layout-top, [data-cy="player-top"]'
            );
            const bottomContainer = document.querySelector(
              '#board-layout-player-bottom, .board-layout-player.player-bottom, .board-layout-bottom, [data-cy="player-bottom"]'
            );
            const boardEl = document.querySelector('wc-chess-board, chess-board, .board');
            const isFlipped = boardEl?.classList?.contains('flipped') ||
                              boardEl?.getAttribute('flipped') === 'true' ||
                              boardEl?.getAttribute('flipped') === '' ||
                              !!document.querySelector('wc-chess-board.flipped, chess-board.flipped, .board.flipped');

            const topName = extractName(topContainer);
            const bottomName = extractName(bottomContainer);

            if (isFlipped) {
              wName = wName || topName;
              bName = bName || bottomName;
            } else {
              wName = wName || bottomName;
              bName = bName || topName;
            }
          }

          // 3. Game over modal player elements
          if (!wName || !bName) {
            const modalPlayers = document.querySelectorAll(
              '.game-over-player-component, [class*="game-over-player"], .game-result-component'
            );
            if (modalPlayers.length >= 2) {
              const p1 = extractName(modalPlayers[0]);
              const p2 = extractName(modalPlayers[1]);
              wName = wName || p1;
              bName = bName || p2;
            }
          }

          if (wName) whitePlayer = wName;
          if (bName) blackPlayer = bName;
        } else if (platform === 'lichess' && (whitePlayer === '白方' || blackPlayer === '黑方')) {
          const wEl = document.querySelector('.game__meta__players .white .user-link, .game__meta__players .white, .ruser-top.white .user-link, .ruser-bottom.white .user-link');
          const bEl = document.querySelector('.game__meta__players .black .user-link, .game__meta__players .black, .ruser-top.black .user-link, .ruser-bottom.black .user-link');
          if (wEl?.textContent) whitePlayer = wEl.textContent.trim();
          if (bEl?.textContent) blackPlayer = bEl.textContent.trim();

          if (whitePlayer === '白方' || blackPlayer === '黑方') {
            const topEl = document.querySelector('.ruser-top .user-link, .ruser-top');
            const botEl = document.querySelector('.ruser-bottom .user-link, .ruser-bottom');
            const isFlipped = !!document.querySelector('.cg-wrap.orientation-black, .main-board.orientation-black');
            if (isFlipped) {
              if (whitePlayer === '白方' && topEl?.textContent) whitePlayer = topEl.textContent.trim();
              if (blackPlayer === '黑方' && botEl?.textContent) blackPlayer = botEl.textContent.trim();
            } else {
              if (whitePlayer === '白方' && botEl?.textContent) whitePlayer = botEl.textContent.trim();
              if (blackPlayer === '黑方' && topEl?.textContent) blackPlayer = topEl.textContent.trim();
            }
          }
        }
      } catch (e) {
        console.warn('[Maia-3] Error extracting players:', e);
      }

      const sanitizedMoves = (moves || []).map(m => ({
        ply: m.ply,
        moveNumber: m.moveNumber,
        turn: m.turn,
        san: m.san,
        uci: m.uci || null,
        from: m.from || null,
        to: m.to || null,
        element: null
      }));

      const review = analyzer.lastReviewResult;
      const expectedKey = GameAnalyzer.getGameKey(moves, { depth: review?.depth || 6, elo: panel.currentElo, engineKey: engine.stockfishInBrowser.engineKey, modelKey: engine.modelKey });
      const cleanReview = review?.gameKey === expectedKey ? {
        gameKey: review.gameKey,
        elo: review.elo,
        depth: review.depth,
        engineKey: review.engineKey,
        modelKey: review.modelKey,
        schemaVersion: analyzer.lastReviewResult.schemaVersion || GameAnalyzer.SCHEMA_VERSION,
        totalMoves: analyzer.lastReviewResult.totalMoves,
        blundersCount: analyzer.lastReviewResult.blundersCount,
        mistakesCount: analyzer.lastReviewResult.mistakesCount,
        inaccuraciesCount: analyzer.lastReviewResult.inaccuraciesCount,
        beyondIntuitionCount: analyzer.lastReviewResult.beyondIntuitionCount,
        intuitionTrapsCount: analyzer.lastReviewResult.intuitionTrapsCount,
        beyondWhiteCount: analyzer.lastReviewResult.beyondWhiteCount || 0,
        beyondBlackCount: analyzer.lastReviewResult.beyondBlackCount || 0,
        trapWhiteCount: analyzer.lastReviewResult.trapWhiteCount || 0,
        trapBlackCount: analyzer.lastReviewResult.trapBlackCount || 0,
        bookMovesCount: analyzer.lastReviewResult.bookMovesCount,
        accuracyWhite: analyzer.lastReviewResult.accuracyWhite,
        accuracyBlack: analyzer.lastReviewResult.accuracyBlack,
        coverageRateWhite: analyzer.lastReviewResult.coverageRateWhite,
        coverageRateBlack: analyzer.lastReviewResult.coverageRateBlack,
        postBookAccuracyWhite: analyzer.lastReviewResult.postBookAccuracyWhite,
        postBookAccuracyBlack: analyzer.lastReviewResult.postBookAccuracyBlack,
        maxLossWhite: analyzer.lastReviewResult.maxLossWhite,
        maxLossBlack: analyzer.lastReviewResult.maxLossBlack,
        acplWhite: analyzer.lastReviewResult.acplWhite,
        acplBlack: analyzer.lastReviewResult.acplBlack,
        allMoves: (analyzer.lastReviewResult.allMoves || []).map(m => ({ ...m, element: null })),
        keyMoments: (analyzer.lastReviewResult.keyMoments || []).map(m => ({ ...m, element: null }))
      } : null;

      const gameData = {
        moves: sanitizedMoves,
        cachedReview: cleanReview,
        white: whitePlayer,
        black: blackPlayer,
        result: gameResult,
        pgn: moves.rawPgn || null,
        url: gameSource?.platform === 'lichess' ? `https://lichess.org/${gameSource.id}` : window.location.href,
        lang: panel.lang || 'zh'
      };

      return openStudio(gameData);
    }
  });

  // Notify initial status
  panel.updateEngineStatus(engine.status);
  panel.setEnginePreferences(preferences);

  async function runPrediction(fen, blunderContext = null, viewMode = 'decision') {
    const thisEpoch = ++predictionEpoch;
    const owner = engine;
    const elo = panel.currentElo;
    const path = location.pathname;
    const abortCheck = () => predictionEpoch !== thisEpoch;

    // Fair Play Iron Law: Strictly lock down during active live games
    if (FairPlayGuard.isLiveGameInProgress()) {
      overlay.clear();
      panel.setFairPlayLocked(true);
      predictionEpoch++;
      rootSearch = null;
      analyzer.cancel();
      engine.suspendForFairPlay();
      engineInitStarted = false;
      return;
    } else {
      panel.setFairPlayLocked(false);
    }

    // Immediately wipe stale arrows and old evaluation so nothing lingers during transition!
    overlay.clear();
    panel.setEvaluating(fen);

    if (rootSearch?.owner !== owner || rootSearch.fen !== fen || rootSearch.path !== path)
      rootSearch = null;
    // Keep a pending root search for the same position, including across an Elo change.
    if (!rootSearch?.pending && owner.stockfishInBrowser.isReady && !analyzer.isAnalyzing)
      owner.stockfishInBrowser.stop();

    // Yield 1 frame (16ms) to let browser finish rendering piece move animation and play audio
    await new Promise(r => setTimeout(r, 16));
    if (abortCheck()) return;

    const started = performance.now();
    const invalid = () => abortCheck() || owner !== engine || elo !== panel.currentElo ||
      path !== location.pathname || FairPlayGuard.isLiveGameInProgress();
    const canSearch = () => !invalid() && !analyzer.isAnalyzing && owner.stockfishInBrowser.isReady;
    let sf = null, maia = null;
    let waitingForStockfish = canSearch(), waitingForMaia = true;
    const publish = (maiaTopEstimate = null) => {
      if (invalid() || (sf && analyzer.isAnalyzing)) return;
      const prediction = maia || { isAvailable: false, moves: [], turn: fen.split(' ')[1] };
      const data = owner.attachStockfishResult(prediction, sf, elo);
      const combined = {
        ...data, fen, stockfish: sf, status: owner.status, blunderContext, viewMode,
        maiaTopEstimate, waitingForStockfish, waitingForMaia
      };
      overlay.render(combined);
      panel.update(combined, performance.now() - started);
      if (blunderContext) {
        const isTrap = blunderContext.isHumanTrap || blunderContext.severity === 'blunder';
        const badge = panel.lang === 'zh' ? (isTrap ? '人机着法分歧 · 关键疑问手' : '人机着法分歧') :
          (isTrap ? 'Human–engine divergence · Blunder' : 'Human–engine divergence');
        panel.showCustomInsight({ badge, blunderInfo: blunderContext, isTrap });
      }
    };

    const stockfish = async () => {
      try {
        if (!canSearch()) return;
        if (!rootSearch) {
          const request = { owner, path, fen, pending: true };
          rootSearch = request;
          request.result = owner.evaluateStockfishAsync(fen).then(result => {
            request.pending = false;
            if (!result && rootSearch === request) rootSearch = null;
            return result;
          }, error => {
            if (rootSearch === request) rootSearch = null;
            throw error;
          });
        }
        const result = await rootSearch.result;
        if (canSearch()) sf = result;
      } finally {
        waitingForStockfish = false;
        if (sf || maia) publish();
      }
    };
    const predict = async () => {
      try { maia = await owner.predict(fen, elo, null, invalid); }
      finally {
        waitingForMaia = false;
        if (sf || maia) publish();
      }
    };
    const results = await Promise.allSettled([stockfish(), predict()]);
    for (const result of results) {
      if (result.status === 'rejected' && !invalid())
        console.warn('[Diverge] Position analysis failed:', result.reason);
    }

    if (!sf && !maia) publish();
    const top = maia?.moves?.[0];
    if (!canSearch()) return;
    if (!sf?.bestMove || !top || top.uci === sf.bestMove.uci ||
        sf.lines?.some(line => line.uci === top.uci) ||
        sf.isBound || sf.isMate || !(sf.depth >= 8) || !Number.isFinite(sf.scoreCp)) return;
    const [move] = legalVariation(fen, [top.uci], 1);
    if (!move) return;

    // Let quick navigation settle before borrowing the single Stockfish worker.
    await new Promise(resolve => setTimeout(resolve, 180));
    if (!canSearch()) return;
    try {
      const depth = sf.depth - 1;
      const estimate = await owner.stockfishInBrowser.evaluate(move.fen, depth, 850);
      if (!canSearch() || !estimate || estimate.isBound || estimate.isMate ||
          (!estimate.terminal && estimate.depth < depth) || !Number.isFinite(estimate.scoreCp)) return;
      const loss = sf.scoreCp + estimate.scoreCp;
      if (loss >= 0) publish({ uci: top.uci, deltaCp: -loss });
    } catch (error) {
      if (!invalid()) console.warn('[Diverge] Candidate estimate failed:', error);
    }
  }

  // When Stockfish is ready, immediately compute best move if a position is on board
  function wireStockfishReady() {
    const owner = engine;
    owner.stockfishInBrowser.onReadyCallback = () => {
      if (owner !== engine) return;
      owner.status.stockfish.state = 'ready';
      owner.status.stockfish.error = null;
      owner.notifyStatus();
      if (currentFen && !FairPlayGuard.isLiveGameInProgress()) runPrediction(currentFen);
    };
  }
  wireStockfishReady();

  // Lazy engine initialization: avoid eager 28MB download/WASM spin-up on homepages or active games
  const ensureEngineInitialized = () => {
    if (engineInitStarted || !currentFen) return;
    if (FairPlayGuard.isLiveGameInProgress()) return;
    engineInitStarted = true;
    const owner = engine;
    return engine.initialize(preferences.cloudflareCdnUrl).then(() => {
      if (owner !== engine) return;
      if (engine.stockfishInBrowser?.isReady) {
        console.log('[Maia-3] ✅ 双引擎 (Maia-3 + Stockfish) 均已就绪！');
      } else {
        console.log(`[Maia-3] ℹ️ Maia-3 已就绪 (Stockfish 状态: ${engine.status.stockfish.state})`);
      }
      if (currentFen && !FairPlayGuard.isLiveGameInProgress()) {
        runPrediction(currentFen);
      }
    }).catch(err => {
      if (owner !== engine) return;
      console.warn('[Maia-3] Engine initialization notice:', err?.message || err);
      engineInitStarted = false;
    });
  };

  async function applyEnginePreferences() {
    const next = await readEnginePreferences();
    const changed = next.maiaVariant !== preferences.maiaVariant || next.cloudflareCdnUrl !== preferences.cloudflareCdnUrl;
    preferences = next;
    panel.setEnginePreferences(next);
    if (!changed) return;
    predictionEpoch++;
    analyzer.cancel();
    overlay.clear();
    engine.dispose();
    engine.stockfishInBrowser.reset();
    const fresh = new MaiaEngine(status => { if (engine === fresh) panel.updateEngineStatus(status); }, null, { variant: next.maiaVariant });
    engine = fresh;
    engine.setElo(panel.currentElo);
    analyzer = new GameAnalyzer(engine.stockfishInBrowser, engine);
    engineInitStarted = false;
    wireStockfishReady();
    panel.updateEngineStatus(engine.status);
    if (currentFen && !FairPlayGuard.isLiveGameInProgress()) {
      panel.setEvaluating(currentFen);
      ensureEngineInitialized();
    }
  }

  // If in safe environment on load (analysis/puzzles/study/post-game), initialize engine lazily
  if (!FairPlayGuard.isLiveGameInProgress()) {
    ensureEngineInitialized();
  }

  function syncPositionContext() {
    if (actionPath !== location.pathname) panel.container.querySelector('#panel-action-recovery').hidden = true;
    actionPath = location.pathname;
    const practiceBoard = /^\/(editor|practice|puzzles|training|lessons|classroom|drills)(\/|$)/.test(actionPath);
    const studyBoard = /^\/(analysis|study)(\/|$)/.test(actionPath);
    const notation = studyBoard && document.querySelector('.vertical-move-list move, .move-list move, .move-list-row, kwdb, .tview2 move, .analyse__moves move');
    const positionOnly = !GameAnalyzer.gameSource(location) && (practiceBoard || (studyBoard && !notation));
    panel.setPositionContext(currentFen, positionOnly ? 'position' : 'auto');
  }

  detector = new BoardDetector(async ({ fen, orientation }) => {
    currentFen = fen;
    currentOrientation = orientation;
    syncPositionContext();
    if (typeof window !== 'undefined') {
      window.__MAIA_CURRENT_FEN__ = fen;
    }

    // Attach overlay to current board container
    if (detector.containerEl) {
      overlay.attach(detector.containerEl, orientation);
    } else if (detector.boardEl) {
      overlay.attach(detector.boardEl, orientation);
    }

    // Fair Play check on position change
    if (FairPlayGuard.isLiveGameInProgress()) {
      overlay.clear();
      panel.setFairPlayLocked(true);
      predictionEpoch++;
      analyzer.cancel();
      engine.suspendForFairPlay();
      rootSearch = null;
      engineInitStarted = false;
      return;
    } else {
      panel.setFairPlayLocked(false);
      ensureEngineInitialized();
    }

    await runPrediction(fen);
  });

  detector.start();
  console.log('[Maia-3] Extension successfully hooked into analysis environment! ♟️');

  // Instant observer for Fair Play state transitions (e.g. game finishes or starts)
  const handleFairPlayChange = (isLive) => {
    if (currentFen && actionPath !== location.pathname) syncPositionContext();
    if (isLive !== panel.isFairPlayLocked) {
      panel.setFairPlayLocked(isLive);
      if (isLive) {
        // Increment predictionEpoch to IMMEDIATELY abort any in-flight asynchronous evaluation
        predictionEpoch++;
        // Immediately abort any full-game review in progress
        analyzer.cancel();
        // Immediately clear board visuals
        overlay.clear();
        // Immediately stop Stockfish engine
        engine.suspendForFairPlay();
        rootSearch = null;
        engineInitStarted = false;
      } else {
        // Game concluded! Re-enable evaluation and ensure engine is initialized for post-game review
        ensureEngineInitialized();
        if (currentFen) {
          runPrediction(currentFen);
        }
      }
    }
    panel.setFairPlayLocked(isLive);
  };

  FairPlayGuard.startObserver(handleFairPlayChange);
  setInterval(() => handleFairPlayChange(FairPlayGuard.isLiveGameInProgress()), 250);

  // Handle runtime messages from Popup
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'TOGGLE_PANEL') {
        if (panel.isPanelClosed()) {
          panel.open();
        } else {
          panel.hide();
        }
        sendResponse({ closed: panel.isPanelClosed() });
      } else if (msg.type === 'GET_PANEL_STATE') {
        sendResponse({ closed: panel.isPanelClosed(), liveEvaluation: liveEvaluationEnabled });
      } else if (msg.type === 'OPEN_PANEL') {
        panel.open();
        sendResponse({ closed: false });
      } else if (msg.type === 'CLOSE_PANEL') {
        panel.hide();
        sendResponse({ closed: true });
      } else if (msg.type === 'SET_ELO' && typeof msg.elo === 'number') {
        panel.setElo(msg.elo);
        sendResponse({ ok: true, elo: msg.elo });
      } else if (msg.type === 'SET_LIVE_EVAL') {
        liveEvaluationEnabled = Boolean(msg.enabled);
        overlay.setLiveEvaluation(liveEvaluationEnabled);
        if (liveEvaluationEnabled && currentFen) {
          runPrediction(currentFen);
        }
        sendResponse({ ok: true, enabled: liveEvaluationEnabled });
      }
    });
  }

  // Synchronize live evaluation toggle from chrome.storage changes
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.maia3_lang && changes.maia3_lang.newValue !== panel.lang) panel.setLanguage(changes.maia3_lang.newValue);
        if (changes.defaultElo && changes.defaultElo.newValue !== panel.currentElo) panel.setElo(changes.defaultElo.newValue);
        if (changes.showHeatmap || changes.showArrows || changes.showStockfishArrows) {
          for (const key of ['showHeatmap', 'showArrows', 'showStockfishArrows']) if (changes[key]) panel[key] = changes[key].newValue;
          panel.syncStudyChrome();
          overlay.setToggles({ showHeatmap: panel.showHeatmap, showArrows: panel.showArrows, showStockfishArrows: panel.showStockfishArrows });
        }
      }
      if (area === 'local' && (changes.maiaVariant || changes.stockfishVariant || changes.cloudflareCdnUrl)) applyEnginePreferences();
      if (area === 'local' && changes.liveEvaluation) {
        liveEvaluationEnabled = Boolean(changes.liveEvaluation.newValue);
        overlay.setLiveEvaluation(liveEvaluationEnabled);
        if (liveEvaluationEnabled && currentFen) {
          runPrediction(currentFen);
        }
      }
    });
  }
}
