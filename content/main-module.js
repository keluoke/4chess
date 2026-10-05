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
  let liveEvaluationEnabled = true;
  const overlay = new HeatmapOverlay();
  let panel = null;
  let detector = null;

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['liveEvaluation'], (res) => {
      if (res && typeof res.liveEvaluation === 'boolean') {
        liveEvaluationEnabled = res.liveEvaluation;
        overlay.setLiveEvaluation(liveEvaluationEnabled);
      }
    });
  }

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

      const cleanReview = analyzer.lastReviewResult ? {
        schemaVersion: analyzer.lastReviewResult.schemaVersion || 5,
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
    engine.status.stockfish.error = null;
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
      engineInitStarted = false;
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
        sendResponse({ closed: panel.isPanelClosed(), liveEvaluation: liveEvaluationEnabled });
      } else if (msg.type === 'OPEN_PANEL') {
        panel.open();
        sendResponse({ closed: false });
      } else if (msg.type === 'CLOSE_PANEL') {
        panel.close();
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
