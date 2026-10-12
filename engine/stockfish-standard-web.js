// Web studio only. This file is excluded from the MV3 extension package.
import { ModelCache } from './model-cache.js';
import { STOCKFISH_VARIANTS } from './engine-variants.js';

export async function loadStandardWorker(engine, epoch) {
  const spec = STOCKFISH_VARIANTS.standard;
  let buffer = await ModelCache.getModel(spec.key);
  if (epoch !== engine.lifecycleEpoch) return;
  if (!buffer || buffer.byteLength !== spec.bytes) {
    engine.downloadController = new AbortController();
    const response = await fetch(spec.wasmUrl, { signal: engine.downloadController.signal });
    if (!response.ok) throw new Error(`Stockfish download HTTP ${response.status}`);
    buffer = await response.arrayBuffer();
    if (buffer.byteLength !== spec.bytes) throw new Error('Invalid standard Stockfish binary');
    await ModelCache.saveModel(spec.key, buffer);
  }
  if (epoch !== engine.lifecycleEpoch) return;
  engine.wasmBlobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/wasm' }));
  engine.initDirectWorker(new URL('../lib/stockfish-19-standard.js', import.meta.url).href + '#' + encodeURIComponent(engine.wasmBlobUrl));
}
