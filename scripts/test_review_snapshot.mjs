import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { decodeReviewSnapshot, encodeReviewSnapshot, makeReviewSnapshot, publicGameLink, restoreReviewSnapshot, reviewStoryRows } from '../analysis/review-snapshot.js';

const pgn = '[FEN "7k/5K2/6Q1/8/8/8/8/8 w - - 0 1"]\n[Result "1-0"]\n1. Qg7# 1-0';
const positions = GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn(pgn));
const final = positions[1];
const report = {
  totalMoves: 1, engineKey: 'sf19lite', modelKey: 'maia3-5m', reviewMode: 'deep', reviewPolicyVersion: 2,
  elo: 1900, accuracyWhite: 100, accuracyBlack: null, depthMin: 12, depthMax: 12, scoreVerifications: [{ depth: 18 }],
  allMoves: [{ ply: 1, uci: final.uci, bestUci: final.uci, turn: final.turn, fenBefore: positions[0].fen, fenAfter: final.fen,
    severity: 'good', accuracy: 100, lossCp: 0, evalBefore: 'M+1', evalBeforeCp: 9900, evalBeforeIsMate: true,
    evalAfter: 'M0', evalAfterCp: -10000, evalAfterIsMate: true, maiaTopUci: 'g6h6', maiaTopProb: 31.27,
    humanProbability: 23.2, divergenceType: 'beyond_intuition', divergenceStatus: 'confirmed', maiaLossCp: 185 }]
};
const game = { result: '1-0', white: '棋手甲', black: '棋手乙', opening: 'Queen ending', source: 'https://lichess.org/AbCd1234?private=unshared',
  comment: 'secret notes', userId: 'private-account', pgn: '[Private "secret"]' };
const snapshot = makeReviewSnapshot({ report, game });
const token = await encodeReviewSnapshot(snapshot);
const restored = await decodeReviewSnapshot(token);
assert.deepEqual(restored.accuracy, [100, null]);
assert.equal(restored.initial.text, '+M1');
assert.equal(restored.plies[0].score.text, '+M0');
assert.equal(restored.plies[0].score.cp, 10000);
assert.equal(restored.plies[0].maiaProb, 31.27);
assert.equal(restored.plies[0].playedLoss, 0);
assert.equal(restored.plies[0].maiaLoss, 185);
assert.equal(restored.plies[0].best[0].san, 'Qg7#');
assert.equal(restored.white, '棋手甲');
assert.equal(restored.source, 'https://lichess.org/AbCd1234');
assert.equal(restored.verifiedDepth, 18);
assert.equal(restored.story, null, 'Older snapshots remain readable');
const verifiedMove = { ...report.allMoves[0], reviewStoryBestUci: final.uci, humanProbability: 2.8,
  narrowChoice: { narrow: true, found: true } };
const storytelling = makeReviewSnapshot({ report: { ...report, allMoves: [verifiedMove] }, game, splits: [null, null, null] });
const story = await decodeReviewSnapshot(await encodeReviewSnapshot(storytelling));
assert.equal(story.story.rare.playedProb, 2.8);
assert.deepEqual(story.story.coverage, { checked: 1, narrow: 1, found: 1 });
assert.deepEqual(reviewStoryRows(story, 'zh').map(row => row.title), ['最冷门的引擎首选', '走钢丝的局面', '各段位从哪一步分岔']);
const malformedStory = restoreReviewSnapshot({ ...storytelling, s: [3, 1, 5, 2, [1, null, null]] });
assert.deepEqual(malformedStory.story, { rare: null, coverage: null, splits: null });
assert.doesNotMatch(JSON.stringify(snapshot), /private|secret|comment|userId/);
const anonymous = await decodeReviewSnapshot(await encodeReviewSnapshot(makeReviewSnapshot({ report, game, anonymize: true })));
assert.equal(anonymous.white, '');
assert.equal(anonymous.black, '');
assert.equal(anonymous.source, null);
assert.equal(publicGameLink('https://lichess.org.evil.example/abcdefgh'), null);
assert.equal(publicGameLink('https://lichess.org/analysis'), null);
assert.throws(() => makeReviewSnapshot({ report, game: { ...game, result: '*' } }));
assert.throws(() => makeReviewSnapshot({ report: { ...report, isPartial: true }, game }));
await assert.rejects(decodeReviewSnapshot('random'));
await assert.rejects(decodeReviewSnapshot(await encodeReviewSnapshot({ ...snapshot, v: 2 })));
const illegal = JSON.parse(JSON.stringify(snapshot));
illegal.m[0][0] = 'a1a8';
await assert.rejects(decodeReviewSnapshot(await encodeReviewSnapshot(illegal)), /Illegal move/);
await assert.rejects(decodeReviewSnapshot(deflateSync(' '.repeat(130 * 1024)).toString('base64url')), /too large/);
console.log('PASS share snapshot: legal replay, explicit compact fields, exact scores, distinct losses, anonymity, malformed and oversized inputs.');
