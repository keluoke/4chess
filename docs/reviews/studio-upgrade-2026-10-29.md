# Review workspace upgrade — 2026-10-29

## Delivered scope

- Keep the board and compact evaluation timeline in the same column; condense accuracy into a small summary.
- Desktop uses three columns: board/timeline, scoring/current-position variations/notation, and independent intuition scanning/key moments. Tablet uses two columns plus the insight area below; phone stacks all three.
- Engine and intuition variations are visible directly. Remove the large combined candidate table; collapse explanatory text and key-moment details. Branch mode uses a neutral divider with only “分支” and the return action.
- Publish Stockfish scores and timeline before Maia is ready. The background intuition pass shares the Maia model, uses a separate lazy Stockfish worker for verification, yields between operations to foreground analysis/practice/autoplay, and supports pause/resume within the session. Completed predictions are retained in memory while paused.
- Changing Maia model or Elo reuses the independent scoring snapshot. Intuition cache reuse requires the same evaluation snapshot so an older enriched report cannot overwrite refreshed scores. Unavailable/partial intuition results are retryable and are not cached as complete.
- Include mistakes and blunders in key moments even when they are not human/engine divergence examples; add a mistakes filter.
- Add per-moment retry. Hide evaluations, candidates, notation, overlays and timeline while thinking. Grade a legal attempt with fresh Stockfish root/child searches, accept alternatives within 30 cp, and return uncertain rather than grade insufficient analysis. Cancelling or loading another game invalidates pending results.
- Tighten beyond-intuition labels: stable best choice, loss at most 10 cp, natural alternative at least 50 cp worse, known model probability at most 15%, completed verification depth. These are product thresholds, not an empirically calibrated human difficulty score.
- Verification targets at least two plies beyond the requested full-review depth (minimum D12); targeted child searches use one less ply. Incomplete evidence cannot confirm a label.
- Report schema 10 separates engine-only reports from enriched reports and stores reusable position evaluations. Update service worker and changed module versions.
- Chart tooltip/cursor retain actual numeric evaluations or mate distance instead of displaying the plot's ±4.5 pawn clamp.

## Verification

- `npm test`: passed, including policy, cancelled-retry, split-review/cache isolation tests and the real Stockfish terminal tests.
- `node scripts/test_review_ui.mjs`: passed with real bundled Stockfish and deterministic Maia fixtures. Includes deliberately delayed Maia initialization, scores and engine candidates visible before Maia readiness, pause/resume, model switching without rescoring, directly visible variations, actual incorrect-move retry, hidden answers, exit/recovery, bilingual controls, before/after positions, rapid navigation, stable board geometry and 320/390/736/1024 pixel widths.
- `npm run build`: passed; module and Cloudflare asset-size checks passed.
- `npm run package` and `node scripts/test_package_integrity.mjs`: passed; ZIP and unpacked directory contain the same 106 files.
- `npm run test:browser`: passed; offline reload, extension loading and synthetic platform DOM lifecycle (live lock, conclusion, modal dismissal, refresh, new-game lock).
- Screenshots: `artifacts/studio-columns-desktop.png`, `artifacts/studio-columns-mobile.png`, `artifacts/studio-columns-branch.png` (ignored generated QA outputs).

## Boundaries

Full-game Maia predicts each move and identifies intuition divergences; it is not needed for the Stockfish accuracy score or timeline. Current-position intuition still needs Maia. This change removes blocking and repeated scoring, not the underlying cost of real 23M inference. A shared-model operation or download already in flight can finish after pause; no further background operations are scheduled. Pause/resume does not persist unfinished work across reloads. There is no claim of personal model calibration, long-term training history, durable variation trees or explanatory language generation. Responsive browser tests are not physical-phone acceptance. Maia fixture tests do not establish real-model speed or prediction accuracy. Synthetic platform tests are not production Chess.com/Lichess lifecycle acceptance. No store submission is performed.
