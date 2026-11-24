// First-party analysis and broadcast pages receive UI preferences only.
(() => {
  if (location.origin !== 'https://4chess.cc' || !/^\/(?:analysis|live)(?:\/|$)/.test(location.pathname)) return;
  let requestId = null;
  const moduleReady = import(chrome.runtime.getURL('engine/engine-preferences.js'));
  const send = async () => {
    if (!requestId) return;
    const { SHARED_PREFERENCE_KEYS, storedPreferencePatch } = await moduleReady;
    const raw = await chrome.storage.local.get([...SHARED_PREFERENCE_KEYS, 'cloudflareCdnUrl']);
    window.postMessage({ type: 'DIVERGE_PREFS_SNAPSHOT', requestId, preferences: storedPreferencePatch(raw) }, location.origin);
  };
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin || !['DIVERGE_PREFS_READ', 'DIVERGE_PREFS_WRITE'].includes(event.data?.type) || typeof event.data.requestId !== 'string' || event.data.requestId.length > 64) return;
    if (event.data.type === 'DIVERGE_PREFS_READ') { requestId = event.data.requestId; await send(); return; }
    if (event.data.requestId !== requestId) return;
    const { preferencePatch } = await moduleReady;
    const patch = preferencePatch(event.data.patch);
    if (!Object.keys(patch).length) return;
    // Canonical model URLs are resolved in the extension, not supplied by page messages.
    if (patch.maiaVariant) {
      const { MAIA_VARIANTS: variants } = await import(chrome.runtime.getURL('engine/engine-variants.js'));
      patch.cloudflareCdnUrl = variants[patch.maiaVariant].url;
    }
    await chrome.storage.local.set(patch);
  });
  chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') send(); });
})();
