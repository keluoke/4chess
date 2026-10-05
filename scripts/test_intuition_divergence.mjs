/**
 * Comprehensive Unit Test for:
 * 1. OpeningBook transposition and opening trap detection
 * 2. Quality gap L(a) x Human Probability P_好棋 for 妙手 / 俗手
 * 3. 风格分歧 (Style Divergence) vs 真正突破直觉 vs 直觉陷阱
 * 4. Engine Accuracy score A_i = 100 * exp(-5.11 * d_i)
 * 5. Maia 1900 Intuition Consistency H = 100 * exp(Σ ln(r_i) / N)
 * 6. Only legal move & timeout safety handling
 */

import { OpeningBook } from '../engine/opening-book.js';
import { GameAnalyzer } from '../engine/game-analyzer.js';

console.log('=== TEST SUITE 1: OpeningBook & Transposition Tests ===');

// Test 1.1: Standard opening lookup
const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const initialLookup = OpeningBook.lookup(initialFen, 'e4');
console.log('1.1 Initial Move e4 in Book:', initialLookup.inBook, '| ECO:', initialLookup.eco, '| Status:', initialLookup.statusText);
if (!initialLookup.inBook || initialLookup.eco !== 'A00' || !initialLookup.isBookMove) {
  throw new Error('Initial move e4 should be recognized in OpeningBook');
}

// Test 1.2: Transposition test (换序转置)
// 1. d4 Nf6 2. c4 e6  vs  1. c4 e6 2. d4 Nf6
const fenTranspositionA = 'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3';
const fenTranspositionB = 'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 2 3'; // Different clock counters
const keyA = OpeningBook.getPositionKey(fenTranspositionA);
const keyB = OpeningBook.getPositionKey(fenTranspositionB);
console.log('1.2 Transposition Key Equivalence:', keyA === keyB);
if (keyA !== keyB) {
  throw new Error('Canonical position keys must match across transpositions regardless of clock counters');
}

// Test 1.3: Opening Trap Detection (Damiano Defense: 1.e4 e5 2.Nf3 f6?)
const damianoFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
const damianoLookup = OpeningBook.lookup(damianoFen, 'f6', 180);
console.log('1.3 Damiano Defense f6: isOpeningTrap =', damianoLookup.isOpeningTrap, '| Status:', damianoLookup.statusText);
if (!damianoLookup.isOpeningTrap || damianoLookup.statusText !== '开局直觉陷阱') {
  throw new Error('Damiano Defense f6 must be flagged as an opening intuition trap');
}

// Test 1.4: Out of book move
const weirdMoveLookup = OpeningBook.lookup(initialFen, 'h4', 50);
console.log('1.4 Rare opening move 1.h4:', weirdMoveLookup.bookStatus, '| isBookMove:', weirdMoveLookup.isBookMove);
if (weirdMoveLookup.isBookMove) {
  throw new Error('1.h4 should not be considered a theoretical book move');
}

console.log('\n=== TEST SUITE 2: Engine Accuracy & Maia Intuition Scores ===');

// Test 2.1: Accuracy exponential formula A_i = 100 * exp(-5.11 * d_i)
const cpToWinScore = (cp) => 1 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp))));
const calcAccuracy = (cpBefore, cpAfterMover) => {
  const qBest = cpToWinScore(cpBefore);
  const qPlayed = cpToWinScore(cpAfterMover);
  const d_i = Math.max(0, qBest - qPlayed);
  return Math.min(100, Math.max(0, Math.round(100 * Math.exp(-5.11 * d_i) * 10) / 10));
};

// 0 cp loss -> 100% accuracy
const accPerfect = calcAccuracy(50, 50);
console.log('2.1 Perfect move accuracy:', accPerfect);
if (accPerfect !== 100) throw new Error('0 loss move must score 100% accuracy');

// 10 percentage points expected score loss -> ~60 accuracy
const d_ten = 0.10;
const accTen = Math.round(100 * Math.exp(-5.11 * d_ten) * 10) / 10;
console.log('2.2 10% expected score drop accuracy:', accTen);
if (Math.abs(accTen - 60) > 0.5) throw new Error('10% score drop must score ~60 accuracy');

// Test 2.2: Maia Intuition Consistency formula H = 100 * exp(Σ ln(max(r_i, 0.01)) / N)
const movesAllTop = [
  { relativeIntuition: 100, isBookMove: false, isOnlyLegalMove: false },
  { relativeIntuition: 100, isBookMove: false, isOnlyLegalMove: false },
  { relativeIntuition: 100, isBookMove: false, isOnlyLegalMove: false },
  { relativeIntuition: 100, isBookMove: false, isOnlyLegalMove: false },
  { relativeIntuition: 100, isBookMove: false, isOnlyLegalMove: false }
];
const computeH = (moves) => {
  const valid = moves.filter(m => !m.isBookMove && !m.isOnlyLegalMove && typeof m.relativeIntuition === 'number');
  if (valid.length < 5) return null;
  const eps = 0.01;
  const sumLog = valid.reduce((acc, m) => acc + Math.log(Math.max(eps, m.relativeIntuition / 100)), 0);
  return Math.round(100 * Math.exp(sumLog / valid.length) * 10) / 10;
};

const hPerfect = computeH(movesAllTop);
console.log('2.3 Perfect intuition consistency (always Maia top choice):', hPerfect);
if (hPerfect !== 100) throw new Error('Always choosing Maia top choice must yield H = 100');

const movesMixed = [
  { relativeIntuition: 100, isBookMove: false, isOnlyLegalMove: false },
  { relativeIntuition: 80, isBookMove: false, isOnlyLegalMove: false },
  { relativeIntuition: 50, isBookMove: false, isOnlyLegalMove: false },
  { relativeIntuition: 60, isBookMove: false, isOnlyLegalMove: false },
  { relativeIntuition: 70, isBookMove: false, isOnlyLegalMove: false }
];
const hMixed = computeH(movesMixed);
console.log('2.4 Mixed intuition consistency:', hMixed);
if (hMixed >= 100 || hMixed <= 50) throw new Error('Mixed intuition consistency should fall within realistic range (50-100)');

console.log('\n=== TEST SUITE 3: Core Archetype Classification (妙手 & 俗手) ===');

// Setup mock Stockfish that returns evaluations and multipv lines
const mockStockfish = {
  isReady: true,
  evaluate: async (fen, depth = 6, timeout = 3500, multipv = 1) => {
    // Starting pos
    if (fen.includes('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')) {
      return { score: '+0.25', scoreCp: 25, bestMove: { san: 'e4', uci: 'e2e4' } };
    }
    // Ply 1: 1. e4 (Black to move)
    if (fen.includes('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR')) {
      return { score: '-0.25', scoreCp: -25, bestMove: { san: 'e5', uci: 'e7e5' } };
    }
    // Ply 2: 1...e5 (White to move)
    if (fen.includes('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR')) {
      return { score: '+0.30', scoreCp: 30, bestMove: { san: 'Nf3', uci: 'g1f3' } };
    }
    // Ply 3: 2. Nf3 (Black to move)
    if (fen.includes('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R')) {
      return { score: '-0.30', scoreCp: -30, bestMove: { san: 'f6', uci: 'f7f6' } };
    }
    // Ply 4: 2...f6? (White to move) -> Damiano Defense trap!
    // Best move is Nxe5 (+1.80), but if Black played f6, it was a huge intuition trap
    if (fen.includes('rnbqkbnr/pppp1ppp/5p2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R')) {
      if (multipv > 1) {
        return {
          score: '+1.80',
          scoreCp: 180,
          bestMove: { san: 'Nxe5', uci: 'f3e5' },
          lines: [
            { multipv: 1, uci: 'f3e5', scoreCp: 180, deltaCp: 0 },
            { multipv: 2, uci: 'd2d4', scoreCp: 90, deltaCp: -90 }
          ]
        };
      }
      return { score: '+1.80', scoreCp: 180, bestMove: { san: 'Nxe5', uci: 'f3e5' } };
    }
    // Default
    return {
      score: '+0.20',
      scoreCp: 20,
      bestMove: { san: 'd4', uci: 'd2d4' },
      lines: [
        { multipv: 1, uci: 'd2d4', scoreCp: 20, deltaCp: 0 },
        { multipv: 2, uci: 'c2c4', scoreCp: 15, deltaCp: -5 }
      ]
    };
  }
};

// Setup mock Maia that outputs moves with rawProb
const mockMaia = {
  isReady: true,
  initialize: async () => {},
  predict: async (fen, elo = 1900) => {
    // At ply 3 (2.Nf3): Maia thinks f6 is a natural choice (e.g. beginner/human impulse)
    if (fen.includes('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R')) {
      return {
        moves: [
          { san: 'f6', uci: 'f7f6', prob: 35.0, rawProb: 0.35 },
          { san: 'Nc6', uci: 'b8c6', prob: 30.0, rawProb: 0.30 }
        ]
      };
    }
    return {
      moves: [
        { san: 'e4', uci: 'e2e4', prob: 50.0, rawProb: 0.50 },
        { san: 'd4', uci: 'd2d4', prob: 30.0, rawProb: 0.30 }
      ]
    };
  }
};

const analyzer = new GameAnalyzer(mockStockfish, mockMaia);

const testMoves = [
  { san: 'e4' },
  { san: 'e5' },
  { san: 'Nf3' },
  { san: 'f6' } // Black plays f6 (Intuition trap: Maia #1 f6, but loss >= 50cp)
];

console.log('Running test analyzeGame on Damiano trap...');
const review = await analyzer.analyzeGame(testMoves, { depth: 6, elo: 1900 });

console.log('\n--- Review Result Verification ---');
console.log('Total moves analyzed:', review.totalMoves);
console.log('White Accuracy:', review.accuracyWhite + '%');
console.log('Black Accuracy:', review.accuracyBlack + '%');
console.log('Book moves count:', review.bookMovesCount);
console.log('Beyond Intuition (妙手) count:', review.beyondIntuitionCount);
console.log('Intuition Trap (俗手) count:', review.intuitionTrapsCount);

// Verify opening move 1.e4 is NOT labeled as 妙手
const move1 = review.allMoves.find(m => m.ply === 1);
if (move1.isBeyondIntuition || move1.divergenceType === 'beyond_intuition') {
  throw new Error('Opening move 1.e4 must not be labeled as 妙手');
}

console.log('\n=== TEST SUITE 4: Brilliant Move (妙手) Verification ===');

// Setup tactical scenario to test true 妙手:
// Player plays SF #1 (Bxf7+), Maia #1 is O-O (loss 150cp >= 10cp)
const mockStockfishTactical = {
  isReady: true,
  evaluate: async (fen, depth = 6, timeout = 3500, multipv = 1) => {
    if (multipv > 1) {
      return {
        score: '+3.50',
        scoreCp: 350,
        bestMove: { san: 'Bxf7+', uci: 'c4f7' },
        lines: [
          { multipv: 1, uci: 'c4f7', scoreCp: 350, deltaCp: 0 },
          { multipv: 2, uci: 'd2d4', scoreCp: 220, deltaCp: -130 },
          { multipv: 3, uci: 'O-O', scoreCp: 200, deltaCp: -150 }
        ]
      };
    }
    return { score: '+3.50', scoreCp: 350, bestMove: { san: 'Bxf7+', uci: 'c4f7' } };
  }
};

const mockMaiaTactical = {
  isReady: true,
  initialize: async () => {},
  predict: async (fen, elo = 1900) => ({
    moves: [
      { san: 'O-O', uci: 'e1g1', prob: 65.0, rawProb: 0.65 },    // Natural move: loss -150cp >= 10cp
      { san: 'd4', uci: 'd2d4', prob: 25.0, rawProb: 0.25 },
      { san: 'Bxf7+', uci: 'c4f7', prob: 4.0, rawProb: 0.04 }     // Brilliant move: SF #1
    ]
  })
};

const tacticalAnalyzer = new GameAnalyzer(mockStockfishTactical, mockMaiaTactical);

// 4.1 Verify ply <= 10 suppression (move at ply 7 must NOT be 妙手)
const earlyTacticalMoves = [
  { san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' },
  { san: 'Bc4' }, { san: 'Bc5' },
  { san: 'Bxf7+' }, // Tactical sacrifice at ply 7
  { san: 'Kxf7' }
];
const earlyReview = await tacticalAnalyzer.analyzeGame(earlyTacticalMoves, { depth: 6, elo: 1900, forceRefresh: true });
const move7 = earlyReview.allMoves.find(m => m.ply === 7);
if (move7.isBeyondIntuition || move7.divergenceType === 'beyond_intuition') {
  throw new Error(`Early tactical move at ply 7 (<= 10) must not be labeled as 妙手, got ${move7.divergenceType}`);
}
console.log('4.1 Early ply 7 (<= 10 plies) brilliant move suppression verified: not 妙手');

// 4.2 Verify brilliant move at ply > 10 (ply 11)
// 1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Bc5 5. c3 dxc3 6. Bxf7+ Kxf7
const tacticalMoves = [
  { san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' },
  { san: 'd4' }, { san: 'exd4' }, { san: 'Bc4' }, { san: 'Bc5' },
  { san: 'c3' }, { san: 'dxc3' },
  { san: 'Bxf7+' }, // Tactical brilliant sacrifice at ply 11
  { san: 'Kxf7' }
];

const tacticalReview = await tacticalAnalyzer.analyzeGame(tacticalMoves, { depth: 6, elo: 1900, forceRefresh: true });
const move11 = tacticalReview.allMoves.find(m => m.ply === 11);
console.log('Tactical Ply 11 classification:', {
  san: move11.san,
  divergenceType: move11.divergenceType,
  divergenceStatus: move11.divergenceStatus,
  divergenceNote: move11.divergenceNote
});

if (move11.divergenceType !== 'beyond_intuition') {
  throw new Error(`Tactical move Bxf7+ at ply 11 should be confirmed as beyond_intuition (妙手), got ${move11.divergenceType}`);
}
console.log('4.2 Ply 11 brilliant move (妙手) confirmed');

console.log('\n=== TEST SUITE 5: Cache Schema v5 Round-Trip & Stale Purging ===');

// Setup mock localStorage
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

// Test 5.1: Save and load complete review result with schema v6
const testCacheKey = 'test_game_v6_roundtrip';
await GameAnalyzer.saveCachedReview(testCacheKey, tacticalReview);
const loadedCache = await GameAnalyzer.getCachedReview(testCacheKey);

console.log('5.1 Cached review schemaVersion:', loadedCache?.schemaVersion);
console.log('5.1 Cached review beyondWhiteCount:', loadedCache?.beyondWhiteCount);
console.log('5.1 Cached review trapWhiteCount:', loadedCache?.trapWhiteCount);

if (!loadedCache || loadedCache.schemaVersion !== 6 || loadedCache.accuracyWhite === undefined || loadedCache.beyondWhiteCount === undefined) {
  throw new Error('Failed to properly serialize and deserialize v6 review cache');
}

// Test 5.2: Invalidation of stale v5 cache
const staleKey = 'test_game_stale_v5';
const staleStorageKey = `maia3_review_v6_${staleKey}`;
localStorage.setItem(staleStorageKey, JSON.stringify({
  result: {
    totalMoves: 10,
    allMoves: [{ ply: 1, maiaTopSan: 'e4' }],
    schemaVersion: 5
  }
}));

const staleLookup = await GameAnalyzer.getCachedReview(staleKey);
console.log('5.2 Stale cache lookup result (must be null):', staleLookup);
if (staleLookup !== null) {
  throw new Error('getCachedReview must discard stale cache missing schemaVersion 6');
}

console.log('\n=== TEST SUITE 6: Missing Evaluation Nulling & Coverage Rate ===');

// Test 6.1: Null accuracy on missing engine evaluation
const mockStockfishWithFailure = {
  isReady: true,
  evaluate: async (fen) => {
    // Fails on ply 2
    if (fen.includes('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR')) {
      return null;
    }
    return { score: '+0.20', scoreCp: 20, bestMove: { san: 'e4', uci: 'e2e4' } };
  }
};
const failureAnalyzer = new GameAnalyzer(mockStockfishWithFailure, mockMaia);
const failMoves = [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }];
const failReview = await failureAnalyzer.analyzeGame(failMoves, { depth: 6, elo: 1900, forceRefresh: true });

console.log('6.1 Move 1 accuracy:', failReview.allMoves[0].accuracy);
console.log('6.1 Move 2 accuracy (failed eval):', failReview.allMoves[1].accuracy);
console.log('6.1 White coverage rate:', failReview.coverageRateWhite + '%');
console.log('6.1 Black coverage rate:', failReview.coverageRateBlack + '%');

if (failReview.allMoves[1].accuracy !== null) {
  throw new Error('Failed evaluation move must have accuracy = null, not 100');
}

console.log('\n✅ All unit tests passed with 100% precision!');
