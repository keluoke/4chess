# Full-game accuracy and score presentation

The old review used depth 6 and an arithmetic mean of move scores. Quiet opening play and a long lopsided ending could dilute a critical loss. A defeat on time does not itself change engine accuracy.

## Calculation

- Convert side-to-move centipawns to expected score: `Q(cp) = 1 / (1 + exp(-0.00368208 * clamp(cp, -1000, 1000)))`.
- Negate the next position's evaluation to compare both positions from the mover's perspective. `A = 100 * exp(-5.11 * max(0, Q_before - Q_after))`. An exact engine first-choice move receives 100 despite adjacent-search noise. Invalid evaluations produce no score.
- Compute a shared White-perspective expected-score timeline. Use sliding windows of `clamp(floor(plies / 10), 2, 8)` positions; pad the beginning with the first complete window. Weights are standard deviations in percentage points, clamped to `[0.5, 12]`. A window containing missing data uses the minimum weight.
- Per side, exclude positions with only one legal move and moves missing either evaluation. Average the volatility-weighted mean and harmonic mean; round the final result once, to one decimal place. Post-book scores use the same method on their subset, retaining full-game weights.
- The aggregation is inspired by [Lichess's public explanation](https://lichess.org/page/accuracy). Diverge retains its existing exponential move mapping and forced-move policy; this is not numerical parity with Lichess or Chess.com. No formula guarantees a low score in an already lost position.

Full-game review now requests depth 12 with the existing per-position 3500 ms bound. The report records actual minimum/maximum returned search depth, excluding terminal depth-zero positions. The UI displays actual depth (or a clearly labeled target if unknown), engine, valid decision-move counts, and a bilingual expandable explanation. Score cards make both numbers prominent without a percent sign. Report schema 8 prevents reuse of old arithmetic-mean reports. Versioned entry-module URLs are explicitly precached for first-load offline recovery; chart, candidates and the studio share one translation-module version.

## Verification

- `npm test`: passed, including new scorer regressions, missing-data coverage, fair-play locking, cancellation, terminal evaluations and cache ownership.
- `node scripts/test_intuition_divergence.mjs`: passed.
- `node scripts/test_review_ui.mjs`: passed with real bundled SF19 Lite WASM and a deterministic Maia fixture; bilingual details, score font, desktop/mobile screenshots, navigation, settings and responsive widths checked.
- The supplied 93-ply finished game was replayed through the actual local browser studio with real SF19 Lite. Maia returned empty predictions for this scoring-only reproduction, so it does not establish Maia key-move classification quality. All positions reached depth 12; white accuracy 90.4 (47/47 decision moves), black 80.7 (44/44). Two black forced moves were excluded. Native WASM runs scored black 81.1–81.6 depending on search history. Exact scores can vary with engine edition, search history and time budget.
- Old depth-6 arithmetic baseline in native WASM: white 92.3, black 89.7; the user's 90.7 was not reproduced exactly. At depth 12, `27...g6` lost roughly 4.6–5.3 pawns in these runs. The scoring defect was aggregate dilution, not an assertion that a losing player cannot score 90.
- `npm run test:browser`: passed after completing versioned-module precache coverage; first offline reload, API cache bypass and existing unpacked-extension live-game protection verified.
- `npm run build`: passed. No packaging, service or platform guard behavior was changed.

Screenshots and raw reproduction reports are retained under ignored `artifacts/accuracy-*`.
