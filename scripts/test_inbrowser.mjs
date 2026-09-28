import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MaiaEngine } from '../engine/maia-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const binPath = path.resolve(__dirname, '../models/maia3_model.bin');
  const buffer = fs.readFileSync(binPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const engine = new MaiaEngine();
  // Manually load array buffer into maiaInBrowser for Node.js test
  await engine.maiaInBrowser.loadModel(arrayBuffer);
  engine.isReady = true;

  console.log('Testing MaiaEngine.predict() on initial position:');
  const res1 = await engine.predict('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1500);
  console.log('Backend:', res1.backend);
  console.log('Available:', res1.isAvailable);
  console.log('Turn:', res1.turn);
  console.log('Top move:', res1.moves[0]?.san, `(${res1.moves[0]?.prob}%)`);
  console.log('Moves:', res1.moves.slice(0, 5).map(m => `${m.san}: ${m.prob}%`).join(', '));
  console.log('Comparison:', res1.comparison);

  console.log('\nTesting MaiaEngine.predict() on Black after 1. e4:');
  const res2 = await engine.predict('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 1500);
  console.log('Turn:', res2.turn);
  console.log('Top move:', res2.moves[0]?.san, `(${res2.moves[0]?.prob}%)`);
  console.log('Moves:', res2.moves.slice(0, 5).map(m => `${m.san}: ${m.prob}%`).join(', '));
  console.log('Comparison:', res2.comparison);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
