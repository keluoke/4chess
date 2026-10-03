/**
 * Diverge popup preferences and entry points
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusPill = document.getElementById('status-pill');
  const eloSelect = document.getElementById('default-elo');
  const cdnInput = document.getElementById('cdn-url');
  const presetSelect = document.getElementById('model-preset-select');
  const panelSwitch = document.getElementById('toggle-panel-switch');

  // 0. Dynamic i18n Translation
  if (globalThis.chrome?.i18n?.getMessage) {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const msg = chrome.i18n.getMessage(key);
      if (msg) el.textContent = msg;
    });
  }

  // Popup has no engine connection: describe its purpose, never claim readiness.
  statusPill.textContent = globalThis.chrome?.i18n?.getMessage('reviewOnly') || '仅供复盘';
  if (globalThis.chrome?.i18n?.getUILanguage) document.documentElement.lang = chrome.i18n.getUILanguage();
  if (!globalThis.chrome?.storage?.local) return;

  // 2. Query active tab to sync panel switch state
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs?.[0];
      if (activeTab?.id) {
        chrome.tabs.sendMessage(activeTab.id, { type: 'GET_PANEL_STATE' }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response && typeof response.closed === 'boolean') {
            if (panelSwitch) panelSwitch.checked = !response.closed;
          }
        });
      }
    });
  }

  // 3. Handle panel toggle switch
  if (panelSwitch) {
    panelSwitch.addEventListener('change', () => {
      const shouldOpen = panelSwitch.checked;
      if (chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs?.[0];
          if (activeTab?.id) {
            chrome.tabs.sendMessage(activeTab.id, { type: shouldOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL' }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        });
      }
    });
  }

  // 4. Load saved preferences
  chrome.storage.local.get(['defaultElo', 'maia3_target_elo', 'cloudflareCdnUrl'], (res) => {
    const elo = res.defaultElo || res.maia3_target_elo || 1900;
    if (eloSelect) eloSelect.value = elo;
    const currentUrl = res?.cloudflareCdnUrl || 'https://weights.4chess.cc/maia3_model.bin';
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

  // 5. Save changes
  if (eloSelect) {
    eloSelect.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      chrome.storage.local.set({ defaultElo: val, maia3_target_elo: val });
      if (chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs?.[0];
          if (activeTab?.id) {
            chrome.tabs.sendMessage(activeTab.id, { type: 'SET_ELO', elo: val }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        });
      }
    });
  }

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
