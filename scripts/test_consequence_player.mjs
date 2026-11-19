import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ConsequencePlayer, buildReplaySteps } from '../analysis/consequence-player.js';

const dom = new JSDOM(`
  <div id="board-status-text"></div>
  <div id="consequence-bar" hidden>
    <span id="consequence-bar-text"></span>
    <button id="btn-consequence-best" hidden></button>
    <button id="btn-consequence-exit"></button>
  </div>
`, { url: 'https://4chess.cc/analysis/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const fenBefore = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2';
const validSteps = buildReplaySteps(fenBefore, ['e5d6', 'e8d7', 'e1d2'], 3);
assert.equal(validSteps.length, 3);
assert.equal(validSteps[0].san, 'exd6');
assert.equal(validSteps[1].san, 'Kd7');

const truncatedSteps = buildReplaySteps(fenBefore, ['e5d6', 'e8e1', 'e1d2'], 3);
assert.equal(truncatedSteps.length, 1, 'Illegal reply stops replay cleanly');

const positionsSet = [];
let restoredPly = null;
const app = {
  gameEpoch: 1,
  scanSourceLocked: false,
  isPlaying: false,
  positions: [{}, { fen: fenBefore }],
  el: { boardStatusText: document.getElementById('board-status-text') },
  boardUI: {
    setPosition(fen, lastMove) { positionsSet.push({ fen, lastMove }); },
    clearArrows() {}
  },
  positionAnalysis: { cancel() {}, clearOverlays() {} },
  goToPly(ply) { restoredPly = ply; }
};

const player = new ConsequencePlayer(app);
const move = {
  ply: 1,
  fenBefore,
  verifiedPlayedPv: ['e5d6', 'e8d7', 'e1d2'],
  verifiedBestPv: ['e1d2', 'e8e7']
};

assert.equal(player.canPlay(move), true);
assert.equal(player.canPlay({ fenBefore, verifiedPlayedPv: ['e5d6'] }), false);

assert.equal(player.play(move, { mode: 'played', stepMs: 25 }), true);
assert.equal(document.getElementById('consequence-bar').hidden, false);
await new Promise(resolve => setTimeout(resolve, 110));
assert.equal(positionsSet.length, 4, 'Initial fenBefore + 3 replay steps');

// Cancel mid-playback on epoch change
positionsSet.length = 0;
assert.equal(player.play(move, { mode: 'played', stepMs: 40 }), true);
app.gameEpoch++;
await new Promise(resolve => setTimeout(resolve, 150));
assert.equal(positionsSet.length, 1, 'Epoch bump prevents late timers from mutating board');

player.stop({ restore: true });
assert.equal(document.getElementById('consequence-bar').hidden, true);
assert.equal(restoredPly, null, 'Different epoch does not restore stale ply');

console.log('PASS consequence player: legal 3-ply replay, illegal move filtering and epoch cancellation.');
