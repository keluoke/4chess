/**
 * Unified Maia-3 Inference Coordinator (Scheme 0: Cloudflare CDN + Standalone WebAssembly Architecture)
 * 100% In-Browser Execution with High-Speed CDN & IndexedDB Persistent Caching:
 * 1. Maia-3 Chessformer Neural Engine loaded via Cloudflare CDN / IndexedDB cache / Local package
 * 2. Stockfish WebAssembly Engine (lib/stockfish.js) via sandboxed Web Worker bridge
 * Zero external servers, zero Python runtime, zero localhost bridges.
 * Clear independent dual-engine status tracking and concurrent evaluation.
 */

import { ChessBoard } from './chess-core.js';
import { MaiaInBrowserEngine } from './maia-inbrowser.js';
import { StockfishInBrowser } from './stockfish-inbrowser.js';
import { ModelCache } from './model-cache.js';

export class MaiaEngine {
  constructor(onStatusChange = null, stockfishInstance = null) {
    this.maiaInBrowser = new MaiaInBrowserEngine();
    this.stockfishInBrowser = stockfishInstance || new StockfishInBrowser();
    this.targetElo = 1900;
    this.onStatusChange = onStatusChange;
    this.isReady = false;
    this.isLoading = false;
    this.initPromise = null;
    this.backendName = '浏览器端 Float32 JS + Stockfish WASM';
    this.modelName = 'Maia-3 5M Chessformer';
    this.lruCache = new Map();
    this.MAX_CACHE_SIZE = 150;

    // Web Worker state
    this.worker = null;
    this.workerReqId = 0;
    this.workerPending = new Map();
    this._workerProgress = null;
    this._workerLoadResolve = null;
    this._workerLoadReject = null;
    this.initWorker();

    // Independent status tracking for both engines
    this.status = {
      maia: {
        state: 'uninitialized', // 'uninitialized' | 'loading' | 'cached' | 'downloading' | 'ready' | 'error'
        percent: 0,
        speed: '',
        loadedMB: '0',
        totalMB: '28.0',
        source: '未启动',
        error: null
      },
      stockfish: {
        state: this.stockfishInBrowser.isReady ? 'ready' : 'uninitialized',
        error: null
      }
    };

    // Forward Stockfish ready callback
    if (this.stockfishInBrowser.isReady) {
      this.status.stockfish.state = 'ready';
    } else {
      const existingCb = this.stockfishInBrowser.onReadyCallback;
      this.stockfishInBrowser.onReadyCallback = () => {
        if (existingCb) {
          try { existingCb(); } catch (e) {}
        }
        this.status.stockfish.state = 'ready';
        this.notifyStatus();
      };
    }
  }

  initWorker() {
    if (typeof Worker === 'undefined' || typeof window === 'undefined') {
      return;
    }
    try {
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime?.getURL && window.location.protocol === 'chrome-extension:';
      const workerUrl = isExtension
        ? chrome.runtime.getURL('engine/maia-worker.js')
        : new URL('./maia-worker.js', import.meta.url).href;

      this.worker = new Worker(workerUrl, { type: 'module' });
      this.backendName = '浏览器端 Web Worker + Stockfish WASM';
      this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
      this.worker.onerror = (err) => {
        console.warn('[Maia Engine] Dedicated Worker error, falling back to direct in-thread:', err);
        this.worker = null;
        this.backendName = '浏览器端 Float32 JS + Stockfish WASM';
      };
    } catch (err) {
      console.warn('[Maia Engine] Worker creation failed, using direct in-thread:', err);
      this.worker = null;
    }
  }

  handleWorkerMessage(msg) {
    const { type, id, data, prog, result, error, success } = msg || {};
    if (type === 'progress') {
      const progressData = data || prog;
      if (this._workerProgress && progressData) {
        this._workerProgress(progressData);
      }
    } else if (type === 'loadModel_result') {
      if (this._workerLoadResolve) {
        if (success) {
          this._workerLoadResolve(true);
        } else {
          this._workerLoadReject(new Error(error || 'Worker model loading failed'));
        }
        this._workerLoadResolve = null;
        this._workerLoadReject = null;
      }
    } else if (type === 'predict_result') {
      if (this.workerPending.has(id)) {
        const { resolve, reject } = this.workerPending.get(id);
        this.workerPending.delete(id);
        if (error) reject(new Error(error));
        else resolve(result);
      }
    }
  }

  notifyStatus() {
    if (this.onStatusChange) {
      this.onStatusChange({ ...this.status });
    }
  }

  async reinitialize(overrideUrl = null) {
    this.isReady = false;
    this.isLoading = false;
    this.initPromise = null;
    this.lruCache.clear();
    if (this.worker) {
      this.worker.postMessage({ type: 'reset' });
    }
    this.maiaInBrowser.reset();
    if (overrideUrl) {
      await ModelCache.clearAll();
    }
    return this.initialize(overrideUrl);
  }

  async initialize(overrideUrl = null) {
    if (this.isReady) return this.backendName;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInitialize(overrideUrl);
    return this.initPromise;
  }

  async _doInitialize(overrideUrl = null) {
    this.isLoading = true;
    this.status.maia.state = 'loading';
    this.status.maia.source = '检测缓存中...';
    if (!this.stockfishInBrowser.isReady) {
      this.status.stockfish.state = 'initializing';
    }
    this.notifyStatus();
    console.log('[Maia Engine] 🚀 正在初始化双引擎 (Cloudflare CDN + WebAssembly)...');

    // 1. Initialize Stockfish WebAssembly in parallel
    this.stockfishInBrowser.initialize().then((isReady) => {
      if (isReady || this.stockfishInBrowser.isReady) {
        this.status.stockfish.state = 'ready';
        this.status.stockfish.error = null;
      } else {
        if (!this.stockfishInBrowser.isReady) {
          this.status.stockfish.state = 'error';
          this.status.stockfish.error = 'WebAssembly 初始化超时';
        }
      }
      this.notifyStatus();
    }).catch(err => {
      if (!this.stockfishInBrowser.isReady) {
        console.warn('[Maia Engine] Stockfish 初始化提示:', err);
        this.status.stockfish.state = 'error';
        this.status.stockfish.error = err?.message || String(err);
        this.notifyStatus();
      }
    });

    // 2. Resolve Model Source: Dedicated Cloudflare CDN / R2 Bucket (with browser IndexedDB persistent cache)
    let customCdn = overrideUrl || '';
    if (!customCdn && typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(['cloudflareCdnUrl']);
        if (stored?.cloudflareCdnUrl) customCdn = stored.cloudflareCdnUrl.trim();
      } catch (e) {}
    }

    const candidates = [];
    if (customCdn) {
      candidates.push(customCdn);
    }
    // 1. Primary Default: Dedicated Cloudflare CDN bucket
    candidates.push('https://weights.4chess.cc/maia3_model.bin');

    let loaded = false;
    let lastErr = null;

    for (const url of candidates) {
      try {
        const onProgress = (prog) => {
          this.status.maia.state = prog.percent === 100 ? 'ready' : 'downloading';
          this.status.maia.percent = prog.percent;
          this.status.maia.speed = prog.speedMBps;
          this.status.maia.loadedMB = prog.receivedMB;
          this.status.maia.totalMB = prog.totalMB;
          this.status.maia.source = prog.source === 'cache' ? 'IndexedDB 缓存' : 'Cloudflare CDN';
          this.notifyStatus();
        };

        if (this.worker) {
          await new Promise((resolve, reject) => {
            this._workerProgress = onProgress;
            this._workerLoadResolve = resolve;
            this._workerLoadReject = reject;
            this.worker.postMessage({
              type: 'loadModel',
              data: { url }
            });
          });
        } else {
          await this.maiaInBrowser.loadModel(url, onProgress);
        }
        loaded = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`[Maia Engine] Candidate source ${url} failed, trying next...:`, err);
      }
    }

    if (loaded) {
      this.isReady = true;
      this.isLoading = false;
      this.status.maia.state = 'ready';
      this.notifyStatus();
      if (this.stockfishInBrowser?.isReady) {
        console.log('[Maia Engine] ✅ Maia-3 与 Stockfish 双引擎均已就绪！');
      } else {
        console.log(`[Maia Engine] ✅ Maia-3 模型已就绪 (Stockfish 状态: ${this.status.stockfish.state})`);
      }
      return this.backendName;
    } else {
      this.isLoading = false;
      this.initPromise = null;
      this.status.maia.state = 'error';
      this.status.maia.error = lastErr?.message || '载入失败';
      this.notifyStatus();
      throw lastErr;
    }
  }

  setElo(elo) {
    this.targetElo = Math.max(600, Math.min(2600, elo));
  }

  getElo() {
    return this.targetElo;
  }

  getBackend() {
    return this.isReady ? this.backendName : (this.isLoading ? '引擎载入中...' : '未就绪');
  }

  isRealOnnxLoaded() {
    return this.isReady;
  }

  isEmbeddedReady() {
    return this.isReady;
  }

  getModelName() {
    return this.modelName;
  }

  /**
   * Evaluates position using both Maia 3 and Stockfish
   * Supports both FEN-only and real history sequence modes.
   */
  async predict(fen, elo = this.targetElo, sfRes = null, abortCheck = null, history = null) {
    let histKey = 'nohist';
    if (history && Array.isArray(history) && history.length > 0) {
      histKey = history.map(h => {
        if (typeof h === 'string') return h.split(' ')[0];
        if (h && typeof h.fen === 'string') return h.fen.split(' ')[0];
        return String(h);
      }).join(';');
    } else if (typeof history === 'string' && history.length > 0) {
      histKey = history;
    }
    const encVer = 'v2h';
    const modelTag = this.modelName || 'maia3';
    const cacheKey = `${fen}_${elo}_${modelTag}_${encVer}_${histKey}`;

    if (this.lruCache.has(cacheKey)) {
      const cached = this.lruCache.get(cacheKey);
      if (sfRes) {
        return this.attachStockfishResult(cached, sfRes, elo);
      }
      return cached;
    }

    const chess = new ChessBoard(fen);
    if (!chess.isValid) {
      console.warn(`[Maia Engine] Invalid FEN rejected: "${fen}"`);
      return null;
    }
    const legalMoves = chess.getLegalMoves();

    if (legalMoves.length === 0) {
      return {
        isAvailable: true,
        isMaiaReady: this.isReady,
        isStockfishReady: this.stockfishInBrowser.isReady,
        fen,
        elo,
        turn: chess.turn,
        status: this.status,
        backend: this.getBackend(),
        modelName: this.getModelName(),
        heatmap: new Float32Array(64),
        moves: [],
        stockfish: null,
        comparison: null,
        analysis: {
          topMove: null,
          commentary: chess.inCheck() ? '局面处于绝杀 (Checkmate)' : '局面处于逼和 (Stalemate)'
        }
      };
    }


    // 1. If Maia-3 model is loading, await initialization promise
    if (!this.isReady && this.initPromise) {
      try {
        await this.initPromise;
      } catch (e) {}
    }

    // If still not ready: return Stockfish evaluation and download progress
    if (!this.isReady) {
      return {
        isAvailable: false,
        isMaiaReady: false,
        isStockfishReady: this.stockfishInBrowser.isReady,
        loading: this.isLoading,
        fen,
        elo,
        turn: chess.turn,
        status: this.status,
        backend: this.stockfishInBrowser.isReady ? 'Stockfish (WASM) 运行中 · Maia-3 载入中' : '双引擎初始化中...',
        modelName: this.modelName,
        moves: [],
        heatmap: new Float32Array(64),
        stockfish: sfRes,
        comparison: null,
        analysis: sfRes?.bestMove ? {
          topMove: sfRes.bestMove.uci,
          commentary: `🐟 Stockfish 建议 ${sfRes.bestMove.san} (${sfRes.score}) · Maia-3 人类直觉权重传输中...`,
          isTacticalTrap: false
        } : null
      };
    }

    const tStart = performance.now();

    // 3. Run Maia-3 prediction (via dedicated Web Worker or direct in-thread fallback)
    let maiaRes = null;
    if (this.worker) {
      const reqId = ++this.workerReqId;
      const p = new Promise((resolve, reject) => {
        this.workerPending.set(reqId, { resolve, reject });
        this.worker.postMessage({
          type: 'predict',
          id: reqId,
          data: { fen, elo, history }
        });
      });

      if (abortCheck) {
        let checkTimer = null;
        const abortWatcher = new Promise((resolve) => {
          checkTimer = setInterval(() => {
            if (abortCheck()) {
              clearInterval(checkTimer);
              this.worker.postMessage({ type: 'abort', id: reqId });
              this.workerPending.delete(reqId);
              resolve(null);
            }
          }, 20);
        });
        maiaRes = await Promise.race([p, abortWatcher]);
        if (checkTimer) clearInterval(checkTimer);
      } else {
        maiaRes = await p;
      }
    } else {
      maiaRes = await this.maiaInBrowser.predict(chess, elo, abortCheck, history);
    }
    if (!maiaRes) return null; // Aborted by user moving again

    // 4. Human vs Stockfish Comparative Insight
    const topMove = maiaRes.moves[0] || null;
    const comparison = this.buildComparison(topMove, sfRes, elo);
    const enrichedMoves = this.enrichMovesWithDelta(maiaRes.moves, sfRes);

    const totalLatency = Math.round(performance.now() - tStart);

    const result = {
      isAvailable: true,
      isMaiaReady: true,
      isStockfishReady: this.stockfishInBrowser.isReady,
      fen,
      elo,
      turn: chess.turn,
      backend: `${this.backendName} (${totalLatency}ms)`,
      modelName: this.modelName,
      status: this.status,
      heatmap: maiaRes.heatmap,
      moves: enrichedMoves,
      stockfish: sfRes,
      comparison,
      analysis: {
        topMove: topMove?.uci,
        commentary: comparison?.summary || '',
        isTacticalTrap: comparison ? !comparison.agreed : false
      },
      latencyMs: totalLatency
    };

    if (this.lruCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.lruCache.keys().next().value;
      this.lruCache.delete(firstKey);
    }
    this.lruCache.set(cacheKey, result);

    return result;
  }

  buildComparison(topMove, sfRes, elo) {
    if (!topMove) return null;
    if (!sfRes || !sfRes.bestMove) {
      return {
        agreed: true,
        badge: '🫤 人类直觉首选',
        badgeEn: '🫤 Human Intuition',
        summary: `典型 ${elo} 分段人类首选 <strong>${topMove.san}</strong> (${topMove.prob}%)。`,
        summaryEn: `Typical ${elo} players favor <strong>${topMove.san}</strong> (${topMove.prob}%).`,
        delta: 0,
        deltaText: null,
        evalScore: null
      };
    }

    const isConsensus = topMove.uci === sfRes.bestMove.uci;
    if (isConsensus) {
      return {
        agreed: true,
        badge: '🎯 人机高度共识',
        badgeEn: '🎯 High Consensus',
        summary: `人类直觉与 Stockfish 顶级引擎一致首选 <strong>${topMove.san}</strong> (${topMove.prob}%)！(局面评级: ${sfRes.score})`,
        summaryEn: `Human intuition & Stockfish both agree on <strong>${topMove.san}</strong> (${topMove.prob}%)! (Eval: ${sfRes.score})`,
        delta: 0,
        deltaText: '0.00',
        evalScore: sfRes.score
      };
    }

    let deltaText = null;
    let deltaCp = null;
    if (sfRes.lines && sfRes.lines.length > 0) {
      const match = sfRes.lines.find(l => l.uci === topMove.uci);
      if (match) {
        deltaCp = match.deltaCp;
        deltaText = match.deltaText;
      }
    }

    const lossStrZh = deltaText ? `，直觉损耗 Δ: ${deltaText} 兵` : '';
    const lossStrEn = deltaText ? `, intuition loss Δ: ${deltaText} pawn` : '';

    return {
      agreed: false,
      badge: '⚠️ 人机着法分歧',
      badgeEn: '⚠️ Engine Divergence',
      summary: `约 <strong>${topMove.prob}%</strong> 的 ${elo} 棋手凭直觉走 <strong>${topMove.san}</strong>，而 Stockfish 建议 <strong>${sfRes.bestMove.san}</strong> (评级: ${sfRes.score}${lossStrZh})。`,
      summaryEn: `~<strong>${topMove.prob}%</strong> of ${elo} players favor <strong>${topMove.san}</strong>, while Stockfish advises <strong>${sfRes.bestMove.san}</strong> (Eval: ${sfRes.score}${lossStrEn}).`,
      delta: deltaCp !== null ? deltaCp / 100 : null,
      deltaText,
      evalScore: sfRes.score
    };
  }

  enrichMovesWithDelta(moves, sfRes) {
    if (!moves || !sfRes?.bestMove) return moves;
    return moves.map(m => {
      const copy = { ...m };
      if (copy.uci === sfRes.bestMove.uci) {
        copy.deltaText = '0.00';
        copy.isBest = true;
      } else if (sfRes.lines) {
        const line = sfRes.lines.find(l => l.uci === copy.uci);
        if (line) {
          copy.deltaText = line.deltaText;
        }
      }
      return copy;
    });
  }

  evaluateStockfishAsync(fen, callback) {
    if (!this.stockfishInBrowser.isReady) return;
    this.stockfishInBrowser.evaluate(fen, 8, 800, 3).then(sfRes => {
      if (callback && sfRes) callback(sfRes);
    }).catch(() => {});
  }

  attachStockfishResult(predictionResult, sfRes, elo = this.targetElo) {
    if (!predictionResult || !sfRes) return predictionResult;
    const topMove = predictionResult.moves?.[0] || null;
    const comparison = this.buildComparison(topMove, sfRes, elo);
    const enrichedMoves = this.enrichMovesWithDelta(predictionResult.moves, sfRes);

    return {
      ...predictionResult,
      moves: enrichedMoves,
      stockfish: sfRes,
      comparison,
      analysis: {
        topMove: topMove?.uci,
        commentary: comparison?.summary || predictionResult.analysis?.commentary || '',
        isTacticalTrap: comparison ? !comparison.agreed : false
      }
    };
  }
}

