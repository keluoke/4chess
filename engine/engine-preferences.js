import { MAIA_VARIANTS, STOCKFISH_VARIANTS } from './engine-variants.js';

export function normalizeEnginePreferences(raw = {}) {
  const legacy = Object.entries(MAIA_VARIANTS).find(([, spec]) => spec.url === raw.cloudflareCdnUrl)?.[0];
  const maiaVariant = Object.hasOwn(MAIA_VARIANTS, raw.maiaVariant) ? raw.maiaVariant : legacy || '5m';
  return {
    maiaVariant,
    stockfishVariant: Object.hasOwn(STOCKFISH_VARIANTS, raw.stockfishVariant) ? raw.stockfishVariant : 'lite',
    cloudflareCdnUrl: raw.cloudflareCdnUrl || MAIA_VARIANTS[maiaVariant].url
  };
}

export function readEnginePreferences() {
  return new Promise(resolve => {
    if (globalThis.chrome?.storage?.local) chrome.storage.local.get(['maiaVariant', 'stockfishVariant', 'cloudflareCdnUrl'], raw => resolve(normalizeEnginePreferences(raw)));
    else resolve(normalizeEnginePreferences());
  });
}

export function studioUrl(prefs, elo = 1900, lang = 'zh') {
  const url = new URL('https://4chess.cc/analysis/');
  url.searchParams.set('sf', prefs.stockfishVariant);
  url.searchParams.set('maia', prefs.maiaVariant);
  url.searchParams.set('elo', String(elo));
  url.searchParams.set('lang', lang);
  return url.href;
}

// UI preferences only. Game data, model bytes and engine commands never cross this bridge.
export const SHARED_PREFERENCE_KEYS = ['maiaVariant', 'stockfishVariant', 'maia3_lang', 'defaultElo', 'maia3_target_elo', 'diverge_ui_theme', 'showHeatmap', 'showArrows', 'showStockfishArrows', 'showProbability', 'studio_depth', 'studio_orientation', 'diverge_sound_enabled'];
export function preferencePatch(raw = {}) {
  const patch = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return patch;
  for (const key of SHARED_PREFERENCE_KEYS) {
    const value = raw[key];
    const valid = key === 'maiaVariant' ? Object.hasOwn(MAIA_VARIANTS, value) : key === 'stockfishVariant' ? Object.hasOwn(STOCKFISH_VARIANTS, value) : key === 'maia3_lang' ? ['zh', 'en'].includes(value) : key === 'diverge_ui_theme' ? ['light', 'dark', 'system'].includes(value) : key === 'studio_orientation' ? ['white', 'black'].includes(value) : key === 'studio_depth' ? [10, 14].includes(value) : ['defaultElo', 'maia3_target_elo'].includes(key) ? Number.isInteger(value) && value >= 600 && value <= 2600 : typeof value === 'boolean';
    if (valid) patch[key] = value;
  }
  if (patch.defaultElo !== undefined) patch.maia3_target_elo = patch.defaultElo;
  else if (patch.maia3_target_elo !== undefined) patch.defaultElo = patch.maia3_target_elo;
  return patch;
}
const listeners = new Set();
let snapshot = null, linked = false, initialized = false;
const requestId = Math.random().toString(36).slice(2);
const hasExtensionStorage = () => !!globalThis.chrome?.storage?.local;
function localSnapshot() {
  let raw = {};
  try {
    const versions = JSON.parse(localStorage.getItem('diverge_engine_versions') || '{}');
    raw = { maiaVariant: versions.model, stockfishVariant: versions.engine, maia3_lang: localStorage.getItem('maia3_lang'), defaultElo: Number(localStorage.getItem('maia3_target_elo')) || 1900, diverge_ui_theme: localStorage.getItem('diverge_ui_theme'), diverge_sound_enabled: localStorage.getItem('diverge_sound_enabled') !== 'false', ...JSON.parse(localStorage.getItem('diverge_preferences') || '{}') };
  } catch {}
  return raw;
}
export function getPreferences() {
  return { maiaVariant: '5m', stockfishVariant: 'lite', maia3_lang: (globalThis.navigator?.language || 'zh').startsWith('zh') ? 'zh' : 'en', defaultElo: 1900, showHeatmap: false, showArrows: true, showStockfishArrows: true, showProbability: true, studio_depth: 10, studio_orientation: 'white', diverge_sound_enabled: true, ...preferencePatch(snapshot || localSnapshot()) };
}
function receive(patch) {
  snapshot = { ...getPreferences(), ...preferencePatch(patch) };
  if (!hasExtensionStorage()) {
    try {
      localStorage.setItem('diverge_preferences', JSON.stringify(snapshot));
      localStorage.setItem('diverge_engine_versions', JSON.stringify({ engine: snapshot.stockfishVariant, model: snapshot.maiaVariant }));
      localStorage.setItem('maia3_lang', snapshot.maia3_lang);
      localStorage.setItem('maia3_target_elo', String(snapshot.defaultElo));
      if (snapshot.diverge_ui_theme) localStorage.setItem('diverge_ui_theme', snapshot.diverge_ui_theme);
      localStorage.setItem('diverge_sound_enabled', String(snapshot.diverge_sound_enabled));
    } catch {}
  }
  for (const listener of listeners) listener(getPreferences(), linked || hasExtensionStorage());
}
export function subscribePreferences(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export async function savePreferences(raw) {
  const patch = preferencePatch(raw);
  if (!Object.keys(patch).length) return;
  if (hasExtensionStorage()) {
    const write = { ...patch };
    if (patch.maiaVariant) write.cloudflareCdnUrl = MAIA_VARIANTS[patch.maiaVariant].url;
    await chrome.storage.local.set(write);
    receive(patch);
  } else {
    receive(patch);
    if (linked) window.postMessage({ type: 'DIVERGE_PREFS_WRITE', requestId, patch }, location.origin);
  }
}
export async function initializePreferences() {
  if (initialized) return getPreferences();
  initialized = true;
  if (hasExtensionStorage()) {
    const raw = await chrome.storage.local.get([...SHARED_PREFERENCE_KEYS, 'cloudflareCdnUrl']);
    snapshot = { ...preferencePatch(raw), ...preferencePatch(normalizeEnginePreferences(raw)) };
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const patch = Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.newValue]));
      if (Object.keys(preferencePatch(patch)).length) receive(patch);
    });
    return getPreferences();
  }
  snapshot = { ...getPreferences() };
  window.addEventListener('storage', event => { if (event.key === 'diverge_preferences') { try { receive(JSON.parse(event.newValue || '{}')); } catch {} } });
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(getPreferences()), 500);
    window.addEventListener('message', event => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'DIVERGE_PREFS_SNAPSHOT' || event.data.requestId !== requestId) return;
      linked = true; clearTimeout(timer); receive(event.data.preferences); resolve(getPreferences());
    });
    window.postMessage({ type: 'DIVERGE_PREFS_READ', requestId }, location.origin);
  });
}
export const preferencesLinked = () => linked || hasExtensionStorage();

export function engineExperienceHint(prefs, lang = 'zh', extension = false) {
  const notes = [];
  if (prefs.maiaVariant === '79m') notes.push(lang === 'zh' ? 'Maia 79M：首次约 159 MiB，内存占用更高，单步可能需要数秒或更久。想轻快一些可先用 5M；缓存后免重复下载。' : 'Maia 79M: about 159 MiB initially, with higher memory use. A move may take several seconds or longer. Choose 5M for a quicker response; downloads are cached.');
  else if (prefs.maiaVariant === '23m') notes.push(lang === 'zh' ? 'Maia 23M：首次约 104 MiB，响应通常慢于 5M；后续复用缓存。' : 'Maia 23M: about 104 MiB initially, usually slower than 5M. Later visits reuse the cache.');
  if (prefs.stockfishVariant === 'standard') notes.push(lang === 'zh' ? `SF19 标准版：使用完整评估网络，首次约 95 MiB，启动与计算更耗时。${extension ? '这个选择不改变悬浮窗的 SF19 Lite，仅在网页复盘使用。' : 'Lite 更适合快速浏览。'}` : `SF19 Standard uses the full evaluation network: about 95 MiB initially, with longer startup and computation. ${extension ? 'This choice applies only to web review; the floating panel stays on SF19 Lite.' : 'Choose Lite for quicker browsing.'}`);
  return notes.join('\n\n');
}
