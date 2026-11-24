import assert from 'node:assert/strict';
import {
  SHARE_CARD_FORMATS,
  buildShareCardSpec,
  parseFenBoard,
  parseUciSquares
} from '../analysis/share-card.js';
import { buildTrapRecord } from '../analysis/study-store.js';

// 1. FEN board parsing
const fischerFen = 'r4rk1/1bq1bppp/p2ppn2/1p6/3NPP2/1BN1BQ2/PPP3PP/R4RK1 w - - 0 17';
const parsed = parseFenBoard(fischerFen);
assert.equal(parsed.turn, 'w');
assert.equal(parsed.pieces.length, 29);

// 2. UCI square extraction
assert.deepEqual(parseUciSquares('c3d1'), { from: 'c3', to: 'd1' });
assert.equal(parseUciSquares('invalid'), null);

// 3. Landscape 16:9 spec in English with Maia probability
const move = {
  moveNumber: 17,
  turn: 'b',
  fenBefore: 'r2qk2r/pp2bppp/2npbn2/2p5/4P3/1NN5/PPP1BPPP/R1BQ1RK1 b kq - 1 9',
  uci: 'c3d1',
  san: 'Nxd1',
  bestUci: 'c8e6',
  bestSan: 'Be6',
  maiaTopSan: 'Nxd1',
  humanRawProbability: 0.331,
  severity: 'mistake',
  lossCp: 165,
  verifiedLossCp: 165,
  divergenceType: 'intuition_trap',
  divergenceStatus: 'confirmed'
};
const enSpec = buildShareCardSpec(move, {
  elo: 1900,
  lang: 'en',
  orientation: 'black',
  white: 'Byrne',
  black: 'Fischer',
  format: 'landscape'
});
assert.deepEqual(enSpec.dimensions, SHARE_CARD_FORMATS.landscape);
assert.equal(enSpec.orientation, 'black');
assert.equal(enSpec.badge, 'Intuition trap');
assert(enSpec.headline.includes('1900 Elo: 33.1% play Nxd1'));
assert(enSpec.headline.includes('Stockfish plays Be6'));
assert.equal(enSpec.arrows.length, 2);
assert.equal(enSpec.arrows[0].role, 'stockfish');
assert.equal(enSpec.arrows[1].role, 'played');
assert.equal(enSpec.watermark, '4chess.cc · Diverge');

// 4. Portrait 3:4 spec in Chinese without probability
const zhSpec = buildShareCardSpec({
  moveNumber: 12,
  turn: 'w',
  fenBefore: fischerFen,
  uci: 'e4e5',
  san: 'e5',
  bestUci: 'e4e5',
  bestSan: 'e5'
}, {
  elo: 1500,
  lang: 'zh',
  format: 'portrait'
});
assert.deepEqual(zhSpec.dimensions, SHARE_CARD_FORMATS.portrait);
assert(zhSpec.headline.includes('e5'));
assert.equal(zhSpec.arrows.length, 1, 'Identical best and played moves produce a single engine arrow');
assert.equal(zhSpec.badge, '人机分歧');

for (const [divergenceType, zh, en] of [
  ['intuition_trap', '直觉陷阱', 'Intuition trap'],
  ['precise_intuition', '精准突破', 'Precise intuition'],
  ['beyond_intuition', '神之一手', 'Beyond intuition']
]) {
  const confirmed = { ...move, divergenceType };
  assert.equal(buildShareCardSpec(confirmed, { lang: 'zh' }).badge, zh);
  assert.equal(buildShareCardSpec(confirmed, { lang: 'en' }).badge, en);
}
const savedTrap = buildTrapRecord({ ...move, verifiedExpectedScoreLoss: 12 }, { elo: 1900 });
assert.equal(buildShareCardSpec(savedTrap, { lang: 'zh' }).badge, '直觉陷阱');

// 5. P1 regression: played === Stockfish best, Maia diverges (e.g. 7.Qb3 vs Maia Bg5)
const qb3Spec = buildShareCardSpec({
  moveNumber: 7,
  turn: 'w',
  fenBefore: fischerFen,
  uci: 'd1b3',
  san: 'Qb3',
  bestUci: 'd1b3',
  bestSan: 'Qb3',
  maiaTopUci: 'c1g5',
  maiaTopSan: 'Bg5',
  maiaTopRawProb: 0.423
}, {
  elo: 1900,
  lang: 'en',
  format: 'landscape'
});
assert.equal(qb3Spec.useMaiaDivergence, true);
assert.equal(qb3Spec.arrows.length, 2, 'Must include both Stockfish Qb3 and Maia Bg5 arrows');
assert.equal(qb3Spec.arrows[0].from, 'd1');
assert.equal(qb3Spec.arrows[1].from, 'c1');
assert.equal(qb3Spec.arrows[1].role, 'maia');
assert.equal(qb3Spec.arrows[1].label, 'Bg5');
assert(qb3Spec.headline.includes('Bg5') && qb3Spec.headline.includes('Qb3'));
assert.equal(qb3Spec.humanSan, 'Bg5');

console.log('PASS share card: FEN parsing, dual arrows, Maia divergence when played === best, 16:9 & 3:4 specs, zh/en headlines and watermark.');
