import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { ChessBoard } from '../engine/chess-core.js';
import { BoardDetector } from '../content/board-detector.js';

const pgn = fs.readFileSync(new URL('./fixtures/dorocha-clarkyan-20261102.pgn', import.meta.url), 'utf8');
const reference = JSON.parse(fs.readFileSync(new URL('./fixtures/dorocha-clarkyan-20261102.positions.json', import.meta.url)));
const moves = GameAnalyzer.parsePgn(pgn);
assert.equal(moves.length, 58);
// Chess.com annotations, black move numbers and URL encoding must preserve the same main line.
const annotated = '[Result "0-1"]\n' + moves.map((m, i) => `${m.moveNumber}${i % 2 ? '...' : '.'} ${m.san} {[%clk 0:03:01.9][%timestamp\n44]}`).join('\n') + '\n{[%c_effect\nh8;square;h8;type;Winner;animated;true,a1;square;a1;type;CheckmateWhite]}\n0-1';
const roundTrip = new URLSearchParams(new URLSearchParams({pgn: annotated}).toString()).get('pgn');
for (const input of [pgn, annotated, roundTrip]) {
  const chain = GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn(input));
  assert.equal(chain.isPartial, false);
  assert.deepEqual(chain.map(p => p.fen), reference.positions, 'Every halfmove matches independent python-chess reference');
  assert.equal(chain[17].uci, 'd2c3', '9.Bxc3 moves the bishop, not the b-pawn');
  assert.equal(chain.at(-1).san, 'Qxc1#');
  const board = new ChessBoard(); board.load(chain.at(-1).fen);
  assert.equal(board.turn, 'w'); assert.equal(board.isCheck(), true); assert.equal(board.getLegalMoves().length, 0);
}
for (const example of reference.collisions) {
  for (const notation of [example.san, example.san + '?!', example.uci]) {
    const chain = GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn(`[FEN "${example.fen}"]\n${notation}`));
    assert.equal(chain.isPartial, false);
    assert.equal(chain[1].uci, example.uci, notation);
    assert.equal(chain[1].fen, example.after, notation);
  }
}
assert.equal(GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn('1. nf3')).isPartial, true, 'Invalid piece casing must not be guessed');

// Exercise both website move-list reconstruction paths, not only PGN import.
for (const platform of ['chesscom', 'lichess']) {
  const dom = new JSDOM('<body></body>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const list = document.createElement('div');
  list.className = platform === 'chesscom' ? 'vertical-move-list' : 'analyse__moves';
  document.body.append(list);
  const detector = new BoardDetector(() => {}); detector.platform = platform;
  for (const [i, move] of moves.entries()) {
    list.querySelector('.selected,.active')?.classList.remove('selected', 'active');
    const el = document.createElement(platform === 'chesscom' ? 'div' : 'move');
    el.className = platform === 'chesscom' ? 'node selected' : 'active';
    el.textContent = move.san; list.append(el);
    assert.equal(detector.getReplayedPositionFromMoves()?.fen, reference.positions[i + 1], `${platform} ply ${i + 1}`);
  }
  dom.window.close();
}
console.log('PASS SAN case: 58-ply independent reference, both colours bishop/b-pawn collisions, annotations, URL round-trip, mate and both website replay paths');
