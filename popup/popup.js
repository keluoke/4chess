import { MAIA_VARIANTS } from '../engine/engine-variants.js';
import { readEnginePreferences, studioUrl } from '../engine/engine-preferences.js';

document.addEventListener('DOMContentLoaded', async () => {
  const message = (key, fallback) => globalThis.chrome?.i18n?.getMessage(key) || fallback;
  const lang = (globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language).startsWith('zh') ? 'zh' : 'en';
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { const text = message(el.dataset.i18n, ''); if (text) el.textContent = text; });
  document.getElementById('guide-link').href = 'https://4chess.cc/guide/?lang=' + lang;
  document.querySelector('.popup-footer a').href = 'https://4chess.cc/guide/?lang=' + lang + '#about';
  if (!globalThis.chrome?.storage?.local) return;
  const prefs = await readEnginePreferences();
  const elo = document.getElementById('default-elo');
  const model = document.getElementById('model-preset-select');
  const sf = document.getElementById('sf-preset-select');
  const cdn = document.getElementById('cdn-url');
  const panel = document.getElementById('toggle-panel-switch');
  const overlays = document.getElementById('toggle-live-eval-switch');
  const saved = await chrome.storage.local.get(['defaultElo', 'maia3_target_elo', 'liveEvaluation']);
  elo.value = String(saved.defaultElo || saved.maia3_target_elo || 1900);
  model.value = prefs.maiaVariant; sf.value = prefs.stockfishVariant; cdn.value = prefs.cloudflareCdnUrl;
  overlays.checked = saved.liveEvaluation !== false;
  const syncLink = () => { document.getElementById('studio-link').href = studioUrl(prefs, elo.value, lang); };
  syncLink();
  const sendToTab = async payload => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, payload, () => { void chrome.runtime.lastError; });
  };
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PANEL_STATE' }, response => {
    if (chrome.runtime.lastError) return;
    if (typeof response?.closed === 'boolean') panel.checked = !response.closed;
    if (typeof response?.liveEvaluation === 'boolean') overlays.checked = response.liveEvaluation;
  });
  panel.addEventListener('change', () => sendToTab({ type: panel.checked ? 'OPEN_PANEL' : 'CLOSE_PANEL' }));
  overlays.addEventListener('change', async () => {
    await chrome.storage.local.set({ liveEvaluation: overlays.checked });
    sendToTab({ type: 'SET_LIVE_EVAL', enabled: overlays.checked });
  });
  elo.addEventListener('change', async () => {
    await chrome.storage.local.set({ defaultElo: Number(elo.value), maia3_target_elo: Number(elo.value) });
    syncLink(); sendToTab({ type: 'SET_ELO', elo: Number(elo.value) });
  });
  const save = async () => {
    await chrome.storage.local.set(prefs);
    syncLink();
    document.getElementById('preference-feedback').textContent = message('preferencesSaved', '已保存，已打开的分析页面会同步更新。');
  };
  model.addEventListener('change', () => {
    prefs.maiaVariant = model.value;
    prefs.cloudflareCdnUrl = MAIA_VARIANTS[model.value].url;
    cdn.value = prefs.cloudflareCdnUrl;
    save();
  });
  sf.addEventListener('change', () => { prefs.stockfishVariant = sf.value; save(); });
  cdn.addEventListener('change', () => {
    let valid = false;
    try { valid = new URL(cdn.value.trim()).protocol === 'https:'; } catch {}
    if (!valid) { document.getElementById('preference-feedback').textContent = message('invalidModelUrl', '请输入 HTTPS 模型地址。'); return; }
    prefs.cloudflareCdnUrl = cdn.value.trim(); save();
  });
});
