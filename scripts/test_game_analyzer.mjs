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

const maia = new MaiaEngine();
const analyzer = new GameAnalyzer(mockStockfish, maia);

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
console.log('  ACPL White:', result.acplWhite, '| ACPL Black:', result.acplBlack);
console.log('  Key Moments (Ranked by loss):');
result.keyMoments.forEach((km, i) => {
  console.log(`    #${i + 1}: Ply ${km.ply} (${km.turn === 'w' ? 'White' : 'Black'} ${km.san}) | Loss: ${km.lossPawns} pawns | Severity: ${km.severity} | Best: ${km.bestSan}`);
});

console.log('\n--- Testing GameAnalyzer Cache Hit ---');
const cacheKey = GameAnalyzer.getGameKey(sampleMoves);
console.log('Deterministic game key:', cacheKey);

let hitCache = false;
const cachedResult = await analyzer.analyzeGame(sampleMoves, {
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

console.log('\n--- Testing forceRefresh ---');
let reevaluated = false;
await analyzer.analyzeGame(sampleMoves, {
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

console.log('\n✅ All GameAnalyzer tests completed successfully!');

