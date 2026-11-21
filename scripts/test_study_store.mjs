import assert from 'node:assert/strict';
import {
  DEFAULT_PROFILE_ID,
  SRS_INTERVALS_MS,
  SRS_RETRY_MS,
  StudyStore,
  buildTrapRecord,
  computeNextSrs,
  detectPhase,
  resolvePerspective
} from '../analysis/study-store.js';

const now = 1763500000000;

// 1. Perspective resolution: self, spectator, ambiguous, and sample guard
const kidProfile = { id: 'kid', displayName: 'Son', aliases: ['KidChess', '小棋手'] };
assert.deepEqual(
  resolvePerspective({ white: '⚪ KidChess (1650)', black: '⚫ Opponent (1700)' }, kidProfile),
  { side: 'w', mode: 'self', matchedAlias: 'KidChess' }
);
assert.deepEqual(
  resolvePerspective({ white: '⚪ Opponent', black: '⚫ 小棋手' }, kidProfile),
  { side: 'b', mode: 'self', matchedAlias: '小棋手' }
);
assert.deepEqual(
  resolvePerspective({ white: '⚪ KidChess', black: '⚫ 小棋手' }, kidProfile),
  { side: null, mode: 'ambiguous', matchedAlias: null }
);
assert.deepEqual(
  resolvePerspective({ white: '⚪ Donald Byrne', black: '⚫ Robert James Fischer', isSample: true }, { aliases: ['Donald Byrne'] }),
  { side: null, mode: 'spectator', matchedAlias: null },
  'Sample games must always stay spectator mode'
);

// 2. Phase detection
assert.equal(detectPhase({ ply: 8, fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' }), 'opening');
assert.equal(detectPhase({ ply: 30, fenBefore: 'r1bq1rk1/pp3ppp/2n1pn2/2bp4/3P4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 10' }), 'middlegame');
assert.equal(detectPhase({ ply: 60, fenBefore: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 30' }), 'endgame');

// 3. SRS progression rules
const stage1 = computeNextSrs({ stage: 0, streak: 0, attempts: 0 }, 'independent', now);
assert.equal(stage1.stage, 1);
assert.equal(stage1.streak, 1);
assert.equal(stage1.nextReviewAt, now + SRS_INTERVALS_MS[1]);

const hinted = computeNextSrs(stage1, 'hinted', now + 1000);
assert.equal(hinted.stage, 1);
assert.equal(hinted.nextReviewAt, now + 1000 + SRS_INTERVALS_MS[0]);

const reset = computeNextSrs(stage1, 'revealed', now + 2000);
assert.equal(reset.stage, 0);
assert.equal(reset.streak, 0);
assert.equal(reset.nextReviewAt, now + 2000 + SRS_RETRY_MS);

// 4. Multi-profile isolation, dedup, and backup merge
const store = new StudyStore({ useIndexedDb: false });
await store.init();
const son = await store.saveProfile({ displayName: 'Son', aliases: ['KidChess, kidchess'] }, now);
assert.deepEqual(son.aliases, ['KidChess']);
await Promise.all([
  store.setProfileAccount(son.id, 'lichess', 'KidChess'),
  store.setProfileAccount(son.id, 'chesscom', 'OtherName')
]);
await store.setProfileAccount(son.id, 'lichess', ' kidchess ');
const linkedSon = await store.saveProfile({ id: son.id, displayName: 'Son', aliases: son.aliases }, now + 1);
assert.deepEqual(linkedSon.accounts, [
  { platform: 'lichess', username: 'KidChess' },
  { platform: 'chesscom', username: 'OtherName' }
], 'Editing profile details preserves case-insensitively deduplicated platform accounts');
assert.equal(resolvePerspective({ platform: 'chesscom', white: 'KidChess', black: 'OtherName' }, linkedSon).side, 'b');
assert.equal(resolvePerspective({ platform: 'chesscom', white: 'KidChess' }, linkedSon).side, null);
assert.equal(resolvePerspective({ white: 'KidChess' }, linkedSon).side, 'w', 'Local PGN aliases still match');

const move = {
  ply: 34,
  moveNumber: 17,
  turn: 'b',
  fenBefore: 'r3r1k1/pp3pbp/1qp1b1p1/2B5/2BP4/Q1n2N2/P4PPP/3R1K1R b - - 2 17',
  uci: 'c3d1',
  san: 'Nxd1',
  divergenceType: 'intuition_trap',
  divergenceStatus: 'confirmed',
  verifiedBestUci: 'e6c4',
  verifiedBestSan: 'Bxc4+',
  verifiedPlayedPv: ['c3d1', 'c5b6', 'a7b6'],
  verifiedBestPv: ['e6c4', 'f1g1'],
  verifiedExpectedScoreLoss: 18.4,
  verifiedLossCp: 240,
  humanRawProbability: 0.331
};

const recDefault = buildTrapRecord(move, { elo: 1900 }, { profileId: DEFAULT_PROFILE_ID, now });
const recSon = buildTrapRecord(move, { elo: 1900 }, { profileId: son.id, now });
assert.notEqual(recDefault.id, recSon.id);

const firstInsert = await store.upsertTrap(recSon);
const dupInsert = await store.upsertTrap(recSon);
assert.equal(firstInsert.added, true);
assert.equal(dupInsert.added, false);
assert.equal((await store.listTraps(DEFAULT_PROFILE_ID)).length, 0, 'Profiles must isolate traps');
assert.equal((await store.listTraps(son.id)).length, 1);
assert.equal(await store.countDue(son.id, now), 1);

const updated = await store.recordPracticeResult(recSon.id, 'independent', now);
assert.equal(updated.srs.stage, 1);
assert.equal(await store.countDue(son.id, now + 1000), 0);

// 5. Backup restore: renamed default profile, activeProfileId, and higher-streak protection
await store.saveProfile({ id: DEFAULT_PROFILE_ID, displayName: '爸爸', aliases: ['dad'] }, now + 500);
store.setActiveProfileId(son.id);
const backup = await store.exportBackup(now + 1000);
const restored = new StudyStore({ useIndexedDb: false });
const importResult = await restored.importBackup(backup, now + 2000);
assert.equal(importResult.profilesAdded, 1);
assert.equal(importResult.trapsAdded, 1);
assert.equal((await restored.listTraps(son.id))[0].srs.stage, 1);
assert.equal((await restored.listProfiles()).find(p => p.id === DEFAULT_PROFILE_ID).displayName, '爸爸', 'Renamed default profile must be restored');
assert.equal(restored.getActiveProfileId(), son.id, 'Active profile ID must be restored');
assert.deepEqual((await restored.getActiveProfile()).accounts, linkedSon.accounts, 'Backup restores account bindings');
await restored.importBackup({
  version: 1,
  profiles: [{ id: son.id, displayName: 'Son', accounts: [
    { platform: 'chesscom', username: 'othername' },
    { platform: 'lichess', username: 'NextAccount' },
    { platform: 'other', username: 'Unknown' }
  ] }]
}, now + 2100);
assert.equal((await restored.getActiveProfile()).accounts.length, 3, 'Merge adds new accounts, deduplicates and validates');
await restored.setProfileAccount(son.id, 'lichess', 'kidCHESS', { remove: true });
assert.deepEqual((await restored.getActiveProfile()).accounts.map(item => item.username), ['OtherName', 'NextAccount']);
assert.deepEqual((await restored.get('profiles', DEFAULT_PROFILE_ID)).accounts, []);

const highStreakTrap = {
  ...recSon,
  srs: { stage: 4, streak: 4, attempts: 4, nextReviewAt: now + SRS_INTERVALS_MS[4], lastStatus: 'independent', lastReviewedAt: now + 3000 }
};
await restored.put('traps', highStreakTrap);
const lowerStreakBackup = {
  version: 1,
  profiles: [],
  traps: [{
    ...recSon,
    srs: { stage: 0, streak: 0, attempts: 5, nextReviewAt: now + 9000, lastStatus: 'revealed', lastReviewedAt: now + 9000 }
  }]
};
const mergeOutcome = await restored.importBackup(lowerStreakBackup, now + 10000);
assert.equal(mergeOutcome.trapsUpdated, 0, 'Newer streak=0 record must not overwrite existing streak=4');
assert.equal((await restored.listTraps(son.id))[0].srs.streak, 4);

console.log('PASS study store: perspective resolution, phase detection, multi-profile isolation, SRS progression and backup merge.');
