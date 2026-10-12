import assert from 'node:assert/strict';
import { ChessBoard } from '../engine/chess-core.js';
import { whiteEvaluation, reviewEvaluation, legalVariation, engineLines, PositionAnalysis } from '../analysis/position-analysis.js';

const initial = ChessBoard.INITIAL_FEN;
const afterE4 = legalVariation(initial, ['e2e4'])[0].fen;
assert.equal(whiteEvaluation({ scoreCp: 120 }, initial).text, '+1.20');
assert.equal(whiteEvaluation({ scoreCp: 120 }, afterE4).text, '-1.20');
assert.equal(whiteEvaluation({ scoreCp: 0 }, afterE4).text, '0.00');
assert.equal(whiteEvaluation(null, initial), null);
assert.equal(whiteEvaluation({ scoreCp: NaN }, initial), null);
assert.equal(whiteEvaluation({ scoreCp: 9700, isMate: true, scoreText: 'M+3' }, afterE4).text, '-M3');
assert.equal(whiteEvaluation({ scoreCp: -9800, isMate: true, scoreText: 'M-2' }, afterE4).text, '+M2');
assert.equal(reviewEvaluation({ evalAfter: '?', evalAfterCp: 0, fenAfter: afterE4 }, true), null);

const pv = legalVariation(initial, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
assert.deepEqual(pv.map(m => m.label), ['1. e4', 'e5', '2. Nf3', 'Nc6']);
assert.equal(legalVariation(afterE4, ['e7e5'])[0].label, '1… e5');
assert.equal(legalVariation(initial, ['e2e4', 'e2e3', 'g1f3']).length, 1, 'An invalid continuation must stop replay');
assert.equal(legalVariation(initial, ['a1a8']).length, 0);
const castle = legalVariation('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1g1']);
assert.equal(castle[0].san, 'O-O');
assert.equal(legalVariation('8/P7/8/7k/8/8/8/7K w - - 0 1', ['a7a8q'])[0].san, 'a8=Q');

const lines = engineLines({ lines: [
  { multipv: 3, uci: 'g1f3', scoreCp: 10, pv: ['g1f3', 'g8f6'] },
  { multipv: 2, uci: 'd2d4', scoreCp: 20, pv: ['d2d4', 'd7d5'] },
  { multipv: 1, uci: 'e2e4', scoreCp: 30, pv: ['e2e4', 'e7e5'] },
  { multipv: 4, uci: 'e2e4', scoreCp: 5 },
  { multipv: 5, uci: 'a1a8', scoreCp: 0 }
] }, initial);
assert.deepEqual(lines.map(l => l.uci), ['e2e4', 'd2d4', 'g1f3']);
assert.equal(lines[0].variation.length, 2, 'Every MultiPV line must retain its own continuation');
assert.equal(engineLines({ bestMove: { uci: 'e2e4' }, scoreCp: 30, pv: ['e2e4', 'e7e5'] }, initial).length, 1, 'Legacy single-PV results must not fabricate three lines');

// A completed old search must not overwrite a newer game/request, even when it resolves late.
let completeSearch;
const app = {
  gameEpoch: 1, currentElo: 1900, settings: { heatmap: false },
  analyzer: { isAnalyzing: false }, boardUI: { clearArrows() {}, squareEls: {} },
  stockfish: { async initialize() {}, evaluate() { return new Promise(resolve => { completeSearch = resolve; }); }, stop() {} },
  maiaEngine: { async initialize() {}, async predict() { return { moves: [] }; } },
  updateEngineStatus() {}
};
const controller = new PositionAnalysis(app);
controller.render = () => {};
const entry = { sf: null, prediction: { moves: [{ uci: 'e2e4' }] }, maiaEvaluations: new Map() };
const snapshot = { generation: 0, ctx: { fen: initial, elo: 1900, epoch: 1, depth: 10, history: [] }, entry };
const running = controller.compute(snapshot);
await new Promise(resolve => setImmediate(resolve));
assert.equal(controller.searchCount, 1);
controller.cancel();
app.gameEpoch = 2;
completeSearch({ scoreCp: 300, bestMove: { uci: 'e2e4' } });
await running;
assert.equal(entry.sf, null, 'Discard the result of the superseded search');
assert.equal(controller.searchCount, 0);
app.analyzer.isAnalyzing = true;
assert.equal(controller.current({ ...snapshot, generation: controller.generation, ctx: { ...snapshot.ctx, epoch: 2 } }), false, 'Single-position work cannot interrupt a full review');

console.log('✅ White perspective, mate/unknown scores, legal PV replay, all MultiPV lines, promotion/castling, stale result rejection and review scheduling passed.');
