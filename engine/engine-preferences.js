import { MAIA_VARIANTS, STOCKFISH_VARIANTS } from './engine-variants.js';

export function normalizeEnginePreferences(raw = {}) {
  const legacy = Object.entries(MAIA_VARIANTS).find(([, spec]) => spec.url === raw.cloudflareCdnUrl)?.[0];
  const maiaVariant = MAIA_VARIANTS[raw.maiaVariant] ? raw.maiaVariant : legacy || '5m';
  return {
    maiaVariant,
    stockfishVariant: STOCKFISH_VARIANTS[raw.stockfishVariant] ? raw.stockfishVariant : 'lite',
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
