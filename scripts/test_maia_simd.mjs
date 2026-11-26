import assert from 'node:assert/strict';
import { ChessBoard } from '../engine/chess-core.js';
import { MaiaInBrowserEngine } from '../engine/maia-inbrowser.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function f32ToF16(val) {
  const buf = new ArrayBuffer(4);
  const f32 = new Float32Array(buf);
  const u32 = new Uint32Array(buf);
  f32[0] = val;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  let exp = ((x >>> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >>> (1 - exp);
    return sign | ((mant + 0x1000) >>> 13);
  }
  if (exp >= 31) return sign | 0x7c00;
  return sign | (exp << 10) | ((mant + 0x1000) >>> 13);
}

function buildSyntheticM3cf({ dimVit, numHeads, numBlocks, ffDim, sm1Dim = 0, sm2OutDim = 32, sm3OutDim = 64, dtype = 'float32', seed = 1337 }) {
  const rand = mulberry32(seed);
  const specs = [];
  const add = (name, shape, scale = 0.08) => specs.push({ name, shape, scale });
  add('elo_embedding_low.weight', [1, 128], 0.2);
  add('elo_embedding_high.weight', [1, 128], 0.2);
  add('token_projection.weight', [dimVit, 352], 0.05);
  add('token_projection.bias', [dimVit], 0.02);

  const genSize = sm3OutDim / numHeads;
  const sm2InDim = sm1Dim > 0 ? 64 * sm1Dim : dimVit;
  if (sm1Dim === 0) add('gab_shared_weight', [4096, genSize], 0.05);

  for (let b = 0; b < numBlocks; b++) {
    const p = `transformer.layers.${b}`;
    add(`${p}.self_attn.mha.in_proj_weight`, [3 * dimVit, dimVit], 0.05);
    add(`${p}.self_attn.mha.out_proj.weight`, [dimVit, dimVit], 0.05);
    add(`${p}.norm1.weight`, [dimVit], 0.5);
    if (sm1Dim > 0) {
      add(`${p}.self_attn.sm1.weight`, [sm1Dim, dimVit], 0.05);
      add(`${p}.self_attn.sm1.bias`, [sm1Dim], 0.02);
      add(`${p}.self_attn.gab_weight`, [4096, genSize], 0.05);
    }
    add(`${p}.self_attn.sm2.weight`, [sm2OutDim, sm2InDim], 0.05);
    add(`${p}.self_attn.sm2.bias`, [sm2OutDim], 0.02);
    add(`${p}.self_attn.sm3.weight`, [sm3OutDim, sm2OutDim], 0.05);
    add(`${p}.self_attn.sm3.bias`, [sm3OutDim], 0.02);
    add(`${p}.self_attn.ln1.weight`, [sm2OutDim], 0.5);
    add(`${p}.self_attn.ln1.bias`, [sm2OutDim], 0.02);
    add(`${p}.self_attn.ln2.weight`, [sm3OutDim], 0.5);
    add(`${p}.self_attn.ln2.bias`, [sm3OutDim], 0.02);
    add(`${p}.linear1.weight`, [ffDim, dimVit], 0.05);
    add(`${p}.linear1.bias`, [ffDim], 0.02);
    add(`${p}.linear2.weight`, [dimVit, ffDim], 0.05);
    add(`${p}.linear2.bias`, [dimVit], 0.02);
    add(`${p}.norm2.weight`, [dimVit], 0.5);
  }
  add('transformer.norm.weight', [dimVit], 0.5);
  add('transformer.norm.bias', [dimVit], 0.02);
  add('proj_sq_from.weight', [dimVit, dimVit], 0.05);
  add('proj_sq_to.weight', [dimVit, dimVit], 0.05);
  add('promo_bias_proj.weight', [4, dimVit], 0.05);

  const elemBytes = dtype === 'float16' ? 2 : 4;
  let payloadOffset = 0;
  const tensorsMeta = {};
  const arrays = [];
  for (const spec of specs) {
    const numel = spec.shape.reduce((a, b) => a * b, 1);
    payloadOffset = (payloadOffset + 3) & ~3;
    tensorsMeta[spec.name] = { shape: spec.shape, numel, offset: payloadOffset };
    const data = dtype === 'float16' ? new Uint16Array(numel) : new Float32Array(numel);
    for (let i = 0; i < numel; i++) {
      const v = (rand() * 2 - 1) * spec.scale;
      data[i] = dtype === 'float16' ? f32ToF16(v) : v;
    }
    arrays.push({ offset: payloadOffset, data });
    payloadOffset += numel * elemBytes;
  }

  const meta = {
    dim_vit: dimVit,
    num_heads: numHeads,
    num_blocks: numBlocks,
    total_params: specs.reduce((s, sp) => s + sp.shape.reduce((a, b) => a * b, 1), 0),
    dtype,
    tensors: tensorsMeta
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const totalBytes = 8 + metaBytes.length + payloadOffset;
  const buf = new ArrayBuffer(totalBytes);
  new Uint8Array(buf).set([77, 51, 67, 70], 0); // M3CF
  new DataView(buf).setUint32(4, metaBytes.length, true);
  new Uint8Array(buf, 8).set(metaBytes);
  const payloadBase = 8 + metaBytes.length;
  for (const { offset, data } of arrays) {
    new Uint8Array(buf, payloadBase + offset, data.byteLength).set(new Uint8Array(data.buffer));
  }
  return buf;
}

async function verifyParity(label, buffer) {
  const js = new MaiaInBrowserEngine({ useWasm: false });
  const wasm = new MaiaInBrowserEngine({ useWasm: true });
  await js.loadModel(buffer);
  await wasm.loadModel(buffer);
  assert.equal(js.backend, 'js');
  assert.equal(wasm.backend, 'wasm-simd');

  const b1 = new ChessBoard();
  const b2 = new ChessBoard('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  const b3 = new ChessBoard('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  const history = [
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
  ];

  let maxProbDiff = 0;
  let maxHeatDiff = 0;
  for (const [board, hist] of [[b1, null], [b2, history], [b3, null]]) {
    const rJs = await js.predict(board, 1900, null, hist);
    const rWasm = await wasm.predict(board, 1900, null, hist);
    assert.deepEqual(
      rWasm.moves.slice(0, 3).map(m => m.uci),
      rJs.moves.slice(0, 3).map(m => m.uci),
      `${label}: Top-3 moves must match`
    );
    const wasmByUci = new Map(rWasm.moves.map(m => [m.uci, m.rawProb]));
    for (const m of rJs.moves) {
      maxProbDiff = Math.max(maxProbDiff, Math.abs(m.rawProb - wasmByUci.get(m.uci)));
    }
    for (let i = 0; i < 64; i++) {
      maxHeatDiff = Math.max(maxHeatDiff, Math.abs(rJs.heatmap[i] - rWasm.heatmap[i]));
    }
  }
  assert(maxProbDiff < 1e-5, `${label}: maxProbDiff=${maxProbDiff} exceeded 1e-5`);
  assert(maxHeatDiff < 2e-3, `${label}: maxHeatDiff=${maxHeatDiff} exceeded 2e-3`);
  console.log(`PASS parity [${label}]: maxProbDiff=${maxProbDiff.toExponential(2)}, maxHeatDiff=${maxHeatDiff.toExponential(2)}`);
  return { js, wasm };
}

const buf5m = buildSyntheticM3cf({ dimVit: 256, numHeads: 8, numBlocks: 8, ffDim: 1024, sm1Dim: 0, dtype: 'float32' });
const buf23m = buildSyntheticM3cf({ dimVit: 512, numHeads: 16, numBlocks: 2, ffDim: 1024, sm1Dim: 16, dtype: 'float16' });

const { js, wasm } = await verifyParity('5M-FP32-8blocks', buf5m);
await verifyParity('23M-FP16-sm1', buf23m);

const benchBoard = new ChessBoard();
await js.predict(benchBoard, 1900);
await wasm.predict(benchBoard, 1900);

const iters = 5;
const tJs0 = performance.now();
for (let i = 0; i < iters; i++) await js.predict(benchBoard, 1900);
const jsMs = (performance.now() - tJs0) / iters;

const tWasm0 = performance.now();
for (let i = 0; i < iters; i++) await wasm.predict(benchBoard, 1900);
const wasmMs = (performance.now() - tWasm0) / iters;

const speedup = jsMs / wasmMs;
console.log(`PASS benchmark [5M 8-block]: JS=${jsMs.toFixed(1)}ms/pos, WASM-SIMD=${wasmMs.toFixed(1)}ms/pos, speedup=${speedup.toFixed(2)}x`);
assert(speedup >= 2.0, `Expected >= 2.0x WASM SIMD speedup, got ${speedup.toFixed(2)}x`);
