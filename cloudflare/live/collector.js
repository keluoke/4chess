import { LIVE_EVENTS } from './events.js';
import { activeRound, completeSnapshot, eventView, fallbackRounds, normalizeRounds, parseFinishedRounds, parseRoundPgn, roundStatus } from './model.js';

const META_INTERVAL = 60_000;
const ROUND_INTERVAL = 12_000;
const CLOSED_INTERVAL = 300_000;
const MAX_BODY = 512 * 1024;

export class LiveCollector {
  constructor(ctx, env) {
    this.storage = ctx.storage;
    this.snapshots = new Map();
    this.meta = new Map();
    this.backfillAfter = new Map();
    this.roundRetryAfter = new Map();
    this.retryUntil = 0;
    this.upstream = env.LICHESS_TEST_ORIGIN || 'https://lichess.org';
    this.pending = Promise.resolve();
    this.inflight = new Map();
    ctx.blockConcurrencyWhile(async () => {
      for (const [key, value] of await this.storage.list()) {
        if (key === 'retryUntil') this.retryUntil = value;
        if (key.startsWith('meta:')) this.meta.set(key.slice(5), value);
        if (key.startsWith('round:')) this.snapshots.set(key.slice(6), value);
      }
    });
  }

  async readSource(path, accept) {
    if (Date.now() < this.retryUntil) throw new Error('Broadcast source cooling down');
    try {
      const response = await fetch(this.upstream + path, {
        headers: { Accept: accept, 'User-Agent': 'DivergeChess Live (+https://4chess.cc)' },
        signal: AbortSignal.timeout(6000),
        redirect: 'manual'
      });
      if (response.status === 429) {
        const header = response.headers.get('Retry-After');
        const retryAfter = /^\d+$/.test(header || '') ? Date.now() + Number(header) * 1000 : Date.parse(header);
        this.retryUntil = Math.max(Date.now() + 60_000, retryAfter || 0);
        await this.storage.put('retryUntil', this.retryUntil);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Broadcast source HTTP ' + response.status);
      }

      if (!response.body) return '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let size = 0, body = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) {
          await reader.cancel();
          throw new Error('Broadcast response too large');
        }
        body += decoder.decode(value, { stream: true });
      }
      return body + decoder.decode();
    } catch (error) {
      this.retryUntil = Math.max(this.retryUntil, Date.now() + ROUND_INTERVAL);
      throw error;
    }
  }

  roundKey(eventId, roundId) {
    return eventId + '/' + roundId;
  }

  async refreshRound(eventId, event, round) {
    const key = this.roundKey(eventId, round.id);
    const old = this.snapshots.get(key);
    const now = Date.now();
    const status = roundStatus(round, old, now);
    if (status === 'scheduled' && round.startsAt - now > 30_000) return false;
    if (now < (this.roundRetryAfter.get(key) ?? 0)) throw new Error('Round PGN cooling down');
    const interval = status === 'finished' && completeSnapshot(old) ? CLOSED_INTERVAL : ROUND_INTERVAL;
    if (old && now - old.checkedAt < interval) return false;

    const pgn = await this.readSource('/api/broadcast/round/' + round.id + '.pgn?clocks=true&comments=true', 'application/x-chess-pgn');
    let games;
    try {
      games = parseRoundPgn(pgn, event);
      if ((completeSnapshot(old) || old?.games.some(game => game.moves.length)) && games.every(game => !game.moves.length && game.result === '*')) {
        throw new Error('Broadcast dropped its published moves');
      }
    } catch (error) {
      this.roundRetryAfter.set(key, Date.now() + ROUND_INTERVAL);
      throw error;
    }
    await this.saveRound(key, games.length ? games : old?.games ?? []);
  }

  async saveRound(key, games) {
    const old = this.snapshots.get(key);
    const changed = old?.games.map(game => game.pgn).join('\n\n') !== games.map(game => game.pgn).join('\n\n');
    const record = { games, updatedAt: games.length && changed ? Date.now() : old?.updatedAt ?? null, checkedAt: Date.now() };
    await this.storage.put('round:' + key, record);
    this.snapshots.set(key, record);
  }

  async refreshFinishedRounds(eventId, event, rounds) {
    this.backfillAfter.set(eventId, Date.now() + META_INTERVAL);
    const pgn = await this.readSource('/api/broadcast/' + event.tournamentId + '.pgn?clocks=true&comments=true', 'application/x-chess-pgn');
    for (const [id, games] of parseFinishedRounds(pgn, event, rounds)) {
      await this.saveRound(this.roundKey(eventId, id), games);
    }
  }

  forEvent(eventId, rounds) {
    return new Map(rounds.map(({ id }) => [id, this.snapshots.get(this.roundKey(eventId, id))]));
  }

  async dispatch(url) {
    const eventId = url.searchParams.get('event');
    if (!Object.hasOwn(LIVE_EVENTS, eventId)) return new Response(null, { status: 404 });
    const event = LIVE_EVENTS[eventId];
    const wantsEvent = url.pathname === '/event';
    const roundId = url.searchParams.get('round');
    const now = Date.now();
    let stale = false;
    let meta = this.meta.get(eventId);
    const known = meta?.rounds || fallbackRounds(event);
    if (!wantsEvent && !known.some(round => round.id === roundId)) return new Response(null, { status: 404 });

    // Keep all Lichess traffic serialized, including metadata discovery and score backfill.
    if (event.enabled && (!meta || (wantsEvent && now - meta.checkedAt >= META_INTERVAL))) {
      try {
        const json = await this.readSource('/api/broadcast/' + event.tournamentId, 'application/json');
        meta = { rounds: normalizeRounds(JSON.parse(json), event), checkedAt: Date.now() };
        await this.storage.put('meta:' + eventId, meta);
        this.meta.set(eventId, meta);
      } catch (error) {
        stale = true;
        if (Date.now() >= this.retryUntil) this.retryUntil = Date.now() + ROUND_INTERVAL;
        if (!meta && error.message !== 'Broadcast source cooling down') console.warn('Broadcast metadata unavailable:', error.message);
      }
    }

    const rounds = meta?.rounds || fallbackRounds(event);
    const snapshots = this.forEvent(eventId, rounds);
    if (wantsEvent) {
      const pending = rounds.filter(round => round.finished && !completeSnapshot(snapshots.get(round.id)));
      const active = activeRound(rounds, snapshots, now);
      const toRefresh = pending[0] || active;
      // On a rest day, finished rounds can still be backfilled for the match score.
      if (event.enabled && toRefresh && now < event.hideAfter) {
        try {
          if (pending.length > 1 && now >= (this.backfillAfter.get(eventId) ?? 0) && now >= this.retryUntil) {
            await this.refreshFinishedRounds(eventId, event, pending);
          } else {
            await this.refreshRound(eventId, event, toRefresh);
          }
        } catch {
          stale = true;
        }
      }
      return this.response({ body: eventView(eventId, event, rounds, this.forEvent(eventId, rounds), now), stale });
    }

    const round = rounds.find(item => item.id === roundId);
    if (!round) return new Response(null, { status: 404 });
    if (event.enabled && now < event.hideAfter) {
      try {
        await this.refreshRound(eventId, event, round);
      } catch {
        stale = true;
      }
    }
    const snapshot = this.snapshots.get(this.roundKey(eventId, roundId));
    const status = roundStatus(round, snapshot, now);
    if (!snapshot && stale && status !== 'scheduled') return this.response({ stale }, 503);
    if (url.searchParams.get('format') === 'pgn') {
      if (!snapshot && stale) return this.response({ stale, status }, 503);
      return this.response({ stale, status, pgn: snapshot?.games.map(game => game.pgn).join('\n\n') ?? '' });
    }
    const game = snapshot?.games.findLast(game => game.moves.length || game.result !== '*') || snapshot?.games[0];
    return this.response({
      stale, status, body: {
        eventId, roundId, roundName: round.name, status,
        updatedAt: snapshot?.updatedAt ?? null,
        source: round.source ?? 'https://lichess.org/broadcast/' + event.tournamentSlug + '/-/' + round.id,
        white: game?.white ?? null, black: game?.black ?? null, result: game?.result ?? '*',
        initialFen: game?.initialFen ?? null, fen: game?.fen ?? null,
        moves: game?.moves ?? [], pgn: game?.pgn ?? ''
      }
    });
  }

  response(payload, status = 200) {
    return Response.json({
      ...payload,
      retryAfter: payload.stale ? Math.max(1, Math.ceil((this.retryUntil - Date.now()) / 1000)) : null
    }, { status });
  }

  fetch(request) {
    const url = new URL(request.url);
    let response = this.inflight.get(url.href);
    if (!response) {
      response = this.pending.then(() => this.dispatch(url));
      this.inflight.set(url.href, response);
      this.pending = response.catch(() => {}).finally(() => this.inflight.delete(url.href));
    }
    return response.then(result => result.clone());
  }
}

export default { fetch: () => new Response(null, { status: 404 }) };
