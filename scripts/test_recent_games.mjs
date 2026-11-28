import assert from 'node:assert/strict';
import { onRequest as lichessProxy } from '../functions/api/lichess.js';
import { fetchRecentGamesPage } from '../analysis/checkup-archives.js';
import { gameOutcomeForPlayer, resolveRecentGamesTarget } from '../analysis/recent-games.js';

const samplePgnWhite = `[Event "Rated Blitz game"]
[Site "https://lichess.org/AbCd1234"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[WhiteElo "1620"]
[BlackElo "1590"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

const samplePgnBlack = `[Event "Rated Rapid game"]
[Site "https://lichess.org/EfGh5678"]
[White "Charlie"]
[Black "Alice"]
[Result "0-1"]
[WhiteElo "1700"]
[BlackElo "1680"]

1. d4 d5 2. c4 e6 0-1`;

const samplePgnDraw = `[Event "Live Chess"]
[Site "Chess.com"]
[White "Alice"]
[Black "Dana"]
[Result "1/2-1/2"]

1. c4 e5 1/2-1/2`;

console.log('--- 1. Testing /api/lichess proxy validation & params ---');
{
  const postRes = await lichessProxy({ request: new Request('http://localhost/api/lichess?username=alice', { method: 'POST' }) });
  assert.equal(postRes.status, 405);

  const badUntil1 = await lichessProxy({ request: new Request('http://localhost/api/lichess?username=alice&until=abc') });
  assert.equal(badUntil1.status, 400);

  const badUntil2 = await lichessProxy({ request: new Request('http://localhost/api/lichess?username=alice&until=123') });
  assert.equal(badUntil2.status, 400);

  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return new Response('', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
  };
  try {
    const okRes = await lichessProxy({
      request: new Request('http://localhost/api/lichess?username=Alice&max=60&opening=true&until=1730000000000')
    });
    assert.equal(okRes.status, 200);
    assert.match(capturedUrl, /max=50/);
    assert.match(capturedUrl, /opening=true/);
    assert.match(capturedUrl, /clocks=false/);
    assert.match(capturedUrl, /until=1730000000000/);
    assert.match(capturedUrl, /finished=true/);
    assert.match(capturedUrl, /ongoing=false/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log('--- 2. Testing fetchRecentGamesPage (Lichess pagination & FairPlay filter) ---');
{
  const requests = [];
  const page1Ndjson = [
    JSON.stringify({ id: 'live99', variant: 'standard', status: 'started', pgn: '[Result "*"]\n1. e4 *', createdAt: 1730000005000 }),
    JSON.stringify({ id: 'chess960', variant: 'chess960', status: 'mate', pgn: samplePgnWhite, createdAt: 1730000004000 }),
    JSON.stringify({ id: 'AbCd1234', variant: 'standard', status: 'mate', speed: 'blitz', createdAt: 1730000003000, players: { white: { rating: 1620 }, black: { rating: 1590 } }, opening: { eco: 'C65', name: 'Ruy Lopez' }, pgn: samplePgnWhite }),
    JSON.stringify({ id: 'EfGh5678', variant: 'standard', status: 'resign', speed: 'rapid', createdAt: 1730000002000, players: { white: { rating: 1700 }, black: { rating: 1680 } }, pgn: samplePgnBlack }),
    JSON.stringify({ id: 'IjKl9012', variant: 'standard', status: 'draw', speed: 'blitz', createdAt: 1730000001000, pgn: samplePgnDraw })
  ].join('\n');

  const page2Ndjson = [
    JSON.stringify({ id: 'MnOp3456', variant: 'standard', status: 'mate', speed: 'classical', createdAt: 1730000000000, pgn: samplePgnWhite })
  ].join('\n');

  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).includes('until=')) {
      return new Response(page2Ndjson, { status: 200 });
    }
    return new Response(page1Ndjson, { status: 200 });
  };

  const page1 = await fetchRecentGamesPage('lichess', 'Alice', { limit: 2, fetchImpl });
  assert.equal(page1.games.length, 2);
  assert.equal(page1.hasMore, true);
  assert.deepEqual(page1.nextCursor, { until: 1730000002000 - 1 });
  assert.equal(page1.games[0].meta.whiteRating, 1620);
  assert.equal(page1.games[0].meta.opening, 'Ruy Lopez');

  const page2 = await fetchRecentGamesPage('lichess', 'Alice', { limit: 2, cursor: page1.nextCursor, fetchImpl });
  assert.equal(page2.games.length, 1);
  assert.equal(page2.hasMore, false);
  assert.equal(requests[1].includes('until=1730000001999'), true);
}

console.log('--- 3. Testing fetchRecentGamesPage (Chess.com lazy monthly archive pagination) ---');
{
  const fetchedArchives = [];
  const fetchImpl = async (url) => {
    const s = String(url);
    if (s.endsWith('/games/archives')) {
      return Response.json({
        archives: [
          'https://api.chess.com/pub/player/alice/games/2026/10',
          'https://api.chess.com/pub/player/alice/games/2026/11'
        ]
      });
    }
    fetchedArchives.push(s);
    if (s.endsWith('/2026/11')) {
      return Response.json({
        games: [
          { url: 'https://www.chess.com/game/live/10000001', rules: 'chess', time_class: 'blitz', end_time: 1730000100, white: { rating: 1500 }, black: { rating: 1490 }, pgn: samplePgnWhite },
          { url: 'https://www.chess.com/game/live/10000002', rules: 'chess960', time_class: 'blitz', end_time: 1730000200, pgn: samplePgnBlack },
          { url: 'https://www.chess.com/game/live/10000003', rules: 'chess', time_class: 'rapid', end_time: 1730000300, pgn: '[Result "*"]\n1. e4 *' },
          { url: 'https://www.chess.com/game/live/10000004', rules: 'chess', time_class: 'rapid', end_time: 1730000400, white: { rating: 1700 }, black: { rating: 1680 }, pgn: samplePgnBlack }
        ]
      });
    }
    return Response.json({
      games: [
        { url: 'https://www.chess.com/game/live/09999999', rules: 'chess', time_class: 'daily', end_time: 1729000000, pgn: samplePgnDraw }
      ]
    });
  };

  const page1 = await fetchRecentGamesPage('chesscom', 'Alice', { limit: 1, fetchImpl });
  assert.equal(page1.games.length, 1);
  assert.equal(page1.games[0].gameId, 'live:10000004');
  assert.equal(page1.hasMore, true);
  assert.deepEqual(fetchedArchives, ['https://api.chess.com/pub/player/alice/games/2026/11'], 'First page should not fetch older monthly archive when current month suffices');

  const page2 = await fetchRecentGamesPage('chesscom', 'Alice', { limit: 2, cursor: page1.nextCursor, fetchImpl });
  assert.equal(page2.games.length, 2);
  assert.deepEqual(page2.games.map(g => g.gameId), ['live:10000001', 'live:09999999']);
  assert.equal(page2.hasMore, false);
}

console.log('--- 3b. Testing Lichess 429 proxy non-fallback, filtered pagination, and Chess.com 503 ---');
{
  const originalLocation = globalThis.location;
  const originalFetch = globalThis.fetch;
  globalThis.location = { protocol: 'https:' };
  let proxyCalls = 0;
  globalThis.fetch = async (url) => {
    proxyCalls++;
    assert.match(String(url), /^\/api\/lichess\?/);
    return new Response('rate limited', { status: 429 });
  };
  try {
    await assert.rejects(() => fetchRecentGamesPage('lichess', 'Alice', { limit: 2 }), /Lichess HTTP 429/);
    assert.equal(proxyCalls, 1, '429 from /api/lichess must not fall back to direct lichess.org');
  } finally {
    globalThis.location = originalLocation;
    globalThis.fetch = originalFetch;
  }

  // When 2 of limit+1 raw rows are filtered, Lichess pagination fetches a follow-up batch and still reports hasMore=true.
  let batchCalls = 0;
  const filteredPageFetch = async () => {
    batchCalls++;
    if (batchCalls === 1) {
      return new Response([
        JSON.stringify({ id: 'live99', variant: 'standard', status: 'started', pgn: '[Result "*"]\n1. e4 *', createdAt: 1730000005000 }),
        JSON.stringify({ id: 'chess960', variant: 'chess960', status: 'mate', pgn: samplePgnWhite, createdAt: 1730000004500 }),
        JSON.stringify({ id: 'AbCd1234', variant: 'standard', status: 'mate', speed: 'blitz', createdAt: 1730000004000, pgn: samplePgnWhite })
      ].join('\n'), { status: 200 });
    }
    return new Response([
      JSON.stringify({ id: 'EfGh5678', variant: 'standard', status: 'resign', speed: 'rapid', createdAt: 1730000003000, pgn: samplePgnBlack }),
      JSON.stringify({ id: 'IjKl9012', variant: 'standard', status: 'draw', speed: 'blitz', createdAt: 1730000002000, pgn: samplePgnDraw })
    ].join('\n'), { status: 200 });
  };
  const filteredPage = await fetchRecentGamesPage('lichess', 'Alice', { limit: 2, fetchImpl: filteredPageFetch });
  assert.equal(batchCalls, 2);
  assert.equal(filteredPage.games.length, 2);
  assert.equal(filteredPage.hasMore, true);
  assert.deepEqual(filteredPage.nextCursor, { until: 1730000003000 - 1 });

  // Chess.com monthly archive 503 must throw instead of silently skipping the month.
  const chesscom503Fetch = async (url) => {
    if (String(url).endsWith('/games/archives')) {
      return Response.json({
        archives: [
          'https://api.chess.com/pub/player/alice/games/2026/10',
          'https://api.chess.com/pub/player/alice/games/2026/11'
        ]
      });
    }
    if (String(url).endsWith('/2026/11')) return new Response('Service Unavailable', { status: 503 });
    return Response.json({ games: [] });
  };
  await assert.rejects(() => fetchRecentGamesPage('chesscom', 'Alice', { limit: 2, fetchImpl: chesscom503Fetch }), /Chess\.com HTTP 503/);
}

console.log('--- 4. Testing resolveRecentGamesTarget & gameOutcomeForPlayer ---');
{
  const targetFromGame = resolveRecentGamesTarget({
    checkupGame: { platform: 'chesscom', white: 'Opp', black: 'Alice', orientation: 'black' },
    mistakeBank: { activeProfile: { accounts: [{ platform: 'lichess', username: 'LichessAlice' }] } }
  });
  assert.deepEqual(targetFromGame, { platform: 'chesscom', username: 'Alice' });

  const targetFromProfile = resolveRecentGamesTarget({
    checkupGame: null,
    mistakeBank: { activeProfile: { accounts: [{ platform: 'lichess', username: 'LichessAlice' }] } }
  });
  assert.deepEqual(targetFromProfile, { platform: 'lichess', username: 'LichessAlice' });

  const targetFromLast = resolveRecentGamesTarget({ checkupGame: null, mistakeBank: null }, {
    lastTarget: { platform: 'chesscom', username: 'LastUser' }
  });
  assert.deepEqual(targetFromLast, { platform: 'chesscom', username: 'LastUser' });

  assert.deepEqual(gameOutcomeForPlayer({ meta: { white: 'Alice', black: 'Bob', result: '1-0' } }, 'alice'), {
    side: 'w', outcome: 'win', orientation: 'white'
  });
  assert.deepEqual(gameOutcomeForPlayer({ meta: { white: 'Charlie', black: 'Alice', result: '0-1' } }, 'alice'), {
    side: 'b', outcome: 'win', orientation: 'black'
  });
  assert.deepEqual(gameOutcomeForPlayer({ meta: { white: 'Alice', black: 'Dana', result: '1/2-1/2' } }, 'alice'), {
    side: 'w', outcome: 'draw', orientation: 'white'
  });
}

console.log('🎉 All recent-games unit tests passed!');
