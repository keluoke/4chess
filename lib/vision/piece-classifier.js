/**
 * Piece Classifier Core
 * Multi-backend CNN runner supporting:
 * 1. Native NPU / InferenceSession (WeChat or WebGPU)
 * 2. WASM Linear Memory Acceleration (exact FP32 parity)
 * 3. Pure JS JIT Forward Pass (exact mathematical parity, zero-dependency fallback)
 * Uses platform adapter for all I/O.
 */

import { sha256 } from './crypto-utils.js';

let asyncLocalStorage = null;
try {
  const { AsyncLocalStorage } = require('async_hooks');
  if (AsyncLocalStorage) {
    asyncLocalStorage = new AsyncLocalStorage();
  }
} catch (_) {}

let wasmHookRefCount = 0;
let origWebAssemblyInstantiate = null;
let origWebAssemblyCompile = null;

function enableWasmHook() {
  if (typeof WebAssembly === 'undefined') return;
  if (wasmHookRefCount === 0) {
    origWebAssemblyInstantiate = WebAssembly.instantiate;
    origWebAssemblyCompile = WebAssembly.compile;

    WebAssembly.instantiate = function(source, ...args) {
      if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
        const store = asyncLocalStorage ? asyncLocalStorage.getStore() : null;
        if (store && store.classifier) {
          try {
            store.classifier.wasmSha256 = sha256(source);
          } catch (_) {}
        }
      }
      return origWebAssemblyInstantiate.apply(WebAssembly, [source, ...args]);
    };

    if (origWebAssemblyCompile) {
      WebAssembly.compile = function(source, ...args) {
        if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
          const store = asyncLocalStorage ? asyncLocalStorage.getStore() : null;
          if (store && store.classifier) {
            try {
              store.classifier.wasmSha256 = sha256(source);
            } catch (_) {}
          }
        }
        return origWebAssemblyCompile.apply(WebAssembly, [source, ...args]);
      };
    }
  }
  wasmHookRefCount++;
}

function disableWasmHook() {
  if (typeof WebAssembly === 'undefined') return;
  wasmHookRefCount--;
  if (wasmHookRefCount <= 0) {
    wasmHookRefCount = 0;
    if (origWebAssemblyInstantiate) {
      WebAssembly.instantiate = origWebAssemblyInstantiate;
      origWebAssemblyInstantiate = null;
    }
    if (origWebAssemblyCompile) {
      WebAssembly.compile = origWebAssemblyCompile;
      origWebAssemblyCompile = null;
    }
  }
}

import { WebAdapter } from './web-adapter.js';
function autoSelectAdapter() {
  return new WebAdapter();
}

function conv3x3_relu(inArr, C_in, H, W, w, b, C_out, outBuffer = null) {
  const out = outBuffer || new Float32Array(C_out * H * W);
  if (outBuffer) out.fill(0);
  for (let oc = 0; oc < C_out; oc++) {
    const ocOffset = oc * H * W;
    const wOcOffset = oc * C_in * 9;
    for (let ic = 0; ic < C_in; ic++) {
      const icOffset = ic * H * W;
      const wOff = wOcOffset + ic * 9;
      const k0 = w[wOff], k1 = w[wOff + 1], k2 = w[wOff + 2];
      const k3 = w[wOff + 3], k4 = w[wOff + 4], k5 = w[wOff + 5];
      const k6 = w[wOff + 6], k7 = w[wOff + 7], k8 = w[wOff + 8];

      for (let y = 1; y < H - 1; y++) {
        const r0 = icOffset + (y - 1) * W;
        const r1 = icOffset + y * W;
        const r2 = icOffset + (y + 1) * W;
        const rowOut = ocOffset + y * W;
        for (let x = 1; x < W - 1; x++) {
          out[rowOut + x] += inArr[r0 + x - 1] * k0 + inArr[r0 + x] * k1 + inArr[r0 + x + 1] * k2
                          + inArr[r1 + x - 1] * k3 + inArr[r1 + x] * k4 + inArr[r1 + x + 1] * k5
                          + inArr[r2 + x - 1] * k6 + inArr[r2 + x] * k7 + inArr[r2 + x + 1] * k8;
        }
      }

      const topRowOut = ocOffset, topR1 = icOffset, topR2 = icOffset + W;
      out[topRowOut] += inArr[topR1] * k4 + inArr[topR1 + 1] * k5 + inArr[topR2] * k7 + inArr[topR2 + 1] * k8;
      for (let x = 1; x < W - 1; x++) {
        out[topRowOut + x] += inArr[topR1 + x - 1] * k3 + inArr[topR1 + x] * k4 + inArr[topR1 + x + 1] * k5
                            + inArr[topR2 + x - 1] * k6 + inArr[topR2 + x] * k7 + inArr[topR2 + x + 1] * k8;
      }
      out[topRowOut + W - 1] += inArr[topR1 + W - 2] * k3 + inArr[topR1 + W - 1] * k4 + inArr[topR2 + W - 2] * k6 + inArr[topR2 + W - 1] * k7;

      const botRowOut = ocOffset + (H - 1) * W, botR0 = icOffset + (H - 2) * W, botR1 = icOffset + (H - 1) * W;
      out[botRowOut] += inArr[botR0] * k1 + inArr[botR0 + 1] * k2 + inArr[botR1] * k4 + inArr[botR1 + 1] * k5;
      for (let x = 1; x < W - 1; x++) {
        out[botRowOut + x] += inArr[botR0 + x - 1] * k0 + inArr[botR0 + x] * k1 + inArr[botR0 + x + 1] * k2
                            + inArr[botR1 + x - 1] * k3 + inArr[botR1 + x] * k4 + inArr[botR1 + x + 1] * k5;
      }
      out[botRowOut + W - 1] += inArr[botR0 + W - 2] * k0 + inArr[botR0 + W - 1] * k1 + inArr[botR1 + W - 2] * k3 + inArr[botR1 + W - 1] * k4;

      for (let y = 1; y < H - 1; y++) {
        const r0 = icOffset + (y - 1) * W, r1 = icOffset + y * W, r2 = icOffset + (y + 1) * W, rowOut = ocOffset + y * W;
        out[rowOut] += inArr[r0] * k1 + inArr[r0 + 1] * k2 + inArr[r1] * k4 + inArr[r1 + 1] * k5 + inArr[r2] * k7 + inArr[r2 + 1] * k8;
        out[rowOut + W - 1] += inArr[r0 + W - 2] * k0 + inArr[r0 + W - 1] * k1 + inArr[r1 + W - 2] * k3 + inArr[r1 + W - 1] * k4 + inArr[r2 + W - 2] * k6 + inArr[r2 + W - 1] * k7;
      }
    }

    const bias = b[oc];
    for (let i = 0; i < H * W; i++) {
      const v = out[ocOffset + i] + bias;
      out[ocOffset + i] = v > 0 ? v : 0;
    }
  }
  return out;
}

function maxpool2x2(inArr, C, H, W, outBuffer = null) {
  const hOut = H >> 1, wOut = W >> 1;
  const out = outBuffer || new Float32Array(C * hOut * wOut);
  for (let c = 0; c < C; c++) {
    const cIn = c * H * W, cOut = c * hOut * wOut;
    for (let y = 0; y < hOut; y++) {
      const y2 = y << 1;
      const inR0 = cIn + y2 * W, inR1 = cIn + (y2 + 1) * W, outR = cOut + y * wOut;
      for (let x = 0; x < wOut; x++) {
        const x2 = x << 1;
        out[outR + x] = Math.max(inArr[inR0 + x2], inArr[inR0 + x2 + 1], inArr[inR1 + x2], inArr[inR1 + x2 + 1]);
      }
    }
  }
  return out;
}

function globalAvgPool(inArr, C, H, W, outBuffer = null) {
  const out = outBuffer || new Float32Array(C), area = H * W;
  for (let c = 0; c < C; c++) {
    let sum = 0, off = c * area;
    for (let i = 0; i < area; i++) sum += inArr[off + i];
    out[c] = sum / area;
  }
  return out;
}

function matvec(w, b, x, rows, cols, relu = false, outBuffer = null) {
  const out = outBuffer || new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let sum = b[r], off = r * cols;
    for (let c = 0; c < cols; c++) sum += w[off + c] * x[c];
    out[r] = relu ? (sum > 0 ? sum : 0) : sum;
  }
  return out;
}

function forwardTile(tile32x32, W, scratch = null) {
  const c1 = conv3x3_relu(tile32x32, 1, 32, 32, W.w1, W.b1, 32, scratch ? scratch.c1 : null);
  const p1 = maxpool2x2(c1, 32, 32, 32, scratch ? scratch.p1 : null);
  const c2 = conv3x3_relu(p1, 32, 16, 16, W.w2, W.b2, 64, scratch ? scratch.c2 : null);
  const p2 = maxpool2x2(c2, 64, 16, 16, scratch ? scratch.p2 : null);
  const c3 = conv3x3_relu(p2, 64, 8, 8, W.w3, W.b3, 64, scratch ? scratch.c3 : null);
  const c4 = conv3x3_relu(c3, 64, 8, 8, W.w4, W.b4, 128, scratch ? scratch.c4 : null);
  const gap = globalAvgPool(c4, 128, 8, 8, scratch ? scratch.gap : null);
  const fc1 = matvec(W.w_fc1, W.b_fc1, gap, 128, 128, true, scratch ? scratch.fc1 : null);
  const fc2 = matvec(W.w_fc2, W.b_fc2, fc1, 64, 128, true, scratch ? scratch.fc2 : null);
  return matvec(W.w_fc3, W.b_fc3, fc2, 13, 64, false, scratch ? scratch.logits : null);
}

function softmax(logits) {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > max) max = logits[i];
  }
  let sum = 0;
  const out = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(logits[i] - max);
    out[i] = e;
    sum += e;
  }
  for (let i = 0; i < logits.length; i++) {
    out[i] /= sum;
  }
  return out;
}

class WasmRunner {
  constructor(instance) {
    this.instance = instance;
    this.exports = instance ? instance.exports : null;
  }
  run(tiles) {
    const e = this.exports, m = new Float32Array(e.memory.buffer);
    m.set(tiles, e.input_ptr() / 4);
    e.run();
    return m.slice(e.output_ptr() / 4, e.output_ptr() / 4 + 832);
  }
  destroy() {
    this.exports = null;
    this.instance = null;
  }
}

class PieceClassifierCore {
  constructor(options = {}) {
    this.adapter = options.adapter || autoSelectAdapter();
    this.weightsPath = options.weightsPath || 'chessimg2pos_weights.bin';
    this.wasmPath = options.wasmPath || 'chess-cnn.wasm';
    this.onnxPath = options.onnxPath || 'chessimg2pos.onnx';
    this.testRunner = options.testRunner || null;

    this.isReady = false;
    this.weights = null;
    this.wasmInstance = null;
    this.wasm = null;
    this.session = null;
    this.backend = 'uninitialized';
    this.initPromise = null;
    this.initGeneration = 0;
    this.destroyed = false;

    this.scratch = {
      c1: new Float32Array(32 * 32 * 32),
      p1: new Float32Array(32 * 16 * 16),
      c2: new Float32Array(64 * 16 * 16),
      p2: new Float32Array(64 * 8 * 8),
      c3: new Float32Array(64 * 8 * 8),
      c4: new Float32Array(128 * 8 * 8),
      gap: new Float32Array(128),
      fc1: new Float32Array(128),
      fc2: new Float32Array(64),
      logits: new Float32Array(13)
    };
  }

  destroy() {
    this.destroyed = true;
    this.initGeneration++;
    if (this.session) {
      try {
        if (typeof this.session.destroy === 'function') this.session.destroy();
      } catch (_) {}
      this.session = null;
    }
    if (this.wasm && typeof this.wasm.destroy === 'function') {
      try { this.wasm.destroy(); } catch (_) {}
    }
    this.wasm = null;
    this.wasmInstance = null;
    this.wasmSha256 = null;
    this.isReady = false;
    this.initPromise = null;
  }

  async init() {
    if (this.destroyed) return false;
    if (this.isReady) return true;
    if (this.initPromise) return this.initPromise;

    const currentGen = ++this.initGeneration;
    this.initPromise = (async () => {
      try {
        if (this.testRunner) {
          if (this.destroyed || currentGen !== this.initGeneration) return false;
          this.isReady = true;
          return true;
        }

        // 1. Start Native NPU acceleration session in parallel
        const nativeTask = (async () => {
          try {
            const sess = await this.adapter.createInferenceSession(this.onnxPath);
            if (this.destroyed || currentGen !== this.initGeneration) {
              if (sess && typeof sess.destroy === 'function') {
                try { sess.destroy(); } catch (_) {}
              }
              return;
            }
            if (sess) this.session = sess;
          } catch (e) {
            this.adapter.log('warn', `Native session init skipped: ${e.message}`);
          }
        })();

        // 2. Load weights buffer via adapter for WASM/JS
        if (!this.weights) {
          try {
            const buf = await this.adapter.loadAsset(this.weightsPath);
            if (buf) this.loadWeightsFromBuffer(buf);
          } catch (e) {
            this.adapter.log('warn', `Failed to load weights: ${e.message}`);
          }
        }

        // 3. Try WASM initialization if weights are loaded
        const wasmTask = (async () => {
          if (!this.weights || this.destroyed || currentGen !== this.initGeneration) return;
          enableWasmHook();
          try {
            const executeInstantiate = async () => {
              const wasmRes = await this.adapter.instantiateWasm(this.wasmPath, {});
              const instance = (wasmRes && wasmRes.instance) ? wasmRes.instance : wasmRes;
              if (wasmRes && wasmRes.wasmSha256) {
                this.wasmSha256 = wasmRes.wasmSha256;
              } else if (this.adapter && this.adapter.wasmSha256) {
                this.wasmSha256 = this.adapter.wasmSha256;
              }
              if (instance && instance.exports && instance.exports.weights_ptr) {
                const wPtr = instance.exports.weights_ptr();
                let off = 0;
                const memory = new Float32Array(instance.exports.memory.buffer);
                for (const name of ['w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'w4', 'b4', 'w_fc1', 'b_fc1', 'w_fc2', 'b_fc2', 'w_fc3', 'b_fc3']) {
                  memory.set(this.weights[name], wPtr / 4 + off);
                  off += this.weights[name].length;
                }
                this.wasmInstance = instance;
                this.wasm = new WasmRunner(instance);
              }
            };

            if (asyncLocalStorage) {
              await asyncLocalStorage.run({ classifier: this }, executeInstantiate);
            } else {
              await executeInstantiate();
            }
          } catch (e) {
            this.adapter.log('warn', `WASM init skipped: ${e.message}`);
          } finally {
            disableWasmHook();
          }
        })();

        await Promise.all([wasmTask, nativeTask]);

        if (this.destroyed || currentGen !== this.initGeneration) {
          if (this.session && typeof this.session.destroy === 'function') {
            try { this.session.destroy(); } catch (_) {}
          }
          this.session = null;
          return false;
        }

        if (this.session) {
          this.backend = 'native';
          this.isReady = true;
          return true;
        }
        if (this.wasmInstance) {
          this.backend = 'wasm';
          this.isReady = true;
          return true;
        }
        if (this.weights) {
          this.backend = 'js';
          this.isReady = true;
          return true;
        }

        throw new Error('无法加载棋子分类模型，请确认模型权重文件可用');
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  loadWeightsFromBuffer(buffer) {
    try {
      this.weightsSha256 = sha256(buffer);
    } catch (_) {
      this.weightsSha256 = null;
    }
    let floats;
    if (buffer instanceof Float32Array) {
      floats = buffer;
    } else if (buffer instanceof ArrayBuffer || (buffer && Object.prototype.toString.call(buffer) === '[object ArrayBuffer]')) {
      floats = new Float32Array(buffer, 0, Math.floor(buffer.byteLength / 4));
    } else if (ArrayBuffer.isView(buffer)) {
      if (buffer.byteOffset % 4 === 0) {
        floats = new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
      } else {
        const copy = new Uint8Array(buffer.byteLength);
        copy.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
        floats = new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
      }
    } else {
      throw new Error('[PieceClassifierCore] Unsupported buffer type');
    }

    let offset = 0;
    const take = n => {
      const s = floats.subarray(offset, offset + n);
      offset += n;
      return s;
    };

    this.weights = {
      w1: take(32 * 1 * 9), b1: take(32),
      w2: take(64 * 32 * 9), b2: take(64),
      w3: take(64 * 64 * 9), b3: take(64),
      w4: take(128 * 64 * 9), b4: take(128),
      w_fc1: take(128 * 128), b_fc1: take(128),
      w_fc2: take(64 * 128), b_fc2: take(64),
      w_fc3: take(13 * 64), b_fc3: take(13)
    };
  }

  predictTiles(tiles, options = {}) {
    const task = (this.predictQueue || Promise.resolve()).catch(() => {}).then(() => this._predictTiles(tiles, options));
    this.predictQueue = task;
    return task;
  }

  async _predictTiles(tiles, options = {}) {
    if (this.destroyed) throw new Error('PieceClassifier has been destroyed');
    if (!this.isReady) await this.init();
    if (this.destroyed) throw new Error('PieceClassifier has been destroyed');

    if (this.testRunner) {
      return this.testRunner(tiles);
    }

    // 1. Native NPU / InferenceSession
    if (this.session && typeof this.session.run === 'function') {
      try {
        const rawData = (tiles.byteOffset === 0 && tiles.buffer.byteLength === tiles.byteLength)
          ? tiles.buffer
          : tiles.buffer.slice(tiles.byteOffset, tiles.byteOffset + tiles.byteLength);
        const runPromise = this.session.run({
          input: { shape: [64, 1, 32, 32], type: 'float32', data: rawData }
        }, options);
        if (runPromise && typeof runPromise.catch === 'function') runPromise.catch(() => {});
        let timer = null;
        const timeoutMs = (options && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) ? options.timeoutMs : 1500;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Native inference run timed out')), timeoutMs);
        });
        let out = null;
        try {
          out = await Promise.race([runPromise, timeoutPromise]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        const raw = out && (out.output ? (out.output.data || out.output) : out);
        let logitsFloat = null;
        if (raw instanceof Float32Array) logitsFloat = raw;
        else if (raw instanceof ArrayBuffer) logitsFloat = new Float32Array(raw);
        else if (raw && raw.buffer) logitsFloat = new Float32Array(raw.buffer, raw.byteOffset || 0, Math.floor((raw.byteLength || (raw.length * 4)) / 4));

        if (logitsFloat && logitsFloat.length >= 64 * 13) {
          const probs = [];
          for (let i = 0; i < 64; i++) {
            probs.push(softmax(logitsFloat.subarray(i * 13, (i + 1) * 13)));
          }
          this.backend = 'native';
          return probs;
        }
      } catch (err) {
        this.adapter.log('warn', 'Native inference failed, falling back to WASM/JS', err.message);
        this.session = null;
      }
    }

    // 2. WASM Backend
    if (this.wasm && this.wasm.exports) {
      try {
        const logits = this.wasm.run(tiles);
        this.backend = 'wasm';
        return Array.from({ length: 64 }, (_, i) => softmax(logits.subarray(i * 13, (i + 1) * 13)));
      } catch (err) {
        this.adapter.log('warn', 'WASM inference run failed, falling back to JS', err.message);
      }
    }

    // 3. Pure JS Fallback
    if (!this.weights) {
      throw new Error('Piece classifier weights not loaded');
    }
    this.backend = 'js';
    const probs = [];
    for (let i = 0; i < 64; i++) {
      const tileData = tiles.subarray(i * 1024, (i + 1) * 1024);
      const logits = forwardTile(tileData, this.weights, this.scratch);
      probs.push(softmax(logits));
    }
    return probs;
  }
}

export { 
  PieceClassifierCore,
  conv3x3_relu,
  maxpool2x2,
  globalAvgPool,
  matvec,
  forwardTile,
  softmax
 };
