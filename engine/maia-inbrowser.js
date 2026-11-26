/**
 * Maia-3 In-Browser Neural Engine (Scheme 0: Pure Client-Side Zero-Dependency)
 * Executes the authentic Maia-3 Chessformer model directly in JavaScript Float32.
 * 100% offline, zero external server, zero Python, zero configuration.
 */

import { loadModelBytes } from './model-cache-client.js?v=20261124-mobile';
import { ChessBoard } from './chess-core.js';

const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
let cachedGemmModulePromise = null;

async function loadGemmWasmModule() {
  if (typeof WebAssembly === 'undefined' || !WebAssembly.validate(SIMD_PROBE)) return null;
  if (!cachedGemmModulePromise) {
    cachedGemmModulePromise = (async () => {
      try {
        const wasmUrl = new URL('./maia-gemm.wasm?v=20261127-maia-simd', import.meta.url);
        let bytes;
        if (wasmUrl.protocol === 'file:') {
          const { readFileSync } = await import('node:fs');
          bytes = readFileSync(new URL('./maia-gemm.wasm', import.meta.url));
        } else {
          const res = await fetch(wasmUrl);
          if (!res.ok) return null;
          bytes = await res.arrayBuffer();
        }
        return await WebAssembly.compile(bytes);
      } catch {
        return null;
      }
    })();
  }
  return cachedGemmModulePromise;
}

function decodeFp16Into(u16Arr, out) {
  if (typeof Float16Array !== 'undefined') {
    out.set(new Float16Array(u16Arr.buffer, u16Arr.byteOffset, u16Arr.length));
    return out;
  }
  const len = u16Arr.length;
  for (let i = 0; i < len; i++) {
    const h = u16Arr[i];
    const sign = (h & 0x8000) >> 15;
    const exp = (h & 0x7c00) >> 10;
    const mant = h & 0x03ff;
    if (exp === 0) {
      out[i] = (sign ? -1 : 1) * Math.pow(2, -14) * (mant / 1024);
    } else if (exp === 0x1f) {
      out[i] = mant ? NaN : ((sign ? -1 : 1) * Infinity);
    } else {
      out[i] = (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + mant / 1024);
    }
  }
  return out;
}

export class MaiaInBrowserEngine {
  constructor({ useWasm = true } = {}) {
    this.isReady = false;
    this.meta = null;
    this.tensors = {};
    this.allMoves = [];
    this.allMovesDict = {};
    this.initPromise = null;
    this.modelSource = 'unknown';
    this._scratch = null;
    this._scratchInUse = false;
    this._useWasm = useWasm;
    this._wasm = null;
    this.backend = 'js';
  }

  reset() {
    this.isReady = false;
    this.initPromise = null;
    this.meta = null;
    this.tensors = {};
    this.modelSource = 'unknown';
    this._scratch = null;
    this._scratchInUse = false;
    this._wasm = null;
    this.backend = 'js';
  }

  _acquireScratch({ D, numHeads, inputDim, ffDim, sm2OutDim, sm3OutDim, pDim }) {
    const key = `${D}|${numHeads}|${inputDim}|${ffDim}|${sm2OutDim}|${sm3OutDim}|${pDim}`;
    const create = (pooled) => ({
      key,
      pooled,
      tokens: new Float32Array(64 * inputDim),
      X: new Float32Array(64 * D),
      Q: new Float32Array(64 * D),
      K: new Float32Array(64 * D),
      V: new Float32Array(64 * D),
      y1: pDim ? new Float32Array(64 * pDim) : null,
      xMean: new Float32Array(D),
      sm2Out: new Float32Array(sm2OutDim),
      sm3Out: new Float32Array(sm3OutDim),
      gabBias: new Float32Array(numHeads * 4096),
      saOut: new Float32Array(64 * D),
      scores: new Float32Array(64),
      ffMid: new Float32Array(ffDim),
      sqFrom: new Float32Array(64 * D),
      sqTo: new Float32Array(64 * D),
      scoresBase: new Float32Array(4096),
      promoBiases: new Float32Array(32),
      promoLogits: new Float32Array(256),
      allLogits: new Float32Array(4352),
      squareWeights: new Float32Array(64)
    });
    if (this._scratchInUse) return create(false);
    this._scratchInUse = true;
    if (!this._scratch || this._scratch.key !== key) this._scratch = create(true);
    return this._scratch;
  }

  _releaseScratch(pool) {
    if (pool?.pooled && this._scratch === pool) this._scratchInUse = false;
  }

  async loadModel(urlOrBuffer = 'https://weights.4chess.cc/maia3_model.bin', onProgress = null, expected = null, options) {
    if (this.isReady) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        let arrayBuffer;
        if (urlOrBuffer instanceof ArrayBuffer) {
          arrayBuffer = urlOrBuffer;
          this.modelSource = 'memory';
        } else {
          const loaded = await loadModelBytes(urlOrBuffer, onProgress, expected, options);
          arrayBuffer = loaded.buffer;
          this.modelSource = loaded.source;
          this.cachePersisted = loaded.persisted;
        }

        if (!arrayBuffer) {
          throw new Error('No model buffer received');
        }

        const view = new DataView(arrayBuffer);
        const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
        if (magic !== 'M3CF') {
          throw new Error('Invalid Maia-3 binary magic header');
        }

        const metaLen = view.getUint32(4, true);
        const metaBytes = new Uint8Array(arrayBuffer, 8, metaLen);
        const metaStr = new TextDecoder().decode(metaBytes);
        this.meta = JSON.parse(metaStr);
        for (const [key, value] of Object.entries(expected || {})) {
          if (this.meta[key] !== value) throw new Error(`Unexpected Maia model ${key}: ${this.meta[key]}`);
        }

        const payloadOffset = 8 + metaLen;
        const payloadBytes = new Uint8Array(arrayBuffer, payloadOffset);
        const isFp16 = this.meta.dtype === 'float16';
        const tensorEntries = Object.entries(this.meta.tensors || {});
        const hasTransformer = tensorEntries.length > 0 &&
          this.meta.dim_vit > 0 &&
          this.meta.num_heads > 0 &&
          !!this.meta.tensors['transformer.layers.0.linear1.bias'];

        let wasmReady = false;
        const wasmModule = this._useWasm && hasTransformer ? await loadGemmWasmModule() : null;
        if (wasmModule) {
          try {
            const D = this.meta.dim_vit;
            const numHeads = this.meta.num_heads;
            const ffDim = this.meta.tensors['transformer.layers.0.linear1.bias'].shape[0];
            const sm1Info = this.meta.tensors['transformer.layers.0.self_attn.sm1.bias'];
            const pDim = sm1Info ? sm1Info.shape[0] : 0;
            const sm2OutDim = this.meta.tensors['transformer.layers.0.self_attn.sm2.bias'].shape[0];
            const sm3OutDim = this.meta.tensors['transformer.layers.0.self_attn.sm3.bias'].shape[0];

            const align16 = n => (n + 15) & ~15;
            let offset = 16;
            const alloc = floats => {
              const pos = offset;
              offset = align16(offset + floats * 4);
              return pos;
            };

            const scratchOffsets = {
              tokens: alloc(64 * 352),
              X: alloc(64 * D),
              Q: alloc(64 * D),
              K: alloc(64 * D),
              V: alloc(64 * D),
              saOut: alloc(64 * D),
              sqFrom: alloc(64 * D),
              sqTo: alloc(64 * D),
              y1: pDim ? alloc(64 * pDim) : 0,
              xMean: alloc(D),
              sm2Out: alloc(sm2OutDim),
              sm3Out: alloc(sm3OutDim),
              gabBias: alloc(numHeads * 4096),
              attnScores: alloc(4096),
              ffMid: alloc(64 * ffDim),
              scoresBase: alloc(4096)
            };

            const tensorOffsets = {};
            for (const [name, info] of tensorEntries) {
              tensorOffsets[name] = offset;
              offset = align16(offset + info.numel * 4);
            }

            const pages = Math.ceil(offset / 65536);
            const memory = new WebAssembly.Memory({ initial: pages });
            const instance = new WebAssembly.Instance(wasmModule, { env: { memory } });

            const scratchViews = {
              tokens: new Float32Array(memory.buffer, scratchOffsets.tokens, 64 * 352),
              X: new Float32Array(memory.buffer, scratchOffsets.X, 64 * D),
              Q: new Float32Array(memory.buffer, scratchOffsets.Q, 64 * D),
              K: new Float32Array(memory.buffer, scratchOffsets.K, 64 * D),
              V: new Float32Array(memory.buffer, scratchOffsets.V, 64 * D),
              saOut: new Float32Array(memory.buffer, scratchOffsets.saOut, 64 * D),
              sqFrom: new Float32Array(memory.buffer, scratchOffsets.sqFrom, 64 * D),
              sqTo: new Float32Array(memory.buffer, scratchOffsets.sqTo, 64 * D),
              y1: pDim ? new Float32Array(memory.buffer, scratchOffsets.y1, 64 * pDim) : null,
              xMean: new Float32Array(memory.buffer, scratchOffsets.xMean, D),
              sm2Out: new Float32Array(memory.buffer, scratchOffsets.sm2Out, sm2OutDim),
              sm3Out: new Float32Array(memory.buffer, scratchOffsets.sm3Out, sm3OutDim),
              gabBias: new Float32Array(memory.buffer, scratchOffsets.gabBias, numHeads * 4096),
              attnScores: new Float32Array(memory.buffer, scratchOffsets.attnScores, 4096),
              ffMid: new Float32Array(memory.buffer, scratchOffsets.ffMid, 64 * ffDim),
              scoresBase: new Float32Array(memory.buffer, scratchOffsets.scoresBase, 4096)
            };

            for (const [name, info] of tensorEntries) {
              const totalOffset = payloadBytes.byteOffset + info.offset;
              const target = new Float32Array(memory.buffer, tensorOffsets[name], info.numel);
              if (isFp16) {
                const encoded = totalOffset % 2 === 0
                  ? new Uint16Array(arrayBuffer, totalOffset, info.numel)
                  : new Uint16Array(arrayBuffer.slice(totalOffset, totalOffset + info.numel * 2));
                decodeFp16Into(encoded, target);
              } else if (totalOffset % 4 === 0) {
                target.set(new Float32Array(payloadBytes.buffer, totalOffset, info.numel));
              } else {
                target.set(new Float32Array(payloadBytes.buffer.slice(totalOffset, totalOffset + info.numel * 4)));
              }
            }

            this._wasm = { memory, exports: instance.exports, tensorOffsets, scratchOffsets, scratchViews };
            this.tensors = {};
            for (const [name, info] of tensorEntries) {
              this.tensors[name] = new Float32Array(memory.buffer, tensorOffsets[name], info.numel);
            }
            this.backend = 'wasm-simd';
            wasmReady = true;
          } catch (err) {
            console.warn('[Maia-3 InBrowser] WASM SIMD setup failed, falling back to JS:', err);
            this._wasm = null;
            this.tensors = {};
            this.backend = 'js';
          }
        }

        if (!wasmReady) {
          this.backend = 'js';
          for (const [name, info] of tensorEntries) {
            const totalOffset = payloadBytes.byteOffset + info.offset;
            if (isFp16) {
              const encoded = totalOffset % 2 === 0
                ? new Uint16Array(arrayBuffer, totalOffset, info.numel)
                : new Uint16Array(arrayBuffer.slice(totalOffset, totalOffset + info.numel * 2));
              this.tensors[name] = decodeFp16Into(encoded, new Float32Array(info.numel));
            } else {
              if (totalOffset % 4 === 0) {
                this.tensors[name] = new Float32Array(
                  payloadBytes.buffer,
                  totalOffset,
                  info.numel
                );
              } else {
                const slice = payloadBytes.buffer.slice(totalOffset, totalOffset + info.numel * 4);
                this.tensors[name] = new Float32Array(slice);
              }
            }
          }
        }

        this.initVocab();
        this.isReady = true;
        console.log(`[Maia-3 InBrowser] ✅ 成功就绪! 参数量: ${this.meta.total_params.toLocaleString()} (来源: ${this.modelSource}, 后端: ${this.backend})`);
        return true;
      } catch (err) {
        this.initPromise = null;
        throw err;
      }
    })();

    return this.initPromise;
  }

  initVocab() {
    const moves = [];
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const sq = rank * 8 + file;
        const sqName = String.fromCharCode(97 + file) + (rank + 1);
        for (let tRank = 0; tRank < 8; tRank++) {
          for (let tFile = 0; tFile < 8; tFile++) {
            const tSqName = String.fromCharCode(97 + tFile) + (tRank + 1);
            moves.push(sqName + tSqName);
          }
        }
      }
    }
    // Promotions from rank 7 to rank 8 (white perspective)
    for (const fFrom of 'abcdefgh') {
      for (const fTo of 'abcdefgh') {
        for (const p of ['q', 'r', 'b', 'n']) {
          moves.push(`${fFrom}7${fTo}8${p}`);
        }
      }
    }
    this.allMoves = moves;
    this.allMovesDict = {};
    for (let i = 0; i < moves.length; i++) {
      this.allMovesDict[moves[i]] = i;
    }
  }

  interpolateElo(elo) {
    const upper = 5000.0;
    const clamped = Math.max(0.0, Math.min(upper, elo));
    const wLow = clamped / upper;
    const wHigh = 1.0 - wLow;

    const low = this.tensors['elo_embedding_low.weight'];
    const high = this.tensors['elo_embedding_high.weight'];
    const D = 128;
    const out = new Float32Array(D);
    for (let i = 0; i < D; i++) {
      out[i] = wLow * low[i] + wHigh * high[i];
    }
    return out;
  }

  mirrorSquare(sq) {
    const f = sq[0];
    const r = String(9 - parseInt(sq[1], 10));
    return f + r;
  }

  mirrorMove(uci) {
    const isPromo = uci.length > 4;
    const from = this.mirrorSquare(uci.slice(0, 2));
    const to = this.mirrorSquare(uci.slice(2, 4));
    return from + to + (isPromo ? uci.slice(4) : '');
  }

  /**
   * Tokenizes a board into 64x12 Float32Array (mirrored if Black to move)
   * Piece map: P:1, N:2, B:3, R:4, Q:5, K:6, Black pieces +6
   */
  static tokenizeBoard(chessBoard) {
    const isBlack = chessBoard.turn === 'b';
    const pieceMap = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
    const boardTokens = new Float32Array(64 * 12);

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const actualSq = isBlack ? (7 - r) * 8 + f : r * 8 + f;
        const normSq = r * 8 + f;
        const piece = chessBoard.board[actualSq];
        if (piece) {
          let mapped = pieceMap[piece.type];
          let color = piece.color;
          if (isBlack) {
            color = color === 'w' ? 'b' : 'w'; // swap colors
          }
          if (color === 'b') mapped += 6;
          boardTokens[normSq * 12 + (mapped - 1)] = 1.0;
        }
      }
    }
    return boardTokens;
  }

  /**
   * Forward pass: computes move distribution and attention heatmap
   * Supports both FEN-only mode (current board repeated 8 times) and
   * real move history (up to 8 half-moves reconstructed from chronological sequence).
   */
  async predict(chessBoard, targetElo = 1900, abortCheck = null, history = null) {
    if (abortCheck?.()) return null;
    if (!this.isReady) {
      throw new Error('Maia-3 In-Browser model is not loaded');
    }

    const tStart = performance.now();
    const D = this.meta.dim_vit; // 256
    const numHeads = this.meta.num_heads; // 8
    const headDim = D / numHeads; // 32
    const numBlocks = this.meta.num_blocks; // 8

    const isBlack = chessBoard.turn === 'b';
    const legalMoves = chessBoard.getLegalMoves();
    if (legalMoves.length === 0) {
      return {
        moves: [],
        heatmap: new Float32Array(64),
        latencyMs: 0
      };
    }

    // 1. Elo embeddings
    const selfEloEmb = this.interpolateElo(targetElo);
    const oppoEloEmb = this.interpolateElo(targetElo);

    // 2. Tokenize board history (up to 8 positions: oldest to newest)
    const currentTokens = MaiaInBrowserEngine.tokenizeBoard(chessBoard);
    const planes = [];

    if (history && Array.isArray(history) && history.length > 0) {
      const historyBoards = [];
      for (const item of history) {
        if (item instanceof ChessBoard) {
          historyBoards.push(item);
        } else if (typeof item === 'string') {
          const b = new ChessBoard(item);
          if (b.isValid) historyBoards.push(b);
        } else if (item && item.fen) {
          const b = new ChessBoard(item.fen);
          if (b.isValid) historyBoards.push(b);
        }
      }
      historyBoards.push(chessBoard);

      const recent = historyBoards.slice(-8);
      const tokenized = recent.map(b => (b === chessBoard ? currentTokens : MaiaInBrowserEngine.tokenizeBoard(b)));

      // Pad with earliest position if < 8 (matching official Maia3 get_historical_tokens)
      const padCount = 8 - tokenized.length;
      for (let i = 0; i < padCount; i++) {
        planes.push(tokenized[0]);
      }
      for (const t of tokenized) {
        planes.push(t);
      }
    } else {
      // FEN-only mode: Replicate current board 8 times (official Maia3 UCI default when --use_uci_history is False)
      for (let h = 0; h < 8; h++) {
        planes.push(currentTokens);
      }
    }

    // Concatenate 8 history planes (64, 96) + 256 elo -> inputDim = 352
    const inputDim = 12 * 8 + 256; // 352
    const sm1B0 = this.tensors['transformer.layers.0.self_attn.sm1.bias'];
    const ffDim = this.tensors['transformer.layers.0.linear1.bias'].length;
    const sm2OutDim = this.tensors['transformer.layers.0.self_attn.sm2.bias'].length;
    const sm3OutDim = this.tensors['transformer.layers.0.self_attn.sm3.bias'].length;
    const useWasm = !!this._wasm && !this._scratchInUse;
    let pool = null;
    if (useWasm) {
      this._scratchInUse = true;
    } else {
      pool = this._acquireScratch({
        D,
        numHeads,
        inputDim,
        ffDim,
        sm2OutDim,
        sm3OutDim,
        pDim: sm1B0 ? sm1B0.length : 0
      });
    }
    const tokens = useWasm ? this._wasm.scratchViews.tokens : pool.tokens;
    const sqToView = useWasm ? this._wasm.scratchViews.sqTo : pool.sqTo;
    const scoresBaseView = useWasm ? this._wasm.scratchViews.scoresBase : pool.scoresBase;
    const promoBiases = useWasm ? (this._promoBiases ||= new Float32Array(32)) : pool.promoBiases;
    const promoLogits = useWasm ? (this._promoLogits ||= new Float32Array(256)) : pool.promoLogits;
    const allLogits = useWasm ? (this._allLogits ||= new Float32Array(4352)) : pool.allLogits;
    const squareWeights = useWasm ? (this._squareWeights ||= new Float32Array(64)) : pool.squareWeights;

    try {
    for (let sq = 0; sq < 64; sq++) {
      const sqOffset = sq * inputDim;
      for (let h = 0; h < 8; h++) {
        const planeTokens = planes[h];
        const planeSqOffset = sq * 12;
        const targetOffset = sqOffset + h * 12;
        for (let p = 0; p < 12; p++) {
          tokens[targetOffset + p] = planeTokens[planeSqOffset + p];
        }
      }
      // Self Elo (128)
      for (let i = 0; i < 128; i++) {
        tokens[sqOffset + 96 + i] = selfEloEmb[i];
      }
      // Oppo Elo (128)
      for (let i = 0; i < 128; i++) {
        tokens[sqOffset + 96 + 128 + i] = oppoEloEmb[i];
      }
    }

    if (useWasm) {
      const w = this._wasm.exports;
      const to = this._wasm.tensorOffsets;
      const so = this._wasm.scratchOffsets;
      const sv = this._wasm.scratchViews;

      // 3. Token Projection: (64, 352) -> (64, D)
      w.sgemm_nt(so.X, so.tokens, to['token_projection.weight'], to['token_projection.bias'], 64, D, inputDim, 2);

      // 4. Shared GAB Weight: [4096, genSize]
      const gabSharedOff = to['gab_shared_weight'] || 0;
      const gabSharedLen = this.tensors['gab_shared_weight']?.length || 0;
      const scale = 1.0 / Math.sqrt(headDim);
      const qkvStride = D * D * 4;

      // 5. Transformer Blocks (0..7)
      for (let b = 0; b < numBlocks; b++) {
        if (b > 0 && b % 2 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
        if (abortCheck?.()) return null;
        const pfx = `transformer.layers.${b}`;
        const inProjOff = to[`${pfx}.self_attn.mha.in_proj_weight`];

        w.sgemm_nt(so.Q, so.X, inProjOff, 0, 64, D, D, 0);
        w.sgemm_nt(so.K, so.X, inProjOff + qkvStride, 0, 64, D, D, 0);
        w.sgemm_nt(so.V, so.X, inProjOff + 2 * qkvStride, 0, 64, D, D, 0);

        const sm1W = to[`${pfx}.self_attn.sm1.weight`];
        const sm1B = to[`${pfx}.self_attn.sm1.bias`];
        let sm2InOff, sm2InDim;
        if (sm1W && sm1B) {
          const p = this.tensors[`${pfx}.self_attn.sm1.bias`].length;
          w.sgemm_nt(so.y1, so.X, sm1W, sm1B, 64, p, D, 2);
          sm2InOff = so.y1;
          sm2InDim = 64 * p;
        } else {
          const X = sv.X, xMean = sv.xMean;
          xMean.fill(0);
          for (let i = 0; i < 64; i++) {
            const xOff = i * D;
            for (let d = 0; d < D; d++) xMean[d] += X[xOff + d];
          }
          for (let d = 0; d < D; d++) xMean[d] /= 64.0;
          sm2InOff = so.xMean;
          sm2InDim = D;
        }

        w.sgemm_nt(so.sm2Out, sm2InOff, to[`${pfx}.self_attn.sm2.weight`], to[`${pfx}.self_attn.sm2.bias`], 1, sm2OutDim, sm2InDim, 2);
        const sm2Out = sv.sm2Out;
        for (let d = 0; d < sm2OutDim; d++) sm2Out[d] = this.gelu(sm2Out[d]);
        this.layerNormInPlace(sm2Out, this.tensors[`${pfx}.self_attn.ln1.weight`], this.tensors[`${pfx}.self_attn.ln1.bias`]);

        w.sgemm_nt(so.sm3Out, so.sm2Out, to[`${pfx}.self_attn.sm3.weight`], to[`${pfx}.self_attn.sm3.bias`], 1, sm3OutDim, sm2OutDim, 2);
        const sm3Out = sv.sm3Out;
        for (let d = 0; d < sm3OutDim; d++) sm3Out[d] = this.gelu(sm3Out[d]);
        this.layerNormInPlace(sm3Out, this.tensors[`${pfx}.self_attn.ln2.weight`], this.tensors[`${pfx}.self_attn.ln2.bias`]);

        const gabLayerOff = to[`${pfx}.self_attn.gab_weight`] || gabSharedOff;
        const gabLayerLen = this.tensors[`${pfx}.self_attn.gab_weight`]?.length || gabSharedLen;
        const genSize = gabLayerLen / 4096;
        w.sgemm_nt(so.gabBias, so.sm3Out, gabLayerOff, 0, numHeads, 4096, genSize, 0);

        const attnScores = sv.attnScores;
        for (let h = 0; h < numHeads; h++) {
          const hOffset = h * headDim;
          w.mha_head_qk(so.attnScores, so.Q, so.K, so.gabBias + h * 4096 * 4, D, hOffset, headDim, scale);
          for (let i = 0; i < 64; i++) {
            const rowOff = i * 64;
            let maxScore = -1e9;
            for (let j = 0; j < 64; j++) {
              const s = attnScores[rowOff + j];
              if (s > maxScore) maxScore = s;
            }
            let sumExp = 0;
            for (let j = 0; j < 64; j++) {
              const e = Math.exp(attnScores[rowOff + j] - maxScore);
              attnScores[rowOff + j] = e;
              sumExp += e;
            }
            const invSum = 1.0 / sumExp;
            for (let j = 0; j < 64; j++) attnScores[rowOff + j] *= invSum;
          }
          w.mha_head_av(so.saOut, so.attnScores, so.V, D, hOffset, headDim);
        }

        w.sgemm_nt(so.X, so.saOut, to[`${pfx}.self_attn.mha.out_proj.weight`], 0, 64, D, D, 1);
        const norm1W = this.tensors[`${pfx}.norm1.weight`];
        for (let i = 0; i < 64; i++) this.rmsNormInPlace(sv.X, i * D, D, norm1W);

        w.sgemm_nt(so.ffMid, so.X, to[`${pfx}.linear1.weight`], to[`${pfx}.linear1.bias`], 64, ffDim, D, 2);
        const ffMid = sv.ffMid;
        const totalFf = 64 * ffDim;
        for (let m = 0; m < totalFf; m++) ffMid[m] = this.gelu(ffMid[m]);

        w.sgemm_nt(so.X, so.ffMid, to[`${pfx}.linear2.weight`], to[`${pfx}.linear2.bias`], 64, D, ffDim, 3);
        const norm2W = this.tensors[`${pfx}.norm2.weight`];
        for (let i = 0; i < 64; i++) this.rmsNormInPlace(sv.X, i * D, D, norm2W);
      }
      if (abortCheck && abortCheck()) return null;

      // Final Transformer LayerNorm
      const tNormW = this.tensors['transformer.norm.weight'];
      const tNormB = this.tensors['transformer.norm.bias'];
      for (let i = 0; i < 64; i++) {
        const xOff = i * D;
        this.layerNormInPlace(sv.X.subarray(xOff, xOff + D), tNormW, tNormB);
      }

      // 6. Policy Head
      w.sgemm_nt(so.sqFrom, so.X, to['proj_sq_from.weight'], 0, 64, D, D, 0);
      w.sgemm_nt(so.sqTo, so.X, to['proj_sq_to.weight'], 0, 64, D, D, 0);
      w.sgemm_nt_scale(so.scoresBase, so.sqFrom, so.sqTo, 64, 64, D, 1.0 / Math.sqrt(D));
    } else {
    const {
      X, Q, K, V, y1, xMean, sm2Out, sm3Out, gabBias, saOut, scores, ffMid,
      sqFrom, sqTo, scoresBase
    } = pool;

    // 3. Token Projection: (64, 352) -> (64, D)
    const tpW = this.tensors['token_projection.weight']; // [D, 352]
    const tpB = this.tensors['token_projection.bias']; // [D]

    for (let i = 0; i < 64; i++) {
      for (let d = 0; d < D; d++) {
        let sum = tpB[d];
        const wOffset = d * inputDim;
        const tOffset = i * inputDim;
        for (let k = 0; k < inputDim; k++) {
          sum += tpW[wOffset + k] * tokens[tOffset + k];
        }
        X[i * D + d] = sum;
      }
    }

    // 4. Shared GAB Weight: [4096, 64]
    const gabSharedWeight = this.tensors['gab_shared_weight'];

    // 5. Transformer Blocks (0..7)
    for (let b = 0; b < numBlocks; b++) {
      if (b > 0 && b % 2 === 0) {
        // Yield to browser UI thread to maintain 60 FPS piece animation
        await new Promise(r => setTimeout(r, 0));
      }
      if (abortCheck?.()) return null;
      const pfx = `transformer.layers.${b}`;

      // --- Self-Attention ---
      const inProjW = this.tensors[`${pfx}.self_attn.mha.in_proj_weight`]; // [3*D, D]
      const outProjW = this.tensors[`${pfx}.self_attn.mha.out_proj.weight`]; // [D, D]
      const norm1W = this.tensors[`${pfx}.norm1.weight`]; // [D]

      // GAB sub-layers
      const sm1W = this.tensors[`${pfx}.self_attn.sm1.weight`]; // [p, D] if present
      const sm1B = this.tensors[`${pfx}.self_attn.sm1.bias`]; // [p]
      const sm2W = this.tensors[`${pfx}.self_attn.sm2.weight`]; // [hdim, inDim]
      const sm2B = this.tensors[`${pfx}.self_attn.sm2.bias`];
      const sm3W = this.tensors[`${pfx}.self_attn.sm3.weight`]; // [H*gen, hdim]
      const sm3B = this.tensors[`${pfx}.self_attn.sm3.bias`];
      const ln1W = this.tensors[`${pfx}.self_attn.ln1.weight`];
      const ln1B = this.tensors[`${pfx}.self_attn.ln1.bias`];
      const ln2W = this.tensors[`${pfx}.self_attn.ln2.weight`];
      const ln2B = this.tensors[`${pfx}.self_attn.ln2.bias`];
      const gabLayerWeight = this.tensors[`${pfx}.self_attn.gab_weight`] || gabSharedWeight;

      // Compute Q, K, V: [64, D] each
      for (let i = 0; i < 64; i++) {
        const xOffset = i * D;
        for (let d = 0; d < D; d++) {
          let sumQ = 0, sumK = 0, sumV = 0;
          const wqOffset = d * D;
          const wkOffset = (D + d) * D;
          const wvOffset = (2 * D + d) * D;
          for (let k = 0; k < D; k++) {
            const xk = X[xOffset + k];
            sumQ += inProjW[wqOffset + k] * xk;
            sumK += inProjW[wkOffset + k] * xk;
            sumV += inProjW[wvOffset + k] * xk;
          }
          Q[i * D + d] = sumQ;
          K[i * D + d] = sumK;
          V[i * D + d] = sumV;
        }
      }

      // Compute GAB square bias
      let sm2In;
      let sm2InDim;

      if (sm1W && sm1B) {
        // Architecture with per-square GAB projection (23M, 79M)
        const p = sm1B.length;
        for (let i = 0; i < 64; i++) {
          const xOffset = i * D;
          const yOffset = i * p;
          for (let d1 = 0; d1 < p; d1++) {
            let s = sm1B[d1];
            const wOff = d1 * D;
            for (let k = 0; k < D; k++) s += sm1W[wOff + k] * X[xOffset + k];
            y1[yOffset + d1] = s;
          }
        }
        sm2In = y1;
        sm2InDim = 64 * p;
      } else {
        // Mean pooling architecture (5M)
        xMean.fill(0);
        for (let i = 0; i < 64; i++) {
          for (let d = 0; d < D; d++) xMean[d] += X[i * D + d];
        }
        for (let d = 0; d < D; d++) xMean[d] /= 64.0;
        sm2In = xMean;
        sm2InDim = D;
      }

      // 2. sm2 -> GELU -> LN1
      for (let d = 0; d < sm2OutDim; d++) {
        let s = sm2B[d];
        const wOff = d * sm2InDim;
        for (let k = 0; k < sm2InDim; k++) s += sm2W[wOff + k] * sm2In[k];
        sm2Out[d] = this.gelu(s);
      }
      this.layerNormInPlace(sm2Out, ln1W, ln1B);

      // 3. sm3 -> GELU -> LN2
      for (let d = 0; d < sm3OutDim; d++) {
        let s = sm3B[d];
        const wOff = d * sm2OutDim;
        for (let k = 0; k < sm2OutDim; k++) s += sm3W[wOff + k] * sm2Out[k];
        sm3Out[d] = this.gelu(s);
      }
      this.layerNormInPlace(sm3Out, ln2W, ln2B);

      // 4. bias = GAB_weight (4096, genSize) @ sm3Out -> [numHeads, 4096]
      const genSize = gabLayerWeight.length / 4096;
      for (let h = 0; h < numHeads; h++) {
        const headVecOffset = h * genSize;
        const headBiasOffset = h * 4096;
        for (let pair = 0; pair < 4096; pair++) {
          let bSum = 0;
          const wOff = pair * genSize;
          for (let k = 0; k < genSize; k++) {
            bSum += gabLayerWeight[wOff + k] * sm3Out[headVecOffset + k];
          }
          gabBias[headBiasOffset + pair] = bSum;
        }
      }

      // 5. Multi-head Scaled Dot-Product Attention
      const scale = 1.0 / Math.sqrt(headDim);

      for (let h = 0; h < numHeads; h++) {
        const hOffset = h * headDim;
        const hBiasOffset = h * 4096;

        for (let i = 0; i < 64; i++) {
          const qiOffset = i * D + hOffset;
          // Compute scores for row i
          let maxScore = -1e9;

          for (let j = 0; j < 64; j++) {
            const kjOffset = j * D + hOffset;
            let dot = 0;
            for (let k = 0; k < headDim; k++) {
              dot += Q[qiOffset + k] * K[kjOffset + k];
            }
            const s = dot * scale + gabBias[hBiasOffset + i * 64 + j];
            scores[j] = s;
            if (s > maxScore) maxScore = s;
          }

          // Softmax
          let sumExp = 0;
          for (let j = 0; j < 64; j++) {
            scores[j] = Math.exp(scores[j] - maxScore);
            sumExp += scores[j];
          }
          for (let j = 0; j < 64; j++) {
            scores[j] /= sumExp;
          }

          // Multiply by V
          for (let k = 0; k < headDim; k++) {
            let vSum = 0;
            for (let j = 0; j < 64; j++) {
              vSum += scores[j] * V[j * D + hOffset + k];
            }
            saOut[i * D + hOffset + k] = vSum;
          }
        }
      }

      // Out projection: [64, D] @ [D, D].T
      // and Residual + RMSNorm1
      const norm2W = this.tensors[`${pfx}.norm2.weight`];
      const lin1W = this.tensors[`${pfx}.linear1.weight`]; // [512, D]
      const lin1B = this.tensors[`${pfx}.linear1.bias`];
      const lin2W = this.tensors[`${pfx}.linear2.weight`]; // [D, 512]
      const lin2B = this.tensors[`${pfx}.linear2.bias`];

      for (let i = 0; i < 64; i++) {
        const xOff = i * D;
        for (let d = 0; d < D; d++) {
          let proj = 0;
          const wOff = d * D;
          for (let k = 0; k < D; k++) {
            proj += outProjW[wOff + k] * saOut[i * D + k];
          }
          X[xOff + d] += proj; // residual
        }
        // RMSNorm1 in-place
        this.rmsNormInPlace(X, xOff, D, norm1W);

        // FeedForward: Linear1 -> GELU -> Linear2 -> Residual -> RMSNorm2
        for (let m = 0; m < ffDim; m++) {
          let s = lin1B[m];
          const wOff = m * D;
          for (let k = 0; k < D; k++) s += lin1W[wOff + k] * X[xOff + k];
          ffMid[m] = this.gelu(s);
        }

        for (let d = 0; d < D; d++) {
          let s = lin2B[d];
          const wOff = d * ffDim;
          for (let k = 0; k < ffDim; k++) s += lin2W[wOff + k] * ffMid[k];
          X[xOff + d] += s; // residual
        }
        // RMSNorm2 in-place
        this.rmsNormInPlace(X, xOff, D, norm2W);
      }
    }
    if (abortCheck && abortCheck()) return null;

    // Final Transformer LayerNorm:
    const tNormW = this.tensors['transformer.norm.weight'];
    const tNormB = this.tensors['transformer.norm.bias'];
    for (let i = 0; i < 64; i++) {
      const xOff = i * D;
      const tok = X.subarray(xOff, xOff + D);
      this.layerNormInPlace(tok, tNormW, tNormB);
    }

    // 6. Policy Head:
    // proj_sq_from (256, 256), proj_sq_to (256, 256)
    const fromW = this.tensors['proj_sq_from.weight'];
    const toW = this.tensors['proj_sq_to.weight'];

    for (let i = 0; i < 64; i++) {
      for (let d = 0; d < D; d++) {
        let sf = 0, st = 0;
        const wOff = d * D;
        for (let k = 0; k < D; k++) {
          const xk = X[i * D + k];
          sf += fromW[wOff + k] * xk;
          st += toW[wOff + k] * xk;
        }
        sqFrom[i * D + d] = sf;
        sqTo[i * D + d] = st;
      }
    }

    // Base square-to-square scores: (64, 64) / sqrt(D)
    const pScale = 1.0 / Math.sqrt(D);
    for (let i = 0; i < 64; i++) {
      for (let j = 0; j < 64; j++) {
        let dot = 0;
        for (let k = 0; k < D; k++) {
          dot += sqFrom[i * D + k] * sqTo[j * D + k];
        }
        scoresBase[i * 64 + j] = dot * pScale;
      }
    }
    }

    // Promotions: 8 files from rank 7 (sq 48..55) to rank 8 (sq 56..63)
    const promoW = this.tensors['promo_bias_proj.weight']; // [4, 256]
    for (let f = 0; f < 8; f++) {
      const rank8Sq = 56 + f;
      for (let p = 0; p < 4; p++) {
        let bSum = 0;
        const wOff = p * D;
        for (let k = 0; k < D; k++) {
          bSum += promoW[wOff + k] * sqToView[rank8Sq * D + k];
        }
        promoBiases[f * 4 + p] = bSum * Math.sqrt(D);
      }
    }

    let pIdx = 0;
    for (let fFrom = 0; fFrom < 8; fFrom++) {
      const fromSq = 48 + fFrom;
      for (let fTo = 0; fTo < 8; fTo++) {
        const toSq = 56 + fTo;
        const base = scoresBaseView[fromSq * 64 + toSq];
        for (let p = 0; p < 4; p++) {
          promoLogits[pIdx++] = base + promoBiases[fTo * 4 + p];
        }
      }
    }

    // Combined logits: [4096 + 256 = 4352]
    allLogits.set(scoresBaseView, 0);
    allLogits.set(promoLogits, 4096);

    // 7. Legal Moves Masking & Softmax
    // If Black to move, legal moves are mirrored to White frame of reference
    const legalMirrored = legalMoves.map(m => isBlack ? this.mirrorMove(m.uci) : m.uci);
    const validLegalMoves = [];
    const validLogits = [];

    for (let i = 0; i < legalMoves.length; i++) {
      const key = legalMirrored[i];
      if (key in this.allMovesDict) {
        const idx = this.allMovesDict[key];
        validLogits.push(allLogits[idx]);
        validLegalMoves.push(legalMoves[i]);
      }
    }

    // Softmax
    const maxL = Math.max(...validLogits);
    const expL = validLogits.map(l => Math.exp(l - maxL));
    const sumL = expL.reduce((a, b) => a + b, 0);
    const probs = expL.map(e => e / sumL);

    // Format scored moves & square heatmap
    // Square heatmap represents candidate move destination square probability aggregation (sum of move probabilities targeting each square)
    const scored = [];
    squareWeights.fill(0);

    for (let i = 0; i < validLegalMoves.length; i++) {
      const m = validLegalMoves[i];
      const p = probs[i];
      scored.push({
        ...m,
        prob: Math.round(p * 10000) / 100,
        rawProb: p
      });
      squareWeights[m.to] += p;
    }

    scored.sort((a, b) => b.prob - a.prob);

    // Normalize heatmap
    let maxW = 0.0001;
    for (let i = 0; i < 64; i++) {
      if (squareWeights[i] > maxW) maxW = squareWeights[i];
    }
    const heatmap = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      heatmap[i] = Math.round((squareWeights[i] / maxW) * 1000) / 1000;
    }

    const latencyMs = Math.round(performance.now() - tStart);

    return {
      moves: scored,
      heatmap,
      latencyMs
    };
    } finally {
      if (useWasm) this._scratchInUse = false;
      else this._releaseScratch(pool);
    }
  }

  gelu(x) {
    return 0.5 * x * (1.0 + Math.tanh(Math.sqrt(2.0 / Math.PI) * (x + 0.044715 * x * x * x)));
  }

  layerNormInPlace(vec, gamma, beta) {
    const n = vec.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += vec[i];
    mean /= n;

    let variance = 0;
    for (let i = 0; i < n; i++) {
      const diff = vec[i] - mean;
      variance += diff * diff;
    }
    const invStd = 1.0 / Math.sqrt(variance / n + 1e-5);

    for (let i = 0; i < n; i++) {
      vec[i] = (vec[i] - mean) * invStd * gamma[i] + beta[i];
    }
  }

  rmsNormInPlace(X, offset, dim, weight) {
    let sumSq = 0;
    for (let i = 0; i < dim; i++) {
      const val = X[offset + i];
      sumSq += val * val;
    }
    const invRms = 1.0 / Math.sqrt(sumSq / dim + 1e-5);
    for (let i = 0; i < dim; i++) {
      X[offset + i] = X[offset + i] * invRms * weight[i];
    }
  }
}
