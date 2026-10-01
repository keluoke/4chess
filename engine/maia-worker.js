/**
 * Maia-3 Dedicated Web Worker
 * Offloads Chessformer neural network inference from the main UI thread.
 * Guarantees 60FPS fluid animations, seamless scrolling, and zero UI stuttering
 * during full-game blunder review and position analysis.
 */

import { ChessBoard } from './chess-core.js';
import { MaiaInBrowserEngine } from './maia-inbrowser.js';

const engine = new MaiaInBrowserEngine();
let activeRequestId = 0;

self.onmessage = async (e) => {
  const { type, id, data } = e.data || {};

  switch (type) {
    case 'loadModel': {
      try {
        await engine.loadModel(data?.url, (prog) => {
          self.postMessage({ type: 'progress', data: prog });
        });
        self.postMessage({ type: 'loadModel_result', success: true });
      } catch (err) {
        self.postMessage({
          type: 'loadModel_result',
          success: false,
          error: err?.message || String(err)
        });
      }
      break;
    }

    case 'reset': {
      engine.reset();
      self.postMessage({ type: 'reset_result', success: true });
      break;
    }

    case 'predict': {
      activeRequestId = id;
      const { fen, elo, history } = data || {};

      try {
        const chess = new ChessBoard(fen);
        if (!chess.isValid) {
          self.postMessage({
            type: 'predict_result',
            id,
            result: null,
            error: 'Invalid FEN'
          });
          return;
        }

        const abortCheck = () => id !== activeRequestId;
        const res = await engine.predict(chess, elo, abortCheck, history);

        if (id !== activeRequestId) {
          // Newer request superseded this one; discard silently
          return;
        }

        if (res && res.heatmap) {
          // Transfer the Float32Array buffer with zero memory copy
          const heatmap = res.heatmap;
          self.postMessage({
            type: 'predict_result',
            id,
            result: {
              moves: res.moves,
              heatmap,
              latencyMs: res.latencyMs
            }
          }, [heatmap.buffer]);
        } else {
          self.postMessage({
            type: 'predict_result',
            id,
            result: res
          });
        }
      } catch (err) {
        if (id === activeRequestId) {
          self.postMessage({
            type: 'predict_result',
            id,
            result: null,
            error: err?.message || String(err)
          });
        }
      }
      break;
    }

    case 'abort': {
      if (id === activeRequestId) {
        activeRequestId = 0;
      }
      break;
    }

    default:
      console.warn('[Maia Worker] Unrecognized message type:', type);
  }
};
