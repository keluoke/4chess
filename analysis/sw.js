/**
 * 4Chess Review PWA Service Worker (v1.1.0)
 * Provides offline capabilities, versioned caching for Stockfish WASM, app shell, and UI assets.
 * Implements Network-First for entry HTML and Cache-First for static assets.
 */

const CACHE_NAME = '4chess-review-20261012-review3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './analysis.js?v=20261012-review3',
  './analysis.css?v=20261012-review3',
  './i18n.js?v=20261012-review3',
  '../ui/theme.css?v=20261012-review3',
  '../ui/theme.js?v=20261012-review3',
  './board-ui.js',
  './position-analysis.js?v=20261012-review3',
  './sound-effects.js',
  './chess-pieces.js',
  './eval-chart.js?v=20261012-review3',
  './manifest.webmanifest',
  './favicon.svg',
  '../engine/chess-core.js',
  '../engine/stockfish-inbrowser.js',
  '../engine/maia-engine.js',
  '../engine/maia-inbrowser.js',
  '../engine/game-analyzer.js',
  '../engine/model-cache.js',
  '../engine/opening-book.js',
  '../content/fair-play-guard.js',
  '../lib/stockfish-19.js',
  '../lib/stockfish.wasm',
  '../icons/icon48.png',
  '../icons/icon128.png'
];

// Cache both legacy nested imports and this release's versioned entry dependencies.
STATIC_ASSETS.push(...STATIC_ASSETS.filter(url => /\.(js|css)$/.test(url) && !url.startsWith('../lib/')).map(url => `${url}?v=20261012-review3`));

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'no-cache' })).catch((err) => {
            console.debug('[SW] Cache add skipped for:', url, err.message);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('4chess-review-') && key !== CACHE_NAME) {
            console.log('[SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass non-GET requests or external dynamic APIs (e.g. Lichess API / CDN model weights which use IndexedDB)
  if (req.method !== 'GET') return;
  if (url.hostname.includes('lichess.org') || url.hostname.includes('chess.com') || url.pathname.endsWith('.bin')) {
    return;
  }

  // 1. Navigation, HTML Entry & App Scripts/Styles: Network-First (ensures fresh deploys, falls back to cache offline)
  const isCodeOrHtml = req.mode === 'navigate' || 
                       url.pathname.endsWith('/') || 
                       url.pathname.endsWith('.html') || 
                       url.pathname.endsWith('.js') || 
                       url.pathname.endsWith('.css');
  if (isCodeOrHtml) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' }).then((freshRes) => {
        if (freshRes && freshRes.status === 200 && (url.protocol === 'http:' || url.protocol === 'https:')) {
          const clone = freshRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return freshRes;
      }).catch(() => {
        return caches.match(req).then((cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html') : null));
      })
    );
    return;
  }

  // 2. Static Heavy Assets (WASM, Images, Manifest): Cache-First with Background Revalidation
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req).then((fresh) => {
          if (fresh && fresh.status === 200 && (url.protocol === 'http:' || url.protocol === 'https:')) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, fresh));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(req).then((res) => {
        if (res && res.status === 200 && (url.protocol === 'http:' || url.protocol === 'https:')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});
