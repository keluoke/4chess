/**
 * Popup Logic for Maia-3 Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusPill = document.getElementById('status-pill');
  const eloSelect = document.getElementById('default-elo');
  const backendSelect = document.getElementById('backend-pref');

  // Check local engine server first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 400);
    const res = await fetch('http://127.0.0.1:8765/health', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ready') {
        statusPill.textContent = `⚡ ${data.model} (本地原生)`;
        statusPill.style.color = '#10b981';
        return;
      }
    }
  } catch (e) {}

  // Check hardware acceleration
  const hasWebGPU = !!navigator.gpu;
  if (hasWebGPU) {
    statusPill.textContent = '⚡ WebGPU 就绪';
    statusPill.style.color = '#10b981';
  } else {
    statusPill.textContent = '⚙️ WASM 就绪';
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
