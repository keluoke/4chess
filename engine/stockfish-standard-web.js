// Web studio only. This file is excluded from the MV3 extension package.
import { ModelCache } from './model-cache.js';
import { STOCKFISH_VARIANTS } from './engine-variants.js';

export async function loadStandardWorker(engine, epoch) {
  engine.downloadProgress = null;
  const spec = STOCKFISH_VARIANTS.standard;
  let buffer = await ModelCache.getModel(spec.key);
  if (epoch !== engine.lifecycleEpoch) return;
  if (!buffer || buffer.byteLength !== spec.bytes) {
    engine.downloadController = new AbortController();
    engine.downloadProgress = { percent: 0 }; engine.onDownloadProgress?.();
    const response = await fetch(spec.wasmUrl, { signal: engine.downloadController.signal });
    if (!response.ok) throw new Error(`Stockfish download HTTP ${response.status}`);
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const bytes = new Uint8Array(spec.bytes);
      let loaded = 0, lastPercent = -1;
      engine.downloadProgress = { percent: 0 };
      while (true) {
        const { done, value } = await reader.read();
        if (epoch !== engine.lifecycleEpoch) { await reader.cancel(); return; }
        if (done) break;
        if (loaded + value.byteLength > spec.bytes) { await reader.cancel(); throw new Error('Invalid standard Stockfish binary'); }
        bytes.set(value, loaded); loaded += value.byteLength;
        const percent = Math.floor(loaded / spec.bytes * 100);
        if (percent !== lastPercent) { lastPercent = percent; engine.downloadProgress = { percent }; engine.onDownloadProgress?.(); }
      }
      buffer = bytes.buffer;
      if (loaded !== spec.bytes) throw new Error('Incomplete standard Stockfish download');
    } else buffer = await response.arrayBuffer();
    if (buffer.byteLength !== spec.bytes) throw new Error('Invalid standard Stockfish binary');
    await ModelCache.saveModel(spec.key, buffer);
  }
  if (epoch !== engine.lifecycleEpoch) return;
  engine.wasmBlobUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/wasm' }));
  engine.initDirectWorker(new URL('../lib/stockfish-19-standard.js', import.meta.url).href + '#' + encodeURIComponent(engine.wasmBlobUrl));
}
