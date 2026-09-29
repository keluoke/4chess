/**
 * 4Chess Review PWA Service Worker
 * Provides offline capabilities, caching for Stockfish WASM, app shell, and UI assets.
 */

const CACHE_NAME = '4chess-review-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './analysis.js',
  './analysis.css',
  './board-ui.js',
  './chess-pieces.js',
  './eval-chart.js',
  './manifest.webmanifest',
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
      // Best-effort cache of static assets
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

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Return cached, but revalidate in background if online
        fetch(req).then((fresh) => {
          if (fresh && fresh.status === 200) {
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
