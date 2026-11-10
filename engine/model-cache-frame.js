import { readModelBytes, getModelCacheKey } from './model-loader.js';
import { MAIA_VARIANTS } from './engine-variants.js';
import { modelSourceCandidates } from './model-sources.js';

const ownOrigin = `${location.protocol}//${location.host}`;
function permittedParent(origin) {
  if (origin === ownOrigin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (['lichess.org', 'chess.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) || url.hostname === '4chess.cc');
  } catch { return false; }
}

window.addEventListener('message', event => {
  if (event.source !== parent || !permittedParent(event.origin) || event.data?.type !== 'DIVERGE_MODEL_CACHE_CONNECT' || event.ports.length !== 1) return;
  const port = event.ports[0];
  port.onmessage = async ({ data }) => {
    if (data?.type !== 'load' || typeof data.id !== 'string' || data.id.length > 64) return;
    const id = data.id;
    try {
      // No arbitrary fetch proxy, cache writes, deletion, chess state, or inference API.
      const { cloudflareCdnUrl = '' } = await chrome.storage.local.get('cloudflareCdnUrl');
      const variant = Object.hasOwn(MAIA_VARIANTS, data.variant) ? data.variant : Object.keys(MAIA_VARIANTS).find(key => MAIA_VARIANTS[key].url === data.url);
      if (!variant || !modelSourceCandidates(variant, cloudflareCdnUrl).includes(data.url)) throw new Error('Model source is not a configured CDN');
      if (!navigator.locks) throw new Error('Shared model cache requires Web Locks');
      const result = await navigator.locks.request(`diverge-model:${getModelCacheKey(data.url)}`, () =>
        readModelBytes(data.url, progress => port.postMessage({ id, type: 'progress', progress }), MAIA_VARIANTS[variant].expected));
      port.postMessage({ id, type: 'result', result }, [result.buffer]);
    } catch (error) { port.postMessage({ id, type: 'result', error: error.message }); }
  };
  port.start();
  port.postMessage({ type: 'ready' });
});
