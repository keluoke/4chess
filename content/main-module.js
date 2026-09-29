/**
 * Main Content Module for Maia-3 Chrome Extension (Scheme 0: Pure Standalone)
 * Coordinates BoardDetector, MaiaEngine, HeatmapOverlay, and IntuitionPanel.
 * 100% In-Browser execution without any external services or Python runtimes.
 */

import { MaiaEngine } from '../engine/maia-engine.js';
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { BoardDetector } from './board-detector.js';
import { HeatmapOverlay } from './heatmap-overlay.js';
import { IntuitionPanel } from './intuition-panel.js';
import { FairPlayGuard } from './fair-play-guard.js';

export async function initMaiaExtension() {
  console.log('[Maia-3] 🚀 Starting Human Intuition Extension (Scheme 0 Standalone)...');

  let currentFen = null;
  let currentOrientation = 'white';
  const overlay = new HeatmapOverlay();
  let panel = null;
  let detector = null;

  const engine = new MaiaEngine((status) => {
    if (panel) {
      panel.updateEngineStatus(status);
    }
  });

  const analyzer = new GameAnalyzer(engine.stockfishInBrowser, engine);

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
    onMoveHover: (moveUci) => {
      overlay.setHoverMove(moveUci);
    },
    onModelLoaded: async () => {
      try {
        await engine.reinitialize();
        if (currentFen) {
          await runPrediction(currentFen);
        }
      } catch (e) {
        console.error('[Maia-3] Re-init error:', e);
      }
    },
    onCdnSave: async (newUrl) => {
      console.log('[Maia-3] Custom CDN updated:', newUrl);
      try {
        await engine.reinitialize(newUrl);
        if (currentFen) {
          await runPrediction(currentFen);
        }
      } catch (e) {
        console.error('[Maia-3] Re-init error with custom CDN:', e);
      }
    },
    onOpenStandaloneAnalysis: async () => {
      if (FairPlayGuard.isLiveGameInProgress()) {
        panel.showToast(panel.lang === 'zh'
          ? '🔒 当前对局仍在进行中，为恪守公平竞技守则，请待对局结束后开启全盘分析。'
          : '🔒 Match in progress. Full game analysis will unlock after the game.');
        return;
      }

      panel.showToast(panel.lang === 'zh' ? '正在提取棋谱数据...' : 'Extracting game moves...');
      const platform = detector ? detector.platform : (window.location.hostname.includes('lichess') ? 'lichess' : 'chesscom');
      const moves = await GameAnalyzer.extractPageMoves(platform);

      if (!moves || moves.length === 0) {
        panel.showToast(panel.lang === 'zh' ? '未能从当前页面提取到棋谱，请确认棋盘上已有完赛步数。' : 'No moves could be extracted from page.');
        return;
      }

      let whitePlayer = '白方';
      let blackPlayer = '黑方';
      let gameResult = '*';

      try {
        if (platform === 'chesscom') {
          const wEl = document.querySelector('.board-layout-player.player-white .user-username-component, .player-component.player-white .user-username-component, .user-tagline-white .user-tagline-username');
          const bEl = document.querySelector('.board-layout-player.player-black .user-username-component, .player-component.player-black .user-username-component, .user-tagline-black .user-tagline-username');
          if (wEl?.textContent) whitePlayer = wEl.textContent.trim();
          if (bEl?.textContent) blackPlayer = bEl.textContent.trim();
        } else if (platform === 'lichess') {
          const wEl = document.querySelector('.game__meta__players .white .user-link, .ruser-top .user-link');
          const bEl = document.querySelector('.game__meta__players .black .user-link, .ruser-bottom .user-link');
          if (wEl?.textContent) whitePlayer = wEl.textContent.trim();
          if (bEl?.textContent) blackPlayer = bEl.textContent.trim();
        }
      } catch (e) {}

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

      const cleanReview = analyzer.lastReviewResult ? {
        totalMoves: analyzer.lastReviewResult.totalMoves,
        blundersCount: analyzer.lastReviewResult.blundersCount,
        mistakesCount: analyzer.lastReviewResult.mistakesCount,
        inaccuraciesCount: analyzer.lastReviewResult.inaccuraciesCount,
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
        url: window.location.href
      };

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'OPEN_ANALYSIS_TAB',
          gameData
        }, () => {
          panel.showToast(panel.lang === 'zh' ? '✓ 已在新标签页开启全盘分析' : '✓ Opened Full Game Analysis in new tab');
        });
      }
    }
  });

  // Notify initial status
  panel.updateEngineStatus(engine.status);

  let predictionEpoch = 0;

  async function runPrediction(fen, blunderContext = null, viewMode = 'decision') {
    const thisEpoch = ++predictionEpoch;
    const abortCheck = () => predictionEpoch !== thisEpoch;

    // Fair Play Iron Law: Strictly lock down during active live games
    if (FairPlayGuard.isLiveGameInProgress()) {
      overlay.clear();
      panel.setFairPlayLocked(true);
      predictionEpoch++;
      analyzer.cancel();
      if (engine.stockfishInBrowser?.isReady) {
        engine.stockfishInBrowser.stop();
      }
      return;
    } else {
      panel.setFairPlayLocked(false);
    }

    // Immediately wipe stale arrows and old evaluation so nothing lingers during transition!
    overlay.clear();
    panel.setEvaluating(fen);

    // Stop previous Stockfish evaluation to free up CPU, but NEVER interrupt an active full-game review
    if (engine.stockfishInBrowser?.isReady && !analyzer.isAnalyzing) {
      engine.stockfishInBrowser.stop();
    }

    // Yield 1 frame (16ms) to let browser finish rendering piece move animation and play audio
    await new Promise(r => setTimeout(r, 16));
    if (abortCheck()) return;

    const t0 = performance.now();
    try {
      if (FairPlayGuard.isLiveGameInProgress() || abortCheck()) return;

      // Phase 1: Instant Maia-3 Human Intuition (0 wait, non-blocking)
      const maiaResult = await engine.predict(fen, panel.currentElo, null, abortCheck);
      if (abortCheck() || !maiaResult || FairPlayGuard.isLiveGameInProgress()) return;

      const latency = performance.now() - t0;

      maiaResult.blunderContext = blunderContext;
      maiaResult.viewMode = viewMode;
      overlay.render(maiaResult);
      panel.update(maiaResult, latency);

      // If blunderContext is provided, display human-engine divergence insight banner
      if (blunderContext) {
        const isZh = panel.lang === 'zh';
        const isTrap = blunderContext.isHumanTrap || blunderContext.severity === 'blunder';
        const badgeText = isTrap
          ? (isZh ? '⚠️ 人机着法分歧 · 关键疑问手' : '⚠️ Human-Engine Divergence · Blunder')
          : (isZh ? '⚠️ 人机着法分歧' : '⚠️ Divergence');
        const sideText = blunderContext.turn === 'w' ? (isZh ? '白方' : 'White') : (isZh ? '黑方' : 'Black');
        const probText = blunderContext.humanProbability ? `${blunderContext.humanProbability}%` : null;

        panel.showCustomInsight({
          badge: badgeText,
          blunderInfo: blunderContext,
          isTrap
        });
      }

      // Phase 2: Asynchronous Background Stockfish Stream (never blocks Maia, mutually exclusive with review)
      if (engine.stockfishInBrowser.isReady && !FairPlayGuard.isLiveGameInProgress() && !abortCheck() && !analyzer.isAnalyzing) {
        engine.evaluateStockfishAsync(fen, (sfRes) => {
          if (abortCheck() || FairPlayGuard.isLiveGameInProgress() || !sfRes || analyzer.isAnalyzing) return;
          const combined = engine.attachStockfishResult(maiaResult, sfRes, panel.currentElo);
          combined.blunderContext = blunderContext;
          combined.viewMode = viewMode;
          overlay.render(combined);
          panel.update(combined, latency);

          if (blunderContext) {
            const isZh = panel.lang === 'zh';
            const isTrap = blunderContext.isHumanTrap || blunderContext.severity === 'blunder';
            const badgeText = isTrap
              ? (isZh ? '⚠️ 人机着法分歧 · 关键疑问手' : '⚠️ Human-Engine Divergence · Blunder')
              : (isZh ? '⚠️ 人机着法分歧' : '⚠️ Divergence');

            panel.showCustomInsight({
              badge: badgeText,
              blunderInfo: blunderContext,
              isTrap
            });
          }
        });
      }
    } catch (err) {
      console.error('[Maia-3] Prediction error:', err);
    }
  }

  // When Stockfish is ready, immediately compute best move if a position is on board
  engine.stockfishInBrowser.onReadyCallback = () => {
    engine.status.stockfish.state = 'ready';
    engine.notifyStatus();
    if (currentFen && !FairPlayGuard.isLiveGameInProgress()) {
      runPrediction(currentFen);
    }
  };

  // Lazy engine initialization: avoid eager 28MB download/WASM spin-up on homepages or active games
  let engineInitStarted = false;
  const ensureEngineInitialized = () => {
    if (engineInitStarted) return;
    if (FairPlayGuard.isLiveGameInProgress()) return;
    engineInitStarted = true;
    engine.initialize().then(() => {
      if (engine.stockfishInBrowser?.isReady) {
        console.log('[Maia-3] ✅ 双引擎 (Maia-3 + Stockfish) 均已就绪！');
      } else {
        console.log(`[Maia-3] ℹ️ Maia-3 已就绪 (Stockfish 状态: ${engine.status.stockfish.state})`);
      }
      if (currentFen && !FairPlayGuard.isLiveGameInProgress()) {
        runPrediction(currentFen);
      }
    }).catch(err => {
      console.warn('[Maia-3] Engine initialization notice:', err?.message || err);
    });
  };

  // If in safe environment on load (analysis/puzzles/study/post-game), initialize engine lazily
  if (!FairPlayGuard.isLiveGameInProgress()) {
    ensureEngineInitialized();
  }

  detector = new BoardDetector(async ({ fen, orientation, platform }) => {
    currentFen = fen;
    currentOrientation = orientation;
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
      if (engine.stockfishInBrowser?.isReady) {
        engine.stockfishInBrowser.stop();
      }
      return;
    } else {
      panel.setFairPlayLocked(false);
      ensureEngineInitialized();
    }

    // Immediately clear stale arrows and set evaluating state
    overlay.clear();
    panel.setEvaluating(fen);

    await runPrediction(fen);
  });

  detector.start();
  console.log('[Maia-3] Extension successfully hooked into analysis environment! ♟️');

  // Instant observer for Fair Play state transitions (e.g. game finishes or starts)
  const handleFairPlayChange = (isLive) => {
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
        if (engine.stockfishInBrowser?.isReady) {
          engine.stockfishInBrowser.stop();
        }
      } else {
        // Game concluded! Re-enable evaluation and ensure engine is initialized for post-game review
        ensureEngineInitialized();
        if (currentFen) {
          runPrediction(currentFen);
        }
      }
    }
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
          panel.close();
        }
        sendResponse({ closed: panel.isPanelClosed() });
      } else if (msg.type === 'GET_PANEL_STATE') {
        sendResponse({ closed: panel.isPanelClosed() });
      } else if (msg.type === 'OPEN_PANEL') {
        panel.open();
        sendResponse({ closed: false });
      } else if (msg.type === 'CLOSE_PANEL') {
        panel.close();
        sendResponse({ closed: true });
      } else if (msg.type === 'SET_ELO' && typeof msg.elo === 'number') {
        panel.setElo(msg.elo);
        sendResponse({ ok: true, elo: msg.elo });
      }
    });
  }
}
