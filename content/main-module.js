/**
 * Main Content Module for Maia-3 Chrome Extension
 * Coordinates BoardDetector, MaiaEngine, HeatmapOverlay, and IntuitionPanel.
 */

import { MaiaEngine } from '../engine/maia-engine.js';
import { BoardDetector } from './board-detector.js';
import { HeatmapOverlay } from './heatmap-overlay.js';
import { IntuitionPanel } from './intuition-panel.js';

export async function initMaiaExtension() {
  console.log('[Maia-3] Starting Human Intuition Extension...');

  const engine = new MaiaEngine();
  await engine.initialize();

  const overlay = new HeatmapOverlay();
  let currentFen = null;
  let currentOrientation = 'white';

  const panel = new IntuitionPanel({
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
      console.log('[Maia-3] Real ONNX model loaded! Refreshing predictions...');
      if (currentFen) {
        await runPrediction(currentFen);
      }
    }
  });

  async function runPrediction(fen) {
    const t0 = performance.now();
    try {
      const result = await engine.predict(fen, panel.currentElo);
      const latency = performance.now() - t0;

      overlay.render(result);
      panel.update(result, latency);
    } catch (err) {
      console.error('[Maia-3] Prediction error:', err);
    }
  }

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
}
