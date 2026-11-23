import { initScanView } from './scan-view.js';
import { MAIA_VARIANTS } from '../engine/engine-variants.js';
import { CHECKUP_BACKGROUND_KEY, hasNewCheckupGames, isCheckupReminderToken } from '../engine/checkup-watch.js';
import { initializePreferences, getPreferences, savePreferences, subscribePreferences, engineExperienceHint, readEnginePreferences, studioUrl } from '../engine/engine-preferences.js?v=20261123-checkup-challenge';

document.addEventListener('DOMContentLoaded', async () => {
  await initializePreferences();
  let prefs = getPreferences();
  const dictionaries = Object.fromEntries(await Promise.all(['en', 'zh'].map(async lang => [lang, await (await fetch(`../_locales/${lang === 'zh' ? 'zh_CN' : 'en'}/messages.json`)).json()])));
  const message = (key, fallback = '') => dictionaries[prefs.maia3_lang]?.[key]?.message || fallback;
  const elo = document.getElementById('default-elo');
  const model = document.getElementById('model-preset-select');
  const sf = document.getElementById('sf-preset-select');
  const cdn = document.getElementById('cdn-url');
  const language = document.getElementById('ui-language');
  const panel = document.getElementById('toggle-panel-switch');
  const overlays = document.getElementById('toggle-live-eval-switch');
  const reminderCard = document.getElementById('popup-checkup');
  const reminderAccounts = document.getElementById('popup-checkup-accounts');
  let subscriptions = [];
  const renderReminders = () => {
    const rows = [];
    for (const item of subscriptions) {
      if (!['chesscom', 'lichess'].includes(item?.platform) || typeof item.username !== 'string'
        || !isCheckupReminderToken(item.token) || !hasNewCheckupGames(item.state)) continue;
      const platform = item.platform === 'chesscom' ? 'Chess.com' : 'Lichess';
      const name = `${platform} · ${item.username}`;
      const url = new URL(studioUrl(prefs, prefs.defaultElo, prefs.maia3_lang));
      url.hash = new URLSearchParams({ checkup: item.token, empty: '1' }).toString();
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = name;
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = message('popupCheckupOpen') + ' ↗';
      link.setAttribute('aria-label', `${message('popupCheckupOpen')} · ${name}`);
      row.append(label, link);
      rows.push(row);
    }
    reminderAccounts.replaceChildren(...rows);
    reminderCard.hidden = !rows.length;
  };
  const render = () => {
    document.documentElement.lang = prefs.maia3_lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => { const text = message(el.dataset.i18n); if (text) el.textContent = text; });
    if (![...elo.options].some(option => option.value === String(prefs.defaultElo))) elo.add(new Option(String(prefs.defaultElo), String(prefs.defaultElo)));
    elo.value = String(prefs.defaultElo); model.value = prefs.maiaVariant; sf.value = prefs.stockfishVariant; language.value = prefs.maia3_lang;
    document.getElementById('guide-link').href = 'https://4chess.cc/guide/?lang=' + prefs.maia3_lang;
    document.querySelector('.popup-footer a').href = 'https://4chess.cc/guide/?lang=' + prefs.maia3_lang + '#about';
    document.getElementById('studio-link').href = studioUrl(prefs, prefs.defaultElo, prefs.maia3_lang);
    renderReminders();
    const hint = document.getElementById('engine-experience-hint'); hint.textContent = engineExperienceHint(prefs, prefs.maia3_lang, true); hint.hidden = !hint.textContent;
  };
  const refreshCdn = async () => { const engines = await readEnginePreferences(); cdn.value = engines.cloudflareCdnUrl; };
  render(); await refreshCdn();
  if (globalThis.chrome?.runtime?.id) initScanView();
  subscribePreferences(next => { prefs = next; render(); refreshCdn(); });
  if (!globalThis.chrome?.storage?.local) return;
  const saved = await chrome.storage.local.get(['liveEvaluation', CHECKUP_BACKGROUND_KEY]);
  overlays.checked = saved.liveEvaluation !== false;
  const setSubscriptions = value => {
    subscriptions = Array.isArray(value) ? value : [];
    renderReminders();
  };
  setSubscriptions(saved[CHECKUP_BACKGROUND_KEY]);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[CHECKUP_BACKGROUND_KEY]) setSubscriptions(changes[CHECKUP_BACKGROUND_KEY].newValue);
  });
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
  overlays.addEventListener('change', async () => { await chrome.storage.local.set({ liveEvaluation: overlays.checked }); sendToTab({ type: 'SET_LIVE_EVAL', enabled: overlays.checked }); });
  const save = async patch => { await savePreferences(patch); document.getElementById('preference-feedback').textContent = message('preferencesSaved'); };
  elo.addEventListener('change', () => save({ defaultElo: Number(elo.value) }));
  language.addEventListener('change', () => save({ maia3_lang: language.value }));
  model.addEventListener('change', () => save({ maiaVariant: model.value }));
  sf.addEventListener('change', () => save({ stockfishVariant: sf.value }));
  cdn.addEventListener('change', async () => {
    let valid = false;
    try { const url = new URL(cdn.value.trim()); valid = ['https:', 'http:'].includes(url.protocol); } catch {}
    if (!valid) { document.getElementById('preference-feedback').textContent = message('invalidModelUrl'); return; }
    await chrome.storage.local.set({ cloudflareCdnUrl: cdn.value.trim() });
    document.getElementById('preference-feedback').textContent = message('preferencesSaved');
  });
});
