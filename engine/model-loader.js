import { ModelCache } from './model-cache.js';

export function getModelCacheKey(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  const baseName = url.split('/').pop().replace(/\.bin$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'maia3';
  return `maia3_v1_${baseName}_${Math.abs(hash).toString(36)}`;
}

export function validateModelBytes(buffer, expected = null) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8 || view.getUint32(0) !== 0x4d334346) throw new Error('Invalid Maia-3 binary magic header');
  const length = view.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, length)));
  for (const [key, value] of Object.entries(expected || {})) {
    if (meta[key] !== value) throw new Error(`Unexpected Maia model ${key}: ${meta[key]}`);
  }
  if (!meta.tensors || typeof meta.tensors !== 'object') throw new Error('Missing Maia tensors');
  const width = meta.dtype === 'float16' ? 2 : 4;
  for (const tensor of Object.values(meta.tensors)) {
    if (!Number.isSafeInteger(tensor.offset) || tensor.offset < 0 || !Number.isSafeInteger(tensor.numel) || tensor.numel < 0 ||
        8 + length + tensor.offset + tensor.numel * width > buffer.byteLength) throw new Error('Invalid Maia tensor bounds');
  }
}

// Called within an extension-origin Web Lock by the broker, or directly by a standalone website.
export async function readModelBytes(url, onProgress, expected, cache = ModelCache) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Maia weights require an external HTTP(S) CDN');
  const cacheKey = getModelCacheKey(url);
  const keys = url === 'https://weights.4chess.cc/maia3_model.bin' ? [cacheKey, 'maia3_model', 'maia3-5m'] : [cacheKey];
  for (const key of keys) {
    const cached = await cache.getModel(key);
    if (!cached) continue;
    try {
      validateModelBytes(cached, expected);
      onProgress?.({ percent: 100, speedMBps: '∞', receivedMB: (cached.byteLength / 1048576).toFixed(1), totalMB: (cached.byteLength / 1048576).toFixed(1), source: 'cache' });
      return { buffer: cached, source: 'cache', persisted: true };
    } catch { await cache.clearCache(key); }
  }
  let arrayBuffer;
  const fetchUrl = url;
  console.log(`[Maia-3] 🌐 从网络/CDN 下载模型: ${fetchUrl}`);
  onProgress?.({ percent: 0, speedMBps: '', receivedMB: '0', totalMB: '--', source: 'cdn' });
  const res = await fetch(fetchUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const contentLength = parseInt(res.headers.get('content-length') || '29329712', 10);

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
            status: `Cloudflare CDN 高速下载 (${percent}%)`,
            source: 'cdn'
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
      // A partially consumed Response cannot be read a second time.
      // Retry the download with a fresh response; never cache partial weights.
      console.warn('[Maia-3] Stream interrupted, retrying model download:', streamErr);
      const retry = await fetch(fetchUrl);
      if (!retry.ok) throw new Error(`HTTP ${retry.status}: ${retry.statusText}`);
      arrayBuffer = await retry.arrayBuffer();
    }
  } else {
    arrayBuffer = await res.arrayBuffer();
  }

  validateModelBytes(arrayBuffer, expected);
  const persisted = await cache.saveModel(cacheKey, arrayBuffer);
  if (!persisted) console.warn('[ModelCache] Persistence unavailable; offline reuse is unavailable for this download');
  return { buffer: arrayBuffer, source: 'cdn', persisted };
}
