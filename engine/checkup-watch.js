export const CHECKUP_GAME_LIMIT = 10;
export const CHECKUP_REFRESH_MS = 30 * 60_000;
export const CHECKUP_FAILURE_MS = 15 * 60_000;
export const CHECKUP_ALARM_MINUTES = 6 * 60;
export const CHECKUP_BACKGROUND_KEY = 'divergeCheckupBackground';
export const LICHESS_CHECKUP_SPEEDS = 'bullet,blitz,rapid,classical';

export function isCheckupReminderToken(value) {
  return typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
}

const LICHESS_FINISHED = new Set(['mate', 'resign', 'stalemate', 'timeout', 'draw', 'outoftime', 'cheat', 'variantEnd']);

export function checkupGameId(platform, source) {
  if (typeof source !== 'string') return null;
  if (platform === 'lichess') return /^[a-zA-Z0-9]{8}$/.test(source) ? source : null;
  if (platform !== 'chesscom') return null;
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || !['chess.com', 'www.chess.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/game\/(live|daily)\/(\d{1,16})\/?$/);
    return match ? `${match[1]}:${match[2]}` : null;
  } catch {
    return null;
  }
}

export function checkupGameIds(platform, ids, limit = 100) {
  const pattern = platform === 'lichess' ? /^[a-zA-Z0-9]{8}$/ : /^(?:live|daily):\d{1,16}$/;
  return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && pattern.test(id)))].slice(0, limit) : [];
}

export function mergeCheckupObservation(record = {}, observation) {
  if (!observation || observation.checkedAt <= (record.checkedAt || 0)) return record;
  return {
    ...record,
    games: observation.games,
    checkedAt: observation.checkedAt,
    baseline: record.baseline || (record.diagnosed?.length ? [] : observation.games.map(game => game.id)),
    baselineAt: record.baselineAt || observation.checkedAt,
    retryAt: 0
  };
}

// Page owns the completed diagnosis records. The newer observation can come from either context.
export function mergeCheckupSnapshot(record = {}, remote = {}) {
  if ((remote.checkedAt || 0) > (record.checkedAt || 0)) {
    record = { ...record, games: remote.games, checkedAt: remote.checkedAt, retryAt: 0 };
  }
  if (remote.baseline && (!record.baseline || remote.baselineAt < record.baselineAt)) {
    record = { ...record, baseline: remote.baseline, baselineAt: remote.baselineAt };
  }
  return record;
}

export function checkupSubscriptionKey({ profileId, platform, username }) {
  return JSON.stringify([profileId, platform, username.toLowerCase()]);
}

export function sanitizeCheckupSnapshot(platform, input, now = Date.now()) {
  const timestamp = value => Number.isSafeInteger(value) && value > 0 && value <= now ? value : 0;
  const checkedAt = timestamp(input?.checkedAt);
  const baselineAt = timestamp(input?.baselineAt);
  const games = Array.isArray(input?.games) ? input.games.slice(0, CHECKUP_GAME_LIMIT).filter(game =>
    game && timestamp(game.at) && checkupGameIds(platform, [game.id]).length
  ).map(({ id, at }) => ({ id, at })) : [];
  return {
    games: checkedAt ? games : [],
    checkedAt,
    ...(baselineAt ? { baselineAt, baseline: checkupGameIds(platform, input.baseline, CHECKUP_GAME_LIMIT) } : {}),
    diagnosed: checkupGameIds(platform, input?.diagnosed),
    lastDiagnosedAt: timestamp(input?.lastDiagnosedAt)
  };
}

export function hasNewCheckupGames(record) {
  if (!record?.games?.length) return false;
  const seen = new Set([...(record.baseline || []), ...(record.diagnosed || [])]);
  return record.games.some(game => !seen.has(game.id));
}

export function markCheckupGames(record = {}, platform, ids, timestamp) {
  return {
    ...record,
    diagnosed: checkupGameIds(platform, [...ids, ...(record.diagnosed || [])]),
    lastDiagnosedAt: Math.max(timestamp, record.lastDiagnosedAt || 0)
  };
}

export function checkupProbeDue(record, maxAge, now = Date.now()) {
  return (record?.retryAt || 0) <= now && now - (record?.checkedAt || 0) >= maxAge;
}

function requireArchiveResponse(response) {
  if (response.ok) return response;
  const error = new Error(`Archive HTTP ${response.status}`);
  const retryAfter = response.headers.get('Retry-After');
  const seconds = Number(retryAfter);
  error.retryAt = retryAfter && Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter);
  throw error;
}

export async function chesscomCheckupArchives(username, { fetchImpl = fetch, signal, now = Date.now(), limit = 6 } = {}) {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/`;
  const index = await requireArchiveResponse(await fetchImpl(base + 'archives', { signal })).json();
  if (!Array.isArray(index.archives)) throw new Error('Invalid monthly archive index');
  const months = index.archives
    .filter(url => typeof url === 'string' && url.startsWith(base) && /^\d{4}\/\d{2}$/.test(url.slice(base.length)))
    .sort().reverse();
  // Try the current month even if the archives index has not caught up after rollover.
  const currentMonth = base + new Date(now).toISOString().slice(0, 7).replace('-', '/');
  return [...new Set([currentMonth, ...months])].slice(0, limit).map(url => ({
    url, mayBeEmpty: url === currentMonth && !months.includes(url)
  }));
}

export async function fetchCheckupObservation(account, { signal, fetchImpl = fetch, now = Date.now() } = {}) {
  const { platform } = account;
  const username = String(account.username).trim().toLowerCase();
  if (!['lichess', 'chesscom'].includes(platform) || !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(username)) {
    throw new Error('Invalid platform account');
  }
  const options = { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) };
  const games = [];
  if (platform === 'lichess') {
    const query = new URLSearchParams({
      max: String(CHECKUP_GAME_LIMIT), finished: 'true', ongoing: 'false', moves: 'false',
      tags: 'false', clocks: 'false', evals: 'false', perfType: LICHESS_CHECKUP_SPEEDS
    });
    const response = requireArchiveResponse(await fetchImpl(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${query}`, {
      ...options, headers: { Accept: 'application/x-ndjson' }
    }));
    for (const line of (await response.text()).split('\n')) {
      if (!line.trim()) continue;
      const item = JSON.parse(line);
      const id = checkupGameId(platform, item.id);
      const at = item.lastMoveAt || item.createdAt;
      if (id && Number.isFinite(at) && item.variant === 'standard' && LICHESS_FINISHED.has(item.status)) games.push({ id, at });
    }
  } else {
    const archives = await chesscomCheckupArchives(username, { fetchImpl, ...options, now, limit: 3 });
    for (const { url, mayBeEmpty } of archives) {
      const response = await fetchImpl(url, options);
      if (response.status === 404 && mayBeEmpty) continue;
      const archive = await requireArchiveResponse(response).json();
      if (!Array.isArray(archive.games)) throw new Error('Invalid monthly archive');
      for (const item of archive.games) {
        const id = checkupGameId(platform, item.url);
        const at = item.end_time * 1000;
        if (id && Number.isFinite(at) && at > 0 && item.rules === 'chess') games.push({ id, at });
      }
      if (games.length >= CHECKUP_GAME_LIMIT) break;
    }
  }
  games.sort((a, b) => b.at - a.at);
  const unique = new Map();
  for (const game of games) if (!unique.has(game.id)) unique.set(game.id, game);
  return { checkedAt: now, games: [...unique.values()].slice(0, CHECKUP_GAME_LIMIT) };
}
