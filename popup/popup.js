/**
 * Popup Logic for Maia-3 Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusPill = document.getElementById('status-pill');
  const eloSelect = document.getElementById('default-elo');
  const backendSelect = document.getElementById('backend-pref');

  // Standalone in-browser dual engine status
  const hasWebGPU = !!navigator.gpu;
  if (hasWebGPU) {
    statusPill.textContent = '🟢 WebGPU + WASM 就绪';
    statusPill.style.color = '#10b981';
  } else {
    statusPill.textContent = '🟢 WebAssembly 就绪';
    statusPill.style.color = '#06b6d4';
  }


  // Load saved preferences
  chrome.storage.local.get(['defaultElo', 'preferredBackend'], (res) => {
    if (res.defaultElo) eloSelect.value = res.defaultElo;
    if (res.preferredBackend) backendSelect.value = res.preferredBackend;
  });

  // Save changes
  eloSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ defaultElo: parseInt(e.target.value, 10) });
  });

  backendSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ preferredBackend: e.target.value });
  });
});
