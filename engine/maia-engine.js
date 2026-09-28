/**
 * Unified Maia-3 Inference Coordinator
 * Supports:
 * 1. Embedded Pre-Packaged Maia-3 Neural Weights (models/maia3_weights.bin) - 0ms instant local load
 * 2. External ONNX Runtime Web Models (session.run via WebGPU)
 * 3. Strict active turn enforcement
 */

import { ChessBoard } from './chess-core.js';
import { WebGPURunner } from './webgpu-runner.js';
import { WasmRunner } from './wasm-runner.js';
import { ModelLoader } from './model-loader.js';

export class MaiaEngine {
  constructor() {
    this.webgpuRunner = new WebGPURunner();
    this.wasmRunner = new WasmRunner();
    this.activeBackend = 'initializing';
    this.targetElo = 1500;
    this.isReady = false;
    this.localServerConnected = false;
    this.localServerModel = '';
    this.localServerDevice = '';
  }

  async initialize() {
    // 1. Check local native engine server (http://127.0.0.1:8765)
    await this.checkLocalServer();

    // 2. Initialize embedded neural weights from extension package (0ms local file)
    await ModelLoader.initEmbeddedModel();

    // 3. Initialize hardware compute pipelines (WebGPU / WASM)
    const gpuSuccess = await this.webgpuRunner.initialize();
    if (gpuSuccess) {
      this.activeBackend = 'webgpu';
    } else {
      await this.wasmRunner.initialize();
      this.activeBackend = 'wasm';
    }

    this.isReady = true;
    return this.getBackend();
  }

  async checkLocalServer() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 400);
      const res = await fetch('http://127.0.0.1:8765/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ready') {
          this.localServerConnected = true;
          this.localServerModel = data.model;
          this.localServerDevice = data.device;
          console.log(`[Maia Engine] ⚡ 连接到本地原生 ${data.model} (${data.device})!`);
          return true;
        }
      }
    } catch (e) {
      this.localServerConnected = false;
    }
    return false;
  }

  async tryLocalServerPredict(fen, elo, moves = null) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      const res = await fetch('http://127.0.0.1:8765/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen, elo, moves, top_k: 5 }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.moves) {
          this.localServerConnected = true;
          this.localServerModel = data.model;
          this.localServerDevice = data.device;
          return data;
        }
      }
    } catch (e) {
      this.localServerConnected = false;
    }
    return null;
  }

  setElo(elo) {
    this.targetElo = Math.max(600, Math.min(2600, elo));
  }

  getElo() {
    return this.targetElo;
  }

  getBackend() {
    if (this.localServerConnected) {
      return `⚡ ${this.localServerModel} (${this.localServerDevice})`;
    }
    if (ModelLoader.isModelLoaded()) {
      return `ONNX (${this.activeBackend.toUpperCase()})`;
    }
    if (ModelLoader.isEmbeddedReady) {
      return `内置神经网络 (${this.activeBackend.toUpperCase()})`;
    }
    return this.activeBackend;
  }

  isRealOnnxLoaded() {
    return this.localServerConnected || ModelLoader.isModelLoaded();
  }

  isEmbeddedReady() {
    return ModelLoader.isEmbeddedReady;
  }

  getModelName() {
    return ModelLoader.getActiveModelName();
  }

  encode18Planes(chess) {
    const tensor = new Float32Array(1 * 18 * 8 * 8);
    const pieceOrder = ['p', 'n', 'b', 'r', 'q', 'k'];

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = chess.board[r * 8 + f];
        if (!p) continue;

        const pieceIdx = pieceOrder.indexOf(p.type);
        if (pieceIdx !== -1) {
          const plane = p.color === 'w' ? pieceIdx : 6 + pieceIdx;
          tensor[plane * 64 + r * 8 + f] = 1.0;
        }
      }
    }

    const turnVal = chess.turn === 'w' ? 1.0 : 0.0;
    for (let i = 0; i < 64; i++) {
      tensor[12 * 64 + i] = turnVal;
    }

    if (chess.castling.K) tensor.fill(1.0, 13 * 64, 14 * 64);
    if (chess.castling.Q) tensor.fill(1.0, 14 * 64, 15 * 64);
    if (chess.castling.k) tensor.fill(1.0, 15 * 64, 16 * 64);
    if (chess.castling.q) tensor.fill(1.0, 16 * 64, 17 * 64);

    if (chess.epSquare !== null) {
      tensor[17 * 64 + chess.epSquare] = 1.0;
    }

    return tensor;
  }

  encodeBoard(chessBoard) {
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

  async predict(fen, elo = this.targetElo) {
    const chess = new ChessBoard(fen);
    const legalMoves = chess.getLegalMoves();

    if (legalMoves.length === 0) {
      return {
        fen,
        elo,
        turn: chess.turn,
        backend: this.getBackend(),
        isRealOnnx: this.isRealOnnxLoaded(),
        isEmbedded: this.isEmbeddedReady(),
        modelName: this.getModelName(),
        heatmap: new Float32Array(64),
        moves: [],
        analysis: {
          topMove: null,
          commentary: chess.inCheck() ? '局面处于绝杀 (Checkmate)' : '局面处于逼和 (Stalemate)'
        }
      };
    }

    let normalizedHeatmap;
    let scoredMoves;

    // 0. Native Local Maia-3 Server (79M on MPS / PyTorch hardware acceleration)
    const localData = await this.tryLocalServerPredict(fen, elo);
    if (localData && localData.moves && localData.moves.length > 0) {
      scoredMoves = localData.moves.map(m => ({
        ...m,
        from: typeof m.from === 'string' ? ChessBoard.squareToIndex(m.from) : m.from,
        to: typeof m.to === 'string' ? ChessBoard.squareToIndex(m.to) : m.to
      }));

      normalizedHeatmap = new Float32Array(localData.heatmap || 64);
      const topMove = scoredMoves[0];
      const commentary = `直觉候选: ${topMove.san} (${topMove.prob}%) · 胜率预估: ${localData.winRate}%`;

      return {
        fen: localData.fen || fen,
        elo,
        turn: localData.activeTurn || chess.turn,
        backend: `${localData.model} (${localData.device}) - ${localData.latencyMs}ms`,
        isRealOnnx: true,
        isEmbedded: false,
        isLocalServer: true,
        modelName: localData.model,
        heatmap: normalizedHeatmap,
        moves: scoredMoves,
        analysis: {
          topMove: topMove.uci,
          commentary,
          isTacticalTrap: false
        }
      };
    }

    // 1. External ONNX Model (if loaded by user)
    if (ModelLoader.isModelLoaded() && window.ort) {
      try {
        const session = ModelLoader.session;
        const planes = this.encode18Planes(chess);
        const eloNorm = (elo - 800) / 1900;

        const positionsTensor = new window.ort.Tensor('float32', planes, [1, 18, 8, 8]);
        const condTensor = new window.ort.Tensor('float32', new Float32Array([eloNorm, 0.5, 0.5]), [1, 3]);

        const feeds = {};
        const inputNames = session.inputNames;
        if (inputNames.length >= 1) feeds[inputNames[0]] = positionsTensor;
        if (inputNames.length >= 2) feeds[inputNames[1]] = condTensor;

        const results = await session.run(feeds);
        const outputTensor = results[session.outputNames[0]];
        const logits = outputTensor.data;

        const moveLogits = legalMoves.map(m => logits[m.from * 64 + m.to]);
        const maxLogit = Math.max(...moveLogits);
        const temp = Math.max(0.4, 1.2 - eloNorm * 0.5);
        const expVals = moveLogits.map(l => Math.exp((l - maxLogit) / temp));
        const sumExp = expVals.reduce((a, b) => a + b, 0);

        scoredMoves = legalMoves.map((m, idx) => ({
          ...m,
          prob: Math.round((expVals[idx] / sumExp) * 1000) / 10
        }));
        scoredMoves.sort((a, b) => b.prob - a.prob);

        normalizedHeatmap = new Float32Array(64);
        for (const m of scoredMoves) {
          normalizedHeatmap[m.to] = Math.min(1.0, normalizedHeatmap[m.to] + m.prob / 100);
        }
      } catch (e) {
        console.warn('[Maia-3] ONNX run fallback:', e);
      }
    }

    // 2. Embedded Pre-Packaged Maia-3 Neural Weights (0ms local inference)
    if (!scoredMoves && ModelLoader.isEmbeddedReady) {
      const embeddedResult = ModelLoader.evaluateEmbedded(chess, legalMoves, elo);
      if (embeddedResult) {
        scoredMoves = embeddedResult.scoredMoves;
        normalizedHeatmap = embeddedResult.heatmap;
      }
    }

    // 3. Fallback: Native WebGPU/WASM Compute Pipeline
    if (!scoredMoves) {
      const tokens = this.encodeBoard(chess);
      let output;

      if (this.activeBackend === 'webgpu') {
        try {
          output = await this.webgpuRunner.runInference(tokens, chess.turn, elo);
        } catch (err) {
          this.activeBackend = 'wasm';
          output = this.wasmRunner.runInference(tokens, chess.turn, elo);
        }
      } else {
        output = this.wasmRunner.runInference(tokens, chess.turn, elo);
      }

      const { heatmap: rawHeatmap, policy: policyMatrix } = output;
      let maxVal = 0.0001;
      for (let i = 0; i < 64; i++) {
        if (rawHeatmap[i] > maxVal) maxVal = rawHeatmap[i];
      }
      normalizedHeatmap = new Float32Array(64);
      for (let i = 0; i < 64; i++) {
        normalizedHeatmap[i] = Math.pow(rawHeatmap[i] / maxVal, 1.25);
      }

      scoredMoves = this.scoreLegalMoves(chess, legalMoves, policyMatrix, elo);
    }

    const analysis = this.analyzeHumanTendencies(chess, scoredMoves, elo);

    return {
      fen,
      elo,
      turn: chess.turn,
      backend: this.getBackend(),
      isRealOnnx: this.isRealOnnxLoaded(),
      isEmbedded: this.isEmbeddedReady(),
      modelName: this.getModelName(),
      heatmap: normalizedHeatmap,
      moves: scoredMoves,
      analysis
    };
  }

  scoreLegalMoves(chess, legalMoves, policyMatrix, elo) {
    const eloNorm = (elo - 600) / 2000;
    const temperature = Math.max(0.40, 1.25 - eloNorm * 0.65);
    const logits = [];

    for (const move of legalMoves) {
      let logit = policyMatrix[move.from * 64 + move.to];
      if (move.promo) {
        logit += (move.promo === 'q' ? 2.0 : -2.0);
      }
      logits.push(logit);
    }

    const scaledLogits = logits.map(l => l / temperature);
    const maxScaled = Math.max(...scaledLogits);
    const expVals = scaledLogits.map(l => Math.exp(l - maxScaled));
    const sumExp = expVals.reduce((a, b) => a + b, 0);

    const scored = legalMoves.map((m, idx) => ({
      ...m,
      prob: Math.round((expVals[idx] / sumExp) * 1000) / 10,
      logit: logits[idx]
    }));

    scored.sort((a, b) => b.prob - a.prob);
    return scored;
  }

  analyzeHumanTendencies(chess, sortedMoves, elo) {
    if (sortedMoves.length === 0) return null;

    const topHuman = sortedMoves[0];
    const runnerUp = sortedMoves[1] || null;

    const isDominant = topHuman.prob >= 50.0;
    const isSplit = runnerUp && (topHuman.prob - runnerUp.prob < 12.0);

    const currentEval = chess.evaluateSimple();
    const state = chess.makeMove(topHuman);
    const nextEval = -chess.evaluateSimple();
    chess.undoMove(state);

    const isTacticalTrap = (nextEval - currentEval) < -250;

    let commentary = '';
    let badgeType = 'neutral';

    if (isTacticalTrap) {
      badgeType = 'blunder-trap';
      commentary = `⚠️ 战术陷阱：约 ${topHuman.prob}% 的 ${elo} 玩家凭直觉走 ${topHuman.san}，但极易掉入防守反击陷阱！`;
    } else if (isDominant) {
      badgeType = 'consensus';
      commentary = `🎯 极高人类共识：${topHuman.prob}% 玩家本能选择 ${topHuman.san}，符合典型 ${elo} 分段直觉风格。`;
    } else if (isSplit) {
      badgeType = 'tactical';
      commentary = `⚖️ 直觉分歧局面：人类棋手在 ${topHuman.san} (${topHuman.prob}%) 与 ${runnerUp.san} (${runnerUp.prob}%) 之间产生强烈分歧。`;
    } else {
      badgeType = 'natural';
      commentary = `💡 自然发展着法：首选 ${topHuman.san} (${topHuman.prob}%)，次选 ${runnerUp ? runnerUp.san : '无'}。`;
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
