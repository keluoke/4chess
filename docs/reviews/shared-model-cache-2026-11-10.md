# Shared Maia model cache — 2026-11-10

Addresses the repeated model downloads described in `full-project-evaluation-2026-11-08.md`.

## Trace and cause

Previously, `MaiaEngine` created a `MaiaInBrowserEngine` directly or inside `maia-worker.js`. That engine called `ModelCache.getModel()`, fetched model bytes, and saved them with `ModelCache.saveModel()`. `ModelCache` opens `Maia3ModelCache/model_binaries` in the executing origin. Importing JavaScript from a `chrome-extension://` URL does not give a content script extension-origin IndexedDB: a content script uses the host page's storage. Thus Chess.com, Lichess, the extension workbench, and the website could each download the same weights. Cross-origin worker creation can also fail on a host page, selecting the direct content-script fallback and its host-origin cache.

`reinitialize(overrideUrl)` also cleared the entire local model DB, unnecessarily invalidating cached variants and potentially Stockfish's cached bytes. It now retains URL-keyed models when reinitializing. Selecting a different CDN URL still selects a different existing URL-based cache key.

## New path

```text
Chess-site content script (including direct fallback) ──┐
Packaged analysis page → Maia dedicated worker ────────┼→ MessagePort → extension cache frame
4chess.cc analysis → Maia dedicated worker ────────────┘                   │
    (installed extension discovery content script)                       ├→ extension-origin Web Lock per model URL
                                                                        ├→ ModelCache → IndexedDB
Website without the bridge → worker → website ModelCache                └→ configured CDN on cache miss
```

- `model-cache-client.js` lazily creates one hidden extension frame per page and obtains a port after a bounded handshake. `MaiaEngine` transfers the port to each dedicated worker before asking it to load. The direct fallback uses the same client. Cache connection failures after discovering an extension surface as loading errors; they do not silently create host-specific caches and downloads.
- `model-cache-frame.js` accepts connections only from its parent and allowed HTTPS chess/first-party origins or its own extension origin. It offers model reads only. It resolves permitted URLs from the shipped variants and the extension's stored custom CDN setting, uses variant metadata controlled by the extension, and provides no arbitrary fetch, cache write/delete, inference, or chess-data API.
- `model-loader.js` streams bytes, validates the M3CF header, expected variant metadata and tensor bounds, and commits only validated bytes. A corrupt persisted entry is removed and fetched again. Interrupted streams retry with a fresh response. Existing extension-origin URL keys and legacy default 5M keys remain readable.
- Web Locks serialize cache-check/download/commit across cache frames and top-level contexts. A second concurrent caller reads the first caller's committed value. Weights remain CDN-only, with no relative/package model fallback. IndexedDB still chunks large values at 32 MiB. ArrayBuffers cross MessagePorts by transfer; large binary payloads never traverse Chrome runtime messaging or its default JSON serialization.
- No analysis or inference runs in the cache frame. It is created only when a caller loads a model. FairPlayGuard and the engine suspension/overlay rules are unchanged. A download already in progress may finish caching after its requesting engine is suspended; that does not run inference or produce suggestions.
- Website-only analysis retains its origin-local IndexedDB path and does not require extension APIs. The PWA cache version is bumped and includes the new module dependencies for offline startup.

## Browser constraints and migration

1. This implementation targets Chromium MV3. Chrome documents that embedded `chrome-extension://` pages use the extension's top-level storage partition, which is what allows the same IndexedDB to serve multiple host sites: [Storage and cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies). It requires IndexedDB, transferable MessagePorts and Web Locks. Firefox/Safari extension behavior has not been accepted by these tests.
2. The extension must be enabled and allowed to run on `https://4chess.cc/analysis` for the website to discover its cache. With no bridge (extension absent, disabled, outdated, denied site access, or a different website origin), analysis continues using website-origin storage. Installing/enabling the bridge later switches it to extension storage. Separate browser profiles, extension IDs/installations, and incognito partitions do not share model bytes.
3. A standalone website cannot read another origin's IndexedDB. Existing Chess.com/Lichess/website cache entries are left intact, not copied or deleted. The shared extension store may therefore need one initial CDN download if it has no copy yet. Existing packaged-extension caches are reused. Removing the extension or its site access makes its offline model unavailable to the website; a separately populated website cache can still work.
4. Frame/CSP/enterprise restrictions can prevent loading or connecting to the cache frame. The 10-second frame/handshake checks then report failure instead of falling back to host storage. A model request has a 10-minute timeout. Actual production host CSP compatibility remains a manual acceptance item; the browser test supplies controlled host documents.
5. Storage is persistent IndexedDB, not a guarantee against browser/user eviction, quota exhaustion, private-mode restrictions, clearing data or uninstalling the extension. No `unlimitedStorage` permission is added. A failed commit is reported as `persisted: false` (and logged); that session can use the downloaded bytes, but future offline reuse cannot be promised. IndexedDB reads, assembly, transfers, FP16 conversion and model setup take time; “0 ms” is not a measured startup claim.
6. Custom model CDNs must be configured in extension settings for extension-backed callers. An arbitrary website URL/override cannot turn the broker into a fetch proxy. Custom servers must satisfy browser CORS/extension permission rules. First download needs network access; subsequent successful cache hits need no CDN. Updating bytes at the same URL requires cache invalidation or a new versioned URL. Transfers still require per-engine memory; this change does not share inference memory or optimize tensor conversion.
7. Chrome runtime messaging defaults to JSON serialization; Chrome 148 offers an opt-in structured-clone format. This implementation avoids either dependency through transferable web MessagePorts: [Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [Structured clone messaging](https://developer.chrome.com/blog/structured-clone-messaging).

## Verification

- `npm test`: existing regression suite, including fair-play, worker cancellation, sandbox authentication, scan safety, model-version separation and the new byte-loader unit tests.
- `npm run test:model-cache`: unit tests for all three variants, corrupt and wrong-variant cached bytes, wrong CDN metadata, legacy keys, forbidden local/package URLs and persistence failure; real headless Chromium with the source extension loaded verifies simultaneous Lichess/Chess.com requests make **one** download, a **33 MiB** buffer round-trips through chunked IndexedDB, packaged and installed-extension website **dedicated workers** read the same cache, a configured custom CDN can load the requested 79M variant, unauthorized model URLs are rejected, offline reload and browser restart reuse the cache, and a separate browser without the extension retains website-only offline reuse.
- `npm run build`: website module graph and 25 MiB/static-model size checks.

Browser tests intercept CDN requests with generated synthetic M3CF fixtures and controlled host pages. They verify actual browser origin storage, locks, binary transfer, worker loading and restart persistence; they do not benchmark full production weights, verify chess inference accuracy, prove actual host-site CSP compatibility, or constitute store upload/release/production deployment acceptance. No binary model assets are added to source or build output.
