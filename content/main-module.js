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
    onAnalyzeGame: async (forceRefresh = false) => {
      if (FairPlayGuard.isLiveGameInProgress()) {
        throw new Error(panel.lang === 'zh'
          ? '🛡️ 当前对局仍在进行中！根据公平竞技铁律，严禁在对局中提供任何引擎与复盘服务。请待对局完全结束后再复盘。'
          : '🛡️ Live game active! Per Fair Play rules, engine review is disabled during live games.');
      }
      const platform = detector ? detector.platform : (window.location.hostname.includes('lichess') ? 'lichess' : 'chesscom');
      const moves = await GameAnalyzer.extractPageMoves(platform);
      if (!moves || moves.length === 0) {
        throw new Error(panel.lang === 'zh' ? '当前页面未检测到棋步记录，请在对局或复盘页面使用。' : 'No move list detected on current page.');
      }
      const reviewResult = await analyzer.analyzeGame(moves, {
        depth: 6,
        elo: panel.currentElo,
        forceRefresh,
        onProgress: (prog) => {
          if (FairPlayGuard.isLiveGameInProgress()) {
            analyzer.cancel();
            return;
          }
          panel.updateReviewProgress(prog);
        }
      });

      if (FairPlayGuard.isLiveGameInProgress()) {
        throw new Error(panel.lang === 'zh'
          ? '🛡️ 当前对局仍在进行中！根据公平竞技铁律，严禁在对局中提供任何引擎与复盘服务。请待对局完全结束后再复盘。'
          : '🛡️ Live game active! Per Fair Play rules, engine review is disabled during live games.');
      }

      return reviewResult;
    },
    onCancelReview: () => {
      analyzer.cancel();
    },
    onJumpToMove: (item, targetPly = null) => {
      GameAnalyzer.jumpToMove(item, targetPly);
    },
    onSelectBlunder: async (results, index, moments, viewMode = 'decision') => {
      const item = moments[index];
      if (!item) return;
      activeDrill = { results, index, item, viewMode };

      const targetPly = viewMode === 'result' ? item.ply : Math.max(0, item.ply - 1);
      const targetFen = viewMode === 'result' ? item.fenAfter : item.fenBefore;

      GameAnalyzer.jumpToMove(item, targetPly);

      if (targetFen) {
        currentFen = targetFen;
        await runPrediction(targetFen, item, viewMode);
      }
    },
    onClearBlunderDrill: () => {
      activeDrill = null;
    }
  });

  // Notify initial status
  panel.updateEngineStatus(engine.status);

  let activeDrill = null;
  let predictionEpoch = 0;

  async function runPrediction(fen, blunderContext = null, viewMode = 'decision') {
    const thisEpoch = ++predictionEpoch;
    const abortCheck = () => predictionEpoch !== thisEpoch;

    // Fair Play Iron Law: Strictly lock down during active live games
    if (FairPlayGuard.isLiveGameInProgress()) {
      overlay.clear();
      panel.setFairPlayLocked(true);
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

    // Stop previous Stockfish evaluation to free up CPU
    if (engine.stockfishInBrowser?.isReady) {
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

        const insightHtml = isZh
          ? `实战<strong>${sideText}</strong>走棋: <strong style="color: #FA5151;">${blunderContext.san}</strong>${probText ? ` (直觉概率 <strong>${probText}</strong>)` : ''}，而引擎推荐最优走法为 <strong style="color: var(--weui-BRAND);">${blunderContext.bestSan}</strong>。<br/>` +
            `局面损耗: <strong style="color: #FA5151;">${blunderContext.lossPawns}</strong> 兵 (局势变动: ${blunderContext.evalBefore} ➔ ${blunderContext.evalAfter})`
          : `Played by <strong>${sideText}</strong>: <strong style="color: #FA5151;">${blunderContext.san}</strong>${probText ? ` (Intuition: <strong>${probText}</strong>)` : ''}, while Engine recommends <strong style="color: var(--weui-BRAND);">${blunderContext.bestSan}</strong>.<br/>` +
            `Centipawn loss: <strong style="color: #FA5151;">${blunderContext.lossPawns}</strong> (${blunderContext.evalBefore} ➔ ${blunderContext.evalAfter})`;

        panel.showCustomInsight({
          badge: badgeText,
          text: insightHtml,
          isTrap
        });
      }

      // Phase 2: Asynchronous Background Stockfish Stream (never blocks Maia)
      if (engine.stockfishInBrowser.isReady && !FairPlayGuard.isLiveGameInProgress() && !abortCheck()) {
        engine.evaluateStockfishAsync(fen, (sfRes) => {
          if (abortCheck() || FairPlayGuard.isLiveGameInProgress() || !sfRes) return;
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
            const sideText = blunderContext.turn === 'w' ? (isZh ? '白方' : 'White') : (isZh ? '黑方' : 'Black');
            const probText = blunderContext.humanProbability ? `${blunderContext.humanProbability}%` : null;

            const insightHtml = isZh
              ? `实战<strong>${sideText}</strong>走棋: <strong style="color: #FA5151;">${blunderContext.san}</strong>${probText ? ` (直觉概率 <strong>${probText}</strong>)` : ''}，而引擎推荐最优走法为 <strong style="color: var(--weui-BRAND);">${blunderContext.bestSan}</strong>。<br/>` +
                `局面损耗: <strong style="color: #FA5151;">${blunderContext.lossPawns}</strong> 兵 (局势变动: ${blunderContext.evalBefore} ➔ ${blunderContext.evalAfter})`
              : `Played by <strong>${sideText}</strong>: <strong style="color: #FA5151;">${blunderContext.san}</strong>${probText ? ` (Intuition: <strong>${probText}</strong>)` : ''}, while Engine recommends <strong style="color: var(--weui-BRAND);">${blunderContext.bestSan}</strong>.<br/>` +
                `Centipawn loss: <strong style="color: #FA5151;">${blunderContext.lossPawns}</strong> (${blunderContext.evalBefore} ➔ ${blunderContext.evalAfter})`;

            panel.showCustomInsight({
              badge: badgeText,
              text: insightHtml,
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
    if (currentFen) {
      runPrediction(currentFen);
    }
  };

  // Start dual-engine initialization asynchronously
  engine.initialize().then(() => {
    console.log('[Maia-3] ✅ Dual Engine (Maia 3 + Stockfish) fully ready in browser!');
    if (currentFen) {
      runPrediction(currentFen);
    }
  }).catch(err => {
    console.warn('[Maia-3] Engine initialization notice:', err?.message || err);
  });

  detector = new BoardDetector(async ({ fen, orientation, platform }) => {
    currentFen = fen;
    currentOrientation = orientation;

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
      if (engine.stockfishInBrowser?.isReady) {
        engine.stockfishInBrowser.stop();
      }
      return;
    } else {
      panel.setFairPlayLocked(false);
    }

    // Blunder drill synchronization with board detector
    if (activeDrill && activeDrill.item) {
      const fenBoard = fen.split(' ')[0];
      const beforeBoard = activeDrill.item.fenBefore ? activeDrill.item.fenBefore.split(' ')[0] : null;
      const afterBoard = activeDrill.item.fenAfter ? activeDrill.item.fenAfter.split(' ')[0] : null;

      if (fenBoard === beforeBoard) {
        await runPrediction(fen, activeDrill.item, 'decision');
        return;
      } else if (fenBoard === afterBoard) {
        await runPrediction(fen, activeDrill.item, 'result');
        return;
      } else {
        // User manually navigated away from the blunder drill position!
        activeDrill = null;
        panel.clearBlunderDrill();
      }
    }

    // Immediately clear stale arrows and set evaluating state
    overlay.clear();
    panel.setEvaluating(fen);

    await runPrediction(fen);
  });

  detector.start();
  console.log('[Maia-3] Extension successfully hooked into analysis environment! ♟️');

  // Instant 0ms observer for Fair Play state transitions (e.g. game finishes or starts)
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
      } else if (currentFen) {
        // Game concluded! Re-enable evaluation for post-game review
        runPrediction(currentFen);
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
