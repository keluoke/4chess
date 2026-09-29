/**
 * Stockfish In-Browser Runner (Scheme 0: Pure Client-Side WebAssembly)
 * Supports dual-mode execution:
 * 1. Direct WebAssembly Worker (Extension Pages / Standalone Studio): 0ms bridge overhead, ~70ms ready.
 * 2. Sandboxed WebAssembly Bridge Iframe (Chess.com / Lichess host pages): Bypasses third-party page CSP.
 * 100% offline, zero local server, zero external dependency.
 */

import { ChessBoard } from './chess-core.js';

export class StockfishInBrowser {
  constructor() {
    this.isReady = false;
    this.engineName = 'Stockfish 19 Lite WASM';
    this.worker = null;
    this.iframe = null;
    this.pendingRequests = new Map();
    this.reqCounter = 0;
    this.initPromise = null;
    this._hasListener = false;
    this._readyResolve = null;
    this._initTimeout = null;

    // Worker state machine for direct worker mode
    this.multiPvMap = new Map();
    this.lastInfo = null;
    this.isSearching = false;
    this.isStopping = false;
    this.activeRequest = null;
    this.queuedRequest = null;
    this.port = null;
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

      // Mode A: Direct Dedicated Worker
      // Applicable on extension pages (chrome-extension://) or standalone pages not subject to host CSP
      const isExtensionPage = typeof chrome !== 'undefined' && chrome.runtime?.getURL && window.location.protocol === 'chrome-extension:';
      const isHostPage = window.location.hostname.includes('chess.com') || window.location.hostname.includes('lichess.org');

      if (typeof Worker !== 'undefined' && (isExtensionPage || !isHostPage)) {
        try {
          const sf19Url = isExtensionPage
            ? chrome.runtime.getURL('lib/stockfish-19.js#stockfish.wasm')
            : (window.location.pathname.includes('/analysis/') ? '../lib/stockfish-19.js#stockfish.wasm' : 'lib/stockfish-19.js#stockfish.wasm');

          this.initDirectWorker(sf19Url);
          return;
        } catch (e) {
          console.warn('[Stockfish In-Browser] Direct worker fallback to iframe bridge:', e);
        }
      }

      // Mode B: Sandboxed Iframe Bridge (for host pages)
      this.initIframeBridge();
    });

    return this.initPromise;
  }

  initDirectWorker(scriptUrl) {
    try {
      this.worker = new Worker(scriptUrl);

      this.worker.onerror = (err) => {
        console.error('[Stockfish In-Browser] Direct Worker error:', err);
        if (!this.isReady && this._readyResolve) {
          const r = this._readyResolve;
          this._readyResolve = null;
          r(false);
        }
      };

      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';
        if (!line) return;

        if (line.startsWith('id name ')) {
          this.engineName = line.replace('id name ', '').trim();
        }

        if (line === 'readyok') {
          if (this._initTimeout) {
            clearTimeout(this._initTimeout);
            this._initTimeout = null;
          }
          this.isReady = true;
          console.log(`[Stockfish In-Browser] ✅ WebAssembly 引擎已就绪 (${this.engineName})!`);
          if (this.onReadyCallback) this.onReadyCallback(this.engineName);
          if (this._readyResolve) {
            const r = this._readyResolve;
            this._readyResolve = null;
            r(true);
          }
          return;
        }

        // Parse evaluation info lines
        if (line.startsWith('info') && line.includes('score')) {
          const depthMatch = line.match(/\bdepth (\d+)/);
          const multipvMatch = line.match(/\bmultipv (\d+)/);
          const cpMatch = line.match(/\bscore cp (-?\d+)/);
          const mateMatch = line.match(/\bscore mate (-?\d+)/);
          const pvMatch = line.match(/\bpv (.+)$/);

          const depth = depthMatch ? parseInt(depthMatch[1], 10) : 0;
          const multipv = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;
          let scoreText = '0.00';
          let scoreCp = 0;
          let isMate = false;

          if (mateMatch) {
            const m = parseInt(mateMatch[1], 10);
            scoreText = `M${m > 0 ? '+' : ''}${m}`;
            scoreCp = m > 0 ? 10000 - m * 100 : -10000 - m * 100;
            isMate = true;
          } else if (cpMatch) {
            scoreCp = parseInt(cpMatch[1], 10);
            const pawns = (scoreCp / 100).toFixed(2);
            scoreText = scoreCp > 0 ? `+${pawns}` : pawns;
          }

          const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];
          const moveUci = pv[0] || null;

          this.multiPvMap.set(multipv, {
            multipv,
            uci: moveUci,
            scoreText,
            scoreCp,
            isMate,
            depth,
            pv
          });

          if (multipv === 1) {
            this.lastInfo = { depth, scoreText, scoreCp, isMate, pv };
          }
        }

        // Parse bestmove line
        if (line.startsWith('bestmove')) {
          const parts = line.split(/\s+/);
          const bestMove = parts[1] && parts[1] !== '(none)' ? parts[1] : null;

          if (this.isStopping) {
            this.isStopping = false;
            this.isSearching = false;
            this.activeRequest = null;
            this.multiPvMap.clear();
            this.lastInfo = null;

            if (this.queuedRequest) {
              const next = this.queuedRequest;
              this.queuedRequest = null;
              this.executeDirectSearch(next);
            }
            return;
          }

          if (this.isSearching && this.activeRequest) {
            const best = this.multiPvMap.get(1) || this.lastInfo;
            const req = this.activeRequest;
            this.activeRequest = null;
            this.isSearching = false;

            const lines = [];
            for (const [idx, item] of this.multiPvMap.entries()) {
              if (item.uci) {
                const deltaCp = best ? (item.scoreCp - best.scoreCp) : 0;
                const deltaText = (deltaCp / 100).toFixed(2);
                lines.push({
                  multipv: idx,
                  uci: item.uci,
                  scoreText: item.scoreText,
                  scoreCp: item.scoreCp,
                  deltaCp,
                  deltaText,
                  isMate: item.isMate
                });
              }
            }

            const rawResult = {
              type: 'STOCKFISH_RESULT',
              id: req.id,
              fen: req.fen,
              bestMove,
              scoreText: best ? best.scoreText : (this.lastInfo ? this.lastInfo.scoreText : '0.00'),
              scoreCp: best ? best.scoreCp : (this.lastInfo ? this.lastInfo.scoreCp : 0),
              isMate: best ? best.isMate : (this.lastInfo ? this.lastInfo.isMate : false),
              depth: best ? best.depth : (this.lastInfo ? this.lastInfo.depth : 0),
              pv: best ? best.pv : (this.lastInfo ? this.lastInfo.pv : []),
              lines
            };

            this.multiPvMap.clear();

            const pending = this.pendingRequests.get(req.id);
            if (pending) {
              this.pendingRequests.delete(req.id);
              pending.resolve(rawResult);
            }

            if (this.queuedRequest) {
              const next = this.queuedRequest;
              this.queuedRequest = null;
              this.executeDirectSearch(next);
            }
          }
        }
      };

      this.worker.postMessage('uci');
      this.worker.postMessage('setoption name MultiPV value 1');
      this.worker.postMessage('isready');

      this._initTimeout = setTimeout(() => {
        if (!this.isReady) {
          console.warn('[Stockfish In-Browser] Direct worker init timeout, falling back to iframe');
          this.initIframeBridge();
        }
      }, 5000);
    } catch (e) {
      console.warn('[Stockfish In-Browser] Failed to spawn direct worker:', e);
      this.initIframeBridge();
    }
  }

  executeDirectSearch(req) {
    if (!this.worker) return;
    this.isSearching = true;
    this.isStopping = false;
    this.activeRequest = req;
    this.lastInfo = null;
    this.multiPvMap.clear();

    if (req.multipv > 1) {
      this.worker.postMessage(`setoption name MultiPV value ${req.multipv}`);
    } else {
      this.worker.postMessage('setoption name MultiPV value 1');
    }
    this.worker.postMessage(`position fen ${req.fen}`);
    this.worker.postMessage(`go depth ${req.depth}`);
  }

  initIframeBridge() {
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

      const url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
        ? chrome.runtime.getURL('engine/stockfish-sandbox.html')
        : (window.location.pathname.includes('/analysis/') ? '../engine/stockfish-sandbox.html' : 'engine/stockfish-sandbox.html');
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

    // Establish private MessageChannel for strict sandbox boundary
    if (this.port) {
      try { this.port.close(); } catch (e) {}
      this.port = null;
    }
    const channel = new MessageChannel();
    this.port = channel.port1;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'STOCKFISH_READY') {
        if (this._initTimeout) {
          clearTimeout(this._initTimeout);
          this._initTimeout = null;
        }
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
        if (this._initTimeout) {
          clearTimeout(this._initTimeout);
          this._initTimeout = null;
        }
        if (!this.isReady && this._readyResolve) {
          if (this.iframe && this.iframe.parentNode) {
            try { this.iframe.parentNode.removeChild(this.iframe); } catch (e) {}
          }
          this.iframe = null;
          this.initPromise = null;
          const r = this._readyResolve;
          this._readyResolve = null;
          r(false);
        }
      }
    };

    let portTransferred = false;
    let onWindowMsg = null;

    const handshake = (token) => {
      const sendPort = () => {
        if (portTransferred) return;
        try {
          if (this.iframe && this.iframe.contentWindow) {
            portTransferred = true;
            if (onWindowMsg) {
              window.removeEventListener('message', onWindowMsg);
              onWindowMsg = null;
            }
            this.iframe.contentWindow.postMessage({ type: 'INIT_AUTH_PORT', token }, '*', [channel.port2]);
          }
        } catch (e) {
          console.warn('[Stockfish In-Browser] Failed to post INIT_AUTH_PORT:', e);
        }
      };

      onWindowMsg = (e) => {
        if (e.data && e.data.type === 'SANDBOX_READY_FOR_PORT') {
          sendPort();
        }
      };
      window.addEventListener('message', onWindowMsg);

      this.iframe.addEventListener('load', () => {
        setTimeout(sendPort, 40);
      }, { once: true });
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'ACQUIRE_SANDBOX_TOKEN' }, (res) => {
        const token = res?.ok ? res.token : null;
        handshake(token);
      });
    } else {
      handshake('standalone_token');
    }

    if (this._initTimeout) {
      clearTimeout(this._initTimeout);
      this._initTimeout = null;
    }
    this._initTimeout = setTimeout(() => {
      this._initTimeout = null;
      if (onWindowMsg) {
        window.removeEventListener('message', onWindowMsg);
        onWindowMsg = null;
      }
      if (!this.isReady) {
        console.warn('[Stockfish In-Browser] ⚠️ 引擎初始化就绪等待超时 (Stockfish init timeout)');
        if (this.iframe && this.iframe.parentNode) {
          try { this.iframe.parentNode.removeChild(this.iframe); } catch (e) {}
        }
        this.iframe = null;
        this.initPromise = null;
        if (this._readyResolve) {
          const r = this._readyResolve;
          this._readyResolve = null;
          r(false);
        }
      }
    }, 16000);
  }

  async evaluate(fen, depth = 8, timeoutMs = 2000, multipv = 1) {
    if (!this.isReady) {
      await this.initialize();
    }

    if (!this.isReady) {
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

      if (this.worker) {
        const req = { id: reqId, fen, depth, multipv };
        if (!this.isSearching && !this.isStopping) {
          this.executeDirectSearch(req);
        } else {
          this.queuedRequest = req;
          this.stop();
        }
      } else if (this.port) {
        this.port.postMessage({
          type: 'EVALUATE',
          id: reqId,
          fen,
          depth,
          multipv
        });
      } else {
        clearTimeout(timer);
        this.pendingRequests.delete(reqId);
        resolve(null);
      }
    });
  }

  stop() {
    if (this.worker) {
      if (this.isSearching && !this.isStopping) {
        this.isStopping = true;
        this.worker.postMessage('stop');
      }
    } else if (this.port) {
      this.port.postMessage({ type: 'STOP' });
    }
  }

  reset() {
    if (this._initTimeout) {
      clearTimeout(this._initTimeout);
      this._initTimeout = null;
    }
    this.isReady = false;
    this.initPromise = null;
    this._readyResolve = null;

    if (this.port) {
      try { this.port.close(); } catch (e) {}
      this.port = null;
    }
    if (this.worker) {
      try { this.worker.terminate(); } catch (e) {}
      this.worker = null;
    }
    if (this.iframe && this.iframe.parentNode) {
      try { this.iframe.parentNode.removeChild(this.iframe); } catch (e) {}
    }
    this.iframe = null;
  }
}
