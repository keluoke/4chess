# Research workbench materials and motion — 2026-11-01

## Delivered behavior

- Study-only midnight-blue / porcelain themes, softly lit board surround, framed board controls and evaluation timeline, prominent current-position score, and blue Stockfish / amber Maia identities. Reading surfaces remain opaque; blur is limited to the desktop header. Existing three-column and Focus layouts remain.
- Native Web Animations provide a one-time workspace entrance, 160 ms adjacent-piece travel (including both castling pieces), 240 ms Focus layout transitions, and brief selection / key-moment feedback. New actions cancel previous animations; state and DOM update synchronously. Board motion is opt-in for the studio; image-scan boards retain their existing behavior.
- Branch curves reveal their first measured segment and trace newly evaluated edges. Cursor-only updates do not restart the trace. Unsearched nodes remain gaps, original scores are untouched, and branch exit removes the overlay.
- Reduced-motion changes and hidden tabs cancel ongoing decorative animations. No perpetual ambient animation, third-party motion runtime, remote executable dependency, or new model asset was added.
- Short desktop viewports reserve space for the full timeline. Mobile glow stays within the layout; narrow layouts retain wrapping and visible variation lines.
- Updated shell/module cache versions, including the nested review-policy dependency and icons, preserve first offline reload.

## Validation

- `npm test`: passed.
- `node scripts/test_review_ui.mjs`: passed with local Chrome and Chromium, real bundled Stockfish WASM, deterministic Maia fixtures. Includes delayed Maia, branch/original isolation, 320/390/736/1024 widths, light/dark, chart bounds, stable board geometry, rapid navigation, castling, reduced-motion changes, and repeatedly interrupted Focus transitions.
- A local Chrome sample collected 59 frame intervals across four Focus transitions: maximum 16.67 ms; none over 50 ms. This is a bounded headless sample, not real-device or Maia 23M performance acceptance.
- `npm run build`, `npm run package`, `node scripts/test_package_integrity.mjs`: passed; 108 identical packaged/unpacked files; public asset-size checks passed.
- `npm run test:browser`: passed, including first offline reload, loading the unpacked extension, synthetic live lock, conclusion, dismissed dialog, refresh, and new-game relock.
- Screenshots inspected: `artifacts/workbench-dark-desktop.png`, `artifacts/workbench-branch-desktop.png`, `artifacts/workbench-dark-mobile-analysis.png`, and Chromium full-page mobile capture. Generated evidence is ignored by Git.

## Design reference and limits

The selected research-workbench direction uses material, hierarchy and interruptible-motion guidance from [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), especially its styles catalog and animation quick reference. No skill installation or GSAP dependency is required by this implementation.

This change does not alter fair-play authorization, model delivery, engine scoring or Maia throughput. Native-device graphics performance and real 23M inference speed remain unmeasured. No extension-store submission is included.
