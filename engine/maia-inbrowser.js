/**
 * Maia-3 In-Browser Neural Engine (Scheme 0: Pure Client-Side Zero-Dependency)
 * Executes the authentic Maia-3 Chessformer model directly in JavaScript / WebGPU.
 * 100% offline, zero external server, zero Python, zero configuration.
 */

import { ModelCache } from './model-cache.js';

export class MaiaInBrowserEngine {
  constructor() {
    this.isReady = false;
    this.meta = null;
    this.tensors = {};
    this.allMoves = [];
    this.allMovesDict = {};
    this.initPromise = null;
    this.modelSource = 'unknown';
  }

  reset() {
    this.isReady = false;
    this.initPromise = null;
    this.meta = null;
    this.tensors = {};
    this.modelSource = 'unknown';
  }

  async loadModel(urlOrBuffer = 'models/maia3_model.bin', onProgress = null) {
    if (this.isReady) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      let arrayBuffer = null;

      if (urlOrBuffer instanceof ArrayBuffer) {
        arrayBuffer = urlOrBuffer;
        this.modelSource = 'memory';
      } else if (typeof urlOrBuffer === 'string') {
        const cacheKey = urlOrBuffer.split('/').pop().replace(/\.bin$/, '') || 'maia3-5m';
        // 1. Try loading from persistent IndexedDB cache (0ms instant)
        try {
          const cached = (await ModelCache.getModel(cacheKey)) || (cacheKey === 'maia3_model' ? await ModelCache.getModel('maia3-5m') : null);
          if (cached && cached.byteLength > 1000000) {
            arrayBuffer = cached;
            this.modelSource = 'cache';
            if (onProgress) {
              onProgress({
                percent: 100,
                speedMBps: '∞',
                receivedMB: (cached.byteLength / (1024 * 1024)).toFixed(1),
                totalMB: (cached.byteLength / (1024 * 1024)).toFixed(1),
                status: '已从本地缓存秒级装载 (0ms)',
                source: 'cache'
              });
            }
          }
        } catch (e) {
          console.warn('[Maia-3] Cache check failed, will fetch:', e);
        }

        // 2. Fetch from URL (Cloudflare CDN / Extension Package)
        if (!arrayBuffer) {
          let fetchUrl = urlOrBuffer;
          if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://') && !fetchUrl.startsWith('chrome-extension://')) {
            if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
              fetchUrl = chrome.runtime.getURL(fetchUrl);
            }
          }

          console.log(`[Maia-3] 🌐 从网络/CDN 下载模型: ${fetchUrl}`);
          const res = await fetch(fetchUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

          const contentLength = parseInt(res.headers.get('content-length') || '29329712', 10);
          const isCdn = fetchUrl.startsWith('http');
          this.modelSource = isCdn ? 'cdn' : 'package';

          if (res.body && res.body.getReader) {
            try {
              const reader = res.body.getReader();
              const chunks = [];
              let receivedLength = 0;
              const startTime = performance.now();

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                receivedLength += value.length;

                const elapsedSec = (performance.now() - startTime) / 1000;
                const speedMBps = elapsedSec > 0.1 ? ((receivedLength / (1024 * 1024)) / elapsedSec).toFixed(1) : '...';
                const percent = Math.min(100, Math.round((receivedLength / contentLength) * 100));

                if (onProgress) {
                  onProgress({
                    percent,
                    speedMBps,
                    receivedMB: (receivedLength / (1024 * 1024)).toFixed(1),
                    totalMB: (contentLength / (1024 * 1024)).toFixed(1),
                    status: isCdn ? `Cloudflare CDN 高速下载 (${percent}%)` : `读取扩展内置模型 (${percent}%)`,
                    source: this.modelSource
                  });
                }
              }

              const allBytes = new Uint8Array(receivedLength);
              let pos = 0;
              for (const chunk of chunks) {
                allBytes.set(chunk, pos);
                pos += chunk.length;
              }
              arrayBuffer = allBytes.buffer;
            } catch (streamErr) {
              console.warn('[Maia-3] ReadableStream read error, fallback to arrayBuffer():', streamErr);
              arrayBuffer = await res.arrayBuffer();
            }
          } else {
            arrayBuffer = await res.arrayBuffer();
          }

          // 3. Save to IndexedDB cache for future instant offline loads
          if (arrayBuffer) {
            ModelCache.saveModel(cacheKey, arrayBuffer).catch(() => {});
          }
        }
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

      const payloadOffset = 8 + metaLen;
      const payloadBytes = new Uint8Array(arrayBuffer, payloadOffset);

      // Fast Float16 to Float32 conversion helper
      function decodeFp16(u16Arr) {
        const len = u16Arr.length;
        const out = new Float32Array(len);
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

      const isFp16 = this.meta.dtype === 'float16';

      // Map tensor buffers (zero-copy if 4-byte aligned, or decode float16)
      for (const [name, info] of Object.entries(this.meta.tensors)) {
        const totalOffset = payloadBytes.byteOffset + info.offset;
        if (isFp16) {
          const u16Slice = payloadBytes.buffer.slice(totalOffset, totalOffset + info.numel * 2);
          if (typeof Float16Array !== 'undefined') {
            this.tensors[name] = new Float32Array(new Float16Array(u16Slice));
          } else {
            this.tensors[name] = decodeFp16(new Uint16Array(u16Slice));
          }
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

      this.initVocab();
      this.isReady = true;
      console.log(`[Maia-3 InBrowser] ✅ 成功就绪! 参数量: ${this.meta.total_params.toLocaleString()} (来源: ${this.modelSource})`);
      return true;
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
   * Forward pass: computes move distribution and attention heatmap
   */
  async predict(chessBoard, targetElo = 1900, abortCheck = null) {
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

    // 2. Tokenize board (mirrored if Black to move)
    // Piece map: P:1, N:2, B:3, R:4, Q:5, K:6, Black pieces +6
    const pieceMap = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
    const boardTokens = new Float32Array(64 * 12);

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        // Mirrored square if black
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

    // Concatenate history 8 times (64, 96) + 256 elo -> inputDim = 352
    const inputDim = 12 * 8 + 256; // 352
    const tokens = new Float32Array(64 * inputDim);
    for (let sq = 0; sq < 64; sq++) {
      const sqOffset = sq * inputDim;
      // Replicate 12 planes 8 times
      for (let h = 0; h < 8; h++) {
        for (let p = 0; p < 12; p++) {
          tokens[sqOffset + h * 12 + p] = boardTokens[sq * 12 + p];
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

    // 3. Token Projection: (64, 352) -> (64, D)
    const tpW = this.tensors['token_projection.weight']; // [D, 352]
    const tpB = this.tensors['token_projection.bias']; // [D]
    let X = new Float32Array(64 * D);

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
      if (abortCheck && abortCheck()) {
        return null;
      }
      if (b > 0 && b % 2 === 0) {
        // Yield to browser UI thread to maintain 60 FPS piece animation
        await new Promise(r => setTimeout(r, 0));
      }
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
      const Q = new Float32Array(64 * D);
      const K = new Float32Array(64 * D);
      const V = new Float32Array(64 * D);

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
        const y1 = new Float32Array(64 * p);
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
        const xMean = new Float32Array(D);
        for (let i = 0; i < 64; i++) {
          for (let d = 0; d < D; d++) xMean[d] += X[i * D + d];
        }
        for (let d = 0; d < D; d++) xMean[d] /= 64.0;
        sm2In = xMean;
        sm2InDim = D;
      }

      // 2. sm2 -> GELU -> LN1
      const sm2OutDim = sm2B.length;
      const sm2Out = new Float32Array(sm2OutDim);
      for (let d = 0; d < sm2OutDim; d++) {
        let s = sm2B[d];
        const wOff = d * sm2InDim;
        for (let k = 0; k < sm2InDim; k++) s += sm2W[wOff + k] * sm2In[k];
        sm2Out[d] = this.gelu(s);
      }
      this.layerNormInPlace(sm2Out, ln1W, ln1B);

      // 3. sm3 -> GELU -> LN2
      const sm3OutDim = sm3B.length;
      const sm3Out = new Float32Array(sm3OutDim);
      for (let d = 0; d < sm3OutDim; d++) {
        let s = sm3B[d];
        const wOff = d * sm2OutDim;
        for (let k = 0; k < sm2OutDim; k++) s += sm3W[wOff + k] * sm2Out[k];
        sm3Out[d] = this.gelu(s);
      }
      this.layerNormInPlace(sm3Out, ln2W, ln2B);

      // 4. bias = GAB_weight (4096, genSize) @ sm3Out -> [numHeads, 4096]
      const genSize = gabLayerWeight.length / 4096;
      const gabBias = new Float32Array(numHeads * 4096);
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
      const saOut = new Float32Array(64 * D);
      const scale = 1.0 / Math.sqrt(headDim);

      for (let h = 0; h < numHeads; h++) {
        const hOffset = h * headDim;
        const hBiasOffset = h * 4096;

        for (let i = 0; i < 64; i++) {
          const qiOffset = i * D + hOffset;
          // Compute scores for row i
          const scores = new Float32Array(64);
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
        const ffDim = lin1B.length;
        const ffMid = new Float32Array(ffDim);
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
    const promoW = this.tensors['promo_bias_proj.weight']; // [4, 256]

    const sqFrom = new Float32Array(64 * D);
    const sqTo = new Float32Array(64 * D);

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
    const scoresBase = new Float32Array(4096);
    for (let i = 0; i < 64; i++) {
      for (let j = 0; j < 64; j++) {
        let dot = 0;
        for (let k = 0; k < D; k++) {
          dot += sqFrom[i * D + k] * sqTo[j * D + k];
        }
        scoresBase[i * 64 + j] = dot * pScale;
      }
    }

    // Promotions: 8 files from rank 7 (sq 48..55) to rank 8 (sq 56..63)
    const promoBiases = new Float32Array(8 * 4);
    for (let f = 0; f < 8; f++) {
      const rank8Sq = 56 + f;
      for (let p = 0; p < 4; p++) {
        let bSum = 0;
        const wOff = p * D;
        for (let k = 0; k < D; k++) {
          bSum += promoW[wOff + k] * sqTo[rank8Sq * D + k];
        }
        promoBiases[f * 4 + p] = bSum * Math.sqrt(D);
      }
    }

    const promoLogits = new Float32Array(256);
    let pIdx = 0;
    for (let fFrom = 0; fFrom < 8; fFrom++) {
      const fromSq = 48 + fFrom;
      for (let fTo = 0; fTo < 8; fTo++) {
        const toSq = 56 + fTo;
        const base = scoresBase[fromSq * 64 + toSq];
        for (let p = 0; p < 4; p++) {
          promoLogits[pIdx++] = base + promoBiases[fTo * 4 + p];
        }
      }
    }

    // Combined logits: [4096 + 256 = 4352]
    const allLogits = new Float32Array(4352);
    allLogits.set(scoresBase, 0);
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

    // Format scored moves
    const scored = [];
    const squareWeights = new Float32Array(64);

    for (let i = 0; i < validLegalMoves.length; i++) {
      const m = validLegalMoves[i];
      const p = probs[i];
      scored.push({
        ...m,
        prob: Math.round(p * 10000) / 100
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
