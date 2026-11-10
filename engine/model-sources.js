import { MAIA_VARIANTS } from './engine-variants.js';

export function modelSourceCandidates(variant, input = '') {
  const spec = MAIA_VARIANTS[variant];
  const fileName = new URL(spec.url).pathname.split('/').pop();
  const candidates = [];
  try {
    const url = new URL(input.trim());
    if (['https:', 'http:'].includes(url.protocol)) {
      if (/\.bin$/i.test(url.pathname)) {
        const name = url.pathname.split('/').pop();
        const known = Object.values(MAIA_VARIANTS).some(model => new URL(model.url).pathname.split('/').pop() === name);
        if (!known || name === fileName) candidates.push(url.href);
      } else {
        url.pathname = `${url.pathname.replace(/\/+$/, '')}/${fileName}`;
        candidates.push(url.href);
      }
    }
  } catch { /* Invalid or relative URLs fall back to the external official CDN. */ }
  return [...new Set([...candidates, spec.url])];
}
