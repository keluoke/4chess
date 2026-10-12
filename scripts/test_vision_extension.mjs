import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('--- Testing Diverge Vision Extension Integration ---');

// 1. Verify model files exist in extension package
const wasmPath = path.join(rootDir, 'models', 'chess-cnn.wasm');
const weightsPath = path.join(rootDir, 'models', 'chessimg2pos_weights.bin');
assert.ok(fs.existsSync(wasmPath), 'models/chess-cnn.wasm must exist');
assert.ok(fs.existsSync(weightsPath), 'models/chessimg2pos_weights.bin must exist');
console.log('✅ Model binaries verified in extension bundle');

// 2. Verify all lib/vision ESM files can be imported
const visionDir = path.join(rootDir, 'lib', 'vision');
assert.ok(fs.existsSync(visionDir), 'lib/vision must exist');

const visionIndex = await import('../lib/vision/index.js');
assert.ok(visionIndex.VisionRecognizerCore, 'VisionRecognizerCore should be exported');
assert.ok(visionIndex.VisionTaskController, 'VisionTaskController should be exported');
assert.ok(visionIndex.WebAdapter, 'WebAdapter should be exported');
assert.ok(visionIndex.extractTiles, 'extractTiles should be exported');
assert.ok(visionIndex.PieceClassifierCore, 'PieceClassifierCore should be exported');
console.log('✅ lib/vision/index.js exported correctly');

// 3. Verify Chess rule validation module in extension
const { Chess } = await import('../lib/vision/chess.js');
const { validateChessPosition } = visionIndex;
assert.ok(typeof Chess === 'function', 'Chess class available');
assert.ok(typeof validateChessPosition === 'function', 'validateChessPosition available');

// Test mutual check rejection
const mutualCheckResult = validateChessPosition('4k3/4R3/8/8/8/8/4r3/4K3 w - - 0 1');
assert.strictEqual(mutualCheckResult.valid, false, 'Mutual check must be invalid');
assert.ok(mutualCheckResult.error.includes('同时受将') || mutualCheckResult.error.includes('king in check'));

// Test non-moving king in check rejection
const invalidTurnResult = validateChessPosition('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1');
assert.strictEqual(invalidTurnResult.valid, false, 'Opponent king in check on own turn must be invalid');

console.log('✅ Chess rule validator verified in extension ESM bundle');

// 4. Verify WebAdapter initialization
const adapter = new visionIndex.WebAdapter({
  baseUrl: 'https://example.com'
});
assert.strictEqual(typeof adapter.loadAsset, 'function');
assert.strictEqual(typeof adapter.decodeImage, 'function');
assert.strictEqual(typeof adapter.instantiateWasm, 'function');
console.log('✅ WebAdapter instantiated successfully');

console.log('🎉 All Vision Extension tests passed successfully!');
