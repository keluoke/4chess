import assert from 'node:assert/strict';
import { readModelBytes, getModelCacheKey } from '../engine/model-loader.js';
import { MAIA_VARIANTS } from '../engine/engine-variants.js';

function fixture(variant) {
  const meta = new TextEncoder().encode(JSON.stringify({ ...MAIA_VARIANTS[variant].expected, tensors: {} }));
  const buffer = new ArrayBuffer(8 + meta.length);
  new Uint8Array(buffer).set(new TextEncoder().encode('M3CF'));
  new DataView(buffer).setUint32(4, meta.length, true);
  new Uint8Array(buffer, 8).set(meta);
  return buffer;
}
const originalFetch = globalThis.fetch;
const saved = new Map();
const cache = {
  getModel: async key => saved.get(key) || null,
  saveModel: async (key, buffer) => { saved.set(key, buffer); return true; },
  clearCache: async key => saved.delete(key)
};
try {
  let downloads = 0;
  for (const variant of Object.keys(MAIA_VARIANTS)) {
    const spec = MAIA_VARIANTS[variant], buffer = fixture(variant);
    globalThis.fetch = async () => { downloads++; return new Response(buffer); };
    assert.equal((await readModelBytes(spec.url, null, spec.expected, cache)).source, 'cdn');
    globalThis.fetch = async () => { throw new Error('Offline'); };
    const offline = await readModelBytes(spec.url, null, spec.expected, cache);
    assert.deepEqual(offline.buffer, buffer);
    assert.equal(offline.source, 'cache');
    assert.equal(offline.persisted, true);
  }
  assert.equal(downloads, 3);
  const spec = MAIA_VARIANTS['5m'];
  const key = getModelCacheKey(spec.url);
  // A corrupt persisted value and a wrong-variant value must be discarded and repaired.
  for (const invalid of [new ArrayBuffer(2), fixture('79m')]) {
    saved.set(key, invalid);
    globalThis.fetch = async () => new Response(fixture('5m'));
    assert.equal((await readModelBytes(spec.url, null, spec.expected, cache)).source, 'cdn');
    assert.deepEqual(saved.get(key), fixture('5m'));
  }
  saved.clear();
  globalThis.fetch = async () => new Response(fixture('79m'));
  await assert.rejects(readModelBytes(spec.url, null, spec.expected, cache), /Unexpected Maia model/);
  assert.equal(saved.size, 0, 'Wrong CDN bytes must never be persisted');
  globalThis.fetch = async () => { throw new Error('Local model fetch must never occur'); };
  for (const url of ['models/maia3_model.bin', 'chrome-extension://id/models/maia3_model.bin', 'file:///tmp/model.bin', 'data:application/octet-stream;base64,']) {
    await assert.rejects(readModelBytes(url, null, spec.expected, cache));
  }
  globalThis.fetch = async () => new Response(fixture('5m'));
  const unpersisted = await readModelBytes(spec.url, null, spec.expected, { ...cache, saveModel: async () => false });
  assert.equal(unpersisted.persisted, false, 'Quota failures cannot claim offline persistence');
  // Legacy 5M extension cache survives the move to the shared broker.
  saved.set('maia3_model', fixture('5m'));
  globalThis.fetch = async () => { throw new Error('Legacy cache should work offline'); };
  assert.equal((await readModelBytes(spec.url, null, spec.expected, cache)).source, 'cache');
  console.log('PASS: all variants offline, legacy cache, corrupt-cache repair, CDN validation, CDN-only sources, persistence failures.');
} finally { globalThis.fetch = originalFetch; }
