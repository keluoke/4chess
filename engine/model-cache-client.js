import { readModelBytes } from './model-loader.js';
import { MAIA_VARIANTS } from './engine-variants.js';

let frameReady;
let defaultPort;
let workerPort;

// Called before loadModel in a dedicated worker. Null means website-only storage.
export function setModelCachePort(port) { workerPort = port; }

function discoverFrameUrl() {
  if (globalThis.chrome?.runtime?.getURL) return Promise.resolve(chrome.runtime.getURL('engine/model-cache-frame.html'));
  if (location.origin !== 'https://4chess.cc' || !/^\/analysis(?:\/|$)/.test(location.pathname)) return Promise.resolve(null);
  return new Promise(resolve => {
    const id = crypto.randomUUID();
    const finish = url => { clearTimeout(timer); window.removeEventListener('message', receive); resolve(url); };
    const receive = event => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'DIVERGE_MODEL_CACHE_URL' || event.data.id !== id) return;
      try {
        const url = new URL(event.data.url);
        if (url.protocol === 'chrome-extension:' && url.pathname === '/engine/model-cache-frame.html') finish(url.href);
      } catch { /* Ignore malformed discovery replies. */ }
    };
    const timer = setTimeout(() => finish(null), 750);
    window.addEventListener('message', receive);
    window.postMessage({ type: 'DIVERGE_MODEL_CACHE_DISCOVER', id }, location.origin);
  });
}

export async function connectModelCache() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !globalThis.location) return null;
  frameReady ||= (async () => {
    const url = await discoverFrameUrl();
    if (!url) return null;
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');
    frame.src = url;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { frame.remove(); reject(new Error('Shared model cache frame blocked or unavailable')); }, 10000);
      frame.onload = () => { clearTimeout(timer); resolve(); };
      frame.onerror = () => { clearTimeout(timer); frame.remove(); reject(new Error('Shared model cache frame failed')); };
      (document.body || document.documentElement).appendChild(frame);
    });
    return frame;
  })().catch(error => { frameReady = null; throw error; });
  const frame = await frameReady;
  if (!frame) return null;
  const channel = new MessageChannel();
  // Extension origins serialize as "null" in some Chromium postMessage paths.
  // The receiving frame checks source === parent and the allowed parent origin.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Shared model cache handshake failed')); }, 10000);
    channel.port1.onmessage = ({ data }) => {
      if (data?.type !== 'ready') return;
      clearTimeout(timer);
      channel.port1.onmessage = null;
      resolve();
    };
    frame.contentWindow.postMessage({ type: 'DIVERGE_MODEL_CACHE_CONNECT' }, '*', [channel.port2]);
  });
  return channel.port1;
}

const clients = new WeakMap();
function request(port, url, onProgress, expected) {
  let client = clients.get(port);
  if (!client) {
    client = new Map();
    clients.set(port, client);
    port.onmessage = ({ data }) => {
      const pending = client.get(data?.id);
      if (!pending) return;
      if (data.type === 'progress') { pending.onProgress?.(data.progress); return; }
      clearTimeout(pending.timer);
      client.delete(data.id);
      if (data.error) pending.reject(new Error(data.error));
      else pending.resolve(data.result);
    };
    port.start();
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { client.delete(id); reject(new Error('Shared model cache request timed out')); }, 10 * 60 * 1000);
    client.set(id, { resolve, reject, onProgress, timer });
    const variant = Object.keys(MAIA_VARIANTS).find(key => Object.entries(MAIA_VARIANTS[key].expected).every(([field, value]) => expected?.[field] === value));
    port.postMessage({ id, type: 'load', url, variant });
  });
}

export async function loadModelBytes(url, onProgress, expected) {
  const port = typeof window === 'undefined' ? workerPort : await (defaultPort ||= connectModelCache().catch(error => { defaultPort = null; throw error; }));
  // An installed-extension connection failure is surfaced, never hidden by a host-origin download.
  return port ? request(port, url, onProgress, expected) : readModelBytes(url, onProgress, expected);
}
