/**
 * 4Chess Review PWA Service Worker (v1.1.0)
 * Provides offline capabilities, versioned caching for Stockfish WASM, app shell, and UI assets.
 * Implements Network-First for entry HTML and Cache-First for static assets.
 */

const CACHE_NAME = '4chess-review-20261122-v128';

// Exact URLs used by the workbench and its local workers. The Pages build validates this list.
const STATIC_ASSETS = [
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg?v=2",
  "../icons/icon48.png?v=2",
  "../icons/icon128.png?v=2",
  "../icons/icon48.png",
  "../icons/icon128.png",
  "../ui/theme.css?v=20261025-v115",
  "./analysis.css?v=20261118-precise-filter",
  "../ui/chessboard.css?v=20261025-v115",
  "../ui/fonts/InterVariable.woff2?v=4.1",
  "./workbench.css?v=20261121-v127",
  "../ui/theme.js?v=20261122-v128",
  "./analysis.js?v=20261122-v128",
  "./commentary-text.js?v=20261118-recap-reset",
  "./built-in-ai.js?v=20261118-summary-ai",
  "./review-commentary.js?v=20261122-v128",
  "./study-store.js?v=20261121-v127",
  "./consequence-player.js?v=20261122-v128",
  "./mistake-bank.js?v=20261122-v128",
  "./checkup-runner.js?v=20261122-v128",
  "./checkup-reminders.js?v=20261122-v128",
  "./study-profile-controls.js?v=20261122-v128",
  "../engine/checkup-watch.js?v=20261121-v127",
  "./share-card.js?v=20261122-v128",
  "../engine/chess-facts.js?v=20261118-summary-ai",
  "./board-ui.js?v=20261117-ui",
  "./chess-pieces.js",
  "./eval-chart.js?v=20261122-v128",
  "./i18n.js?v=20261122-v128",
  "./intuition-review.js?v=20261122-v128",
  "./maia-elo-trend.js?v=20261122-v128",
  "./position-analysis.js?v=20261122-v128",
  "./review-explorer.js?v=20261122-v128",
  "./review-practice.js?v=20261122-v128",
  "./review-overview.js?v=20261122-v128",
  "./scan-authorization.js?v=20261121-study-reminders",
  "./sound-effects.js?v=20261025-v115",
  "./workbench-layout.js?v=20261122-v128",
  "./workbench-motion.js?v=20261103-jade",
  "../ui/board-visuals.js?v=20261117-ui",
  "../content/fair-play-guard.js",
  "../content/fair-play-guard.js?v=20261025-v115",
  "../engine/chess-core.js",
  "../engine/chess-core.js?v=20261025-v115",
  "../engine/chess-notation.js",
  "../engine/chess-notation.js?v=20261120-import",
  "../engine/engine-preferences.js?v=20261122-v128",
  "../engine/engine-variants.js",
  "../engine/engine-variants.js?v=20261025-v115",
  "../engine/game-analyzer.js?v=20261122-v128",
  "../engine/maia-engine.js?v=20261122-v128",
  "../engine/maia-inbrowser.js?v=20261122-v128",
  "../engine/maia-worker.js?v=20261122-v128",
  "../engine/model-cache.js",
  "../engine/model-cache-client.js?v=20261122-v128",
  "../engine/model-loader.js?v=20261122-v128",
  "../engine/model-sources.js",
  "../engine/opening-book.js",
  "../engine/position-lines.js",
  "../engine/review-policy.js?v=20261117-review-policy",
  "../engine/review-policy.js?v=20261120-review",
  "../engine/stockfish-inbrowser.js?v=20261122-v128",
  "../engine/stockfish-sandbox.html?v=20261122-v128",
  "../engine/stockfish-sandbox.js?v=20261122-v128",
  "../engine/stockfish-standard-web.js",
  "../lib/stockfish-19.js",
  "../lib/stockfish-19-standard.js",
  "../lib/stockfish.wasm"
];

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
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;
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
