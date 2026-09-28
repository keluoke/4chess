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


  const cdnInput = document.getElementById('cdn-url');
  const presetSelect = document.getElementById('model-preset-select');

  // Load saved preferences
  chrome.storage.local.get(['defaultElo', 'preferredBackend', 'cloudflareCdnUrl'], (res) => {
    if (res.defaultElo) eloSelect.value = res.defaultElo;
    if (res.preferredBackend) backendSelect.value = res.preferredBackend;
    const currentUrl = res?.cloudflareCdnUrl || 'https://weights.4chess.cc/maia3_23m.bin';
    if (cdnInput) cdnInput.value = currentUrl;

    if (presetSelect) {
      const match = Array.from(presetSelect.options).find(opt => opt.value === currentUrl);
      if (match) {
        presetSelect.value = currentUrl;
        if (cdnInput) cdnInput.style.display = 'none';
      } else {
        presetSelect.value = 'custom';
        if (cdnInput) cdnInput.style.display = 'block';
      }
    }
  });

  // Save changes
  eloSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ defaultElo: parseInt(e.target.value, 10) });
  });

  backendSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ preferredBackend: e.target.value });
  });

  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        if (cdnInput) cdnInput.style.display = 'block';
      } else {
        if (cdnInput) {
          cdnInput.style.display = 'none';
          cdnInput.value = val;
        }
        chrome.storage.local.set({ cloudflareCdnUrl: val });
      }
    });
  }

  if (cdnInput) {
    cdnInput.addEventListener('change', (e) => {
      chrome.storage.local.set({ cloudflareCdnUrl: e.target.value.trim() });
    });
  }
});
