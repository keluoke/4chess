/**
 * Stockfish In-Browser Runner (Scheme 0: Pure Client-Side WebAssembly)
 * Executes Stockfish via a sandboxed WebAssembly bridge iframe.
 * 100% offline, zero local server, zero external dependency.
 */

import { ChessBoard } from './chess-core.js';

export class StockfishInBrowser {
  constructor() {
    this.isReady = false;
    this.iframe = null;
    this.pendingRequests = new Map();
    this.reqCounter = 0;
    this.initPromise = null;
  }

  async initialize() {
    if (this.isReady) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve) => {
      // In Node.js environment (e.g. CLI testing)
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        this.isReady = true;
        resolve(true);
        return;
      }

      // Check if iframe already exists
      let frame = document.getElementById('maia3-stockfish-frame');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'maia3-stockfish-frame';
        frame.style.position = 'absolute';
        frame.style.width = '0px';
        frame.style.height = '0px';
        frame.style.border = 'none';
        frame.style.visibility = 'hidden';
        frame.style.pointerEvents = 'none';

        const url = chrome?.runtime?.getURL ? chrome.runtime.getURL('engine/stockfish-sandbox.html') : 'engine/stockfish-sandbox.html';
        frame.src = url;

        const mountFrame = () => {
          const parent = document.body || document.documentElement;
          if (parent && !parent.contains(frame)) {
            parent.appendChild(frame);
          }
        };
        mountFrame();
        if (!document.body) {
          window.addEventListener('DOMContentLoaded', mountFrame);
        }
      }
      this.iframe = frame;

      const messageHandler = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === 'STOCKFISH_READY') {
          this.isReady = true;
          console.log('[Stockfish In-Browser] ✅ WebAssembly 引擎已就绪!');
          if (this.onReadyCallback) this.onReadyCallback();
          resolve(true);
        } else if (data.type === 'STOCKFISH_RESULT') {
          const req = this.pendingRequests.get(data.id);
          if (req) {
            this.pendingRequests.delete(data.id);
            req.resolve(data);
          }
        } else if (data.type === 'STOCKFISH_ERROR') {
          console.warn('[Stockfish In-Browser] ⚠️ Error:', data.error);
        }
      };

      window.addEventListener('message', messageHandler);

      // Fallback timeout in case frame takes long
      setTimeout(() => {
        this.isReady = true;
        if (this.onReadyCallback) this.onReadyCallback();
        resolve(true);
      }, 2000);
    });

    return this.initPromise;
  }

  async evaluate(fen, depth = 10, timeoutMs = 2000) {
    if (!this.isReady) {
      await this.initialize();
    }

    // In Node.js testing environment without DOM iframe
    if (typeof window === 'undefined' || !this.iframe?.contentWindow) {
      return null;
    }

    const reqId = ++this.reqCounter;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          resolve(null);
        }
      }, timeoutMs);

      this.pendingRequests.set(reqId, {
        resolve: (rawResult) => {
          clearTimeout(timer);
          if (!rawResult || !rawResult.bestMove) {
            resolve(null);
            return;
          }

          // Parse coordinates and SAN
          const uci = rawResult.bestMove;
          const fromSq = uci.slice(0, 2);
          const toSq = uci.slice(2, 4);
          const from = ChessBoard.squareToIndex(fromSq);
          const to = ChessBoard.squareToIndex(toSq);

          // Get SAN representation
          let san = uci;
          try {
            const chess = new ChessBoard(fen);
            const legalMoves = chess.getLegalMoves();
            const match = legalMoves.find(m => m.uci === uci);
            if (match) san = match.san;
          } catch (e) {}

          resolve({
            available: true,
            bestMove: {
              uci,
              san,
              from,
              to,
              fromSq,
              toSq
            },
            score: rawResult.scoreText,
            scoreCp: rawResult.scoreCp,
            isMate: rawResult.isMate,
            depth: rawResult.depth,
            pv: rawResult.pv || []
          });
        }
      });

      this.iframe.contentWindow.postMessage({
        type: 'EVALUATE',
        id: reqId,
        fen,
        depth
      }, '*');
    });
  }

  stop() {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage({ type: 'STOP' }, '*');
    }
  }
}
