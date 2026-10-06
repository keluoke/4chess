/**
 * 4Chess Review PWA Service Worker (v1.1.0)
 * Provides offline capabilities, versioned caching for Stockfish WASM, app shell, and UI assets.
 * Implements Network-First for entry HTML and Cache-First for static assets.
 */

const CACHE_NAME = '4chess-review-v1.0.3-i18n-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './analysis.js',
  './analysis.css',
  './i18n.js',
  '../ui/theme.css',
  '../ui/theme.js',
  './board-ui.js',
  './sound-effects.js',
  './chess-pieces.js',
  './eval-chart.js',
  './manifest.webmanifest',
  './favicon.svg',
  '../engine/chess-core.js',
  '../engine/stockfish-inbrowser.js',
  '../engine/maia-engine.js',
  '../engine/maia-inbrowser.js',
  '../engine/game-analyzer.js',
  '../engine/model-cache.js',
  '../lib/stockfish-19.js',
  '../lib/stockfish.wasm',
  '../icons/icon48.png',
  '../icons/icon128.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
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
          if (key !== CACHE_NAME) {
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
      fetch(req).then((freshRes) => {
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
