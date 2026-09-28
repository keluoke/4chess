/**
 * Main Content Module for Maia-3 Chrome Extension (Scheme 0: Pure Standalone)
 * Coordinates BoardDetector, MaiaEngine, HeatmapOverlay, and IntuitionPanel.
 * 100% In-Browser execution without any external services or Python runtimes.
 */

import { MaiaEngine } from '../engine/maia-engine.js';
import { BoardDetector } from './board-detector.js';
import { HeatmapOverlay } from './heatmap-overlay.js';
import { IntuitionPanel } from './intuition-panel.js';

export async function initMaiaExtension() {
  console.log('[Maia-3] 🚀 Starting Human Intuition Extension (Scheme 0 Standalone)...');

  let currentFen = null;
  let currentOrientation = 'white';
  const overlay = new HeatmapOverlay();
  let panel = null;

  const engine = new MaiaEngine((status) => {
    if (panel) {
      panel.updateEngineStatus(status);
    }
  });

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
    }
  });

  // Notify initial status
  panel.updateEngineStatus(engine.status);

  let predictionEpoch = 0;

  async function runPrediction(fen) {
    const thisEpoch = ++predictionEpoch;
    const abortCheck = () => predictionEpoch !== thisEpoch;

    // Stop previous Stockfish evaluation to free up CPU
    if (engine.stockfishInBrowser?.isReady) {
      engine.stockfishInBrowser.stop();
    }

    // Yield 1 frame (16ms) to let browser finish rendering piece move animation and play audio
    await new Promise(r => setTimeout(r, 16));
    if (abortCheck()) return;

    const t0 = performance.now();
    try {
      // Phase 1: Instant Maia-3 Human Intuition (0 wait, non-blocking)
      const maiaResult = await engine.predict(fen, panel.currentElo, null, abortCheck);
      if (abortCheck() || !maiaResult) return;

      const latency = performance.now() - t0;

      overlay.render(maiaResult);
      panel.update(maiaResult, latency);

      // Phase 2: Asynchronous Background Stockfish Stream (never blocks Maia)
      if (engine.stockfishInBrowser.isReady) {
        engine.evaluateStockfishAsync(fen, (sfRes) => {
          if (!abortCheck() && sfRes) {
            const combined = engine.attachStockfishResult(maiaResult, sfRes, panel.currentElo);
            overlay.render(combined);
            panel.update(combined, latency);
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

  const detector = new BoardDetector(async ({ fen, orientation, platform }) => {
    currentFen = fen;
    currentOrientation = orientation;

    // Attach overlay to current board container
    if (detector.containerEl) {
      overlay.attach(detector.containerEl, orientation);
    } else if (detector.boardEl) {
      overlay.attach(detector.boardEl, orientation);
    }

    await runPrediction(fen);
  });

  detector.start();
  console.log('[Maia-3] Extension successfully hooked into analysis environment! ♟️');

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
      }
    });
  }
}
