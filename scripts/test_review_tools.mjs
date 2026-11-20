import assert from 'node:assert/strict';
import { canPractice, coreTurningPoints, expectedScore, isKeyMoment, moveQuality, positiveIntuition, qualifiesTrap, retryVerdict, selectReviewMoves, selectReviewObservations } from '../engine/review-policy.js';
import { ReviewPractice } from '../analysis/review-practice.js';
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { ChessBoard } from '../engine/chess-core.js';
import { gameLinkInput, readPgnTags, withPgnTermination } from '../engine/chess-notation.js';
import { JSDOM } from 'jsdom';
function scored(ply, before, after, extra = {}) {
  const lossCp = Math.max(0, before - after);
  return { ply, turn: ply % 2 ? 'w' : 'b', severity: 'good', accuracy: 90, evalBeforeCp: before, evalAfterCp: -after, lossCp,
    expectedScoreLoss: (expectedScore(before) - expectedScore(after)) * 100, ...extra };
}
const conversion = scored(1, 800, 600), balanced = scored(2, 0, -90);
assert.equal(moveQuality(conversion), 'blunder');
assert.equal(isKeyMoment(conversion), false);
assert.equal(moveQuality(balanced), 'inaccuracy');
assert.equal(isKeyMoment(balanced), true, 'A Black move also uses the mover’s perspective');
assert.equal(isKeyMoment(scored(3, 9950, 800, { evalBeforeIsMate: true })), true, 'Missing a forced mate survives the expected-score clamp');
assert.equal(isKeyMoment(scored(3, -800, -9950, { evalAfterIsMate: true })), true, 'Allowing forced mate is a turning point');
assert.equal(isKeyMoment(scored(3, 60, 0, { accuracy: null, divergenceStatus: 'confirmed', divergenceType: 'intuition_trap' })), false);
const big = scored(6, 300, -300), medium = scored(5, 200, 0), small = scored(4, 0, -120);
const order = [conversion, balanced, scored(3, 0, 0, { divergenceType: 'precise_intuition', divergenceStatus: 'confirmed' }), small, medium, big];
assert.deepEqual(selectReviewMoves(order).map(move => move.ply), [2, 4, 5, 6]);
assert.deepEqual([...coreTurningPoints(order)], [6, 5, 4]);
assert.deepEqual(selectReviewMoves(order, 'all', 'precise').map(move => move.ply), [3]);
const narrow = [2, 4, 6, 10].map((ply, i) => scored(ply, 22, -10 - i, {
  san: 'Nf6', bestSan: 'd5', fenBefore: ChessBoard.INITIAL_FEN
}));
const evaluations = Array.from({ length: 11 }, () => ({ scoreCp: 10, pv: ['d7d5', 'c2c4'] }));
evaluations[9] = { ...evaluations[9], isBound: true };
assert.deepEqual(selectReviewMoves(narrow, 'b'), []);
const observations = selectReviewObservations(narrow, 'b', evaluations);
assert.deepEqual(observations.map(move => move.ply), [6, 2], 'Observations skip bounded scores and avoid adjacent suggestions');
assert(observations.every(move => !canPractice(move)));
assert.deepEqual(selectReviewObservations([...narrow, small, big], 'b', evaluations), []);
assert.deepEqual(selectReviewObservations(narrow, 'w', evaluations), []);

const start = ChessBoard.INITIAL_FEN;
const sharePgn = '[White "A \\"quoted\\" 100%20"]\n[Black "B"]\n[Result "1-0"]\n[ECO "A80"]\n[TimeControl "180+2"]\n'
  + '[FEN "' + start + '"]\n[SetUp "1"]\n[EndTime "12:34:56"]\n\n1. d4 f5 {[%clk 0:02:19]} 1-0';
const compactLink = gameLinkInput(sharePgn, { white: 'A', black: 'B', result: '1-0' });
assert.deepEqual([...compactLink.keys()], ['pgn']);
const compactPgn = compactLink.get('pgn');
assert.deepEqual(readPgnTags(compactPgn), { white: 'A "quoted" 100%20', black: 'B', result: '1-0', eco: 'A80', timecontrol: '180+2' });
assert.match(compactPgn, /\[%clk 0:02:19\]/);
assert.deepEqual(GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn(compactPgn)).map(pos => pos.fen),
  GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn(sharePgn)).map(pos => pos.fen));
for (const input of [sharePgn.replace(' w KQkq - 0 1', ' w KQkq - 3 4'), '[Variant "Chess960"]\n' + sharePgn]) {
  assert.equal(readPgnTags(gameLinkInput(input).get('pgn')).setup, '1');
  assert.ok(readPgnTags(gameLinkInput(input).get('pgn')).fen);
}
assert.equal(readPgnTags(withPgnTermination('[Termination "Normal"]\n\n1. d4 f5 1-0', 'resign')).termination, 'Resignation');
assert.equal(readPgnTags(withPgnTermination('[Termination "Black won by checkmate"]\n\n1. d4 f5 0-1', 'resign')).termination, 'Black won by checkmate');

const evidence = { lossCp: 0, maiaAdvantageCp: 90, maiaESL: 8.2, probability: .08, maiaProbability: .35, stableBest: true };
assert.equal(positiveIntuition(evidence), 'beyond_intuition');
assert.equal(positiveIntuition({ ...evidence, lossCp: 12, stableBest: false, maiaAdvantageCp: 29, maiaESL: 2.6, probability: .21 }), 'precise_intuition');
assert.equal(positiveIntuition({ ...evidence, maiaAdvantageCp: 54, maiaESL: 4.9 }), 'precise_intuition');
for (const change of [{ maiaAdvantageCp: 1, maiaESL: 1 }, { probability: .6 }, { lossCp: 45 }, { probability: NaN }]) {
  assert.equal(positiveIntuition({ ...evidence, ...change }), null);
}
assert.equal(qualifiesTrap({ lossCp: 69, scoreLoss: 8, probability: .23, rank: 1 }), false);
assert.equal(qualifiesTrap({ lossCp: 75, scoreLoss: 5, probability: .23, rank: 1 }), false);
assert.equal(qualifiesTrap({ lossCp: 80, scoreLoss: 7, probability: .12, rank: 2 }), true);
assert.equal(qualifiesTrap({ lossCp: 80, scoreLoss: 7, probability: .12, rank: 3 }), false);
assert.equal(qualifiesTrap({ lossCp: 80, scoreLoss: 7, probability: .03, knownOpeningTrap: true }), true);

const game = GameAnalyzer.parsePgn('1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Bc5 5. c3 dxc3 6. Bxf7+ 1-0');
const positions = GameAnalyzer.buildPositionChain(game);
const [before, played] = positions.slice(-2);
const alternatives = new ChessBoard(before.fen).getLegalMoves().filter(move => move.uci !== played.uci);
const [best, maia] = alternatives;
const alternateBoard = new ChessBoard(before.fen);
alternateBoard.makeMove(maia);
const maiaFen = alternateBoard.getFen();
async function verifyFixture(kind, rootDepth, isBound = false) {
  const calls = [];
  const sf = { isReady: true, engineKey: 'fixture', async evaluate(fen, depth, timeout, multipv, movetime) {
    calls.push({ fen, depth, timeout, multipv, movetime });
    if (multipv === 2) return { bestMove: kind === 'beyond' ? played : best, depth: rootDepth, scoreCp: 0, isBound };
    if (fen === maiaFen) return { depth, scoreCp: kind === 'beyond' ? 110 : 43 };
    if (fen === played.fen) return { depth, scoreCp: kind === 'trap' ? 100 : kind === 'precise' ? 12 : 0 };
    return { depth, scoreCp: 0, bestMove: fen === before.fen && kind === 'beyond' ? played : best };
  } };
  const predictions = kind === 'trap' ? [{ ...played, rawProb: .36 }] : [{ ...maia, rawProb: .55 }, { ...played, rawProb: .08 }];
  const engine = new GameAnalyzer(sf, { isReady: true, modelKey: 'fixture', async predict(fen) { return { moves: fen === before.fen ? predictions : [] }; } });
  const report = await engine.analyzeGame(game, { forceRefresh: true });
  return { report, move: report.allMoves.at(-1), calls: calls.filter(call => call.movetime) };
}
const primary = await verifyFixture('beyond', 15);
assert.equal(primary.move.divergenceType, 'beyond_intuition');
assert.deepEqual(primary.calls.map(call => [call.fen, call.depth, call.multipv]), [[before.fen, 15, 2], [maiaFen, 14, 1]]);
assert(primary.calls.every(call => call.movetime < call.timeout && call.timeout <= 6000));
const precision = await verifyFixture('precise', 14);
assert.equal(precision.move.divergenceType, 'precise_intuition');
assert.equal(precision.move.maiaAdvantageCp, 31, 'Compare the actual played move against Maia’s first choice');
assert.deepEqual(precision.calls.map(call => [call.fen, call.depth, call.multipv]), [[before.fen, 15, 2], [played.fen, 13, 1], [maiaFen, 13, 1]]);
assert.equal(precision.report.keyMoments.some(move => move.ply === played.ply), false);
const trap = await verifyFixture('trap', 15);
assert.equal(trap.move.divergenceType, 'intuition_trap');
assert.deepEqual(trap.calls.map(call => call.fen), [before.fen, played.fen], 'Trap verification needs no third move');
const tooShallow = await verifyFixture('precise', 13);
assert.equal(tooShallow.move.divergenceStatus, 'unconfirmed');
assert.equal(tooShallow.calls.length, 1, 'An incomplete root evaluation cannot justify targeted searches');
assert.equal((await verifyFixture('precise', 15, true)).move.divergenceStatus, 'unconfirmed', 'Score bounds do not certify a move');

const cachedCore = { ...trap.report, engineOnly: true, reviewPolicyVersion: undefined, allMoves: [conversion, balanced], keyMoments: [conversion] };
GameAnalyzer.memoryCache.set('maia3_review_policy_upgrade_fixture', cachedCore);
const updatedCore = await GameAnalyzer.getCachedReview('policy_upgrade_fixture');
assert.deepEqual(updatedCore.keyMoments, [balanced]);
assert.equal(updatedCore.positionEvaluations, cachedCore.positionEvaluations, 'Upgrade core reports without rescoring the game');
assert.equal(GameAnalyzer.isValidReviewCache({ ...cachedCore, engineOnly: false }), false);
assert.equal(retryVerdict({scoreCp:100,depth:14},{scoreCp:-80,depth:13}),'retryGood','Equivalent good choices are accepted');
assert.equal(retryVerdict({scoreCp:100,depth:14},{scoreCp:0,depth:13}),'retryAgain');
assert.equal(retryVerdict({scoreCp:100,depth:5},{scoreCp:-100,depth:13}),'retryUncertain');
assert.equal(retryVerdict({scoreCp:9900,depth:14},{scoreCp:-10000,terminal:true}),'retryGood','Delivering mate is accepted');
assert.equal(retryVerdict(null,{scoreCp:0,depth:13}),'retryUncertain');
const dom = new JSDOM('<div id="practice-panel"></div>',{url:'https://4chess.cc/analysis/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
let complete, searches=0, boardUpdates=0;
const app={stockfish:{evaluate:()=>{searches++;return new Promise(resolve=>complete=resolve);},stop(){}},boardUI:{setPosition(){boardUpdates++;}}};
const practice = new ReviewPractice(app);
practice.active=true;practice.item={fenBefore:'fixture'};practice.message=document.createElement('p');
const pending=practice.submit({uci:'e2e4'},'after');
practice.stop();
complete({scoreCp:30,depth:14});
await pending;
assert.equal(searches,1,'Cancelled retry must not launch child search');
assert.equal(boardUpdates,0,'Late retry result cannot replace the new board');
dom.window.close();
console.log('Review policies and retry cancellation regressions passed');
