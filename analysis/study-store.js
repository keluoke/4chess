import { checkupGameIds, markCheckupGames } from '../engine/checkup-watch.js?v=20261124-checkup-cards-r2';
import { parseStudioElo } from '../engine/chess-notation.js?v=20261120-import';

const DB_NAME = 'diverge_study_v1';
const DB_VERSION = 1;
export const ACTIVE_PROFILE_KEY = 'diverge_study_active_profile';
const MAX_TRAPS_PER_PROFILE = 2000;
const MAX_CHECKUPS_PER_PROFILE = 20;

export const DEFAULT_PROFILE_ID = 'default';
export const SRS_INTERVALS_MS = [1, 3, 7, 14, 30].map(days => days * 86400000);
export const SRS_RETRY_MS = 12 * 3600000;

export function normalizeAlias(name) {
  if (typeof name !== 'string') return '';
  return name
    .replace(/^[⚪⚫]\s*/, '')
    .replace(/\s*\(\d{3,4}\)\s*$/, '')
    .trim()
    .toLowerCase();
}

export function parseAliases(input) {
  const raw = (Array.isArray(input) ? input : [input]).flatMap(item => String(item || '').split(/[,，\n]/));
  const seen = new Set();
  const list = [];
  for (const item of raw) {
    const clean = String(item || '').trim();
    const key = normalizeAlias(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push(clean);
  }
  return list;
}

export function normalizeAccount(platform, username) {
  if (!['chesscom', 'lichess'].includes(platform) || typeof username !== 'string') return null;
  const clean = username.trim();
  return /^[a-z0-9][a-z0-9_-]{0,49}$/i.test(clean) ? { platform, username: clean } : null;
}

export function accountKey({ platform, username }) {
  return `${platform}:${username.toLowerCase()}`;
}

function checkupReportAccount(report) {
  const [platform, username] = String(report?.sourceLabel || '').split(':');
  const account = normalizeAccount(platform, report?.playerName);
  return account && (!username || normalizeAlias(username) === normalizeAlias(account.username)) ? account : null;
}

export function checkupReportMatchesAccount(report, account) {
  const reported = checkupReportAccount(report);
  return !!reported && !!account && accountKey(reported) === accountKey(account);
}

function newestCheckups(a, b) {
  return (b.createdAt ?? 0) - (a.createdAt ?? 0);
}

function restoreCheckupReminders(profile, reports) {
  const reminders = { ...profile.checkupReminders };
  let changed = false;
  for (const account of profile.accounts || []) {
    const matches = reports.filter(report => checkupReportMatchesAccount(report, account));
    const withIds = matches.map(report => ({ report, ids: checkupGameIds(account.platform, report.analyzedGameIds) }))
      .filter(item => item.ids.length);
    if (!withIds.length) continue;

    const timestamp = Math.max(0, ...withIds.map(({ report }) => Number.isSafeInteger(report.createdAt) ? report.createdAt : 0));
    const key = accountKey(account);
    const current = reminders[key] || {};
    // Keep existing acknowledgements when the historical IDs exceed the reminder limit.
    const existing = current.diagnosed || [];
    const next = markCheckupGames(current, account.platform, [...existing, ...withIds.flatMap(item => item.ids)], timestamp);
    if (next.lastDiagnosedAt === (current.lastDiagnosedAt || 0) && next.diagnosed.length === existing.length &&
      next.diagnosed.every((id, index) => id === existing[index])) continue;
    reminders[key] = next;
    changed = true;
  }
  return changed ? { ...profile, checkupReminders: reminders } : profile;
}

function mergeAccounts(...lists) {
  const accounts = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const account = normalizeAccount(item?.platform, item?.username);
      if (account && !accounts.has(accountKey(account))) accounts.set(accountKey(account), account);
    }
  }
  return [...accounts.values()];
}

export function perspectiveNames(profile, platform) {
  const linked = (profile?.accounts || []).filter(account => account.platform === platform);
  return linked.length ? linked.map(account => account.username) : (profile?.aliases || []);
}

export function resolvePerspective(meta = {}, profile = null) {
  if (!meta || meta.isSample || meta.isPositionOnly) {
    return { side: null, mode: 'spectator', matchedAlias: null };
  }
  const aliases = new Map();
  for (const alias of perspectiveNames(profile, meta.platform)) {
    const key = normalizeAlias(alias);
    if (key) aliases.set(key, alias);
  }
  if (!aliases.size) return { side: null, mode: 'spectator', matchedAlias: null };
  const whiteKey = normalizeAlias(meta.white);
  const blackKey = normalizeAlias(meta.black);
  const whiteMatch = whiteKey && aliases.get(whiteKey) || null;
  const blackMatch = blackKey && aliases.get(blackKey) || null;
  if (whiteMatch && blackMatch) return { side: null, mode: 'ambiguous', matchedAlias: null };
  if (whiteMatch) return { side: 'w', mode: 'self', matchedAlias: whiteMatch };
  if (blackMatch) return { side: 'b', mode: 'self', matchedAlias: blackMatch };
  return { side: null, mode: 'spectator', matchedAlias: null };
}

export function detectPhase(move) {
  if (move?.isBookMove || (Number.isFinite(move?.ply) && move.ply <= 16)) return 'opening';
  const placement = String(move?.fenBefore || '').split(/\s+/)[0] || '';
  const weights = { q: 9, r: 5, b: 3, n: 3 };
  let material = 0;
  let queens = 0;
  for (const ch of placement) {
    const lower = ch.toLowerCase();
    if (weights[lower]) material += weights[lower];
    if (lower === 'q') queens++;
  }
  if (material <= 24 || (queens === 0 && material <= 30)) return 'endgame';
  return 'middlegame';
}

export function computeNextSrs(current = {}, status, now = Date.now()) {
  const prevStage = Number.isInteger(current.stage) ? Math.max(0, Math.min(4, current.stage)) : 0;
  const prevStreak = Number.isInteger(current.streak) ? Math.max(0, current.streak) : 0;
  const prevAttempts = Number.isInteger(current.attempts) ? Math.max(0, current.attempts) : 0;
  if (status === 'independent') {
    const stage = Math.min(4, prevStage + 1);
    return {
      stage,
      streak: prevStreak + 1,
      attempts: prevAttempts + 1,
      nextReviewAt: now + SRS_INTERVALS_MS[stage],
      lastStatus: status,
      lastReviewedAt: now
    };
  }
  if (status === 'hinted') {
    return {
      stage: prevStage,
      streak: prevStreak,
      attempts: prevAttempts + 1,
      nextReviewAt: now + SRS_INTERVALS_MS[0],
      lastStatus: status,
      lastReviewedAt: now
    };
  }
  if (status === 'revealed' || status === 'attempted') {
    return {
      stage: 0,
      streak: 0,
      attempts: prevAttempts + 1,
      nextReviewAt: now + SRS_RETRY_MS,
      lastStatus: status,
      lastReviewedAt: now
    };
  }
  return {
    stage: prevStage,
    streak: prevStreak,
    attempts: prevAttempts,
    nextReviewAt: Number.isFinite(current.nextReviewAt) ? current.nextReviewAt : now,
    lastStatus: current.lastStatus || 'new',
    lastReviewedAt: current.lastReviewedAt ?? null
  };
}

export function trapId(profileId, fenBefore, playedUci) {
  return `${profileId || DEFAULT_PROFILE_ID}|${fenBefore}|${playedUci}`;
}

export function buildTrapRecord(move, review, { profileId = DEFAULT_PROFILE_ID, source = {}, triggerMove = null, now = Date.now() } = {}) {
  if (!move?.fenBefore || !move?.uci) return null;
  if (move.divergenceType !== 'intuition_trap' || move.divergenceStatus !== 'confirmed') return null;
  if (!Number.isFinite(move.verifiedExpectedScoreLoss)) return null;
  const bestSan = move.verifiedBestSan || move.bestSan || '';
  const bestUci = move.verifiedBestUci || move.bestUci || '';
  if (!bestSan && !bestUci) return null;
  const playedPv = Array.isArray(move.verifiedPlayedPv) && move.verifiedPlayedPv[0] === move.uci
    ? move.verifiedPlayedPv.slice(0, 3) : [move.uci];
  const bestPv = Array.isArray(move.verifiedBestPv) && move.verifiedBestPv.length
    ? move.verifiedBestPv.slice(0, 3) : (bestUci ? [bestUci] : []);
  const cleanTrigger = triggerMove?.from && triggerMove?.to
    ? { from: String(triggerMove.from), to: String(triggerMove.to), san: String(triggerMove.san || '') }
    : null;
  return {
    id: trapId(profileId, move.fenBefore, move.uci),
    profileId,
    fenBefore: move.fenBefore,
    turn: move.turn || (move.fenBefore.split(/\s+/)[1] === 'b' ? 'b' : 'w'),
    moveNumber: move.moveNumber || 1,
    ply: move.ply || 0,
    uci: move.uci,
    playedUci: move.uci,
    san: move.san || move.uci,
    playedSan: move.san || move.uci,
    bestUci,
    bestSan,
    verifiedBestUci: bestUci,
    verifiedBestSan: bestSan,
    playedPv,
    verifiedPlayedPv: playedPv,
    bestPv,
    verifiedBestPv: bestPv,
    maiaTopSan: move.maiaTopSan || null,
    triggerMove: cleanTrigger,
    divergenceType: 'intuition_trap',
    divergenceStatus: 'confirmed',
    elo: Number.isInteger(review?.elo) ? review.elo : null,
    humanProb: Number.isFinite(move.humanRawProbability) ? move.humanRawProbability : null,
    eslLoss: move.verifiedExpectedScoreLoss,
    lossCp: Number.isFinite(move.verifiedLossCp) ? move.verifiedLossCp : (Number.isFinite(move.lossCp) ? move.lossCp : null),
    phase: detectPhase(move),
    source: {
      white: String(source.white || '').replace(/^⚪\s*/, '').trim(),
      black: String(source.black || '').replace(/^⚫\s*/, '').trim(),
      result: String(source.result || '*').trim(),
      date: String(source.date || '').trim(),
      url: String(source.url || '').trim()
    },
    srs: {
      stage: 0,
      streak: 0,
      attempts: 0,
      nextReviewAt: now,
      lastStatus: 'new',
      lastReviewedAt: null
    },
    createdAt: now
  };
}

function defaultProfile(now = Date.now()) {
  return {
    id: DEFAULT_PROFILE_ID,
    displayName: 'Default',
    aliases: [],
    accounts: [],
    createdAt: now,
    updatedAt: now
  };
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('profiles')) {
          db.createObjectStore('profiles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('traps')) {
          const traps = db.createObjectStore('traps', { keyPath: 'id' });
          traps.createIndex('by_profile', 'profileId', { unique: false });
        }
        if (!db.objectStoreNames.contains('checkups')) {
          const checkups = db.createObjectStore('checkups', { keyPath: 'id' });
          checkups.createIndex('by_profile', 'profileId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function txRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('Study transaction aborted'));
  });
}

export class StudyStore {
  db = null;
  persistent = false;
  persistRequested = false;
  memory = {
    profiles: new Map(),
    traps: new Map(),
    checkups: new Map()
  };

  constructor({ useIndexedDb = true } = {}) {
    this.useIndexedDb = useIndexedDb;
  }

  async init() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      if (this.useIndexedDb) {
        this.db = await openDatabase();
        this.persistent = !!this.db;
      }
      await this.writeProfile(DEFAULT_PROFILE_ID, existing => existing ? null : defaultProfile());
      return this;
    })();
    return this.readyPromise;
  }

  close() {
    this.db?.close();
    this.db = null;
    this.readyPromise = null;
  }

  requestPersistence() {
    if (this.persistRequested || !this.persistent) return;
    this.persistRequested = true;
    try {
      globalThis.navigator?.storage?.persist?.().catch(() => {});
    } catch { /* Optional storage persistence hint. */ }
  }

  async getAll(storeName) {
    if (!this.db) return [...this.memory[storeName].values()];
    const tx = this.db.transaction(storeName, 'readonly');
    return txRequest(tx.objectStore(storeName).getAll());
  }

  async get(storeName, id) {
    if (!this.db) return this.memory[storeName].get(id) ?? null;
    const tx = this.db.transaction(storeName, 'readonly');
    return (await txRequest(tx.objectStore(storeName).get(id))) ?? null;
  }

  async put(storeName, value) {
    this.requestPersistence();
    if (!this.db) {
      this.memory[storeName].set(value.id, structuredClone(value));
      return value;
    }
    const tx = this.db.transaction(storeName, 'readwrite');
    await txRequest(tx.objectStore(storeName).put(value));
    return value;
  }

  async delete(storeName, id) {
    if (!this.db) {
      this.memory[storeName].delete(id);
      return;
    }
    const tx = this.db.transaction(storeName, 'readwrite');
    await txRequest(tx.objectStore(storeName).delete(id));
  }

  getActiveProfileId() {
    try {
      return localStorage.getItem(ACTIVE_PROFILE_KEY) || DEFAULT_PROFILE_ID;
    } catch {
      return this._activeProfileId || DEFAULT_PROFILE_ID;
    }
  }

  setActiveProfileId(id) {
    const next = id || DEFAULT_PROFILE_ID;
    this._activeProfileId = next;
    try { localStorage.setItem(ACTIVE_PROFILE_KEY, next); } catch { /* Memory fallback. */ }
    return next;
  }

  async listProfiles() {
    const items = await this.getAll('profiles');
    return items.sort((a, b) => (a.id === DEFAULT_PROFILE_ID ? -1 : b.id === DEFAULT_PROFILE_ID ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  }

  async getActiveProfile() {
    await this.init();
    const id = this.getActiveProfileId();
    const profile = await this.get('profiles', id);
    if (profile) return profile;
    this.setActiveProfileId(DEFAULT_PROFILE_ID);
    return (await this.get('profiles', DEFAULT_PROFILE_ID)) || defaultProfile();
  }

  async writeProfile(id, update) {
    if (!this.db) {
      const record = update(this.memory.profiles.get(id));
      if (record) this.memory.profiles.set(id, structuredClone(record));
      return record;
    }
    const tx = this.db.transaction('profiles', 'readwrite');
    const store = tx.objectStore('profiles');
    const record = update(await txRequest(store.get(id)));
    if (!record) return record;
    this.requestPersistence();
    const committed = transactionDone(tx);
    store.put(record);
    await committed;
    return record;
  }

  async saveProfile({ id, displayName, aliases = [], account, moveFrom, transferCheckup }, now = Date.now()) {
    await this.init();
    const cleanName = String(displayName || '').trim();
    if (!cleanName) throw new Error('Profile name is required');
    const profileId = id || `profile_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const build = existing => ({
      ...existing,
      id: profileId,
      displayName: cleanName.slice(0, 40),
      aliases: parseAliases(aliases),
      accounts: account ? mergeAccounts(existing?.accounts, [account]) : existing?.accounts || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });
    if (!id && !moveFrom && account && typeof transferCheckup?.id === 'string') {
      return this.createProfileWithCheckup(build(), account, transferCheckup);
    }
    if (!moveFrom) return this.writeProfile(profileId, build);

    const key = accountKey(account);
    const tx = this.db?.transaction('profiles', 'readwrite');
    const store = tx?.objectStore('profiles');
    const from = store ? await txRequest(store.get(moveFrom)) : this.memory.profiles.get(moveFrom);
    if (!from?.accounts?.some(item => accountKey(item) === key)) throw new Error('Account is no longer linked');
    const target = id && (store ? await txRequest(store.get(id)) : this.memory.profiles.get(id));
    if (id && (!target || id === moveFrom || target.accounts?.some(item => item.platform === account.platform))) {
      throw new Error('The destination profile cannot accept this account');
    }
    const created = target
      ? { ...target, accounts: mergeAccounts(target.accounts, [account]), updatedAt: now }
      : build();
    const checkupReminders = { ...from.checkupReminders };
    if (checkupReminders[key]) created.checkupReminders = { ...created.checkupReminders, [key]: checkupReminders[key] };
    delete checkupReminders[key];
    const updated = {
      ...from,
      accounts: from.accounts.filter(item => accountKey(item) !== key),
      aliases: (from.aliases || []).filter(alias => normalizeAlias(alias) !== normalizeAlias(account.username)),
      checkupReminders,
      updatedAt: now
    };
    if (store) {
      const committed = transactionDone(tx);
      store.put(updated);
      if (target) store.put(created);
      else store.add(created);
      await committed;
    } else {
      this.memory.profiles.set(updated.id, structuredClone(updated));
      this.memory.profiles.set(created.id, structuredClone(created));
    }
    return created;
  }

  async createProfileWithCheckup(profile, account, { id, profileId }) {
    const tx = this.db?.transaction(['profiles', 'checkups'], 'readwrite');
    const reports = tx?.objectStore('checkups');
    const report = reports ? await txRequest(reports.get(id)) : this.memory.checkups.get(id);
    const matching = report?.profileId === profileId && checkupReportMatchesAccount(report, account);
    let moved;
    if (matching) {
      const scopeTrap = trap => ({
        ...trap, profileId: profile.id, id: trapId(profile.id, trap.fenBefore, trap.playedUci || trap.uci)
      });
      const scopeSummary = summary => ({
        ...(Array.isArray(summary.traps) ? { traps: summary.traps.map(scopeTrap) } : {}),
        ...(Array.isArray(summary.games) ? { games: summary.games.map(game => Array.isArray(game.trapEvidence)
          ? { ...game, trapEvidence: game.trapEvidence.map(scopeTrap) } : game) } : {})
      });
      const topTraps = (report.topTraps || []).map(scopeTrap);
      moved = {
        ...report, profileId: profile.id, topTraps, topTrapIds: topTraps.map(trap => trap.id),
        ...scopeSummary(report),
        ...(report.rolling ? { rolling: { ...report.rolling, ...scopeSummary(report.rolling) } } : {})
      };
      profile = restoreCheckupReminders(profile, [moved]);
    }
    if (tx) {
      this.requestPersistence();
      const committed = transactionDone(tx);
      tx.objectStore('profiles').add(profile);
      if (moved) reports.put(moved);
      await committed;
    } else {
      this.memory.profiles.set(profile.id, structuredClone(profile));
      if (moved) this.memory.checkups.set(id, structuredClone(moved));
    }
    return profile;
  }

  async loadCheckupProfile(id, { addAccount } = {}) {
    await this.init();
    const tx = this.db?.transaction(['profiles', 'checkups'], 'readwrite');
    const profiles = tx?.objectStore('profiles');
    const [existing, reports] = profiles ? await Promise.all([
      txRequest(profiles.get(id)),
      txRequest(tx.objectStore('checkups').index('by_profile').getAll(id))
    ]) : [this.memory.profiles.get(id), [...this.memory.checkups.values()].filter(report => report.profileId === id)];
    reports.sort(newestCheckups);
    if (!existing) return { profile: null, reports };
    const profile = restoreCheckupReminders(addAccount
      ? { ...existing, accounts: mergeAccounts(existing.accounts, [addAccount]) } : existing, reports);
    if (profile !== existing) {
      if (profiles) {
        this.requestPersistence();
        const committed = transactionDone(tx);
        profiles.put(profile);
        await committed;
      } else {
        this.memory.profiles.set(id, structuredClone(profile));
      }
    }
    return { profile, reports };
  }

  async setProfileElo(id, value, now = Date.now()) {
    const defaultElo = parseStudioElo(value);
    if (!defaultElo) throw new Error('Invalid Maia rating');
    await this.init();
    return this.writeProfile(id, profile => profile ? { ...profile, defaultElo, updatedAt: now } : null);
  }

  async setProfileAccount(id, platform, username, { remove = false } = {}) {
    const account = normalizeAccount(platform, username);
    if (!account) return null;
    if (!remove) return (await this.loadCheckupProfile(id, { addAccount: account })).profile;
    await this.init();
    return this.writeProfile(id, existing => {
      if (!existing) return null;
      const accounts = (existing.accounts || []).filter(item => accountKey(item) !== accountKey(account));
      const checkupReminders = { ...existing.checkupReminders };
      delete checkupReminders[accountKey(account)];
      return { ...existing, accounts, checkupReminders };
    });
  }

  async updateCheckupReminder(id, account, update) {
    await this.init();
    const key = accountKey(account);
    const profile = await this.writeProfile(id, existing => {
      if (!existing?.accounts?.some(item => accountKey(item) === key)) return null;
      const checkupReminders = { ...existing.checkupReminders };
      const previous = checkupReminders[key] || {};
      const next = update(previous);
      if (next === previous) return null;
      checkupReminders[key] = next;
      return { ...existing, checkupReminders };
    });
    return profile?.checkupReminders[key];
  }

  async setBackgroundCheckup(id, enabled) {
    await this.init();
    return this.writeProfile(id, existing => existing ? { ...existing, backgroundCheckup: enabled === true } : null);
  }

  async deleteProfile(id) {
    await this.init();
    if (!id || id === DEFAULT_PROFILE_ID) return false;
    await this.delete('profiles', id);
    const traps = await this.listTraps(id);
    for (const trap of traps) await this.delete('traps', trap.id);
    const checkups = await this.listCheckups(id);
    for (const item of checkups) await this.delete('checkups', item.id);
    if (this.getActiveProfileId() === id) this.setActiveProfileId(DEFAULT_PROFILE_ID);
    return true;
  }

  async listTraps(profileId = this.getActiveProfileId(), { filter = 'all', phase = 'all', sort = 'due', now = Date.now() } = {}) {
    await this.init();
    const all = (await this.getAll('traps')).filter(item => item.profileId === profileId);
    const filtered = all.filter(item => {
      if (phase !== 'all' && item.phase !== phase) return false;
      if (filter === 'due') return (item.srs?.nextReviewAt ?? 0) <= now;
      if (filter === 'mastered') return (item.srs?.stage ?? 0) >= 2 && (item.srs?.streak ?? 0) >= 2;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === 'loss') return (b.eslLoss ?? 0) - (a.eslLoss ?? 0) || (a.srs?.nextReviewAt ?? 0) - (b.srs?.nextReviewAt ?? 0);
      return (a.srs?.nextReviewAt ?? 0) - (b.srs?.nextReviewAt ?? 0) || (b.eslLoss ?? 0) - (a.eslLoss ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  }

  async getProfileStats(profileId = this.getActiveProfileId(), now = Date.now()) {
    await this.init();
    const all = (await this.getAll('traps')).filter(item => item.profileId === profileId);
    const dueByPhase = { opening: 0, middlegame: 0, endgame: 0 };
    let dueTotal = 0;
    let masteredTotal = 0;
    for (const item of all) {
      if ((item.srs?.nextReviewAt ?? 0) <= now) {
        dueTotal++;
        const p = item.phase || 'middlegame';
        if (p in dueByPhase) dueByPhase[p]++;
      }
      if ((item.srs?.stage ?? 0) >= 2 && (item.srs?.streak ?? 0) >= 2) masteredTotal++;
    }
    return { total: all.length, dueTotal, masteredTotal, dueByPhase };
  }

  async countDue(profileId = this.getActiveProfileId(), now = Date.now()) {
    return (await this.listTraps(profileId, { filter: 'due', now })).length;
  }

  async hasTrap(profileId, fenBefore, playedUci) {
    await this.init();
    return !!(await this.get('traps', trapId(profileId, fenBefore, playedUci)));
  }

  async upsertTrap(record) {
    await this.init();
    if (!record?.id || !record.fenBefore || !record.playedUci) return null;
    const existing = await this.get('traps', record.id);
    const merged = existing ? {
      ...record,
      srs: existing.srs,
      createdAt: existing.createdAt
    } : record;
    await this.put('traps', merged);
    if (!existing) {
      const profileTraps = await this.listTraps(record.profileId);
      if (profileTraps.length > MAX_TRAPS_PER_PROFILE) {
        const oldest = profileTraps.slice(MAX_TRAPS_PER_PROFILE);
        for (const item of oldest) await this.delete('traps', item.id);
      }
    }
    return { record: merged, added: !existing };
  }

  async removeTrap(id) {
    await this.init();
    await this.delete('traps', id);
  }

  async recordPracticeResult(id, status, now = Date.now()) {
    await this.init();
    const trap = await this.get('traps', id);
    if (!trap) return null;
    const updated = {
      ...trap,
      srs: computeNextSrs(trap.srs, status, now)
    };
    await this.put('traps', updated);
    return updated;
  }

  async saveCheckup(record) {
    await this.init();
    if (!record?.id || !record.profileId) return null;
    const account = checkupReportAccount(record);
    const ids = record.analyzedGameIds;
    if (account && ids?.length && this.db) {
      const key = accountKey(account);
      const tx = this.db.transaction(['profiles', 'checkups'], 'readwrite');
      const profiles = tx.objectStore('profiles');
      const profile = await txRequest(profiles.get(record.profileId));
      const committed = transactionDone(tx);
      if (profile?.accounts?.some(item => accountKey(item) === key)) {
        const checkupReminders = { ...profile.checkupReminders };
        checkupReminders[key] = markCheckupGames(checkupReminders[key], account.platform, ids, record.createdAt);
        profiles.put({ ...profile, checkupReminders });
      }
      tx.objectStore('checkups').put(record);
      await committed;
    } else {
      await this.put('checkups', record);
      if (account && ids?.length) await this.updateCheckupReminder(record.profileId, account,
        current => markCheckupGames(current, account.platform, ids, record.createdAt));
    }
    const all = await this.listCheckups(record.profileId);
    if (all.length > MAX_CHECKUPS_PER_PROFILE) {
      for (const old of all.slice(MAX_CHECKUPS_PER_PROFILE)) {
        await this.delete('checkups', old.id);
      }
    }
    return record;
  }

  async saveCheckupReviewEvidence(profileId, game, sides) {
    if (!profileId || !game?.platform || !game.gameId) return;
    await this.init();
    const key = `${game.platform}:${game.gameId}`;
    return this.writeProfile(profileId, profile => {
      if (!profile) return null;
      const reviews = new Map(Object.entries(profile.checkupReviews || {}));
      reviews.delete(key);
      reviews.set(key, sides);
      return { ...profile, checkupReviews: Object.fromEntries([...reviews].slice(-100)) };
    });
  }

  async listCheckups(profileId = this.getActiveProfileId()) {
    await this.init();
    return (await this.getAll('checkups'))
      .filter(item => item.profileId === profileId)
      .sort(newestCheckups);
  }

  async deleteCheckup(id) {
    await this.init();
    if (!id) return false;
    await this.delete('checkups', id);
    return true;
  }

  async exportBackup(now = Date.now()) {
    await this.init();
    return {
      version: 1,
      exportedAt: new Date(now).toISOString(),
      activeProfileId: this.getActiveProfileId(),
      profiles: (await this.listProfiles()).map(({ checkupReminders, backgroundCheckup, checkupReviews, ...profile }) => profile),
      traps: await this.getAll('traps'),
      checkups: await this.getAll('checkups')
    };
  }

  async importBackup(payload, now = Date.now()) {
    await this.init();
    if (!payload || typeof payload !== 'object' || payload.version !== 1) {
      throw new Error('Invalid backup format');
    }
    let profilesAdded = 0;
    let trapsAdded = 0;
    let trapsUpdated = 0;
    for (const incoming of Array.isArray(payload.profiles) ? payload.profiles : []) {
      if (!incoming?.id || !incoming?.displayName) continue;
      const id = String(incoming.id);
      await this.writeProfile(id, existing => {
        if (!existing) profilesAdded++;
        const shouldAdoptName = !existing ||
          (id === DEFAULT_PROFILE_ID && existing.displayName === 'Default' && incoming.displayName !== 'Default') ||
          (Number.isFinite(incoming.updatedAt) && incoming.updatedAt >= (existing.updatedAt || 0));
        const defaultElo = parseStudioElo(incoming.defaultElo);
        return {
          ...existing,
          ...(defaultElo && (shouldAdoptName || !existing?.defaultElo) ? { defaultElo } : {}),
          id,
          displayName: shouldAdoptName ? String(incoming.displayName).slice(0, 40) : existing.displayName,
          aliases: parseAliases([...(existing?.aliases || []), ...parseAliases(incoming.aliases)]),
          accounts: mergeAccounts(existing?.accounts, incoming.accounts),
          createdAt: existing?.createdAt ?? (Number.isFinite(incoming.createdAt) ? incoming.createdAt : now),
          updatedAt: Math.max(existing?.updatedAt || 0, Number.isFinite(incoming.updatedAt) ? incoming.updatedAt : now)
        };
      });
    }
    if (payload.activeProfileId && await this.get('profiles', String(payload.activeProfileId))) {
      this.setActiveProfileId(String(payload.activeProfileId));
    }
    for (const incoming of Array.isArray(payload.traps) ? payload.traps : []) {
      if (!incoming?.fenBefore || !(incoming?.playedUci || incoming?.uci)) continue;
      const profileId = String(incoming.profileId || DEFAULT_PROFILE_ID);
      const playedUci = String(incoming.playedUci || incoming.uci);
      const id = trapId(profileId, incoming.fenBefore, playedUci);
      const existing = await this.get('traps', id);
      if (!existing) {
        await this.put('traps', { ...incoming, id, profileId, playedUci, uci: playedUci });
        trapsAdded++;
      } else {
        const incStreak = incoming.srs?.streak ?? 0;
        const extStreak = existing.srs?.streak ?? 0;
        const incStage = incoming.srs?.stage ?? 0;
        const extStage = existing.srs?.stage ?? 0;
        const incReviewed = incoming.srs?.lastReviewedAt ?? 0;
        const extReviewed = existing.srs?.lastReviewedAt ?? 0;
        const incomingProgress = incStreak > extStreak ||
          (incStreak === extStreak && (incStage > extStage || (incStage === extStage && incReviewed > extReviewed)));
        if (incomingProgress) {
          await this.put('traps', { ...existing, srs: incoming.srs });
          trapsUpdated++;
        }
      }
    }
    const checkupProfiles = new Set();
    for (const incoming of Array.isArray(payload.checkups) ? payload.checkups : []) {
      if (!incoming?.id || !incoming?.profileId) continue;
      if (!(await this.get('checkups', String(incoming.id)))) {
        await this.put('checkups', incoming);
        checkupProfiles.add(String(incoming.profileId));
      }
    }
    for (const pid of checkupProfiles) {
      const all = await this.listCheckups(pid);
      if (all.length > MAX_CHECKUPS_PER_PROFILE) {
        for (const old of all.slice(MAX_CHECKUPS_PER_PROFILE)) {
          await this.delete('checkups', old.id);
        }
      }
    }
    return { profilesAdded, trapsAdded, trapsUpdated };
  }
}
