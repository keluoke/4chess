# Review workspace upgrade — 2026-10-29

## Delivered scope

- Keep the board and compact evaluation timeline in the same column; condense accuracy into a small summary.
- Merge engine, Maia and played choices into one deduplicated candidate table. Scores use White's perspective; Maia probabilities are explicitly model predictions, not win rates. Detailed variations remain expandable.
- Include mistakes and blunders in key moments even when they are not human/engine divergence examples; add a mistakes filter.
- Add per-moment retry. Hide evaluations, candidates, notation, overlays and timeline while thinking. Grade a legal attempt with fresh Stockfish root/child searches, accept alternatives within 30 cp, and return uncertain rather than grade insufficient analysis. Cancelling or loading another game invalidates pending results.
- Tighten beyond-intuition labels: stable best choice, loss at most 10 cp, natural alternative at least 50 cp worse, known model probability at most 15%, completed verification depth. These are product thresholds, not an empirically calibrated human difficulty score.
- Verification targets at least two plies beyond the requested full-review depth (minimum D12); targeted child searches use one less ply. Incomplete evidence cannot confirm a label.
- Report schema 9 invalidates previous classifications. Update service worker and changed module versions.
- Chart tooltip/cursor retain actual numeric evaluations or mate distance instead of displaying the plot's ±4.5 pawn clamp.

## Verification

- `npm test`: passed, including new policy and cancelled-retry tests and the real Stockfish terminal tests.
- `node scripts/test_review_ui.mjs`: passed with real bundled Stockfish and deterministic Maia fixtures. Includes candidate deduplication, actual incorrect-move retry, hidden answers, exit/recovery, bilingual controls, before/after positions, rapid navigation, stable board geometry and 320/390/736/1024 pixel widths.
- `npm run build`: passed; module and Cloudflare asset-size checks passed.
- `npm run package` and `node scripts/test_package_integrity.mjs`: passed; ZIP and unpacked directory contain the same 105 files.
- `npm run test:browser`: passed; offline reload, extension loading and synthetic platform DOM lifecycle (live lock, conclusion, modal dismissal, refresh, new-game lock).
- Screenshots: `artifacts/studio-workspace-desktop.png`, `artifacts/studio-practice-desktop.png` (ignored generated QA outputs).

## Boundaries

This delivery covers the first five recommended improvements. It does not claim personal model calibration, long-term training history, durable variation trees, explanatory language generation, or resumable full-game computation. Responsive browser tests are not physical-phone acceptance. Maia fixture tests do not establish real-model prediction accuracy. Synthetic platform tests are not production Chess.com/Lichess lifecycle acceptance. No store submission is performed.
