import assert from 'node:assert/strict';
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { MaiaEngine } from '../engine/maia-engine.js';
import { MaiaInBrowserEngine } from '../engine/maia-inbrowser.js';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js';
import { ModelCache } from '../engine/model-cache.js';
import { MAIA_VARIANTS } from '../engine/engine-variants.js';

const moves = [{ san: 'e4' }, { san: 'e5' }];
const keys = new Set();
for (const engineKey of ['sf19lite', 'sf19standard-v1']) {
  for (const modelKey of ['maia3-5m', 'maia3-23m-fp32-v1', 'maia3-79m-fp16-v1']) keys.add(GameAnalyzer.getGameKey(moves, { engineKey, modelKey }));
}
assert.equal(keys.size, 6, 'Every engine/model combination must have a distinct review cache');

// A legacy 5M cache must never satisfy a request for 79M.
const originalGet = ModelCache.getModel, originalSave = ModelCache.saveModel, originalFetch = globalThis.fetch;
const lookups = [];
const meta = { ...MAIA_VARIANTS['79m'].expected, tensors: {} };
const header = new TextEncoder().encode(JSON.stringify(meta));
const buffer = new ArrayBuffer(1000016 + header.length);
new Uint8Array(buffer).set(new TextEncoder().encode('M3CF'));
new DataView(buffer).setUint32(4, header.length, true);
new Uint8Array(buffer, 8).set(header);
ModelCache.getModel = async key => { lookups.push(key); return key === 'maia3_model' ? buffer : null; };
ModelCache.saveModel = async () => true;
globalThis.fetch = async () => ({ ok: true, headers: new Headers(), arrayBuffer: async () => buffer });
try {
  const model = new MaiaInBrowserEngine();
  await model.loadModel(MAIA_VARIANTS['79m'].url, null, MAIA_VARIANTS['79m'].expected);
  assert.equal(model.meta.dim_vit, 1024);
  assert.equal(lookups.length, 1);
  assert.notEqual(lookups[0], 'maia3_model');
  await assert.rejects(new MaiaInBrowserEngine().loadModel(buffer, null, { dim_vit: 256 }), /Unexpected Maia model/);
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return requests === 1 ? {
      ok: true, headers: new Headers(), body: { getReader: () => ({ read: async () => { throw new Error('Stream interrupted'); } }) },
      arrayBuffer: async () => { throw new Error('Cannot read a consumed response'); }
    } : { ok: true, arrayBuffer: async () => buffer };
  };
  await new MaiaInBrowserEngine().loadModel(MAIA_VARIANTS['79m'].url, null, MAIA_VARIANTS['79m'].expected);
  assert.equal(requests, 2, 'An interrupted stream must retry with a fresh response');
} finally {
  ModelCache.getModel = originalGet; ModelCache.saveModel = originalSave; globalThis.fetch = originalFetch;
}

const sf = new StockfishInBrowser();
let settled = false, terminated = false;
sf.pendingRequests.set(1, { resolve: value => { assert.equal(value, null); settled = true; } });
sf.worker = { terminate: () => { terminated = true; } };
sf.reset();
assert.equal(settled && terminated, true, 'Switching engines must settle an in-flight search and terminate the worker');
const maia = new MaiaEngine(null, sf, { variant: '79m' });
let pendingSettled = false;
maia.workerPending.set(1, { resolve: () => { pendingSettled = true; } });
maia.dispose();
assert.equal(pendingSettled, true);
await assert.rejects(maia.initialize(), /selection changed/);
console.log('✅ Engine versions: distinct review caches, no legacy model substitution, metadata checks and switch cancellation.');
