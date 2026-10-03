import assert from 'assert';
import { soundEffects, SoundEffects } from '../analysis/sound-effects.js';

console.log('--- Testing SoundEffects Module ---');

// 1. Instantiation and default state
assert.strictEqual(typeof soundEffects.playMove, 'function');
assert.strictEqual(typeof soundEffects.playCapture, 'function');
assert.strictEqual(typeof soundEffects.playCastle, 'function');
assert.strictEqual(typeof soundEffects.playCheck, 'function');
assert.strictEqual(typeof soundEffects.playPromote, 'function');
assert.strictEqual(typeof soundEffects.playSoundForMove, 'function');
console.log('✅ SoundEffects methods verified');

// 2. Toggle state
const initial = soundEffects.enabled;
soundEffects.toggle();
assert.strictEqual(soundEffects.enabled, !initial);
soundEffects.toggle();
assert.strictEqual(soundEffects.enabled, initial);
console.log('✅ SoundEffects toggle verified');

// 3. Move classification dispatch
class TestSoundEffects extends SoundEffects {
  constructor() {
    super();
    this.calls = [];
  }
  playMove() { this.calls.push('move'); }
  playCapture() { this.calls.push('capture'); }
  playCastle() { this.calls.push('castle'); }
  playCheck() { this.calls.push('check'); }
  playPromote() { this.calls.push('promote'); }
}

const testAudio = new TestSoundEffects();

testAudio.playSoundForMove('e4');
assert.deepStrictEqual(testAudio.calls, ['move']);

testAudio.calls = [];
testAudio.playSoundForMove('Nxd5');
assert.deepStrictEqual(testAudio.calls, ['capture']);

testAudio.calls = [];
testAudio.playSoundForMove('O-O');
assert.deepStrictEqual(testAudio.calls, ['castle']);

testAudio.calls = [];
testAudio.playSoundForMove('O-O-O');
assert.deepStrictEqual(testAudio.calls, ['castle']);

testAudio.calls = [];
testAudio.playSoundForMove('Qxf7#');
assert.deepStrictEqual(testAudio.calls, ['check']);

testAudio.calls = [];
testAudio.playSoundForMove('Bb5+');
assert.deepStrictEqual(testAudio.calls, ['check']);

testAudio.calls = [];
testAudio.playSoundForMove('e8=Q');
assert.deepStrictEqual(testAudio.calls, ['promote']);

console.log('✅ Move classification (move, capture, check, castle, promote) verified');

// 4. Safe fallback in Node environment without Web Audio
soundEffects.playMove();
soundEffects.playCapture();
soundEffects.playCastle();
soundEffects.playCheck();
soundEffects.playPromote();
soundEffects.playSoundForMove('Nf3');
console.log('✅ Non-browser / headless environment safety verified');

console.log('🎉 All SoundEffects tests passed successfully!');
