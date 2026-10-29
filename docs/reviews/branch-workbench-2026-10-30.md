# Branch comparison and research workbench — 2026-10-30

## Behavior

- The evaluation timeline now overlays the active study variation on the original game. Both use the same ply axis; the original remains dashed, the branch solid, and a branch may extend beyond the game. The fork uses the displayed position, including before-move review.
- Clicking a branch point selects that exact variation node. Board controls and inline notation navigate the same branch. Returning to the game removes the overlay without changing the report, accuracy or original moves.
- Current-position Stockfish work renders first. The same cancellable foreground queue fills missing branch nodes without waiting for Maia. Scores are cached by position, engine and requested depth for the session. Unknown evaluations leave gaps; terminal nodes preserve mate direction. Old searches cannot update a new session or a departed branch.
- Original and branch tooltips retain exact numeric scores or mate distance and available search depth. Plot height remains capped at ±4.5 pawns. Grid labels now match their actual score coordinates. Paths connect only measured adjacent nodes without spline overshoot.
- A study-only graphite/indigo visual system adds light and dark palettes, restrained card surfaces, proportional notation with tabular scores, a prominent current-position evaluation and a smaller game-accuracy summary. The shared extension-panel theme is unchanged.
- A persistent Focus toggle hides the insight column. The third column presents facts for the current played move and retry where relevant. Branches are embedded next to their source notation row, with individual move buttons.

## Verification

- `npm test`: passed, including mate-direction, cache ownership, cancellation, scan authorization and fair-play regressions.
- `node scripts/test_position_analysis.mjs` and `node scripts/test_eval_chart.mjs`: branch gaps, extended axis, chart selection, perspective, terminal branch history and stale-result isolation passed.
- `node scripts/test_review_ui.mjs`: real bundled Stockfish with deterministic Maia fixtures. Checks a ten-ply branch against an eight-ply original game, before-move anchoring, delayed Maia, unchanged original report, chart/board/notation navigation, cached branch scores, Focus, light/dark appearance and 320/390/736/1024 widths.
- `npm run build`, `npm run package`, `node scripts/test_package_integrity.mjs`: passed; package and unpacked directory contain the same 107 files. Module and Cloudflare asset-size checks passed.
- `npm run test:browser`: passed; extension load, offline reload, synthetic live-game lock, conclusion, dismissed-result dialog, refresh and new-game locking.
- Visual QA screenshots: `artifacts/workbench-branch-desktop.png`, `artifacts/workbench-focus-desktop.png`, `artifacts/workbench-dark-desktop.png`, `artifacts/studio-columns-mobile.png` (ignored generated outputs).

## Limits

These changes do not establish real Maia 23M throughput or real-device acceptance. Branches and their evaluation cache remain session-local. Later positions on different paths are a comparison of those positions, not a causal single-move improvement score. There is no generated chess explanation or new personalization claim. The fair-play guard and model distribution rules remain intact; no store submission is performed.
