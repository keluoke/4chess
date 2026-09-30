/**
 * Test script for GameAnalyzer & Loss Ranking
 */
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { MaiaEngine } from '../engine/maia-engine.js';

console.log('--- Testing GameAnalyzer Position Chain & Loss Computation ---');

// Simulated 10-ply game moves (Opera Game opening variation)
const sampleMoves = [
  { san: 'e4' },
  { san: 'e5' },
  { san: 'Nf3' },
  { san: 'd6' },
  { san: 'd4' },
  { san: 'Bg4' },
  { san: 'dxe5' },
  { san: 'Bxf3' },
  { san: 'Qxf3' },
  { san: 'dxe5' }
];

const positions = GameAnalyzer.buildPositionChain(sampleMoves);
console.log(`Replayed ${positions.length - 1} moves into ${positions.length} positions:`);
positions.forEach((p, idx) => {
  console.log(`  [Ply ${p.ply}] ${p.san.padEnd(6)} -> Turn: ${p.turn} | FEN: ${p.fen.split(' ')[0]}`);
});

// Mock Stockfish engine that simulates evaluations
const mockStockfish = {
  isReady: true,
  evaluate: async (fen, depth = 8) => {
    // Return mock evaluations
    if (fen.includes('rnbqkbnr/pppppppp')) return { score: '+0.25', scoreCp: 25, bestMove: { san: 'e4' } };
    if (fen.includes('rnbqkbnr/pppp1ppp')) return { score: '+0.30', scoreCp: 30, bestMove: { san: 'e5' } };
    if (fen.includes('r1bqkbnr/pppp1ppp')) return { score: '+0.85', scoreCp: 85, bestMove: { san: 'Nf6' } };
    // Simulate a blunder at ply 6 (Bg4)
    if (fen.includes('rnbqkb1r/ppp2ppp')) return { score: '+1.90', scoreCp: 190, bestMove: { san: 'dxe5' } };
    return { score: '+0.50', scoreCp: 50, bestMove: { san: 'Nf3' } };
  }
};

const mockMaia = {
  isReady: true,
  initialize: async () => {},
  predict: async (fen, elo = 1500) => ({
    moves: [
      { san: 'Nf3', uci: 'g1f3', prob: 40.0, rawProb: 0.40 },
      { san: 'e4', uci: 'e2e4', prob: 30.0, rawProb: 0.30 },
      { san: 'd4', uci: 'd2d4', prob: 20.0, rawProb: 0.20 }
    ]
  })
};

const analyzer = new GameAnalyzer(mockStockfish, mockMaia);

console.log('\nRunning analyzer.analyzeGame()...');
const result = await analyzer.analyzeGame(sampleMoves, {
  depth: 8,
  elo: 1500,
  onProgress: (prog) => {
    console.log(`  Progress: ${prog.percent}% (${prog.current}/${prog.total}) [${prog.phase}]`);
  }
});

console.log('\nAnalysis Results Summary:');
console.log('  Total Moves Analyzed:', result.totalMoves);
console.log('  Blunders:', result.blundersCount);
console.log('  Mistakes:', result.mistakesCount);
console.log('  Inaccuracies:', result.inaccuraciesCount);
console.log('  Style Divergence:', result.styleDivergenceCount);
console.log('  Beyond Intuition (妙手):', result.beyondIntuitionCount);
console.log('  Intuition Traps (俗手):', result.intuitionTrapsCount);
console.log('  White Accuracy:', result.accuracyWhite + '%');
console.log('  Black Accuracy:', result.accuracyBlack + '%');
console.log('  ACPL White:', result.acplWhite, '| ACPL Black:', result.acplBlack);
console.log('  Key Moments (Ranked by loss):');
result.keyMoments.forEach((km, i) => {
  console.log(`    #${i + 1}: Ply ${km.ply} (${km.turn === 'w' ? 'White' : 'Black'} ${km.san}) | Loss: ${km.lossPawns} pawns | Severity: ${km.severity} | Best: ${km.bestSan}`);
});

console.log('\n--- Testing GameAnalyzer Cache Hit ---');
const cacheKey = GameAnalyzer.getGameKey(sampleMoves, { depth: 8, elo: 1500 });
console.log('Deterministic game key:', cacheKey);

let hitCache = false;
const cachedResult = await analyzer.analyzeGame(sampleMoves, {
  depth: 8,
  elo: 1500,
  onProgress: (prog) => {
    if (prog.fromCache) hitCache = true;
  }
});

if (hitCache && cachedResult && cachedResult.totalMoves === 10) {
  console.log('✅ Persistent Cache Hit verified (0ms instant return)!');
} else {
  console.error('❌ Cache hit failed!');
  process.exit(1);
}

// Verify different parameters yield different cache keys
const keyDifferentElo = GameAnalyzer.getGameKey(sampleMoves, { depth: 8, elo: 1900 });
if (cacheKey !== keyDifferentElo) {
  console.log('✅ Cache key differentiates by Elo/Depth parameters!');
} else {
  console.error('❌ Cache key collided across different Elo!');
  process.exit(1);
}

console.log('\n--- Testing forceRefresh ---');
let reevaluated = false;
await analyzer.analyzeGame(sampleMoves, {
  depth: 8,
  elo: 1500,
  forceRefresh: true,
  onProgress: (prog) => {
    if (prog.phase === 'evaluating') reevaluated = true;
  }
});
if (reevaluated) {
  console.log('✅ forceRefresh successfully bypassed cache and re-analyzed!');
} else {
  console.error('❌ forceRefresh failed to re-evaluate!');
  process.exit(1);
}

console.log('\n--- Testing Custom Start FEN in PGN ---');
import { ChessBoard } from '../engine/chess-core.js';

const customPgn = `[Event "Puzzle"]
[FEN "r1bqk2r/pppp1ppp/2n5/4p3/1bB1P1n1/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 1 6"]

6. O-O d6 7. Nd5`;

const customMoves = GameAnalyzer.parsePgn(customPgn);
if (customMoves.startFen && customMoves.length === 3) {
  console.log('✅ [FEN "..."] header parsed properly:', customMoves.startFen);
  const customPositions = GameAnalyzer.buildPositionChain(customMoves);
  if (customPositions.length === 4 && customPositions[0].fen.startsWith('r1bqk2r')) {
    console.log('✅ Custom start position chained accurately:', customPositions[0].fen);
  } else {
    console.error('❌ Custom position chain failed:', customPositions);
    process.exit(1);
  }
} else {
  console.error('❌ parsePgn failed to retain startFen:', customMoves);
  process.exit(1);
}

console.log('\n--- Testing Castling Rules with Missing Rooks/Kings ---');
// Board with white king at e1 but NO rooks at a1 or h1
const boardNoRook = new ChessBoard('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1');
if (!boardNoRook.castling.K && !boardNoRook.castling.Q && !boardNoRook.castling.k && !boardNoRook.castling.q) {
  console.log('✅ ChessBoard.load invalidated impossible castling rights on piece-less board!');
} else {
  console.error('❌ Failed to invalidate castling rights on piece-less board:', boardNoRook.castling);
  process.exit(1);
}

const legals = boardNoRook.getLegalMoves();
const castlingMoves = legals.filter(m => m.castling || m.san === 'O-O' || m.san === 'O-O-O');
if (castlingMoves.length === 0) {
  console.log('✅ No pseudo-legal castling moves generated without rooks!');
} else {
  console.error('❌ Generated illegal castling moves:', castlingMoves);
  process.exit(1);
}

console.log('\n--- Testing Partial Review Replay Flags ---');
const illegalMoves = [
  { san: 'e4' },
  { san: 'e5' },
  { san: 'Qh5' },
  { san: 'Ke2??' } // Illegal move for Black at ply 4
];
const partialPositions = GameAnalyzer.buildPositionChain(illegalMoves);
if (partialPositions.isPartial && partialPositions.stoppedAtPly === 4) {
  console.log('✅ Partial replay correctly flagged at ply 4 without breaking!');
} else {
  console.error('❌ Partial replay flag missing:', partialPositions.isPartial, partialPositions.stoppedAtPly);
  process.exit(1);
}

console.log('\n✅ All GameAnalyzer tests completed successfully!');

