/**
 * Maia-3 Service Worker (Manifest V3)
 * Handles extension lifecycle, storage initialization, and messaging.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Maia-3 Extension] Installed successfully.');
  // Initialize default user settings in chrome.storage.local
  chrome.storage.local.set({
    defaultElo: 1500,
    preferredBackend: 'webgpu',
    showHeatmap: true,
    showArrows: true,
    heatmapOpacity: 0.55
  });
});
