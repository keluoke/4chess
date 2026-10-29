import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EvalChart } from '../analysis/eval-chart.js';

const dom = new JSDOM('<div id="chart"></div>');
globalThis.document = dom.window.document;
const chart = new EvalChart(document.querySelector('#chart'));
for (const turn of ['w', 'b']) {
  const expected = turn === 'w' ? 450 : -450;
  chart.setData([
    { ply: 1, turn, evalAfter: 'M-1', evalAfterCp: -9900 },
    { ply: 2, turn, san: 'Qh4#', evalAfter: 'M0', evalAfterCp: -10000 }
  ]);
  assert.deepEqual(chart.data.map(m => m.cp), [expected, expected], 'Mate must not reverse the curve');
  chart.setCursor(2);
  assert.equal(Number(chart.scrubDot.getAttribute('cy')), expected > 0 ? 22 : 138);
  assert.ok(!chart.linePath.getAttribute('d').includes('NaN'));
  chart.setData([{ turn, evalAfter: 'M0' }]);
  assert.equal(chart.data[0].cp, expected, 'Legacy text-only terminal score');
}
chart.setData([{ turn: 'b', evalAfter: '0.00', evalAfterCp: 0 }]);
assert.equal(chart.data[0].cp, 0, 'Draw stays at zero');
chart.setData([{ turn: 'w', evalAfter: '?', evalAfterCp: 0, evalBefore: '+1.25', evalBeforeCp: 125 }]);
assert.equal(chart.data[0].cp, 125, 'Before-move fallback uses the mover perspective');
chart.setData([{ turn: 'b', evalAfter: '+1.25', evalAfterCp: 125, eval: '-9.00' }]);
assert.equal(chart.data[0].cp, 125, 'Structured after-score takes precedence over legacy text');
console.log('Evaluation chart terminal, draw, perspective and SVG regressions passed');
dom.window.close();
