/**
 * Maia-3 Content Script Loader
 * Dynamically imports ES modules in Manifest V3 environment
 */

(async () => {
  try {
    const src = chrome.runtime.getURL('content/main-module.js');
    const { initMaiaExtension } = await import(src);
    await initMaiaExtension();
  } catch (err) {
    console.error('[Maia-3] Failed to bootstrap Maia-3 content script:', err);
  }
})();
