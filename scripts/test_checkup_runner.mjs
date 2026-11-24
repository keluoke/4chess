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
import { GameAnalyzer } from '../engine/game-analyzer.js';
import { challengeChoices, checkupChallengeUrl, decodeChallenge } from '../analysis/challenge-link.js';
import { ChessBoard } from '../engine/chess-core.js';
import { overviewSummary, clockErrorTone } from '../analysis/checkup-overview.js';
import { checkupCardData, checkupChallengeCard, overviewCardData, summarizeCheckupCard } from '../analysis/checkup-share.js';
import { checkupFitBands, summarizeCheckupFit } from '../analysis/checkup-fit.js';
import { checkupFitBandLabel, checkupScoreSummary, pgnRatingGroups, withCheckupFit } from '../analysis/checkup-fit-view.js';
import {
  buildCheckupFitWindow, buildCheckupWindow, checkupClockSample, checkupFitForSpeed, checkupReportStability,
  checkupTrend, prepareCheckupOverview, rankCheckupOpenings, summarizeCheckupOverview
} from '../analysis/checkup-insights.js';

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
const boundBatch = detectBatchPlayer(chunks.map(pgn => ({ pgn })), {
  accounts: [{ platform: 'lichess', username: 'oppa' }]
});
assert.equal(boundBatch.suggestedName, 'OppA', 'A bound account takes precedence over the most frequent player in a local PGN batch');
assert.equal(boundBatch.matchedAlias, 'OppA');

const chesscomPgn = '[Site "Chess.com"]\n' + pgn1;
const chesscomContext = checkupGameContext(chesscomPgn, { orientation: 'black' });
assert.equal(chesscomContext.platform, 'chesscom');
assert.equal(suggestCheckupPlayer(chesscomContext), 'OppA');
assert.equal(suggestCheckupPlayer(chesscomContext, { aliases: ['kidplayer'] }), 'KidPlayer');
assert.equal(suggestCheckupPlayer(chesscomContext, { aliases: ['OPPa', 'kidplayer'] }), '');
const lichessContext = checkupGameContext('[Site "https://lichess.org/AbCd1234"]\n' + pgn2);
assert.equal(lichessContext.platform, 'lichess');
assert.equal(lichessContext.gameId, 'AbCd1234');
assert.equal(checkupGameContext(chesscomPgn, { publicGameUrl: 'https://www.chess.com/game/live/12345678' }).gameId, 'live:12345678');
assert.equal(checkupGameContext('[Link "https://www.chess.com/game/daily/12345678"]\n' + chesscomPgn).gameId, 'daily:12345678');
assert.equal(suggestCheckupPlayer(lichessContext), '', 'A platform URL alone supplies no player perspective');
assert.equal(suggestCheckupPlayer(lichessContext, {
  aliases: ['KidPlayer'],
  accounts: [{ platform: 'chesscom', username: 'OppB' }]
}), 'KidPlayer', 'An unbound platform still recognizes its legacy alias');
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

const openingUrls = [
  ['https://www.chess.com/openings/Slav-Defense-3.e3-Nf6', 'Slav Defense'],
  ['https://chess.com/openings/R%C3%A9ti-Opening-1...d5-2.g3/?ref=archive#moves', 'Réti Opening'],
  ['https://www.chess.com/openings/Dutch-Defense', 'Dutch Defense'],
  ['https://chess.com.example.org/openings/Slav-Defense-3.e3-Nf6', ''],
  ['https://www.chess.com/openings/%E0%A4%A', ''],
  ['https://www.chess.com/openings/Slav-Defense-3.e3-Nf6', 'Slav Defense, Alapin Variation', 'Slav Defense, Alapin Variation'],
  ['', '']
];
const namedArchives = await fetchChesscomRecentGames('KidPlayer', {
  fetchImpl: async url => String(url).endsWith('/games/archives') ? Response.json({ archives: [] })
    : Response.json({ games: openingUrls.map(([link, , opening], index) => ({
      rules: 'chess',
      url: `https://www.chess.com/game/live/${index + 1}`,
      pgn: `[ECO "D11"]\n[ECOUrl "${link}"]\n[Opening "${opening || '?'}"]\n${pgn2}`
    })).reverse() })
});
assert.deepEqual(namedArchives.map(game => game.meta.opening), openingUrls.map(([, title]) => title));
assert(namedArchives.every(game => game.meta.eco === 'D11'));

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
const challengeUrl = new URL(checkupChallengeUrl(report.topTraps[0], 'en'));
const challengeToken = new URLSearchParams(challengeUrl.hash.slice(1)).get('p');
const challenge = decodeChallenge(challengeToken);
assert.equal(challengeUrl.pathname, '/analysis/challenge.html');
assert.deepEqual([challenge.playedSan, challenge.bestSan, challenge.elo, challenge.probability], ['Bb3', 'c3', 1900, 48]);
const choices = challengeChoices(challenge);
assert.deepEqual(choices.map(choice => choice.uci).sort(), [challenge.best, challenge.played].sort());
assert.deepEqual(challengeChoices({ ...challenge, best: challenge.played, bestSan: challenge.playedSan,
  played: challenge.best, playedSan: challenge.bestSan }), choices, 'Display order is independent of which move is best');
const legal = new ChessBoard(challenge.fen).getLegalMoves().filter(move => move.uci !== challenge.played);
const playedFirst = legal.filter(move => challengeChoices({ ...challenge, best: move.uci })[0].uci === challenge.played).length;
assert(Math.abs(playedFirst / legal.length - 0.5) < 0.25, 'Both display orders occur across different move pairs');
assert(!JSON.stringify(challenge).includes('KidPlayer'), 'A challenge carries no chess account or original PGN');
assert.equal(checkupChallengeUrl({ ...report.topTraps[0], bestUci: 'a8a1' }, 'en'), null);
assert.equal(checkupChallengeUrl({ ...report.topTraps[0], divergenceStatus: 'unconfirmed' }, 'en'), null);
assert.equal(decodeChallenge('a'.repeat(321)), null);
const challengeCard = checkupChallengeCard(report.topTraps[0]);
assert.equal(challengeCard.position.bestSan, 'c3');
assert.match(challengeCard.url, /challenge.html#/);
assert(!summarizeCheckupCard(challengeCard, false).includes('KidPlayer'));
const card = checkupCardData({ report, challenge: challengeCard });
assert.equal(card.challenge, challengeCard);
assert(!card.position);
assert(!summarizeCheckupCard(card, true).includes('KidPlayer'));
assert.match(summarizeCheckupCard(card, false), /KidPlayer/);
assert.equal(summarizeCheckupCard(card, true).split('\n').length, 3);

const highlight = await runIntuitionCheckup({
  games: [{ pgn: pgn1 }], targetPlayer: 'KidPlayer', elo: 1900,
  maiaEngine: { async predict() {
    return { moves: [{ uci: 'c2c3', rawProb: 0.55 }, { uci: 'a4b3', rawProb: 0.14 }] };
  } },
  stockfish: { async evaluate(fen, depth) {
    const white = fen.split(' ')[1] === 'w';
    const uci = white ? 'a4b3' : 'd7d6';
    return { depth, scoreCp: white ? 250 : 100, bestMove: { uci }, pv: [uci] };
  } }
});
assert.equal(highlight.highlights.length, 1);
assert.equal(highlight.highlights[0].kind, 'beyond');
assert.equal(highlight.highlights[0].uci, 'a4b3');
assert.equal(highlight.highlights[0].evidence.probability, 0.14);
assert.equal(highlight.highlights[0].evidence.alternative, 'c3');
assert(highlight.highlights[0].evidence.advantage > 0);
assert.equal(GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn(highlight.games[0].pgn))
  [highlight.highlights[0].ply - 1].fen, highlight.highlights[0].fenBefore);

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
assert.deepEqual(progress.slice(0, 4).map(entry => entry.phase), ['stockfish', 'maia', 'fitting', 'analyzing']);
assert(progress.some(entry => entry.analyzedMoves === 1 && entry.workDone > 0 && entry.workDone < 1), 'Move progress arrives before the first game finishes');
assert.equal(progress.at(-1).workDone, 1);
assert.equal(progress.at(-1).completedGames, 1);
assert.equal(lowProbabilityReport.screenEloSource, 'fit');

const highRated = {
  games: [
    { pgn: '[WhiteElo "2160"]\n[BlackElo "1200"]\n' + pgn1 },
    { pgn: '[WhiteElo "1300"]\n[BlackElo "2200"]\n' + pgn2 }
  ],
  targetPlayer: 'KidPlayer',
  defaultElo: 1400,
  stockfish: mockStockfish,
  maiaEngine: mockMaia
};
const automatic = await runIntuitionCheckup(highRated);
assert.equal(automatic.screenElo, 2200, 'The median is taken from target player ratings on either side');
assert.equal(automatic.screenEloSource, 'pgn');
assert.equal(automatic.closestElo, 1900, 'PGN rating and behavioral fit are independent');
assert.equal(automatic.fit.weights.length, 4);
assert.deepEqual(pgnRatingGroups(automatic.games), [{ speed: '', elo: 2180, count: 2 }]);
assert.deepEqual(pgnRatingGroups([
  { ...automatic.games[0], timeClass: 'blitz', playedRating: undefined },
  { ...automatic.games[1], timeClass: 'rapid' }
]).map(group => group.speed), ['blitz', 'rapid']);
const detailed = await runIntuitionCheckup({ ...highRated, fitMethod: 'fine' });
assert.deepEqual(detailed.fit.bands, checkupFitBands('fine'));
assert.equal(detailed.screenElo, automatic.screenElo);
assert.notEqual(detailed.evidenceKey, automatic.evidenceKey);
assert.equal(detailed.fit.estimate, null, 'Two games cannot support a fine estimate');
assert(detailed.games.every(game => game.fitSamples.every(sample => sample.uci && sample.fenBefore && sample.scores.length === 6)));
assert.equal(buildCheckupWindow(detailed.analyzedGameIds, detailed.evidenceKey, [automatic, detailed]).fitMethod, 'fine');

const manual = await runIntuitionCheckup({ ...highRated, elo: 1500 });
assert.equal(manual.screenElo, 1500);
assert.equal(manual.screenEloSource, 'manual');

const fitted = await runIntuitionCheckup({
  ...highRated,
  games: [{ pgn: pgn1 }],
  maiaEngine: {
    async initialize() { return true; },
    async predict(fen, elo) {
      return { moves: [{ uci: 'a4b3', rawProb: elo === 2200 ? 0.48 : 0.08 }] };
    }
  }
});
assert.equal(fitted.screenElo, 2200);
assert.equal(fitted.screenEloSource, 'fit');
assert.equal(fitted.topTraps[0]?.elo, 2200, 'The fitted rating is used during trap screening');

const repetition = Array.from({ length: 20 }, (_, i) =>
  `${i + 1}. ${i % 2 ? 'Ng1 Ng8' : 'Nf3 Nf6'}`).join(' ');
const longPgn = '[White "KidPlayer"]\n[Black "Rival"]\n[WhiteElo "2200"]\n[Result "1/2-1/2"]\n\n' +
  repetition + ' {excluded private note} 1/2-1/2';
const archivedGames = Array.from({ length: 10 }, (_, i) => ({ pgn: longPgn, gameId: `live:${1000 + i}` }));
const sampleFens = new Set();
const complete = await runIntuitionCheckup({
  games: archivedGames, targetPlayer: 'KidPlayer', sourceLabel: 'chesscom:KidPlayer',
  maiaEngine: {
    async predict(fen, elo) {
      if (elo === 1100) sampleFens.add(fen);
      const uci = fen.startsWith('rnbqkb1r') ? 'f3g1' : 'g1f3';
      return { moves: [{ uci, rawProb: 0.6 }] };
    }
  },
  stockfish: {
    async evaluate(fen, depth) {
      const whiteTurn = fen.split(' ')[1] === 'w';
      const uci = whiteTurn ? 'e2e4' : 'e7e5';
      return { depth, scoreCp: whiteTurn ? 300 : 0, bestMove: { uci, san: whiteTurn ? 'e4' : 'e5' }, pv: [uci] };
    }
  }
});
assert.equal(complete.eloSampleCount, 24);
assert.equal(complete.fitGameCount, 10, 'Long first games cannot consume the whole fit budget');
assert.deepEqual(complete.games.map(game => game.eloSampleCount), [3, 3, 3, 3, 2, 2, 2, 2, 2, 2]);
assert([...sampleFens].some(fen => Number(fen.split(' ').at(-1)) >= 16), 'Fit samples reach late decisions in each game');
assert.equal(complete.games[0].url, 'https://www.chess.com/game/live/1000');
assert(!complete.games[0].pgn.includes('private note'), 'Replay stores the main line without imported annotations');
assert.equal(GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn(complete.games[0].pgn)).length, 41);
assert(complete.traps.length > 5);
assert.deepEqual(complete.topTraps, complete.traps.slice(0, 5));
assert(complete.traps.every(trap => trap.occurrences.length === 10 && trap.topics.includes('tempting')));
assert.equal(complete.games.reduce((sum, game) => sum + game.trapCount, 0),
  Object.values(complete.phaseTraps).reduce((sum, count) => sum + count, 0));
assert.equal(complete.traps[5].gameIndex, 0);
assert.equal(complete.traps[5].playedUci,
  GameAnalyzer.buildPositionChain(GameAnalyzer.parsePgn(complete.games[0].pgn))[complete.traps[5].ply].uci);

const rejectedReplay = await runIntuitionCheckup({
  games: [{ pgn: longPgn.replaceAll('1/2-1/2', '*') }], targetPlayer: 'KidPlayer',
  stockfish: { initialize() { assert.fail('An ongoing game must never start the engines'); } },
  maiaEngine: mockMaia
});
assert.equal(rejectedReplay.gameCount, 0);

const customFen = '4k1n1/8/8/8/8/8/8/R3K1N1 b - - 0 40';
const customMoves = Array.from({ length: 13 }, (_, i) =>
  `${41 + i}. ${i % 2 ? 'Ng1 Nf6' : 'Nf3 Ng8'}`).join(' ');
const customPgn = `[White "KidPlayer"]\n[Black "Rival"]\n[WhiteElo "2200"]\n[SetUp "1"]\n[FEN "${customFen}"]\n[Result "1/2-1/2"]\n\n40... Nf6 ${customMoves} 1/2-1/2`;
const endgame = await runIntuitionCheckup({
  games: [{ pgn: customPgn }], targetPlayer: 'KidPlayer',
  maiaEngine: { async predict() {
    return { moves: [{ uci: 'g1f3', rawProb: 0.55 }, { uci: 'f3g1', rawProb: 0.45 }] };
  } },
  stockfish: { async evaluate(fen, depth) {
    const white = fen.split(' ')[1] === 'w';
    const uci = white ? 'e1e2' : 'e8e7';
    return { depth, scoreCp: white ? 300 : 0, bestMove: { uci, san: white ? 'Ke2' : 'Ke7' }, pv: [uci] };
  } }
});
const customReplay = GameAnalyzer.parsePgn(endgame.games[0].pgn);
assert.equal(customReplay.startFen, customFen);
const customPositions = GameAnalyzer.buildPositionChain(customReplay);
assert.equal(customPositions.isPartial, false);
assert.equal(customPositions[1].turn, 'b');
const endgameTrap = endgame.traps.find(trap => trap.topics.includes('endgameAdvantage'));
assert(endgameTrap);
assert.equal(customPositions[endgameTrap.ply - 1].fen, endgameTrap.fenBefore);

const recapture = await runIntuitionCheckup({
  games: [{ pgn: pgn2 }], targetPlayer: 'KidPlayer', elo: 1900,
  maiaEngine: { async predict() { return { moves: [{ uci: 'd5c4', rawProb: 0.6 }] }; } },
  stockfish: { async evaluate(fen, depth) {
    const black = fen.split(' ')[1] === 'b';
    const uci = black ? 'a7a6' : 'd3c4';
    return { depth, scoreCp: black ? 300 : 0, bestMove: { uci, san: black ? 'a6' : 'Bxc4' }, pv: [uci] };
  } }
});
assert.equal(recapture.traps[0]?.playedUci, 'd5c4');
assert(recapture.traps[0]?.topics.includes('recapture'));
assert.equal(recapture.traps[0]?.playedPv[1], 'd3c4');

let stopAfterFirst = false;
const partialReplay = await runIntuitionCheckup({
  games: [{ pgn: pgn1 }, { pgn: pgn2 }], targetPlayer: 'KidPlayer',
  stockfish: mockStockfish, maiaEngine: mockMaia,
  onProgress: progress => { if (progress.completedGames === 1) stopAfterFirst = true; },
  isCancelled: () => stopAfterFirst
});
assert.equal(partialReplay.partial, true);
assert.equal(partialReplay.games.length, 1);
assert.equal(partialReplay.fitGameCount, 1, 'Partial reports count prefit samples from completed games only');
assert.equal(partialReplay.eloSampleCount, partialReplay.games[0].eloSampleCount);

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
assert.equal(emptyMaiaReport.screenEloSource, 'default');
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
assert.deepEqual(midCancelReport.games, [], 'A cancelled game does not add a replay snapshot');
assert.equal(midCancelReport.eloSampleCount, 0);
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
const fetchBeforeProxyTest = globalThis.fetch;
try {
  let requested;
  globalThis.fetch = async url => {
    requested = new URL(url);
    return new Response('', { headers: { 'content-type': 'application/x-ndjson' } });
  };
  await lichessProxy({ request: new Request('https://example.invalid/api/lichess?username=KidPlayer&max=100') });
  assert.equal(requested.searchParams.get('max'), '10');
  assert.equal(requested.searchParams.get('clocks'), 'false');
  await lichessProxy({ request: new Request('https://example.invalid/api/lichess?username=KidPlayer&max=900&clocks=true') });
  for (const [key, value] of Object.entries({ max: '100', clocks: 'true', opening: 'true', finished: 'true', ongoing: 'false' })) {
    assert.equal(requested.searchParams.get(key), value);
  }
} finally {
  globalThis.fetch = fetchBeforeProxyTest;
}

const clockPgn = `[White "KidPlayer"]\n[Black "Rival"]\n[Result "0-1"]
1. e4 { [%clk 0:00:25.5] } (1. d4 {[%clk 0:12:00]}) e5 {[%clk 0:00:50]}
2. Nf3 { [%clk 0:00:10] } Nc6 0-1`;
assert.deepEqual(GameAnalyzer.parsePgn(clockPgn, { clocks: true }).map(move => move.clockSeconds), [25.5, 50, 10, undefined]);
assert.equal(GameAnalyzer.parsePgn(clockPgn)[0].clockSeconds, undefined);
const clockGame = { gameId: 'live:1', pgn: clockPgn, meta: {
  white: 'KidPlayer', black: 'Rival', result: '0-1', eco: 'C20', timeClass: 'blitz', termination: 'timeout', initialSeconds: 60
} };
const prepared = prepareCheckupOverview([clockGame], 'kidplayer', { 'live:1': { w: { errors: { 3: true } } } });
const overview = summarizeCheckupOverview(prepared);
assert.deepEqual(overview.pressure, { observed: 2, low: 1, reviewedLow: 1, errors: 1, timeoutLosses: 1 });
assert.equal(overview.openings[0].count, 1);
assert.equal(summarizeCheckupOverview(prepared, 'rapid').count, 0);
assert.equal(prepareCheckupOverview([{ ...clockGame, pgn: pgn1 }], 'KidPlayer')[0].pressure.observed, 0);
assert.equal(prepareCheckupOverview([{ ...clockGame, pgn: clockPgn.replaceAll(/\[%clk [^\]]+\]/g, ''),
  clocks: [2550, 5000, 1000] }], 'KidPlayer')[0].pressure.low, 1);
const outcomes = ['1-0', '1/2-1/2', '1-0', '0-1', '0-1', '0-1', '0-1'];
const mixed = prepareCheckupOverview(outcomes.map((result, i) => ({
  ...clockGame, gameId: `live:${i}`, meta: {
    ...clockGame.meta, result, timeClass: i % 2 ? 'blitz' : 'rapid', eco: i < 4 ? 'C50' : 'C25'
  }
})), 'kidplayer');
const mixedOverview = summarizeCheckupOverview(mixed);
assert.match(overviewSummary(mixedOverview), /100%/);
assert.deepEqual([clockErrorTone(1, 0), clockErrorTone(11, 100), clockErrorTone(12, 100), clockErrorTone(25, 100), clockErrorTone(40, 100)],
  ['missing', 'low', 'medium', 'high', 'high']);
const statsCard = overviewCardData(mixed, { username: 'KidPlayer' }, 'blitz', 'Blitz');
assert.equal(statsCard.count, 3);
assert.equal(statsCard.summary, overviewSummary(summarizeCheckupOverview(mixed, 'blitz')));
assert(!summarizeCheckupCard(checkupCardData({ overview: statsCard }), true).includes('KidPlayer'));
assert.deepEqual(mixedOverview.total, { count: 7, win: 2, draw: 1, loss: 4, points: 2.5 });
assert.deepEqual(mixedOverview.colors.w, mixedOverview.total);
const ranked = rankCheckupOpenings(mixedOverview.openings, 'w');
assert.equal(ranked.length, 2, 'An opening with two labels is displayed once');
assert.deepEqual([ranked[0].eco, ranked[0].count, ranked[0].games.length], ['C50', 4, 3]);
assert.deepEqual(ranked[0].labels, ['checkupOpeningPopular', 'checkupOpeningBest']);
assert.deepEqual(ranked[1].labels, ['checkupOpeningWorst']);
assert.equal(summarizeCheckupOverview(mixed, 'blitz').openings.find(item => item.eco === 'C50').count, 2);
assert.deepEqual(rankCheckupOpenings(summarizeCheckupOverview(mixed, 'blitz').openings, 'w')[0].labels, ['checkupOpeningPopular']);

const makeEvidence = (id, loss, scores = [-4, -3, -2, -1]) => ({
  gameId: id, analyzedMoves: 10, screenedMoves: 8, timeClass: 'blitz',
  fitSamples: Array.from({ length: 24 }, (_, i) => ({ ply: i + 13, scores })),
  trapEvidence: [{ id: 'same-trap', ply: 15, phase: 'middlegame', eslLoss: loss }]
});
const example = summarizeCheckupFit([makeEvidence('example', 7, [0.214, 0.238, 0.245, 0.231].map(Math.log))]);
assert.deepEqual(example.fit.weights.map(weight => Math.round(weight * 1000)), [22, 280, 561, 137]);
assert(Math.abs(Math.exp(example.fit.logLead) - Math.pow(.245 / .238, 24)) < 1e-12);
assert.deepEqual(withCheckupFit({ closestElo: 1500, eloFit: { 1500: .25 } }), { closestElo: 1500, eloFit: { 1500: .25 } });
const fineGames = ['a', 'b', 'c', 'd'].map(id => makeEvidence(id, 7, [-5, -5, -2.5, -2, -3, -5]));
const fineFit = summarizeCheckupFit(fineGames, 'fine');
assert.equal(fineFit.fit.retained, 4);
assert.equal(fineFit.fit.checked, 4);
assert.deepEqual(fineFit.fit.estimate, { value: 1900, low: 1900, high: 1900 });
assert.deepEqual(fineFit.fit.examples.map(move => move.gameIndex), [0, 1], 'Show evidence from separate games when possible');
const exemplarGames = [
  { fitSamples: [
    { ply: 13, scores: [.003, .004, .017, .0009].map(Math.log) },
    { ply: 15, scores: [.1, .1, .6, .2].map(Math.log) }
  ] },
  { fitSamples: [{ ply: 19, scores: [.1, .1, .12, .3].map(Math.log) }] }
];
const exemplars = summarizeCheckupFit(exemplarGames, 'standard');
assert.equal(exemplars.eloSampleCount, 3, 'A low-probability move still contributes to the fit');
assert.deepEqual(exemplars.fit.examples.map(move => move.ply), [15, 19], 'Show a common enough move on each side of the comparison');
assert(exemplars.fit.examples[0].leaderProbability > exemplars.fit.examples[0].runnerProbability);
assert(exemplars.fit.examples[1].leaderProbability < exemplars.fit.examples[1].runnerProbability);
const broadStable = { closestElo: 1900, fit: {
  status: 'stable', ranges: [{ low: 1500, high: 2200 }], logLead: Math.log(2), weights: [.05, .24, .484, .226], runner: 1500
} };
assert.equal(checkupFitBandLabel(broadStable), '1900');
const uncertain = summarizeCheckupFit(fineGames.map(game => ({ ...game,
  fitSamples: game.fitSamples.map(sample => ({ ...sample, scores: [-2, -4, -4, -4, -4, -2] })) })), 'fine');
assert.equal(uncertain.fit.estimate, null);
assert.equal(uncertain.fit.logLead, 0);
assert.equal(uncertain.fit.status, 'variation');
assert.deepEqual(uncertain.fit.ranges, [{ low: 1000, high: 1000 }, { low: 2500, high: 2500 }]);
const contested = summarizeCheckupFit([
  ...['p', 'q', 'r'].map(id => makeEvidence(id, 0, [-5, -3, -5, -2.8])),
  makeEvidence('s', 0, [-5, -1, -5, -3.8])
], 'standard', { rolling: true });
assert.deepEqual(contested.fit.influence, { gameIndex: 3, shift: 700, elo: 2200 });
assert.deepEqual(contested.fit.ranges, [{ low: 1500, high: 1500 }, { low: 2200, high: 2200 }]);
assert.equal(contested.fit.status, 'variation');
assert.equal(fineFit.fit.status, 'stable');
assert.equal(example.fit.status, 'limited');
const ratedFit = {
  ...fineFit, playerName: 'Sample', gameCount: fineGames.length,
  games: fineGames.map((game, index) => ({ ...game, platform: 'lichess', timeClass: 'rapid',
    orientation: 'white', playedRating: [1600, 1650, 1650, 1700][index] }))
};
const compare = report => checkupCardData({ report }).fitComparison;
assert.match(compare(ratedFit), /1650.*Maia 1900/);
assert.match(summarizeCheckupCard(checkupCardData({ report: ratedFit }), true), /1650.*Maia 1900/);
assert.equal(compare({ ...ratedFit, fit: { ...ratedFit.fit, status: 'variation' } }), '');
assert.equal(compare({ ...ratedFit, fit: broadStable.fit }), '', 'A wide supported range can cross the sampled rating');
for (const other of [{ platform: 'chesscom' }, { timeClass: 'blitz' }, { playedRating: '' }]) {
  assert.equal(compare({ ...ratedFit, games: [{ ...ratedFit.games[0], ...other }, ...ratedFit.games.slice(1)] }), '');
}
const withRating = playedRating => ({ ...ratedFit, games: ratedFit.games.map(game => ({ ...game, playedRating })) });
assert.match(compare(withRating(1750)), /1750.*Maia 1900/, 'A supported gap of 150 qualifies');
assert.equal(compare(withRating(1751)), '');

const makeWindowGame = index => ({
  ...makeEvidence('game-' + index, 7), platform: 'lichess', playedAt: 100 * index, orientation: 'white',
  timeClass: index === 33 ? 'rapid' : 'blitz', fitSamples: [{ ply: 15, scores: [-5, -3, -2, -1] },
    { ply: 17, scores: [-5, -3, -2, -1] }, { ply: 19, scores: [-5, -3, -2, -1] }]
});
const latestLong = { profileId: 'default', sourceLabel: 'lichess:KidPlayer', playerName: 'KidPlayer',
  evidenceKey: 'window-v1|sf-new|maia-x|2200', createdAt: 10000, games: [makeWindowGame(29), makeWindowGame(33)] };
const previousLong = { ...latestLong, evidenceKey: 'window-v1|sf-old|maia-x|1900', createdAt: 9000,
  games: Array.from({ length: 34 }, (_, i) => makeWindowGame(i)) };
const foreign = [makeWindowGame(90)];
const historyWindow = buildCheckupFitWindow(latestLong, [
  { ...previousLong, profileId: 'other', games: foreign },
  { ...previousLong, sourceLabel: 'lichess:Other', playerName: 'Other', games: foreign },
  { ...previousLong, evidenceKey: 'window-v1|sf-old|maia-y|1900', games: foreign },
  { ...previousLong, evidenceKey: 'window-fine-v1|sf-old|maia-x|1900', games: foreign },
  { ...previousLong, createdAt: 11000, games: foreign },
  previousLong
], ['game-29', 'game-33']);
assert.equal(historyWindow.games.length, 30);
assert.deepEqual(historyWindow.games.slice(0, 3).map(game => game.gameId), ['game-29', 'game-33', 'game-32']);
assert.equal(new Set(historyWindow.games.map(game => game.gameId)).size, 30);
assert(!historyWindow.games.some(game => game.gameId === 'game-90' || 'trapEvidence' in game));
const blitzFit = checkupFitForSpeed(historyWindow.games, 'standard');
assert.equal(blitzFit.speed, 'blitz');
assert.equal(blitzFit.fitGameCount, 29);
assert.equal(blitzFit.eloSampleCount, 87, 'The rolling fit uses all cached moves, without the batch cap');
assert.equal(checkupFitForSpeed(historyWindow.games, 'standard', 'rapid').eloSampleCount, 3);
const restored = buildCheckupFitWindow(latestLong, [{ ...previousLong, games: [], fitWindow: historyWindow }], []);
assert.equal(restored.games.length, 30, 'Older evidence survives after its batch record leaves the report archive');
const clockParsed = GameAnalyzer.parsePgn('1. e4 {[%clk 0:00:22]} e5 2. Nf3 {[%clk 0:00:10]} Nc6 3. Bb5 a6', { clocks: true });
assert.deepEqual(checkupClockSample(clockParsed, 'w', null, 60), { observed: 3, low: [3, 5] });
assert.deepEqual(checkupReportStability({
  games: [{ ...makeWindowGame(1), clockSample: { observed: 4, low: [3, 5, 7] } }],
  screenedMoves: 25, phaseTraps: { opening: 1, middlegame: 1, endgame: 0 }
}, {
  'lichess:game-1': { w: { errors: { 3: true, 5: false } }, b: { errors: { 7: true } } }
}), { hits: 2, screened: 25, density: 8, missingCoverage: false, observed: 4, low: 3, reviewed: 2, errors: 1 });

const summary = checkupScoreSummary({
  gameCount: 4, games: [
    { orientation: 'black', result: '0-1' }, { orientation: 'white', result: '1/2-1/2' },
    { orientation: 'white', result: '0-1' }, { orientation: 'white', result: '*' }
  ], stability: { density: 2, reviewed: 4, errors: 1 }, phaseTraps: { opening: 1, middlegame: 3, endgame: 0 }
});
assert.equal(summary.metrics[0].value, '50%', 'Wins count as one point and draws as half; exclude unfinished records');
assert.equal(summary.metrics[1].value, '1.0');
assert.equal(summary.metrics[2].detail, '3/4');
assert.equal(summary.clock, null, 'Keep low-clock rates out of the summary until enough moves were reviewed');

const ties = summarizeCheckupFit([makeEvidence('tie', 0, [-2.4, -2.4, -2.4, -2.32])], 'standard');
assert.deepEqual(ties.fit.ranges, [{ low: 1100, high: 2200 }], 'An exact tie at the support boundary must not favor the lowest band');
const older = { ...makeWindowGame(1), clockSample: undefined };
const withClocks = buildCheckupWindow([older.gameId], 'legacy', [{ evidenceKey: 'legacy', games: [older] }], 1,
  [{ gameId: older.gameId, pgn: '1. e4 {[%clk 0:00:22]} e5 2. Nf3 {[%clk 0:00:10]} Nc6 3. Bb5 a6',
    meta: { initialSeconds: 60, playedAt: 2000 } }]);
assert.deepEqual(withClocks.games[0].clockSample, { observed: 3, low: [3, 5] });
const historyGames = Array.from({ length: 10 }, (_, i) => makeEvidence(`g${i}`, i + 10));
const firstWindow = buildCheckupWindow(historyGames.map(game => game.gameId), 'sf:maia:2200',
  [{ evidenceKey: 'sf:maia:2200', games: historyGames }], 1);
const nextWindow = buildCheckupWindow(['new', 'ignored', ...historyGames.map(game => game.gameId)], 'sf:maia:2200', [
  { evidenceKey: 'different-engine', games: [makeEvidence('ignored', 90)] },
  { evidenceKey: 'sf:maia:2200', games: [makeEvidence('new', 16)], rolling: firstWindow }
], 2);
assert.equal(nextWindow.gameCount, 9, 'Unanalyzed or incompatible games do not count toward coverage');
assert.equal(nextWindow.games[0].gameId, 'new');
assert.equal(nextWindow.eloSampleCount, 24);
assert.equal(nextWindow.fitGameCount, 9);
assert.equal(nextWindow.phaseTraps.middlegame, 9);
assert.equal(nextWindow.traps[0].eslLoss, 17, 'The strongest occurrence is recalculated after older games leave');
assert.equal(nextWindow.traps[0].occurrences.length, 9);
assert.deepEqual(checkupTrend([nextWindow, firstWindow].map(rolling => ({ evidenceKey: 'sf:maia:2200', rolling })),
  'sf:maia:2200', 'blitz').map(point => [point.count, point.elo, point.density]), [[10, 2200, 12.5], [9, 2200, 12.5]]);

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
