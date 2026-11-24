import { ChessBoard } from '../../engine/chess-core.js';
import { GameAnalyzer } from '../../engine/game-analyzer.js';

const finishedResults = new Set(['1-0', '0-1', '1/2-1/2']);
const officialId = /^[a-z\d]{8}$/i;
const tag = (pgn, key) => pgn.match(new RegExp(`^\\[${key} "([^"]*)"\\]$`, 'm'))?.[1];

export function fallbackRounds(event) {
  return event.roundIds.map((id, i) => ({
    id, name: 'Game ' + (i + 1), number: i + 1,
    startsAt: event.startsAt + [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17][i] * 86400000
  }));
}

export function normalizeRounds(data, event) {
  if (data.tour?.id !== event.tournamentId || !Array.isArray(data.rounds)) {
    throw new Error('Unexpected broadcast tournament');
  }
  const fallback = fallbackRounds(event);
  const rounds = new Map(fallback.map(round => [round.id, round]));
  for (const round of data.rounds) {
    if (!officialId.test(round.id || '') || typeof round.name !== 'string') continue;
    const known = rounds.get(round.id);
    rounds.set(round.id, {
      id: round.id, name: round.name.slice(0, 80),
      number: Number(round.name.match(/^Game\s+(\d+)$/i)?.[1]) || known?.number || null,
      startsAt: Number.isFinite(round.startsAt) ? round.startsAt : known?.startsAt ?? null,
      ongoing: round.ongoing === true,
      finished: round.finished === true,
      source: 'https://lichess.org/broadcast/' + event.tournamentSlug + '/-/' + round.id
    });
  }
  return [...rounds.values()].sort((left, right) =>
    (left.number ?? Infinity) - (right.number ?? Infinity) ||
    (left.startsAt ?? Infinity) - (right.startsAt ?? Infinity));
}

function parseGame(pgn, event) {
  if (!pgn || !tag(pgn, 'White') || !tag(pgn, 'Black')) throw new Error('Incomplete broadcast PGN');
  if ((tag(pgn, 'Variant') || 'Standard') !== 'Standard') throw new Error('Unsupported broadcast variant');
  const parsed = GameAnalyzer.parsePgn(pgn, { clocks: true });
  const positions = GameAnalyzer.buildPositionChain(parsed);
  if (positions.isPartial || positions.length !== parsed.length + 1) throw new Error('Illegal broadcast move');
  const moves = positions.slice(1).map((position, i) => ({
    ply: position.ply, san: position.san, uci: position.uci,
    turn: position.turn, moveNumber: position.moveNumber, fen: position.fen,
    clk: parsed[i].clockSeconds ?? null
  }));
  const player = (side) => {
    const id = tag(pgn, side + 'FideId') || null;
    const configured = event.players.find(candidate => candidate.id === id);
    const name = side === 'White' ? parsed.white : parsed.black;
    const rating = Number(tag(pgn, side + 'Elo'));
    return { id, name: configured?.name || name, nameEn: configured?.nameEn || name,
      rating: Number.isSafeInteger(rating) && rating > 0 ? rating : null };
  };
  const result = finishedResults.has(parsed.result) ? parsed.result : '*';
  // Keep the played-position identity separate from timing and PGN annotations.
  return {
    white: player('White'), black: player('Black'), result, moves, pgn,
    initialFen: positions[0]?.fen || ChessBoard.INITIAL_FEN,
    fen: positions.at(-1)?.fen || ChessBoard.INITIAL_FEN
  };
}

function splitGames(pgn) {
  return pgn.trim() ? pgn.trim().replaceAll('\r\n', '\n').split(/\n\s*\n(?=\[Event ")/) : [];
}

export function parseRoundPgn(pgn, event) {
  const games = splitGames(pgn).filter(game => {
    if (game === '*') return false;
    const unnamed = !tag(game, 'White') || !tag(game, 'Black');
    return !unnamed || tag(game, 'Result') !== '*' || GameAnalyzer.parsePgn(game).length > 0;
  });
  if (games.length > 20) throw new Error('Too many broadcast games');
  return games.map(game => parseGame(game, event));
}

export function parseFinishedRounds(pgn, event, rounds) {
  const ids = new Set(rounds.map(round => round.id));
  const byRound = new Map();
  const prefix = 'https://lichess.org/broadcast/' + event.tournamentSlug + '/';
  for (const game of splitGames(pgn)) {
    const url = tag(game, 'BroadcastURL');
    if (!url?.startsWith(prefix)) continue;
    const [slug, id, extra] = url.slice(prefix.length).replace(/\/$/, '').split('/');
    if (!slug || extra !== undefined || !ids.has(id)) continue;
    if (!byRound.has(id)) byRound.set(id, []);
    byRound.get(id).push(game);
  }
  const finished = new Map();
  for (const [id, games] of byRound) {
    try {
      const parsed = parseRoundPgn(games.join('\n\n'), event);
      if (completeSnapshot({ games: parsed })) finished.set(id, parsed);
    } catch {
      // The per-round endpoint can backfill this round on a later refresh.
    }
  }
  return finished;
}

export function completeSnapshot(snapshot) {
  return !!snapshot?.games.length && snapshot.games.every(game => finishedResults.has(game.result));
}

export function roundStatus(round, snapshot, now) {
  if (round.finished || completeSnapshot(snapshot)) return 'finished';
  if (snapshot?.games.some(game => game.moves.length)) return 'live';
  if (round.ongoing) return 'waiting';
  return round.startsAt != null && now < round.startsAt ? 'scheduled' : 'waiting';
}

export function activeRound(rounds, snapshots, now) {
  const available = rounds.filter(round => roundStatus(round, snapshots.get(round.id), now) !== 'finished');
  return available.findLast(round => round.ongoing)
    || available.findLast(round => snapshots.get(round.id)?.games.some(game => game.moves.length))
    || available.findLast(round => round.startsAt != null && round.startsAt <= now)
    || null;
}

export function eventView(eventId, event, rounds, snapshots, now) {
  const score = Object.fromEntries(event.players.map(({ id }) => [id, 0]));
  let incomplete = false;
  for (const round of rounds) {
    if (!round.number) continue;
    const game = snapshots.get(round.id)?.games[0];
    if (round.finished && (!game || !finishedResults.has(game.result))) incomplete = true;
    if (!game || !finishedResults.has(game.result)) continue;
    if (!Object.hasOwn(score, game.white.id) || !Object.hasOwn(score, game.black.id)) {
      incomplete = true;
      continue;
    }
    score[game.white.id] += game.result === '1-0' ? 1 : game.result === '1/2-1/2' ? 0.5 : 0;
    score[game.black.id] += game.result === '0-1' ? 1 : game.result === '1/2-1/2' ? 0.5 : 0;
  }
  const active = activeRound(rounds, snapshots, now);
  const won = Object.values(score).some(points => points >= 7.5);
  return {
    eventId, enabled: event.enabled && now < event.hideAfter, title: event.title, titleEn: event.titleEn,
    source: event.source, startsAt: event.startsAt, players: event.players, score, scoreIncomplete: incomplete,
    activeRoundId: won ? null : active?.id ?? null,
    rounds: rounds.map(round => {
      const snapshot = snapshots.get(round.id);
      const status = roundStatus(round, snapshot, now);
      return {
        id: round.id, name: round.name, number: round.number, startsAt: round.startsAt,
        source: round.source ?? 'https://lichess.org/broadcast/' + event.tournamentSlug + '/-/' + round.id,
        status: won && (status === 'scheduled' || status === 'waiting') ? 'cancelled' : status,
        ongoing: status !== 'finished' && (status === 'live' || round.ongoing === true), finished: status === 'finished',
        result: snapshot?.games[0]?.result ?? '*'
      };
    })
  };
}
