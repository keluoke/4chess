/**
 * Unified Maia-3 Inference Coordinator (Scheme 0: Standalone In-Browser Architecture)
 * 100% In-Browser Execution:
 * 1. Maia-3 Chessformer Neural Engine (models/maia3_model.bin) via pure client-side WebGPU/JS
 * 2. Stockfish WebAssembly Engine (lib/stockfish.js) via sandboxed Web Worker bridge
 * Zero external servers, zero Python runtime, zero localhost bridges.
 * Identical experience across all platforms (Mac, Windows, Linux).
 */

import { ChessBoard } from './chess-core.js';
import { MaiaInBrowserEngine } from './maia-inbrowser.js';
import { StockfishInBrowser } from './stockfish-inbrowser.js';

export class MaiaEngine {
  constructor() {
    this.maiaInBrowser = new MaiaInBrowserEngine();
    this.stockfishInBrowser = new StockfishInBrowser();
    this.targetElo = 1500;
    this.isReady = false;
    this.isLoading = false;
    this.loadError = null;
    this.backendName = '浏览器端 WebGPU / JS + WebAssembly';
    this.modelName = 'Maia-3 5M Chessformer';
  }

  async initialize() {
    if (this.isReady) return this.backendName;
    if (this.isLoading) return this.backendName;

    this.isLoading = true;
    console.log('[Maia Engine] 🚀 正在初始化方案0：全浏览器端双引擎 (Maia 3 + Stockfish)...');

    try {
      // 1. Initialize Stockfish WebAssembly in parallel
      this.stockfishInBrowser.initialize().catch(err => {
        console.warn('[Maia Engine] Stockfish 初始化提示:', err);
      });

      // 2. Load authentic Maia-3 weights binary directly from extension package
      const modelUrl = chrome?.runtime?.getURL ? chrome.runtime.getURL('models/maia3_model.bin') : 'models/maia3_model.bin';
      await this.maiaInBrowser.loadModel(modelUrl);

      this.isReady = true;
      this.isLoading = false;
      console.log('[Maia Engine] ✅ 双引擎全部就绪！100% 本地免配置执行。');
      return this.backendName;
    } catch (err) {
      this.isLoading = false;
      this.loadError = err.message;
      console.error('[Maia Engine] ❌ 模型载入失败:', err);
      throw err;
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
        fen,
        elo,
        turn: chess.turn,
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

    // Strict Honesty: If Maia-3 model is not loaded yet, never guess with heuristics!
    if (!this.isReady) {
      return {
        isAvailable: false,
        error: 'Maia-3 神经网络引擎载入中',
        message: this.isLoading ? '正在将 7,327,236 参数 Maia-3 神经权重装载至浏览器内存...' : '引擎未加载',
        loading: this.isLoading,
        fen,
        turn: chess.turn,
        backend: this.getBackend(),
        modelName: this.modelName,
        moves: [],
        heatmap: new Float32Array(64),
        stockfish: null,
        comparison: null
      };
    }

    const tStart = performance.now();

    // 1. Run Maia-3 in-browser prediction
    const maiaRes = this.maiaInBrowser.predict(chess, elo);

    // 2. Run Stockfish in-browser WebAssembly evaluation concurrently
    let sfRes = null;
    try {
      sfRes = await this.stockfishInBrowser.evaluate(fen, 10, 1500);
    } catch (e) {
      console.warn('[Maia Engine] Stockfish eval timeout/error:', e);
    }

    // 3. Human vs Stockfish Comparative Insight
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
        // Human diverges from engine
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
      fen,
      elo,
      turn: chess.turn,
      backend: `${this.backendName} (${totalLatency}ms)`,
      modelName: this.modelName,
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
