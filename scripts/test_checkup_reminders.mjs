import assert from 'node:assert/strict';
import { StudyStore } from '../analysis/study-store.js';
import {
  CHECKUP_ALARM_MINUTES, CHECKUP_BACKGROUND_KEY, fetchCheckupObservation,
  hasNewCheckupGames, markCheckupGames, mergeCheckupObservation, pendingCheckupGameIds
} from '../engine/checkup-watch.js';
import { startCheckupReminders } from '../engine/checkup-reminders-background.js';

const now = Date.now();
const old = now - 8 * 3600_000;
const lichess = { platform: 'lichess', username: 'Student' };
const game = (id, status, at = now - 1000) => ({ id, variant: 'standard', status, lastMoveAt: at });
const ndjson = items => new Response(items.map(item => JSON.stringify(item)).join('\n'));
const observation = await fetchCheckupObservation(lichess, {
  now,
  fetchImpl: async (url, options) => {
    const params = new URL(url).searchParams;
    assert.equal(options.headers.Accept, 'application/x-ndjson');
    assert.equal(params.get('moves'), 'false');
    assert.equal(params.get('ongoing'), 'false');
    assert.equal(params.get('finished'), 'true');
    return ndjson([game('LiveGame', 'started'), game('NewGame1', 'resign'), game('OldGame1', 'mate', old)]);
  }
});
assert.deepEqual(observation.games.map(item => item.id), ['NewGame1', 'OldGame1']);

const archiveBase = 'https://api.chess.com/pub/player/student/games/';
const november = Date.UTC(2026, 10, 1, 0, 2);
const requests = [];
const chesscom = await fetchCheckupObservation({ ...lichess, platform: 'chesscom' }, {
  now: november,
  fetchImpl: async url => {
    requests.push(url);
    if (url.endsWith('/archives')) return Response.json({ archives: [
      archiveBase + '2026/10', 'https://example.invalid/games/2026/11'
    ] });
    return Response.json({ games: [{
      url: `https://www.chess.com/game/${url.endsWith('/11') ? 'live/10000001' : 'daily/10000002'}`,
      rules: 'chess', end_time: (november - (url.endsWith('/11') ? 1000 : 100_000_000)) / 1000
    }] });
  }
});
assert.deepEqual(requests, ['archives', '2026/11', '2026/10'].map(path => archiveBase + path));
assert.deepEqual(chesscom.games.map(item => item.id), ['live:10000001', 'daily:10000002']);

const store = new StudyStore({ useIndexedDb: false });
await store.init();
await store.setProfileAccount('default', lichess.platform, lichess.username);
const first = { checkedAt: old, games: [observation.games[1]] };
await store.updateCheckupReminder('default', lichess, current => mergeCheckupObservation(current, first));
const state = async () => (await store.get('profiles', 'default')).checkupReminders['lichess:student'];
assert.equal(hasNewCheckupGames(await state()), false, 'The first observation establishes a baseline');
await store.updateCheckupReminder('default', lichess, current => mergeCheckupObservation(current, observation));
assert.equal(hasNewCheckupGames(await state()), true);
const observed = await state();
const newIds = pendingCheckupGameIds({ ...observed, games: [...observed.games, ...observed.games] });
assert.deepEqual(newIds, ['NewGame1']);
const late = mergeCheckupObservation(observed, { checkedAt: now + 1, games: [{ id: 'Later123', at: now }, ...observed.games] });
const dismissed = markCheckupGames(late, 'lichess', newIds);
assert.deepEqual(pendingCheckupGameIds(dismissed), ['Later123'], 'Dismissal only consumes the IDs visible at click time');
assert.equal(dismissed.lastDiagnosedAt, 0, 'Dismissing or reviewing a game does not change the last diagnosis time');
const beforeFirstProbe = markCheckupGames({}, 'lichess', ['NewGame1']);
assert.deepEqual(pendingCheckupGameIds(mergeCheckupObservation(beforeFirstProbe, observation)), []);
await store.saveCheckup({
  id: 'partial', profileId: 'default', sourceLabel: 'lichess:Student', playerName: 'Student',
  createdAt: now, analyzedGameIds: ['OldGame1'], partial: true
});
assert.equal(hasNewCheckupGames(await state()), true, 'A partial report clears only the games it finished');
await store.saveCheckup({
  id: 'completed', profileId: 'default', sourceLabel: 'lichess:Student', playerName: 'Student',
  createdAt: now + 1, analyzedGameIds: ['NewGame1']
});
assert.equal(hasNewCheckupGames(await state()), false);
await store.setBackgroundCheckup('default', true);
const exported = (await store.exportBackup()).profiles[0];
assert.equal(exported.backgroundCheckup, undefined, 'An exported profile does not carry reminder consent');
await store.setProfileAccount('default', lichess.platform, lichess.username, { remove: true });
assert.equal(await state(), undefined);

// A report saved before linking still belongs to that profile and platform.
const experienced = { platform: 'lichess', username: 'GuestChess' };
const full = {
  id: 'guest-full', profileId: 'default', sourceLabel: 'lichess:guestchess', playerName: 'GuestChess',
  gameCount: 1, createdAt: now - 100, analyzedGameIds: ['Guest123']
};
await store.saveCheckup(full);
await store.saveCheckup({ ...full, id: 'guest-partial', partial: true, createdAt: now, analyzedGameIds: ['Guest456'] });
await store.saveCheckup({ ...full, id: 'guest-local', sourceLabel: 'local-pgn-batch', analyzedGameIds: ['Local123'] });
await store.saveCheckup({ ...full, id: 'guest-other-platform', sourceLabel: 'chesscom:GuestChess', analyzedGameIds: ['live:12345'] });
await store.saveCheckup({ ...full, id: 'guest-legacy', createdAt: now + 1, analyzedGameIds: undefined });
let guestProfile = await store.setProfileAccount('default', 'lichess', 'GUESTCHESS');
assert.deepEqual(guestProfile.checkupReminders['lichess:guestchess'].diagnosed, ['Guest456', 'Guest123']);
assert.equal(guestProfile.checkupReminders['lichess:guestchess'].lastDiagnosedAt, now);
await store.updateCheckupReminder('default', experienced, () => ({
  checkedAt: now, baseline: ['Baseline'], diagnosed: ['Seen1234']
}));
guestProfile = (await store.loadCheckupProfile('default')).profile;
assert.deepEqual(guestProfile.checkupReminders['lichess:guestchess'], {
  checkedAt: now, baseline: ['Baseline'], diagnosed: ['Seen1234', 'Guest456', 'Guest123'], lastDiagnosedAt: now
});
assert.deepEqual((await store.loadCheckupProfile('default')).profile, guestProfile, 'Repair is idempotent');

const trap = { id: 'default|fen|e2e4', profileId: 'default', fenBefore: 'fen', playedUci: 'e2e4' };
const secondTrap = { ...trap, id: 'default|fen|d2d4', playedUci: 'd2d4', gameIndex: 0 };
const replays = [{ gameId: 'Guest123', pgn: '1. e4 e5 1-0' }];
await store.saveCheckup({
  ...full, id: 'transfer', games: replays, traps: [trap, secondTrap], topTraps: [trap], topTrapIds: [trap.id]
});
await store.put('traps', trap);
const unrelated = await store.saveProfile({
  displayName: 'Other account', account: { platform: 'lichess', username: 'Another' },
  transferCheckup: { id: 'transfer', profileId: 'default' }
});
assert.equal((await store.listCheckups(unrelated.id)).length, 0);
const moved = await store.saveProfile({
  displayName: 'Guest', account: experienced, transferCheckup: { id: 'transfer', profileId: 'default' }
});
const [transferred] = await store.listCheckups(moved.id);
assert.equal(transferred.id, 'transfer');
assert.deepEqual(transferred.topTrapIds, [`${moved.id}|fen|e2e4`]);
assert.equal(transferred.topTraps[0].profileId, moved.id);
assert.deepEqual(transferred.games, replays);
assert.equal(transferred.traps[1].id, `${moved.id}|fen|d2d4`);
assert.equal(transferred.traps[1].gameIndex, 0);
assert.deepEqual(moved.checkupReminders['lichess:guestchess'].diagnosed, ['Guest123']);
assert.equal((await store.listCheckups('default')).some(report => report.id === 'transfer'), false);
assert.equal((await store.listCheckups('default')).some(report => report.id === full.id), true);
assert.deepEqual(await store.get('traps', trap.id), trap);

const events = () => ({ addListener(listener) { this.fire = listener; } });
let storage = [];
let alarm = null;
let badge = '';
let mode = 'success';
let fetches = 0;
let release;
let started;
const api = {
  storage: { local: {
    async get(key) { return { [key]: structuredClone(storage) }; },
    async set(values) { storage = structuredClone(values[CHECKUP_BACKGROUND_KEY]); }
  } },
  action: {
    async setBadgeText({ text }) { badge = text; },
    async setBadgeBackgroundColor() {}
  },
  alarms: {
    async get() { return alarm; },
    async create(name, options) { alarm = { name, ...options }; },
    async clear() { alarm = null; },
    onAlarm: events()
  },
  runtime: { onMessage: events(), onInstalled: events(), onStartup: events() }
};
startCheckupReminders(api, async () => {
  fetches++;
  if (mode === 'error') return new Response('', { status: 429, headers: { 'Retry-After': '3600' } });
  if (mode === 'held') {
    started();
    await new Promise(resolve => { release = resolve; });
  }
  return ndjson([game('NewGame1', 'mate')]);
});
const sender = { frameId: 0, url: 'https://4chess.cc/analysis/' };
const send = subscriptions => new Promise(resolve =>
  api.runtime.onMessage.fire({ type: 'CHECKUP_BACKGROUND_SYNC', subscriptions }, sender, resolve)
);
const resolveReminder = reminder => new Promise(resolve =>
  api.runtime.onMessage.fire({ type: 'CHECKUP_BACKGROUND_SYNC', reminder }, sender, resolve)
);
const input = { ...lichess, profileId: 'child', state: mergeCheckupObservation({}, first) };
assert.equal(api.runtime.onMessage.fire({ type: 'CHECKUP_BACKGROUND_SYNC', subscriptions: [input] },
  { ...sender, url: 'https://4chess.cc/guide' }, () => assert.fail('Non-studio sender accepted')), undefined);
assert.equal((await send([{ ...input, platform: 'other' }])).ok, false);
assert.equal((await send([input])).ok, true);
assert.equal(alarm.periodInMinutes, CHECKUP_ALARM_MINUTES);
assert.equal(badge, '');
await api.alarms.onAlarm.fire(alarm);
assert.equal(fetches, 1);
assert.equal(badge, '•');
const token = storage[0].token;
assert.deepEqual(await resolveReminder(token), {
  ok: true, target: { profileId: 'child', platform: 'lichess', username: 'student' }
});
assert.equal(badge, '•', 'Opening a reminder does not mark those games as diagnosed');
assert.deepEqual(await resolveReminder('foreign-token'), { ok: false });
assert.equal((await send([input])).subscriptions[0].state.games[0].id, 'NewGame1', 'Sync with an older web snapshot retains the background result');
assert.equal((await send([{ ...input, state: { ...input.state, diagnosed: ['NewGame1'] } }])).ok, true);
assert.equal(badge, '');
await send([]);
assert.equal(alarm, null);
assert.deepEqual(await resolveReminder(token), { ok: true }, 'A removed subscription cannot open its former account');

await send([input]);
mode = 'error';
await api.alarms.onAlarm.fire(alarm);
assert.equal(storage[0].state.games[0].id, 'OldGame1', 'Rate limiting preserves the previous observation');
assert(storage[0].state.retryAt - Date.now() > 3_500_000);
await send([]);
await send([input]);
mode = 'held';
const requestStarted = new Promise(resolve => { started = resolve; });
const polling = api.alarms.onAlarm.fire(alarm);
await requestStarted;
await send([]);
release();
await polling;
assert.deepEqual(storage, [], 'An in-flight observation cannot recreate a revoked subscription');
assert.equal(badge, '');
assert.equal(alarm, null);
console.log('PASS checkup reminders: metadata only, month rollover, partial reports, per-profile opt-in, alarms, rate limit and in-flight revocation.');
