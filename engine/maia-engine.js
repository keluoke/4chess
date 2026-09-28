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
  constructor(onStatusChange = null) {
    this.maiaInBrowser = new MaiaInBrowserEngine();
    this.stockfishInBrowser = new StockfishInBrowser();
    this.targetElo = 1500;
    this.onStatusChange = onStatusChange;
    this.isReady = false;
    this.isLoading = false;
    this.backendName = '浏览器端 WebGPU / JS + WebAssembly';
    this.modelName = 'Maia-3 5M Chessformer';

    // Independent status tracking for both engines
    this.status = {
      maia: {
        state: 'loading', // 'cached' | 'downloading' | 'ready' | 'error'
        percent: 0,
        speed: '',
        loadedMB: '0',
        totalMB: '28.0',
        source: '检测缓存中...',
        error: null
      },
      stockfish: {
        state: 'initializing', // 'ready' | 'error'
        error: null
      }
    };

    // Forward Stockfish ready callback
    this.stockfishInBrowser.onReadyCallback = () => {
      this.status.stockfish.state = 'ready';
      this.notifyStatus();
    };
  }

  notifyStatus() {
    if (this.onStatusChange) {
      this.onStatusChange({ ...this.status });
    }
  }

  async reinitialize(overrideUrl = null) {
    this.isReady = false;
    this.isLoading = false;
    this.maiaInBrowser.reset();
    if (overrideUrl) {
      await ModelCache.clearCache('maia3-5m');
    }
    return this.initialize(overrideUrl);
  }

  async initialize(overrideUrl = null) {
    if (this.isReady) return this.backendName;
    if (this.isLoading) return this.backendName;

    this.isLoading = true;
    this.notifyStatus();
    console.log('[Maia Engine] 🚀 正在初始化双引擎 (Cloudflare CDN + WebAssembly)...');

    // 1. Initialize Stockfish WebAssembly in parallel
    this.stockfishInBrowser.initialize().then(() => {
      this.status.stockfish.state = 'ready';
      this.notifyStatus();
    }).catch(err => {
      console.warn('[Maia Engine] Stockfish 初始化提示:', err);
      this.status.stockfish.state = 'error';
      this.status.stockfish.error = err.message;
      this.notifyStatus();
    });

    // 2. Resolve Model Source (Override URL -> Custom Cloudflare CDN -> Local Extension Package -> Default CDN)
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
    // 1. Primary Default: User's dedicated Cloudflare CDN bucket
    candidates.push('https://weights.4chess.cc/maia3_model.bin');

    // 2. Extension packaged local file
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      candidates.push(chrome.runtime.getURL('models/maia3_model.bin'));
    } else {
      candidates.push('models/maia3_model.bin');
    }
    // 3. High-speed mirror fallback
    candidates.push('https://maia3-cdn.pages.dev/models/maia3_model.bin');

    let loaded = false;
    let lastErr = null;

    for (const url of candidates) {
      try {
        await this.maiaInBrowser.loadModel(url, (prog) => {
          this.status.maia.state = prog.percent === 100 ? 'ready' : 'downloading';
          this.status.maia.percent = prog.percent;
          this.status.maia.speed = prog.speedMBps;
          this.status.maia.loadedMB = prog.receivedMB;
          this.status.maia.totalMB = prog.totalMB;
          this.status.maia.source = prog.source === 'cache' ? 'IndexedDB 缓存' : (prog.source === 'cdn' ? 'Cloudflare CDN' : '扩展内置');
          this.notifyStatus();
        });
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
      console.log('[Maia Engine] ✅ Maia-3 与 Stockfish 双引擎均已就绪！');
      return this.backendName;
    } else {
      this.isLoading = false;
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
   */
  async predict(fen, elo = this.targetElo) {
    const chess = new ChessBoard(fen);
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

    // 1. Evaluate with Stockfish concurrently (if ready)
    let sfRes = null;
    if (this.stockfishInBrowser.isReady) {
      try {
        sfRes = await this.stockfishInBrowser.evaluate(fen, 10, 1500);
      } catch (e) {
        console.warn('[Maia Engine] Stockfish eval error:', e);
      }
    }

    // 2. If Maia-3 model is not loaded yet: return Stockfish evaluation and download progress
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

    // 3. Run Maia-3 in-browser prediction
    const maiaRes = this.maiaInBrowser.predict(chess, elo);

    // 4. Human vs Stockfish Comparative Insight
    const topMove = maiaRes.moves[0] || null;
    let comparison = null;

    if (topMove && sfRes && sfRes.bestMove) {
      const isConsensus = topMove.uci === sfRes.bestMove.uci;
      if (isConsensus) {
        comparison = {
          agreed: true,
          badge: '🎯 人机高度共识',
          summary: `人类直觉与 Stockfish 顶级引擎一致首选 <strong>${topMove.san}</strong> (${topMove.prob}%)！`
        };
      } else {
        comparison = {
          agreed: false,
          badge: '⚠️ 人机着法分歧',
          summary: `约 <strong>${topMove.prob}%</strong> 的 ${elo} 棋手凭直觉走 <strong>${topMove.san}</strong>，而 Stockfish 建议 <strong>${sfRes.bestMove.san}</strong> (${sfRes.score})。`
        };
      }
    } else if (topMove) {
      comparison = {
        agreed: true,
        badge: '💡 人类直觉首选',
        summary: `典型 ${elo} 分段人类首选 <strong>${topMove.san}</strong> (${topMove.prob}%)。`
      };
    }

    const totalLatency = Math.round(performance.now() - tStart);

    return {
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
      moves: maiaRes.moves,
      stockfish: sfRes,
      comparison,
      analysis: {
        topMove: topMove?.uci,
        commentary: comparison?.summary || '',
        isTacticalTrap: comparison ? !comparison.agreed : false
      },
      latencyMs: totalLatency
    };
  }
}
