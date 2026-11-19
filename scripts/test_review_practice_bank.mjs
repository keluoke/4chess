// Real offline Stockfish WASM grading verification for Mistake Bank practice mode.
// Disables global fetch to guarantee 100% offline execution with bundled Stockfish 19 Lite WASM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { ChessBoard } from '../engine/chess-core.js';
import { StockfishInBrowser } from '../engine/stockfish-inbrowser.js';
import { ReviewPractice } from '../analysis/review-practice.js';
import { StudyStore, buildTrapRecord, DEFAULT_PROFILE_ID } from '../analysis/study-store.js';
import { MistakeBank } from '../analysis/mistake-bank.js';

const repo = fileURLToPath(new URL('../', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diverge-offline-practice-'));
fs.copyFileSync(path.join(repo, 'lib/stockfish-19.js'), path.join(tmp, 'stockfish.cjs'));
const require = createRequire(import.meta.url);
const factory = require(path.join(tmp, 'stockfish.cjs'));

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  throw new Error(`Offline grading test must not access network: ${url}`);
};

class RealStockfishAdapter {
  constructor() {
    this.queued = [];
    this.boot = factory()({
      locateFile: () => path.join(repo, 'lib/stockfish.wasm'),
      listener: line => this.onmessage?.({ data: line })
    }).then(engine => {
      this.engine = engine;
      for (const cmd of this.queued) this.postMessage(cmd);
      this.queued = [];
    });
  }
  postMessage(cmd) {
    if (!this.engine) { this.queued.push(cmd); return; }
    this.engine.ccall('command', null, ['string'], [cmd], { async: true });
  }
  terminate() {}
}
globalThis.Worker = RealStockfishAdapter;

const dom = new JSDOM(`
  <div id="empty-study-intro"></div>
  <div id="board-container"></div>
  <div id="board-status-text"></div>
  <p id="practice-context"></p>
  <section id="practice-panel" hidden></section>
  <button id="btn-mistake-bank"><span id="mistake-bank-due-badge" hidden>0</span></button>
  <dialog id="mistake-bank-dialog">
    <button id="btn-close-mistake-bank"></button>
    <select id="bank-profile-select"></select>
    <button id="btn-bank-new-profile"></button>
    <button id="btn-bank-edit-profile"></button>
    <button id="btn-bank-delete-profile" hidden></button>
    <form id="bank-profile-form" hidden>
      <input id="bank-profile-name">
      <input id="bank-profile-aliases">
      <button id="btn-bank-profile-cancel"></button>
    </form>
    <button id="btn-bank-practice"></button>
    <button id="btn-bank-export"></button>
    <button id="btn-bank-import"></button>
    <input id="bank-import-file" hidden>
    <select id="bank-phase-filter"><option value="all">All</option></select>
    <p id="bank-status-note"></p>
    <div id="bank-trap-list"></div>
  </dialog>
`, { url: 'https://4chess.cc/analysis/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const dialogEl = document.getElementById('mistake-bank-dialog');
dialogEl.open = false;
dialogEl.showModal = () => { dialogEl.open = true; };
dialogEl.close = () => { dialogEl.open = false; };

const sf = new StockfishInBrowser();
const ready = new Promise(resolve => { sf._readyResolve = resolve; });
sf.initDirectWorker('real-bundled-engine-offline');
await ready;

try {
  // Position where White has an immediate winning capture/checkmate tactic: 1. Re8# (e1e8)
  const fenBefore = '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1';
  const now = 1763500000000;
  const store = new StudyStore({ useIndexedDb: false });
  await store.init();
  const trap = buildTrapRecord({
    ply: 41,
    moveNumber: 21,
    turn: 'w',
    fenBefore,
    uci: 'g1f1',
    san: 'Kf1',
    divergenceType: 'intuition_trap',
    divergenceStatus: 'confirmed',
    verifiedBestUci: 'e1e8',
    verifiedBestSan: 'Re8#',
    verifiedPlayedPv: ['g1f1', 'g7g6'],
    verifiedBestPv: ['e1e8'],
    verifiedExpectedScoreLoss: 50,
    verifiedLossCp: 900,
    humanRawProbability: 0.25
  }, { elo: 1500 }, { profileId: DEFAULT_PROFILE_ID, now });
  await store.upsertTrap(trap);

  // Simulate offline reload: restore state into a fresh StudyStore with zero loaded game positions
  const reloadedStore = new StudyStore({ useIndexedDb: false });
  await reloadedStore.importBackup(await store.exportBackup(now), now);
  const dueQueue = await reloadedStore.listTraps(DEFAULT_PROFILE_ID, { filter: 'due', now });
  assert.equal(dueQueue.length, 1);

  let boardFen = '';
  let boardOrientation = '';
  const app = {
    gameEpoch: 1,
    positions: [], // No loaded PGN game at all
    scanSourceLocked: false,
    stockfish: sf,
    el: {
      boardContainer: document.getElementById('board-container'),
      boardStatusText: document.getElementById('board-status-text')
    },
    boardUI: {
      setOrientation(o) { boardOrientation = o; },
      setPosition(fen) { boardFen = fen; },
      clearArrows() {}
    },
    positionAnalysis: { cancel() {}, clearOverlays() {} }
  };

  const practice = new ReviewPractice(app);
  const recorded = [];
  practice.start(dueQueue[0], {
    queue: dueQueue,
    mode: 'bank',
    onItemResult: async (item, status) => {
      recorded.push(status);
      await reloadedStore.recordPracticeResult(item.id, status, now + 5000);
    }
  });

  assert.equal(boardFen, fenBefore);
  assert.equal(boardOrientation, 'white');

  // 1. Wrong move first -> real Stockfish grades as retryAgain
  const wrongBoard = new ChessBoard(fenBefore);
  const wrongMove = wrongBoard.getLegalMoves().find(m => m.uci === 'g1f1');
  wrongBoard.makeMove(wrongMove);
  await practice.submit(wrongMove, wrongBoard.getFen());
  assert.equal(practice.verdict, 'retryAgain', 'Real offline Stockfish rejects the blunder Kf1');

  // 2. Retry and play winning mate Re8# -> real Stockfish grades as retryGood & advances SRS
  practice.retry();
  const winBoard = new ChessBoard(fenBefore);
  const winMove = winBoard.getLegalMoves().find(m => m.uci === 'e1e8');
  winBoard.makeMove(winMove);
  await practice.submit(winMove, winBoard.getFen());
  assert.equal(practice.verdict, 'retryGood', 'Real offline Stockfish grades Re8# as Good move');
  assert.equal(recorded.at(-1), 'independent');

  const updated = (await reloadedStore.listTraps(DEFAULT_PROFILE_ID, { filter: 'all', now: now + 6000 }))[0];
  assert.equal(updated.srs.stage, 1, 'SRS stage advances after real offline Stockfish grading');
  assert.equal(updated.srs.streak, 1);
  assert(updated.srs.nextReviewAt > now + 6000);

  practice.stop();

  // 3. Verify origin restoration on exiting cross-game bank practice (black orientation & prior ply preserved)
  let restoredOrigin = null;
  let reopenedBank = false;
  app.capturePracticeOrigin = () => ({ epoch: 1, ply: 3, before: false, orientation: 'black', emptyStudy: false });
  app.restorePracticeOrigin = (origin) => { restoredOrigin = origin; boardOrientation = origin.orientation; };
  app.mistakeBank = { open() { reopenedBank = true; } };
  practice.start(dueQueue[0], { queue: dueQueue, mode: 'bank' });
  assert.equal(boardOrientation, 'white', 'Bank puzzle switches orientation to side to move');
  practice.returnToWorkbench();
  assert.equal(restoredOrigin?.ply, 3, 'Exiting bank practice restores prior game ply');
  assert.equal(boardOrientation, 'black', 'Exiting bank practice restores prior board orientation');
  assert.equal(reopenedBank, true);

  // 4. Verify MistakeBank: (a) clicking 6th card Retry opens the 6th trap, and (b) scan lock mid-open prevents dialog opening
  const { setScanAvailability, showScanLock } = await import('../analysis/scan-authorization.js');
  const sixStore = new StudyStore({ useIndexedDb: false });
  await sixStore.init();
  const sixTraps = [];
  for (let i = 0; i < 6; i++) {
    const tRec = buildTrapRecord({
      ply: 10 + i, moveNumber: 5 + i, turn: 'w',
      fenBefore: `6k1/5ppp/8/8/8/8/5PPP/${i + 1}R4K1 w - - 0 1`.replace(/^\dR/, match => (i === 0 ? '4R' : `${i}R`)),
      uci: 'g1f1', san: `Kf1-${i}`,
      divergenceType: 'intuition_trap', divergenceStatus: 'confirmed',
      verifiedBestUci: 'e1e8', verifiedBestSan: `Re8#${i}`,
      verifiedPlayedPv: ['g1f1', 'g7g6'], verifiedBestPv: ['e1e8'],
      verifiedExpectedScoreLoss: 20 + i, verifiedLossCp: 300 + i
    }, { elo: 1500 }, { profileId: DEFAULT_PROFILE_ID, now: now + i * 100 });
    // Distinct valid FEN per trap via halfmove clock
    tRec.fenBefore = `6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - ${i} 1`;
    tRec.id = `${DEFAULT_PROFILE_ID}|${tRec.fenBefore}|g1f1`;
    await sixStore.upsertTrap(tRec);
    sixTraps.push(tRec);
  }
  let startedPractice = null;
  const bankApp = {
    scanSourceLocked: false,
    isPlaying: false,
    gameEpoch: 1,
    mistakeBank: null,
    consequencePlayer: { stop() {}, canPlay() { return false; } },
    reviewCommentary: { suspend() {} },
    reviewOverview: { show() {}, view: 'workbench' },
    boardUI: { cancelGesture() {}, closePromotion() {}, clearArrows() {}, clearAnnotations() {} },
    positionAnalysis: { cancel() {} },
    pauseWholeReview() {},
    intuitionReview: { state: 'idle', dispose() {}, render() {} },
    analyzer: { cancel() {} },
    practice: { stop() {} },
    stockfish: { reset() {}, stop() {} },
    maiaEngine: { dispose() {} },
    resetPositionPanel() {},
    startPractice(item, opts) { startedPractice = { item, opts }; }
  };
  const bank = new MistakeBank(bankApp, sixStore);
  bankApp.mistakeBank = bank;
  await bank.ready;
  await bank.renderDialog();
  const cards = [...document.querySelectorAll('#bank-trap-list .bank-trap-item')];
  assert.equal(cards.length, 6);
  const sixthId = cards[5].dataset.trapId;
  cards[5].querySelector('.btn-primary').click();
  assert.equal(startedPractice?.item?.id, sixthId, 'Clicking 6th card Retry must open the 6th trap, not #1');
  assert.deepEqual(startedPractice?.opts?.queue?.map(q => q.id), [sixthId]);

  // (b) Click open -> scan lock fires while IndexedDB read is pending -> read completes -> dialog stays closed
  const pendingReads = [];
  const originalListTraps = sixStore.listTraps.bind(sixStore);
  sixStore.listTraps = (...args) => new Promise(resolve => {
    pendingReads.push(() => resolve(originalListTraps(...args)));
  });
  const flushReads = async () => {
    while (pendingReads.length) pendingReads.shift()();
    await new Promise(resolve => setTimeout(resolve, 0));
    while (pendingReads.length) pendingReads.shift()();
  };
  dialogEl.open = false;
  const openPromise = bank.open();
  await new Promise(resolve => setTimeout(resolve, 10));
  setScanAvailability(bankApp, false);
  await flushReads();
  await openPromise;
  assert.equal(dialogEl.open, false, 'Temporary scan lock during async open() must keep mistake bank closed');

  bankApp.scanSourceLocked = false;
  const openPromise2 = bank.open();
  await new Promise(resolve => setTimeout(resolve, 10));
  showScanLock(bankApp);
  await flushReads();
  await openPromise2;
  assert.equal(dialogEl.open, false, 'Final scan revoke during async open() must keep mistake bank closed');
  sixStore.listTraps = originalListTraps;

  // 5. Post-answer unlock, free branch isolation, variation stepping, triggerMove highlight, sort:'loss' & stats
  const trigTrap = buildTrapRecord({
    ply: 41, moveNumber: 21, turn: 'w',
    fenBefore, uci: 'g1f1', san: 'Kf1',
    divergenceType: 'intuition_trap', divergenceStatus: 'confirmed',
    verifiedBestUci: 'e1e8', verifiedBestSan: 'Re8#',
    verifiedPlayedPv: ['g1f1', 'g7g6'], verifiedBestPv: ['e1e8'],
    verifiedExpectedScoreLoss: 50, verifiedLossCp: 900, humanRawProbability: 0.25
  }, { elo: 1500 }, { profileId: DEFAULT_PROFILE_ID, triggerMove: { from: 'g8', to: 'g7', san: 'Kg7' }, now });
  assert.deepEqual(trigTrap.triggerMove, { from: 'g8', to: 'g7', san: 'Kg7' });

  const lossSorted = await sixStore.listTraps(DEFAULT_PROFILE_ID, { filter: 'all', sort: 'loss', now: now + 1000 });
  assert(lossSorted[0].eslLoss >= lossSorted[1].eslLoss, 'sort: loss orders highest eslLoss first');
  const profileStats = await sixStore.getProfileStats(DEFAULT_PROFILE_ID, now + 1000);
  assert.equal(profileStats.total, 6);
  assert.equal(profileStats.dueTotal, 6);

  let lastHighlight = null;
  const stepApp = {
    gameEpoch: 1,
    positions: [],
    scanSourceLocked: false,
    stockfish: sf,
    el: {
      boardContainer: document.getElementById('board-container'),
      boardStatusText: document.getElementById('board-status-text')
    },
    boardUI: {
      setOrientation() {},
      setPosition(fen, lastMove) { boardFen = fen; lastHighlight = lastMove || null; },
      clearArrows() {}
    },
    positionAnalysis: { cancel() {}, clearOverlays() {} }
  };
  const stepPractice = new ReviewPractice(stepApp);
  const stepRecorded = [];
  stepPractice.start(trigTrap, {
    queue: [trigTrap],
    mode: 'bank',
    onItemResult: (_item, status) => stepRecorded.push(status)
  });
  assert.deepEqual(lastHighlight, { from: 'g8', to: 'g7' }, 'Trigger move highlighted on question open');

  const bWrong = new ChessBoard(fenBefore);
  const mWrong = bWrong.getLegalMoves().find(m => m.uci === 'g1f1');
  bWrong.makeMove(mWrong);
  await stepPractice.handleBoardMove(mWrong, bWrong.getFen());
  assert.equal(stepPractice.verdict, 'retryAgain');
  assert.equal(stepApp.el.boardContainer.inert, false, 'Board unlocks after grading for variation/branching');

  const countBeforeBranch = stepRecorded.length;
  const bBranch = new ChessBoard(bWrong.getFen());
  const mBranch = bBranch.getLegalMoves()[0];
  bBranch.makeMove(mBranch);
  await stepPractice.handleBoardMove(mBranch, bBranch.getFen());
  assert.equal(stepRecorded.length, countBeforeBranch, 'Free exploration branch must not re-grade or write SRS');
  assert.equal(stepPractice.verdict, 'retryAgain', 'Free exploration branch preserves original verdict');

  stepPractice.stepVariation(-1);
  assert.equal(stepPractice.branchMoves.length, 0, 'Stepping back from branch move 1 exits branch');

  stepPractice.retry();
  assert.deepEqual(lastHighlight, { from: 'g8', to: 'g7' }, 'Retry restores trigger move highlight');
  await stepPractice.handleBoardMove(mWrong, bWrong.getFen());
  await stepPractice.reveal();
  assert.equal(stepPractice.revealed, true);
  assert.equal(boardFen, fenBefore, 'Reveal after wrong move syncs board back to variation cursor 0 (fenBefore)');
  assert.equal(stepPractice.controls.retry.hidden, false, 'Retry button stays visible after reveal');
  // Simulate suspend & resume from temp dual-engine analysis at cursor 0
  stepPractice.suspendForTempAnalysis();
  boardFen = bWrong.getFen();
  stepPractice.resumeFromTempAnalysis();
  assert.equal(boardFen, fenBefore, 'Resuming at cursor 0 after reveal restores variationBaseFen, not stale wrong move');
  stepPractice.stepVariation(1);
  assert.equal(stepPractice.variationCursor, 1, 'ArrowRight / stepVariation(1) steps into engine best line');
  stepPractice.retry();
  const attemptsBeforeRetry = stepPractice.attempts;
  const bBest = new ChessBoard(fenBefore);
  const mBest = bBest.getLegalMoves().find(m => m.uci === 'e1e8');
  bBest.makeMove(mBest);
  await stepPractice.handleBoardMove(mBest, bBest.getFen());
  assert.equal(stepPractice.attempts, attemptsBeforeRetry + 1, 'Move after retry() following reveal must trigger formal grading');
  assert.equal(stepPractice.verdict, 'retryGood', 'Formal grading after reveal+retry evaluates Re8# as retryGood');
  assert.equal(stepRecorded.at(-1), 'revealed', 'Playing best move after reveal keeps revealed status');

  stepPractice.stop();

  // 6. Legacy bank trap without triggerMove must not borrow unrelated game's positions; sort:'due' in 'all' filter
  const legacyTrap = { ...trigTrap, triggerMove: null, ply: 2 };
  stepApp.positions = [{ fen: 'start' }, { fen: 'after_e4', from: 'e2', to: 'e4', san: 'e4' }, { fen: 'after_e5', from: 'e7', to: 'e5', san: 'e5' }];
  lastHighlight = 'unchanged';
  stepPractice.start(legacyTrap, { queue: [legacyTrap], mode: 'bank' });
  assert.equal(lastHighlight, null, 'Legacy bank trap without triggerMove must not borrow unrelated game move');
  stepPractice.stop();

  const dueSortStore = new StudyStore({ useIndexedDb: false });
  await dueSortStore.init();
  await dueSortStore.upsertTrap({ ...trigTrap, id: `${DEFAULT_PROFILE_ID}|${fenBefore}|g1f1`, createdAt: 100, srs: { ...trigTrap.srs, nextReviewAt: 100 } });
  await dueSortStore.upsertTrap({ ...trigTrap, id: `${DEFAULT_PROFILE_ID}|${fenBefore}|g1h1`, fenBefore: `6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 1 1`, playedUci: 'g1h1', createdAt: 999999, srs: { ...trigTrap.srs, nextReviewAt: 999999 } });
  const dueInAll = await dueSortStore.listTraps(DEFAULT_PROFILE_ID, { filter: 'all', sort: 'due', now: 500 });
  assert.equal(dueInAll[0].srs.nextReviewAt, 100, 'sort: due orders earliest nextReviewAt first even in all filter');

  console.log('PASS offline bank practice: real bundled Stockfish WASM graded wrong + winning moves offline, 6th card retry, mid-open scan lock, origin restore, post-answer branching, triggerMove, loss/due sort and SRS.');
} finally {
  sf.reset();
  globalThis.fetch = originalFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
}
