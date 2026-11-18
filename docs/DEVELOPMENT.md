# Developing Diverge

Use Node.js 24 and run the commands from the repository root. The studio and the extension share chess rules, inference and review code. They have separate build outputs.

## Run the studio

```sh
npm ci
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist/site
```

Open [the local studio](http://127.0.0.1:8000/analysis/), choose a sample game, or paste a PGN or FEN. The static server supports local input. Production public-game imports that use Pages Functions need the Functions runtime.

## Load the extension

Run `npm run package`. In `chrome://extensions`, enable Developer mode, choose **Load unpacked** and select the generated `releases/diverge-extension-v<version>/` directory. Reload the extension and its source tab after rebuilding. The release ZIP contains the same distribution files.

For a finished game, the floating panel shows both engines. Hover or focus a candidate to preview its arrow. Its settings control the two arrow layers independently. For a static diagram, choose **Scan page**, check orientation, pieces and side to move, then confirm. A diagram alone cannot establish castling rights or an en passant target. See the [bilingual user guide](https://4chess.cc/guide/) for panel controls, move annotations and the studio handoff.

## Work on an engine or the scanner

- **Maia.** `engine/maia-inbrowser.js` executes the model. `engine/model-loader.js` validates the header, model dimensions and tensor bounds. Weights come from the configured CDN and persist in IndexedDB. Keep Maia weights outside Git, Pages assets and extension packages. Cache hits still require loading and initialization. See the [model-cache design](reviews/shared-model-cache-2026-11-10.md).
- **Stockfish.** The extension uses packaged SF19 Lite. The web studio can also load SF19 Standard. The floating panel uses a sandboxed engine bridge. The idle-stop, handshake and concurrent-token tests cover its UCI and messaging lifecycle.
- **Fair play.** Review [the project rules](../AGENTS.md) before changing an entry point. Active games stop searches and clear candidate overlays. An uncertain interactive source stays locked. A terminal result restores post-game review. Recheck a scan when its source changes or closes.
- **Vision.** The shared algorithm lives in the sibling project at `chesspuzzle/services/vision/core`. With that checkout present, run `npm run vision:check` to compare source and generated outputs, or `npm run vision:sync` to regenerate the browser factories. Run `node scripts/test_vision_parity.mjs --source` for raw-pixel parity. Ordinary CI verifies the checked-in fixture and lock. [Recognition pipeline](scan-delivery-1.1.3.md)
- **Store copy.** Edit `chrome-web-store/listing-copy.json`, run `npm run store:sync`, then `npm run store:check`. The checks cover localized names, descriptions and length limits. [Listing instructions](../chrome-web-store/STORE_LISTING.md)

## Verify and package

```sh
npm test
npx playwright install chromium
npm run test:release
npm run test:floating-handoff
npm run test:review-explorer
```

The release suite packages the extension, checks its contents and runs browser tests. The full [Verify workflow](../.github/workflows/verify.yml) also builds the site. For panel layout and keyboard interactions, run `npm run test:floating`. For a public release, use the clean tagged source and the distribution ZIP from `npm run package`. The local-development flavor is for local use. Package provenance is written under `releases/`. The [distribution notice](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.md) describe the component licenses and corresponding sources.
