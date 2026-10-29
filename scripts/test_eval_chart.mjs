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
chart.setData([
  { ply: 1, turn: 'w', evalBefore: '0.20', evalBeforeCp: 20, evalAfter: '-0.30', evalAfterCp: -30 },
  { ply: 2, turn: 'b', evalAfter: '0.40', evalAfterCp: 40 }
]);
const original = structuredClone(chart.data);
let selected;
chart.onSelectBranch = offset => { selected = offset; };
chart.setBranch({ basePly: 1, cursor: 1, points: [
  { ply: 1, offset: 0, cp: 30, displayText: '+0.30' },
  { ply: 2, offset: 1, cp: null, displayText: '—' },
  { ply: 3, offset: 2, cp: 110, displayText: '+1.10', depth: 12 }
] });
assert.equal(chart.maxPly, 3, 'Branch can extend past the game');
assert.equal(chart.cursorBadge.textContent, '—', 'Unsearched branch nodes must not display guessed scores');
assert.equal(chart.scrubDot.style.opacity, '0');
assert.equal((chart.branchPath.getAttribute('d').match(/M/g) || []).length, 2, 'Unknown nodes break the path');
assert.equal(chart.branchPath.getAttribute('d').includes('L'), false, 'Do not bridge an unknown node');
chart.branchDots.querySelector('[data-offset="2"]').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
assert.equal(selected, 2, 'Clicking a branch point selects its branch offset');
assert.deepEqual(chart.data, original, 'Study evaluations cannot mutate the game');
chart.setBranch(null); chart.setCursor(2);
assert.equal(chart.cursorBadge.textContent, '+0.40');
assert.equal(chart.branchPath.getAttribute('d'), '');
assert.equal(chart.linePath.getAttribute('stroke-dasharray'), '');
chart.setData([{ply:1,turn:'w',evalAfter:'?'}]);
assert.equal(chart.data[0].cp,null,'Missing evaluation is unknown, not zero');
assert.equal(chart.linePath.getAttribute('d').trim(),'');
console.log('Branch timeline gaps, extended axis, selection and original-score isolation passed');
dom.window.close();
