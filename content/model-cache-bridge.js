// Discover only the cache frame URL; bulk model bytes use transferable MessagePorts.
(() => {
  if (location.origin !== 'https://4chess.cc' || !/^\/analysis(?:\/|$)/.test(location.pathname)) return;
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'DIVERGE_MODEL_CACHE_DISCOVER' || typeof event.data.id !== 'string' || event.data.id.length > 64) return;
    window.postMessage({ type: 'DIVERGE_MODEL_CACHE_URL', id: event.data.id, url: chrome.runtime.getURL('engine/model-cache-frame.html') }, location.origin);
  });
})();
