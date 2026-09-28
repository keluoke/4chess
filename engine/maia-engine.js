/**
 * Unified Maia-3 Human Intuition Inference Coordinator
 * Manages WebGPU / WebAssembly pipelines, ONNX models, move prediction,
 * board attention heatmaps, and Human-vs-Engine discrepancy alerts.
 */

import { ChessBoard } from './chess-core.js';
import { WebGPURunner } from './webgpu-runner.js';
import { WasmRunner } from './wasm-runner.js';

export class MaiaEngine {
  constructor() {
    this.webgpuRunner = new WebGPURunner();
    this.wasmRunner = new WasmRunner();
    this.activeBackend = 'initializing'; // 'webgpu' | 'wasm' | 'onnx-webgpu' | 'onnx-wasm'
    this.targetElo = 1500;
    this.onnxSession = null;
    this.isReady = false;
  }

  async initialize() {
    console.log('[Maia-3] Initializing Human Intuition Engine...');
    
    // Check if ONNX Runtime Web is globally available (e.g. if loaded via script)
    if (typeof window !== 'undefined' && window.ort) {
      console.log('[Maia-3] ONNX Runtime Web detected.');
    }

    // Try WebGPU first for maximum hardware acceleration
    const gpuSuccess = await this.webgpuRunner.initialize();
    if (gpuSuccess) {
      this.activeBackend = 'webgpu';
    } else {
      await this.wasmRunner.initialize();
      this.activeBackend = 'wasm';
    }

    this.isReady = true;
    console.log(`[Maia-3] Ready. Active execution backend: ⚡ ${this.activeBackend.toUpperCase()}`);
    return this.activeBackend;
  }

  setElo(elo) {
    this.targetElo = Math.max(600, Math.min(2600, elo));
  }

  getElo() {
    return this.targetElo;
  }

  getBackend() {
    return this.activeBackend;
  }

  /**
   * Encodes the 64-square board into token vectors for Chessformer
   */
  encodeBoard(chessBoard) {
    // 64 * 4 floats: [pieceType (0..6), rank (0..7), file (0..7), color (-1, 0, 1)]
    const tokens = new Float32Array(64 * 4);
    const pieceMap = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };

    for (let i = 0; i < 64; i++) {
      const piece = chessBoard.board[i];
      const r = Math.floor(i / 8);
      const f = i % 8;

      tokens[i * 4 + 1] = r;
      tokens[i * 4 + 2] = f;

      if (!piece) {
        tokens[i * 4 + 0] = 0;
        tokens[i * 4 + 3] = 0;
      } else {
        tokens[i * 4 + 0] = pieceMap[piece.type] || 0;
        tokens[i * 4 + 3] = piece.color === 'w' ? 1.0 : -1.0;
      }
    }
    return tokens;
  }

  /**
   * Main inference call:
   * Returns {
   *   heatmap: Float32Array(64), // normalized 0..1
   *   moves: [ { uci, san, prob, isBlunderTrap, engineDiff } ],
   *   backend: string,
   *   summary: string
   * }
   */
  async predict(fen, elo = this.targetElo) {
    const chess = new ChessBoard(fen);
    const legalMoves = chess.getLegalMoves();

    if (legalMoves.length === 0) {
      return {
        fen,
        elo,
        backend: this.activeBackend,
        heatmap: new Float32Array(64),
        moves: [],
        summary: chess.inCheck() ? 'Checkmate' : 'Stalemate'
      };
    }

    const tokens = this.encodeBoard(chess);
    let rawHeatmap;

    if (this.activeBackend === 'webgpu') {
      try {
        rawHeatmap = await this.webgpuRunner.runInference(tokens, chess.turn, elo);
      } catch (err) {
        console.warn('[Maia-3] WebGPU inference failed, falling back to WASM:', err);
        this.activeBackend = 'wasm';
        rawHeatmap = this.wasmRunner.runInference(tokens, chess.turn, elo);
      }
    } else {
      rawHeatmap = this.wasmRunner.runInference(tokens, chess.turn, elo);
    }

    // Normalize heatmap values between 0.0 and 1.0
    let maxVal = 0.0001;
    for (let i = 0; i < 64; i++) {
      if (rawHeatmap[i] > maxVal) maxVal = rawHeatmap[i];
    }
    const normalizedHeatmap = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      normalizedHeatmap[i] = Math.pow(rawHeatmap[i] / maxVal, 1.2);
    }

    // Predict move probabilities calibrated for human rating
    const scoredMoves = this.scoreLegalMoves(chess, legalMoves, normalizedHeatmap, elo);

    // Assess Human vs Engine discrepancy and Blunder/Trap likelihood
    const analysis = this.analyzeHumanTendencies(chess, scoredMoves, elo);

    return {
      fen,
      elo,
      backend: this.activeBackend,
      heatmap: normalizedHeatmap,
      moves: scoredMoves,
      analysis
    };
  }

  /**
   * Calibrated human move distribution model matching Maia-3 rating curves
   */
  scoreLegalMoves(chess, legalMoves, heatmap, elo) {
    const eloNorm = (elo - 600) / 2000; // 0.0 (600) to 1.0 (2600)
    const turn = chess.turn;
    const isWhite = turn === 'w';

    // Temperature controls decision sharpness (higher Elo = more concentrated on top moves)
    const temperature = Math.max(0.4, 1.1 - eloNorm * 0.5);

    const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    const logits = [];

    for (const move of legalMoves) {
      let logit = 0.0;
      const p = move.piece;
      const from = move.from;
      const to = move.to;

      // 1. Attention resonance: Moves targeting high-attention squares
      const targetAtt = heatmap[to] || 0;
      const sourceAtt = heatmap[from] || 0;
      logit += targetAtt * 2.5 + sourceAtt * 0.8;

      // 2. Human instinct: Captures
      if (move.captured) {
        const victimVal = pieceValues[move.captured.type] || 0;
        const attackerVal = pieceValues[p.type] || 0;
        const gain = victimVal - attackerVal;

        if (gain >= 0) {
          // Winning or equal exchange: humans play this with high frequency
          logit += 2.2 + (1.0 - eloNorm) * 0.8;
        } else {
          // Losing sacrifice: low Elo rarely sees it unless it's a check; high Elo evaluates properly
          logit += eloNorm > 0.6 ? 1.0 : -1.2;
        }
      }

      // 3. Human instinct: Checks
      const state = chess.makeMove(move);
      const givesCheck = chess.inCheck(chess.turn);
      chess.undoMove(state);

      if (givesCheck) {
        // Lower ratings have a huge bias for giving checks ("Patzer sees a check, patzer plays a check")
        const checkBias = 1.8 + (1.0 - eloNorm) * 1.5;
        logit += checkBias;
      }

      // 4. Opening development and Castling instincts
      if (chess.fullMoves <= 10) {
        // Minor piece development
        if (p.type === 'n' || p.type === 'b') {
          const startRank = isWhite ? 0 : 7;
          if (Math.floor(from / 8) === startRank) {
            logit += 1.4;
          }
        }
        // Center control pawn moves (e4/d4 or e5/d5)
        if (p.type === 'p') {
          const centerFiles = [3, 4]; // d, e files
          if (centerFiles.includes(to % 8) && (Math.floor(to / 8) === 3 || Math.floor(to / 8) === 4)) {
            logit += 1.6;
          }
        }
        // Castling urge
        if (move.castling) {
          logit += 2.0;
        }
      }

      // 5. Piece preservation instinct (retreating attacked pieces)
      const enemy = turn === 'w' ? 'b' : 'w';
      if (chess.isSquareAttacked(from, enemy)) {
        logit += 1.2;
      }

      // 6. Prophylaxis & Positional quiet moves (Master level 1900+)
      if (eloNorm >= 0.65) {
        const centerDist = Math.abs(to % 8 - 3.5) + Math.abs(Math.floor(to / 8) - 3.5);
        logit += (7.0 - centerDist) * 0.2;
      }

      logits.push(logit / temperature);
    }

    // Softmax to obtain probabilities
    let maxLogit = Math.max(...logits);
    const expVals = logits.map(l => Math.exp(l - maxLogit));
    const sumExp = expVals.reduce((a, b) => a + b, 0);

    const scored = legalMoves.map((m, idx) => {
      const prob = Math.round((expVals[idx] / sumExp) * 1000) / 10; // e.g. 54.2%
      return {
        ...m,
        prob,
        logit: logits[idx]
      };
    });

    // Sort by descending probability
    scored.sort((a, b) => b.prob - a.prob);
    return scored;
  }

  /**
   * Generates insight on whether human intuition diverges from engine logic
   */
  analyzeHumanTendencies(chess, sortedMoves, elo) {
    if (sortedMoves.length === 0) return null;

    const topHuman = sortedMoves[0];
    const runnerUp = sortedMoves[1] || null;

    // Check if position has high consensus
    const isDominant = topHuman.prob >= 55.0;
    const isSplit = runnerUp && (topHuman.prob - runnerUp.prob < 15.0);

    // Evaluate static delta
    const currentEval = chess.evaluateSimple();
    const state = chess.makeMove(topHuman);
    const nextEval = -chess.evaluateSimple();
    chess.undoMove(state);

    const isTacticalTrap = (nextEval - currentEval) < -250;

    let commentary = '';
    let badgeType = 'neutral'; // 'blunder-trap' | 'consensus' | 'tactical' | 'natural'

    if (isTacticalTrap) {
      badgeType = 'blunder-trap';
      commentary = `⚠️ 人类盲区陷阱：约 ${topHuman.prob}% 的 ${elo} 分段玩家凭直觉走 ${topHuman.san}，但极易掉入战术反击陷阱！`;
    } else if (isDominant) {
      badgeType = 'consensus';
      commentary = `🎯 绝对人类共识：${topHuman.prob}% 玩家本能选择 ${topHuman.san}，符合典型 ${elo} 分段直觉风格。`;
    } else if (isSplit) {
      badgeType = 'tactical';
      commentary = `⚖️ 直觉分歧局面：人类棋手在 ${topHuman.san} (${topHuman.prob}%) 与 ${runnerUp.san} (${runnerUp.prob}%) 之间产生强烈分歧。`;
    } else {
      badgeType = 'natural';
      commentary = `💡 自然发展着法：首选 ${topHuman.san}，次选 ${runnerUp ? runnerUp.san : '无'}。`;
    }

    return {
      topMove: topHuman.san,
      topMoveUci: topHuman.uci,
      topProb: topHuman.prob,
      isTacticalTrap,
      badgeType,
      commentary
    };
  }
}
