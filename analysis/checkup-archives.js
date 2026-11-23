import { FairPlayGuard } from '../content/fair-play-guard.js?v=20261025-v115';
import { GameAnalyzer } from '../engine/game-analyzer.js?v=20261123-checkup-fit';
import { readPgnTags } from '../engine/chess-notation.js?v=20261120-import';
import { CHECKUP_GAME_LIMIT, LICHESS_CHECKUP_SPEEDS, checkupGameId, chesscomCheckupArchives } from '../engine/checkup-watch.js?v=20261123-checkup-fit';
import { normalizeAlias, perspectiveNames } from './study-store.js?v=20261123-checkup-fit';

export const MAX_LOCAL_GAMES = 15;

export function parsePgnMeta(pgnText = '') {
  const read = tag => pgnText.match(new RegExp(`^\\[${tag}\\s+"([^"]*)"\\]`, 'im'))?.[1]?.trim() || '';
  const site = read('Site');
  return {
    white: read('White'),
    black: read('Black'),
    result: read('Result') || '*',
    date: read('Date'),
    url: site.startsWith('http') ? site : '',
    site
  };
}

export function checkupGameContext(pgn, { source, publicGameUrl, orientation, white, black } = {}) {
  if (!pgn || !FairPlayGuard.verifyConcludedGame(pgn).ok) return null;
  const meta = parsePgnMeta(pgn);
  const link = pgn.match(/^\[Link\s+"([^"]*)"\]/im)?.[1];
  const urls = [publicGameUrl, meta.url, link].flatMap(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? [url] : [];
    } catch {
      return [];
    }
  });
  const site = urls.find(url => ['www.chess.com', 'chess.com', 'lichess.org'].includes(url.hostname))?.hostname || meta.site.toLowerCase();
  const platform = ['chesscom', 'lichess'].includes(source) ? source
    : /(^|\.)chess\.com$/.test(site) ? 'chesscom'
    : /(^|\.)lichess\.org$|^lichess$/.test(site) ? 'lichess' : null;
  if (!platform) return null;
  const cleanName = name => {
    const value = String(name || '').trim();
    return /^[a-z0-9][a-z0-9_-]*$/i.test(value) && !/^(?:white|black|anonymous|guest)$/i.test(value) ? value : '';
  };
  return {
    platform,
    orientation,
    gameId: urls.map(url => platform === 'lichess'
      ? url.hostname === 'lichess.org' && checkupGameId(platform, url.pathname.match(/^\/([a-z0-9]{8})(?:\/(?:white|black))?\/?$/i)?.[1])
      : checkupGameId(platform, url.href)).find(Boolean) || null,
    gameRef: GameAnalyzer.hashString(pgn),
    white: cleanName(meta.white) || cleanName(white),
    black: cleanName(meta.black) || cleanName(black)
  };
}

export function suggestCheckupPlayer(game, profile) {
  if (!game) return '';
  const aliases = new Set(perspectiveNames(profile, game.platform).map(normalizeAlias));
  const matches = [game.white, game.black].filter(name => name && aliases.has(normalizeAlias(name)));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return '';
  return ['white', 'black'].includes(game.orientation) ? game[game.orientation] : '';
}

export function splitMultiPgn(text = '') {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const chunks = normalized.split(/(?=^\[Event\s+")/m).map(s => s.trim()).filter(Boolean);
  return chunks.length ? chunks : [normalized];
}

export function detectBatchPlayer(games = [], profile = null) {
  const counts = new Map();
  const display = new Map();
  const add = (name) => {
    const key = normalizeAlias(name);
    if (!key || key === 'white' || key === 'black' || key === '?') return;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!display.has(key)) display.set(key, name.trim());
  };
  for (const game of games) {
    const meta = game.meta || parsePgnMeta(game.pgn || '');
    add(meta.white);
    add(meta.black);
  }
  const candidates = [...counts.entries()]
    .map(([key, count]) => ({ key, name: display.get(key), count }))
    .sort((a, b) => b.count - a.count);

  const profileNames = [...(profile?.aliases || []), ...(profile?.accounts || []).map(account => account.username)];
  const aliasKeys = new Set(profileNames.map(normalizeAlias).filter(Boolean));
  const aliasMatch = candidates.find(item => aliasKeys.has(item.key));
  return {
    suggestedName: aliasMatch?.name || candidates[0]?.name || '',
    matchedAlias: aliasMatch?.name || null,
    candidates
  };
}

function chesscomOpeningName(link) {
  if (!link) return '';
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' || !['chess.com', 'www.chess.com'].includes(url.hostname) ||
        url.port || url.username || url.password) return '';
    const slug = url.pathname.match(/^\/openings\/([^/]+)\/?$/)?.[1];
    if (!slug) return '';
    // Chess.com can append a PGN continuation such as "-3.e3-Nf6" to the title.
    const title = decodeURIComponent(slug).split(/(?:^|-)\d+\./, 1)[0];
    return /^[\p{L}\p{N}][\p{L}\p{M}\p{N}.'’ -]*$/u.test(title) ? title.replaceAll('-', ' ').trim() : '';
  } catch {
    return '';
  }
}

function archivedCheckupGame(platform, item, pgn, result) {
  const tags = readPgnTags(pgn);
  const meta = parsePgnMeta(pgn);
  const loser = result === '1-0' ? item.black : result === '0-1' ? item.white : null;
  const initial = tags.timecontrol?.match(/^(\d+)(?:[+|]\d+)?$/)?.[1];
  const explicitOpening = [item.opening?.name, tags.opening]
    .map(name => typeof name === 'string' ? name.trim() : '')
    .find(name => name && !/^(?:[?*-]|unknown)$/i.test(name));
  return {
    pgn,
    gameId: checkupGameId(platform, platform === 'lichess' ? item.id : item.url),
    clocks: Array.isArray(item.clocks) ? item.clocks : null,
    meta: {
      ...meta, result, timeClass: item.speed || item.time_class || '',
      eco: item.opening?.eco || tags.eco || '',
      opening: explicitOpening || chesscomOpeningName(tags.ecourl),
      termination: item.status?.name || item.status || loser?.result || tags.termination || '',
      initialSeconds: item.clock?.initial ?? (initial !== undefined ? Number(initial) : null)
    }
  };
}

function lichessCheckupGames(text, max) {
  const games = [];
  for (const line of text.split('\n')) {
    let item;
    try { item = JSON.parse(line); } catch { continue; }
    if (!item?.pgn || (item.variant && item.variant !== 'standard')) continue;
    const verdict = FairPlayGuard.verifyConcludedGame(item);
    if (!verdict.ok) continue;
    games.push(archivedCheckupGame('lichess', item, item.pgn, verdict.result));
    if (games.length >= max) break;
  }
  return games;
}

export async function fetchLichessRecentGames(username, { max = CHECKUP_GAME_LIMIT, clocks = false, signal, fetchImpl = fetch } = {}) {
  const clean = String(username || '').trim();
  if (!clean) throw new Error('Username is required');
  const query = new URLSearchParams({ max: String(max), pgnInJson: 'true', clocks: String(clocks),
    opening: String(clocks), evals: 'false', finished: 'true', ongoing: 'false', perfType: LICHESS_CHECKUP_SPEEDS });
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(clean)}?${query}`;
  const useBrowserProxy = fetchImpl === fetch && typeof location !== 'undefined' && location.protocol.startsWith('http');
  if (useBrowserProxy) {
    const proxyUrl = `/api/lichess?username=${encodeURIComponent(clean)}&max=${max}${clocks ? '&clocks=true' : ''}`;
    try {
      const resp = await fetchImpl(proxyUrl, { signal, cache: 'no-store' });
      const contentType = resp.headers?.get?.('content-type') || '';
      if (resp.ok) return lichessCheckupGames(await resp.text(), max);
      if ((contentType.includes('ndjson') || contentType.includes('json')) && resp.status === 404) throw new Error('Lichess HTTP 404');
    } catch (err) {
      if (err?.name === 'AbortError' || String(err?.message).includes('Lichess HTTP 404')) throw err;
    }
  }
  const resp = await fetchImpl(url, { headers: { Accept: 'application/x-ndjson' }, signal });
  if (!resp.ok) throw new Error(`Lichess HTTP ${resp.status}`);
  return lichessCheckupGames(await resp.text(), max);
}

export async function fetchChesscomRecentGames(username, { max = CHECKUP_GAME_LIMIT, signal, fetchImpl = fetch } = {}) {
  const clean = String(username || '').trim().toLowerCase();
  if (!clean) throw new Error('Username is required');
  const archives = await chesscomCheckupArchives(clean, { signal, fetchImpl, limit: max > CHECKUP_GAME_LIMIT ? 12 : 6 });
  const games = [];
  const seen = new Set();
  for (const { url } of archives) {
    const resp = await fetchImpl(url, { signal });
    if (!resp.ok) continue;
    const data = await resp.json();
    const list = Array.isArray(data?.games) ? data.games.slice().reverse() : [];
    for (const item of list) {
      if (item.rules && item.rules !== 'chess') continue;
      if (!item.pgn) continue;
      const verdict = FairPlayGuard.verifyConcludedGame({ pgn: item.pgn, isFinished: true, status: 'finished' });
      if (!verdict.ok) continue;
      const game = archivedCheckupGame('chesscom', item, item.pgn, verdict.result);
      if (game.gameId && seen.has(game.gameId)) continue;
      if (game.gameId) seen.add(game.gameId);
      games.push(game);
      if (games.length >= max) return games;
    }
  }
  return games;
}

export function checkupReplayUrl(platform, id) {
  if (platform === 'lichess' && checkupGameId(platform, id)) return `https://lichess.org/${id}`;
  const match = platform === 'chesscom' && typeof id === 'string' && id.match(/^(live|daily):(\d{1,16})$/);
  return match ? `https://www.chess.com/game/${match[1]}/${match[2]}` : null;
}

export function checkupSourceType(sourceLabel = '') {
  if (sourceLabel === 'local-pgn-batch') return 'local';
  const prefix = String(sourceLabel || '').split(':')[0];
  return ['lichess', 'chesscom'].includes(prefix) ? prefix : 'local';
}
