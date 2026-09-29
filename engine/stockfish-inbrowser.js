/**
 * Stockfish In-Browser Runner (Scheme 0: Pure Client-Side WebAssembly)
 * Executes Stockfish via a sandboxed WebAssembly bridge iframe.
 * 100% offline, zero local server, zero external dependency.
 */

import { ChessBoard } from './chess-core.js';

export class StockfishInBrowser {
  constructor() {
    this.isReady = false;
    this.engineName = 'Stockfish 19 Lite WASM';
    this.iframe = null;
    this.pendingRequests = new Map();
    this.reqCounter = 0;
    this.initPromise = null;
    this._hasListener = false;
    this._readyResolve = null;
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

      this._readyResolve = resolve;

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

      if (!this._hasListener) {
        window.addEventListener('message', (event) => {
          const data = event.data;
          if (!data) return;

          if (data.type === 'STOCKFISH_READY') {
            this.isReady = true;
            if (data.engineName) this.engineName = data.engineName;
            console.log(`[Stockfish In-Browser] ✅ WebAssembly 引擎已就绪 (${this.engineName})!`);
            if (this.onReadyCallback) this.onReadyCallback(this.engineName);
            if (this._readyResolve) {
              const r = this._readyResolve;
              this._readyResolve = null;
              r(true);
            }
          } else if (data.type === 'STOCKFISH_RESULT') {
            const req = this.pendingRequests.get(data.id);
            if (req) {
              this.pendingRequests.delete(data.id);
              req.resolve(data);
            }
          } else if (data.type === 'STOCKFISH_ERROR') {
            console.warn('[Stockfish In-Browser] ⚠️ Error:', data.error);
            if (!this.isReady && this._readyResolve) {
              if (this.iframe && this.iframe.parentNode) {
                this.iframe.parentNode.removeChild(this.iframe);
              }
              this.iframe = null;
              this.initPromise = null;
              const r = this._readyResolve;
              this._readyResolve = null;
              r(false);
            }
          }
        });
        this._hasListener = true;
      }

      // Timeout guard: if engine fails to reply readyok, do NOT falsely mark ready, allow retry with fresh iframe
      setTimeout(() => {
        if (!this.isReady) {
          console.warn('[Stockfish In-Browser] ⚠️ 引擎初始化就绪等待超时 (Stockfish init timeout)');
          if (this.iframe && this.iframe.parentNode) {
            this.iframe.parentNode.removeChild(this.iframe);
          }
          this.iframe = null;
          this.initPromise = null;
          if (this._readyResolve) {
            const r = this._readyResolve;
            this._readyResolve = null;
            r(false);
          }
        }
      }, 8000);
    });

    return this.initPromise;
  }

  async evaluate(fen, depth = 8, timeoutMs = 2000, multipv = 1) {
    if (!this.isReady) {
      await this.initialize();
    }

    if (!this.isReady) {
      return null;
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
            pv: rawResult.pv || [],
            lines: rawResult.lines || []
          });
        }
      });

      this.iframe.contentWindow.postMessage({
        type: 'EVALUATE',
        id: reqId,
        fen,
        depth,
        multipv
      }, '*');
    });
  }

  stop() {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage({ type: 'STOP' }, '*');
    }
  }

  reset() {
    this.isReady = false;
    this.initPromise = null;
    this._readyResolve = null;
    if (this.iframe && this.iframe.parentNode) {
      try { this.iframe.parentNode.removeChild(this.iframe); } catch (e) {}
    }
    this.iframe = null;
  }
}
