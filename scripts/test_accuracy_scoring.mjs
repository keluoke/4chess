import assert from 'node:assert/strict';
import { GameAnalyzer as G } from '../engine/game-analyzer.js';

assert.equal(G.moveAccuracy(0, 0).accuracy, 100);
assert.equal(G.moveAccuracy(200, 400).accuracy, 100, 'Search improvements are not losses');
assert.equal(G.moveAccuracy(0, -300, true).accuracy, 100, 'Engine first choice must not lose points from adjacent-search noise');
assert.equal(G.moveAccuracy(null, 0), null);
assert.equal(G.moveAccuracy(0, NaN), null);
assert(G.moveAccuracy(0, -300).accuracy < 30, 'A three-pawn loss in equality is severe');
assert(G.moveAccuracy(-700, -1000).accuracy > G.moveAccuracy(0, -300).accuracy, 'Same pawn loss in a lost position changes expected score less');
assert.equal(G.aggregateAccuracy([]), null);
assert.equal(G.aggregateAccuracy([{ accuracy: null }, { accuracy: NaN }]), null);
assert.equal(G.aggregateAccuracy([{ accuracy: 100 }, { accuracy: null }]), 100);
assert.equal(G.aggregateAccuracy([{ accuracy: 0 }]), 0);
assert.equal(G.aggregateAccuracy([{ accuracy: 100 }, { accuracy: 100 }]), 100);
const quiet = Array.from({ length: 19 }, () => ({ accuracy: 100, accuracyWeight: .5 }));
const critical = { accuracy: 10, accuracyWeight: 12 };
assert(G.aggregateAccuracy([...quiet, critical]) < 65, 'A critical blunder cannot be diluted into 95.5 by quiet moves');
assert(G.aggregateAccuracy([...quiet, critical]) < G.aggregateAccuracy([...quiet, { ...critical, accuracyWeight: .5 }]));
assert.deepEqual(G.accuracyWeights([.5, .5, .5]), [.5, .5]);
assert.deepEqual(G.accuracyWeights([null, .5, .5]), [.5, .5]);
assert.deepEqual(G.accuracyWeights([.5, .9, .5]), [12, 12]);

const moves = G.parsePgn('[Result "1-0"]\n1. e4 e5 2. Nf3 Nc6 1-0');
let index = 0;
const scores = [0, 0, 0, 0, 300], depths = [];
const sf = { isReady: true, engineKey: 'scoring-fixture', async evaluate(fen, depth) {
  depths.push(depth);
  const scoreCp = scores[index++];
  return { scoreCp, score: String(scoreCp / 100), depth: 12, bestMove: null };
} };
const result = await new G(sf, { isReady: true, modelKey: 'scoring-fixture', async predict() { return { moves: [] }; } }).analyzeGame(moves, { forceRefresh: true });
assert(depths.every(d => d === 12), 'Default full review requests depth 12');
assert.equal(result.coverageRateBlack, 100);
assert.equal(result.depthMin, 12);
assert.equal(result.depthMax, 12);
assert(result.accuracyBlack < result.accuracyWhite);
assert.equal(result.accuracyBlack, G.aggregateAccuracy(result.allMoves.filter(m => m.turn === 'b' && !m.isOnlyLegalMove)));
assert.notEqual(G.getGameKey(moves), G.getGameKey(moves, { depth: 6 }));
assert.equal(G.isValidReviewCache({ ...result, schemaVersion: 7 }), false, 'Old arithmetic-mean reports must be invalidated');
assert.equal(G.isValidReviewCache({ ...result, schemaVersion: 10 }), false, 'Reports built with case-insensitive SAN replay must be invalidated');
console.log('PASS accuracy: real scorer, critical loss weighting, missing data, depth, side perspective and cache migration');

const criticalGame = G.parsePgn('[FEN "4k3/8/8/8/8/8/8/R3K3 w - - 0 1"]\n[Result "1-0"]\n1. Ra2 1-0');
const positions = G.buildPositionChain(criticalGame);
const verificationCalls = [];
const bestMove = { uci: 'a1a8', san: 'Ra8+' };
const verifier = {
  isReady: true, engineKey: 'adaptive-scoring-fixture',
  async evaluate(fen, depth, _timeout, _multipv, time) {
    verificationCalls.push({ depth, time });
    const before = fen === positions[0].fen;
    const scoreCp = before ? (depth === 12 ? 0 : 40) : (depth === 12 ? 350 : 35);
    return { depth, scoreCp, score: String(scoreCp / 100), bestMove: before ? bestMove : null };
  }
};
const maia = { isReady: true, modelKey: 'adaptive-maia', async predict() { return { moves: [] }; } };
const deep = await new G(verifier, maia).analyzeGame(criticalGame, { engineOnly: true, reviewMode: 'deep', forceRefresh: true });
assert.deepEqual(verificationCalls.map(call => call.depth), [12, 12, 18, 17]);
assert(verificationCalls.every(call => call.time > 0), 'All adaptive searches use a bounded engine budget');
assert.equal(deep.scoreVerifications.length, 1);
assert.equal(deep.allMoves[0].scoreVerificationDepth, 18);
assert.equal(deep.allMoves[0].lossCp, 75);
assert.equal(deep.allMoves[0].accuracy, G.moveAccuracy(40, -35).accuracy);
assert.equal(deep.allMoves[0].accuracyWeight, G.accuracyWeights([G.winScore(40), G.winScore(-35)])[0]);
assert.equal(deep.acplWhite, 75);
assert.equal(deep.blundersCount, 0);
const enriched = await new G(verifier, maia).analyzeGame(criticalGame, { reviewMode: 'deep', baseReview: deep, elo: 2200 });
assert.equal(enriched.accuracyWhite, deep.accuracyWhite);
assert.deepEqual(enriched.scoreVerifications, deep.scoreVerifications);
assert.equal(verificationCalls.length, 4, 'Maia enrichment reuses the paired scoring evidence');
const quick = await new G(verifier, maia).analyzeGame(criticalGame, { engineOnly: true, reviewMode: 'quick' });
assert.deepEqual(verificationCalls.slice(4).map(call => call.depth), [12, 12, 16, 15]);
assert.notEqual(quick.gameKey, deep.gameKey);
console.log('PASS adaptive accuracy: per-mode budget, paired D18/D16 verification, correction and cache isolation');

// Deep mode verifies borderline moves (ESL >= 3.5) that Quick mode skips.
const borderlineGame = G.parsePgn('[FEN "4k3/8/8/8/8/8/8/R3K3 w - - 0 1"]\n[Result "1-0"]\n1. Ra2 Kd7 1-0');
const borderlinePositions = G.buildPositionChain(borderlineGame);
const borderlineSf = {
  isReady: true, engineKey: 'borderline-fixture',
  async evaluate(fen, depth) {
    const isPly1After = fen === borderlinePositions[1].fen;
    const scoreCp = isPly1After ? 48 : 0; // ply 1: evalBefore=0, evalAfter=+48 -> 48cp loss (~4.4% ESL)
    return { depth, scoreCp, score: String(scoreCp / 100), bestMove: { uci: 'a1a8', san: 'Ra8+' } };
  }
};
const borderlineQuick = await new G(borderlineSf, maia).analyzeGame(borderlineGame, { engineOnly: true, reviewMode: 'quick', forceRefresh: true });
assert.equal(borderlineQuick.scoreVerifications.length, 0, 'Quick mode skips borderline < 6% ESL moves');
const borderlineDeep = await new G(borderlineSf, maia).analyzeGame(borderlineGame, { engineOnly: true, reviewMode: 'deep', forceRefresh: true });
assert(borderlineDeep.scoreVerifications.length >= 1, 'Deep mode verifies borderline >= 3.5% ESL moves');

// Parallel Stockfish worker pool matches sequential accuracy and cleans up helpers.
const longPgn = '[Result "1/2-1/2"]\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 1/2-1/2';
const longMoves = G.parsePgn(longPgn);
const makeDeterministicSf = (id, stats, workerLog = null) => ({
  isReady: false,
  engineKey: 'parallel-fixture',
  async initialize() { stats.inits++; this.isReady = true; return true; },
  stop() { stats.stops++; },
  reset() { stats.resets++; this.isReady = false; },
  async evaluate(fen, depth) {
    stats.evals++;
    workerLog?.push({ id, fen });
    const hash = fen.length * 17 + fen.charCodeAt(0);
    return { depth, scoreCp: (hash % 50) - 25, score: '0.00', bestMove: { uci: 'e2e4', san: 'e4' } };
  }
});
const seqStats = { inits: 0, stops: 0, resets: 0, evals: 0 };
const parStats = { inits: 0, stops: 0, resets: 0, evals: 0 };
const seqResult = await new G(makeDeterministicSf(0, seqStats), maia).analyzeGame(longMoves, { engineOnly: true, forceRefresh: true });
const progressCounts = [];
const workerLog = [];
let nextWorkerId = 1;
const longPositions = G.buildPositionChain(longMoves).map(p => p.fen);
const parResult = await new G(makeDeterministicSf(0, parStats, workerLog), maia).analyzeGame(longMoves, {
  engineOnly: true, forceRefresh: true, concurrency: 3,
  createWorker: () => makeDeterministicSf(nextWorkerId++, parStats, workerLog),
  onProgress: p => { if (p.phase === 'evaluating') progressCounts.push(p.current); }
});
assert.equal(parResult.accuracyWhite, seqResult.accuracyWhite);
assert.equal(parResult.accuracyBlack, seqResult.accuracyBlack);
assert.equal(parStats.resets, 2, 'Helper workers are always reset after parallel sweep');
assert.deepEqual(progressCounts, Array.from({ length: 13 }, (_, i) => i + 1), 'Parallel sweep reports monotonic progress');
for (const workerId of [0, 1, 2]) {
  const indices = workerLog.filter(entry => entry.id === workerId).map(entry => longPositions.indexOf(entry.fen));
  assert(indices.length > 0, `Worker ${workerId} receives a non-empty contiguous slice`);
  for (let k = 1; k < indices.length; k++) {
    assert.equal(indices[k], indices[k - 1] + 1, `Worker ${workerId} evaluates contiguous positions`);
  }
}
console.log('PASS parallel Stockfish sweep & deep borderline verification');
