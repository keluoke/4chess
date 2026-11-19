import assert from 'node:assert/strict';
import {
  CHECKUP_ELOS,
  checkupGameContext,
  detectBatchPlayer,
  fetchChesscomRecentGames,
  fetchLichessRecentGames,
  runIntuitionCheckup,
  selectCheckupHistory,
  splitMultiPgn,
  suggestCheckupPlayer
} from '../analysis/checkup-runner.js';
import { StudyStore } from '../analysis/study-store.js';

const pgn1 = `[Event "Match 1"]
[White "KidPlayer"]
[Black "OppA"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0`;

const pgn2 = `[Event "Match 2"]
[White "OppB"]
[Black "KidPlayer"]
[Result "0-1"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3 dxc4 0-1`;

const chunks = splitMultiPgn(`${pgn1}\n\n${pgn2}`);
assert.equal(chunks.length, 2);

const detected = detectBatchPlayer(chunks.map(pgn => ({ pgn })));
assert.equal(detected.suggestedName, 'KidPlayer', 'Most frequent player across batch is suggested');

const chesscomPgn = '[Site "Chess.com"]\n' + pgn1;
const chesscomContext = checkupGameContext(chesscomPgn, { orientation: 'black' });
assert.equal(chesscomContext.platform, 'chesscom');
assert.equal(suggestCheckupPlayer(chesscomContext), 'OppA');
assert.equal(suggestCheckupPlayer(chesscomContext, { aliases: ['kidplayer'] }), 'KidPlayer');
assert.equal(suggestCheckupPlayer(chesscomContext, { aliases: ['OPPa', 'kidplayer'] }), '');
const lichessContext = checkupGameContext('[Site "https://lichess.org/AbCd1234"]\n' + pgn2);
assert.equal(lichessContext.platform, 'lichess');
assert.equal(suggestCheckupPlayer(lichessContext), '', 'A platform URL alone supplies no player perspective');
assert.equal(checkupGameContext(chesscomPgn.replaceAll('1-0', '*')), null);
assert.equal(checkupGameContext('[Site "https://fakechess.com/AbCd1234"]\n' + pgn1), null);

const lichessNdjson = [
  JSON.stringify({ id: 'live1', variant: 'standard', status: 'started', pgn: '[Result "*"]\n1. e4 e5 *' }),
  JSON.stringify({ id: '960', variant: 'chess960', status: 'mate', pgn: pgn1 }),
  JSON.stringify({ id: 'ok1', variant: 'standard', status: 'mate', pgn: pgn1 })
].join('\n');

const lichessGames = await fetchLichessRecentGames('KidPlayer', {
  fetchImpl: async () => new Response(lichessNdjson, { status: 200 })
});
assert.equal(lichessGames.length, 1);
assert.equal(lichessGames[0].meta.white, 'KidPlayer');

const chesscomGames = await fetchChesscomRecentGames('KidPlayer', {
  fetchImpl: async (url) => {
    if (String(url).endsWith('/games/archives')) {
      return Response.json({ archives: ['https://example.invalid/archives/2026/11'] });
    }
    return Response.json({
      games: [
        { rules: 'chess960', pgn: pgn1 },
        { rules: 'chess', pgn: pgn2 }
      ]
    });
  }
});
assert.equal(chesscomGames.length, 1);
assert.equal(chesscomGames[0].meta.black, 'KidPlayer');

const mockStockfish = {
  async initialize() { return true; },
  async evaluate(fen, depth) {
    if (fen.startsWith('r1bqk2r/2ppbppp/p1n2n2/1p2p3/B3P3/5N2/PPPP1PPP/RNBQR1K1')) {
      return { bestMove: { uci: 'c2c3', san: 'c3' }, scoreCp: 140, depth, pv: ['c2c3', 'd7d6'] };
    }
    if (fen.startsWith('r1bqk2r/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1')) {
      return { bestMove: { uci: 'd7d6', san: 'd6' }, scoreCp: 40, depth, pv: ['d7d6', 'c2c3'] };
    }
    return { bestMove: { uci: 'c2c3', san: 'c3' }, scoreCp: 20, depth, pv: ['c2c3'] };
  }
};

const mockMaia = {
  async initialize() { return true; },
  async predict(fen, rating) {
    const prob = rating === 1900 ? 0.48 : 0.16;
    return {
      moves: [
        { uci: 'a4b3', san: 'Bb3', rawProb: prob, prob: prob * 100 },
        { uci: 'c2c3', san: 'c3', rawProb: prob, prob: prob * 100 },
        { uci: 'd3c4', san: 'Bxc4', rawProb: prob, prob: prob * 100 }
      ]
    };
  }
};

const report = await runIntuitionCheckup({
  games: [{ pgn: pgn1, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }, { pgn: pgn2, meta: { white: 'OppB', black: 'KidPlayer', result: '0-1' } }],
  targetPlayer: 'KidPlayer',
  profileId: 'kid',
  sourceLabel: 'lichess:KidPlayer',
  elo: 1900,
  stockfish: mockStockfish,
  maiaEngine: mockMaia,
  now: 1763500000000
});

assert.equal(report.gameCount, 2);
assert(report.analyzedMoves >= 2);
assert.equal(report.closestElo, 1900);
assert.equal(Object.keys(report.eloFit).length, CHECKUP_ELOS.length);
assert.equal(report.topTraps.length, 1);
assert.equal(report.topTraps[0].playedSan, 'Bb3');
assert.equal(report.topTraps[0].turn, 'w', 'Only targetPlayer moves are collected');

const progress = [];
const lowProbabilityReport = await runIntuitionCheckup({
  games: [{ pgn: pgn1 }],
  targetPlayer: 'KidPlayer',
  stockfish: {
    async initialize() { return true; },
    async evaluate() { assert.fail('No Stockfish search is needed for moves below the trap probability threshold'); }
  },
  maiaEngine: {
    async initialize() { return true; },
    async predict() {
      return { moves: [{ uci: 'a4b3', rawProb: 0.08 }, { uci: 'c2c3', rawProb: 0.08 }] };
    }
  },
  onProgress: entry => progress.push(entry)
});
assert.equal(lowProbabilityReport.gameCount, 1);
assert.equal(lowProbabilityReport.analyzedMoves, 2);
assert.equal(lowProbabilityReport.eloFit[1900], 0.08);
assert.deepEqual(progress.slice(0, 3).map(entry => entry.phase), ['stockfish', 'maia', 'analyzing']);
assert(progress.some(entry => entry.analyzedMoves === 1 && entry.workDone > 0 && entry.workDone < 1), 'Move progress arrives before the first game finishes');
assert.equal(progress.at(-1).workDone, 1);

const abort = new AbortController();
let releaseStockfish;
const abortedStartup = runIntuitionCheckup({
  games: [{ pgn: pgn1 }],
  targetPlayer: 'KidPlayer',
  signal: abort.signal,
  stockfish: { initialize: () => new Promise(resolve => { releaseStockfish = resolve; }) },
  maiaEngine: { initialize() { assert.fail('Cancelling startup must not start Maia'); } }
});
abort.abort();
assert.equal((await abortedStartup).partial, true, 'Cancellation returns even while startup is still pending');
releaseStockfish(true);

// 1. P0 regression: cancellation between stockfish.initialize() and maiaEngine.initialize() must NOT start Maia
let maiaInitCalls = 0;
let cancelledMidInit = false;
const lockReport = await runIntuitionCheckup({
  games: [{ pgn: pgn1, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }],
  targetPlayer: 'KidPlayer',
  isCancelled: () => cancelledMidInit,
  stockfish: {
    async initialize() { cancelledMidInit = true; return true; },
    async evaluate() { throw new Error('Should not evaluate after cancel'); }
  },
  maiaEngine: {
    async initialize() { maiaInitCalls++; return true; },
    async predict() { throw new Error('Should not predict after cancel'); }
  }
});
assert.equal(maiaInitCalls, 0, 'Must not initialize Maia after scan lock / cancellation');
assert.equal(lockReport.gameCount, 0);
assert.equal(lockReport.partial, true);

// 2. P1 regression: 5th-arg history passed to maiaEngine.predict() has <=7 prior FENs and never repeats current fen
let sawFifthArgHistory = false;
let sawDuplicateCurrentFen = false;
await runIntuitionCheckup({
  games: [{ pgn: pgn1, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }],
  targetPlayer: 'KidPlayer',
  stockfish: mockStockfish,
  maiaEngine: {
    async initialize() { return true; },
    async predict(fen, rating, sfRes, abortCheck, history) {
      if (Array.isArray(history) && history.length === 7) {
        sawFifthArgHistory = true;
        if (history.includes(fen)) sawDuplicateCurrentFen = true;
      }
      return mockMaia.predict(fen, rating);
    }
  }
});
assert.equal(sawFifthArgHistory, true, 'Maia predict must receive 7 prior FENs as 5th argument');
assert.equal(sawDuplicateCurrentFen, false, 'History must not duplicate current fenBefore');

const shortPgn = '[White "KidPlayer"]\n[Black "OppA"]\n[Result "1-0"]\n\n1. e4 e5 1-0';
const shortReport = await runIntuitionCheckup({
  games: [{ pgn: shortPgn, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }],
  targetPlayer: 'KidPlayer',
  elo: 1900,
  stockfish: mockStockfish,
  maiaEngine: mockMaia
});
assert.equal(shortReport.analyzedMoves, 0);
assert.equal(shortReport.closestElo, null, 'Zero-decision game must not default closestElo to 1900');

// 3. P1 regression: low-depth / bound-only verification must NOT produce confirmed traps
const lowTrustReport = await runIntuitionCheckup({
  games: [{ pgn: pgn1, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }],
  targetPlayer: 'KidPlayer',
  stockfish: {
    async initialize() { return true; },
    async evaluate(fen, depth) {
      const res = await mockStockfish.evaluate(fen, depth);
      return depth >= 14 ? { ...res, depth: 2, isBound: true } : res;
    }
  },
  maiaEngine: mockMaia
});
assert.equal(lowTrustReport.topTraps.length, 0, 'Low-depth / bound verification must be rejected');

const emptyPvReport = await runIntuitionCheckup({
  games: [{ pgn: pgn1, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }],
  targetPlayer: 'KidPlayer',
  stockfish: {
    async initialize() { return true; },
    async evaluate(fen, depth) {
      const res = await mockStockfish.evaluate(fen, depth);
      return depth >= 14 ? { ...res, pv: [] } : res;
    }
  },
  maiaEngine: mockMaia
});
assert.equal(emptyPvReport.topTraps.length, 0, 'Empty pv verification must be rejected');

const emptyMaiaReport = await runIntuitionCheckup({
  games: [{ pgn: pgn1, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }],
  targetPlayer: 'KidPlayer',
  stockfish: mockStockfish,
  maiaEngine: {
    async initialize() { return true; },
    async predict() { return { moves: [] }; }
  }
});
assert(emptyMaiaReport.analyzedMoves >= 2);
assert.equal(emptyMaiaReport.closestElo, null, 'Empty Maia predictions across all Elos must yield closestElo: null');

// 4. P1 regression: mid-game cancellation must NOT count unfinished game 1
let evalCount = 0;
const midCancelReport = await runIntuitionCheckup({
  games: [{ pgn: pgn1, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }],
  targetPlayer: 'KidPlayer',
  isCancelled: () => evalCount >= 1,
  stockfish: {
    async initialize() { return true; },
    async evaluate(fen, depth) { evalCount++; return mockStockfish.evaluate(fen, depth); }
  },
  maiaEngine: mockMaia
});
assert.equal(midCancelReport.gameCount, 0, 'Unfinished game 1 must not be counted on cancellation');
assert.equal(midCancelReport.analyzedMoves, 0);
assert.equal(midCancelReport.partial, true);

// 5. StudyStore persistence & 20-report cap on importBackup merge
const store = new StudyStore({ useIndexedDb: false });
await store.saveCheckup(report);
const savedCheckups = await store.listCheckups('kid');
assert.equal(savedCheckups.length, 1);
assert.equal(savedCheckups[0].closestElo, 1900);

for (let i = 1; i <= 20; i++) {
  await store.saveCheckup({
    id: `cap_${i}`,
    profileId: 'kid',
    playerName: 'KidPlayer',
    gameCount: 1,
    analyzedMoves: 2,
    createdAt: 1763500000000 + i
  });
}
assert.equal((await store.listCheckups('kid')).length, 20);
await store.importBackup({
  version: 1,
  profiles: [],
  traps: [],
  checkups: [{
    id: 'cap_21',
    profileId: 'kid',
    playerName: 'KidPlayer',
    gameCount: 1,
    analyzedMoves: 2,
    createdAt: 1763500000099
  }]
});
assert.equal((await store.listCheckups('kid')).length, 20, 'importBackup must enforce 20-checkup cap per profile');

// 6. Cloudflare Pages Function /api/lichess validation
const { onRequest: lichessProxy } = await import('../functions/api/lichess.js');
const postResp = await lichessProxy({ request: new Request('https://example.invalid/api/lichess', { method: 'POST' }) });
assert.equal(postResp.status, 405);
const badUserResp = await lichessProxy({ request: new Request('https://example.invalid/api/lichess?username=bad/user') });
assert.equal(badUserResp.status, 400);

// 7. Fast-fail when no games match targetPlayer (must NOT start engines)
const noMatchReport = await runIntuitionCheckup({
  games: [{ pgn: pgn1, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }],
  targetPlayer: 'NonExistentPlayer',
  stockfish: { initialize() { assert.fail('Must not initialize Stockfish when zero games match targetPlayer'); } },
  maiaEngine: { initialize() { assert.fail('Must not initialize Maia when zero games match targetPlayer'); } }
});
assert.equal(noMatchReport.gameCount, 0);
assert.equal(noMatchReport.partial, false);

// 8. Cross-entry history isolation & StudyStore.deleteCheckup()
const historySample = [
  { id: 'c_chesscom', sourceLabel: 'chesscom:hikaru', playerName: 'Hikaru', createdAt: 200 },
  { id: 'c_lichess', sourceLabel: 'lichess:kidplayer', playerName: 'KidPlayer', createdAt: 100 }
];
const mismatchCtx = selectCheckupHistory(historySample, {
  source: 'lichess',
  gameContext: { platform: 'lichess', white: 'KidPlayer', black: 'OppA' },
  suggestedPlayer: 'KidPlayer'
});
assert.equal(mismatchCtx.primary.id, 'c_lichess', 'Game context selects matching platform + player');

const otherPlayerCtx = selectCheckupHistory(historySample, {
  source: 'chesscom',
  gameContext: { platform: 'chesscom', white: 'Magnus', black: 'Fabiano' },
  suggestedPlayer: 'Magnus'
});
assert.equal(otherPlayerCtx.primary, null, 'Different player must not auto-display stale report');
assert.equal(otherPlayerCtx.fallbackReport.id, 'c_chesscom', 'Fallback exposes latest report for optional reveal');

const blankLocalTab = selectCheckupHistory(historySample, { source: 'local' });
assert.equal(blankLocalTab.primary, null, 'Switching to local tab must not show online report');

const tabSwitchFromGame = selectCheckupHistory(historySample, {
  source: 'lichess',
  gameContext: { platform: 'chesscom', white: 'Hikaru', black: 'OppA' },
  suggestedPlayer: 'Hikaru'
});
assert.equal(tabSwitchFromGame.primary, null, 'Switching tab from game context must filter by active source tab');

const clearedPlayerFromGame = selectCheckupHistory(historySample, {
  source: 'chesscom',
  gameContext: { platform: 'chesscom', white: 'Hikaru', black: 'OppA' },
  suggestedPlayer: ''
});
assert.equal(clearedPlayerFromGame.primary, null, 'Empty player input from game context must keep history collapsed');

// 9. Bad PGN pre-validation (no engine startup on all-bad/partial PGNs; accurate denominator on mixed batch)
const badPgn = '[White "KidPlayer"]\n[Black "OppA"]\n[Result "1-0"]\n\n1. Kxe8# 1-0';
const partialBadPgn = '[White "KidPlayer"]\n[Black "OppA"]\n[Result "1-0"]\n\n1. e4 e5 2. Kxe8# 1-0';
const allBadReport = await runIntuitionCheckup({
  games: [
    { pgn: badPgn, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } },
    { pgn: partialBadPgn, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }
  ],
  targetPlayer: 'KidPlayer',
  stockfish: { initialize() { assert.fail('Must not initialize Stockfish when matching PGNs cannot replay'); } },
  maiaEngine: { initialize() { assert.fail('Must not initialize Maia when matching PGNs cannot replay'); } }
});
assert.equal(allBadReport.gameCount, 0);

const mixedProgress = [];
const mixedReport = await runIntuitionCheckup({
  games: [
    { pgn: partialBadPgn, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } },
    { pgn: pgn1, meta: { white: 'KidPlayer', black: 'OppA', result: '1-0' } }
  ],
  targetPlayer: 'KidPlayer',
  elo: 1500,
  stockfish: mockStockfish,
  maiaEngine: mockMaia,
  onProgress: entry => mixedProgress.push(entry)
});
assert.equal(mixedReport.gameCount, 1);
assert.equal(mixedReport.screenElo, 1500);
const analyzingEvents = mixedProgress.filter(entry => entry.phase === 'analyzing');
assert.equal(analyzingEvents[0].gameIndex, 1);
assert.equal(analyzingEvents[0].totalGames, 1, 'Progress denominator must reflect complete replayable matched games only');

await store.deleteCheckup('cap_21');
assert.equal((await store.listCheckups('kid')).some(item => item.id === 'cap_21'), false, 'deleteCheckup removes report');

console.log('PASS checkup runner: multi-PGN split, platform filtering, single-player perspective isolation, Elo fit, lock/cancel safety, verification gates, cap, proxy, fast-fail and history isolation.');
