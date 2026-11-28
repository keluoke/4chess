import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2'
};

const pgnLichess1 = `[Event "Rated Blitz game"]
[Site "https://lichess.org/GameWin1"]
[White "Alice"]
[Black "Opponent1"]
[Result "1-0"]
[WhiteElo "1620"]
[BlackElo "1605"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

const pgnLichess2 = `[Event "Rated Rapid game"]
[Site "https://lichess.org/GameLoss"]
[White "Opponent2"]
[Black "Alice"]
[Result "1-0"]
[WhiteElo "1710"]
[BlackElo "1625"]

1. d4 d5 2. c4 e6 1-0`;

const pgnLichess3 = `[Event "Rated Blitz game"]
[Site "https://lichess.org/GameOld3"]
[White "Opponent3"]
[Black "Alice"]
[Result "0-1"]
[WhiteElo "1580"]
[BlackElo "1630"]

1. c4 e5 2. Nc3 Nf6 0-1`;

const pgnChesscomCurrent = `[Event "Live Chess"]
[Site "Chess.com"]
[Link "https://www.chess.com/game/live/12345678"]
[White "RivalOne"]
[Black "BobPlayer"]
[Result "0-1"]
[WhiteElo "1520"]
[BlackElo "1550"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 0-1`;

const pgnChesscomOther = `[Event "Live Chess"]
[Site "Chess.com"]
[Link "https://www.chess.com/game/live/87654321"]
[White "BobPlayer"]
[Black "RivalTwo"]
[Result "1-0"]
[WhiteElo "1555"]
[BlackElo "1530"]

1. d4 Nf6 2. c4 g6 1-0`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/analysis/index.html') {
    res.writeHead(308, { Location: '/analysis/' });
    res.end();
    return;
  }
  if (url.pathname === '/api/lichess') {
    const until = url.searchParams.get('until');
    const body = until
      ? [
          JSON.stringify({ id: 'GameOld3', variant: 'standard', status: 'resign', speed: 'blitz', createdAt: 1730000001000, opening: { eco: 'A20', name: 'English Opening' }, players: { white: { rating: 1580 }, black: { rating: 1630 } }, pgn: pgnLichess3 })
        ].join('\n')
      : [
          JSON.stringify({ id: 'LiveGame', variant: 'standard', status: 'started', speed: 'blitz', createdAt: 1730000099000, pgn: '[Result "*"]\n1. e4 *' }),
          JSON.stringify({ id: 'GameWin1', variant: 'standard', status: 'mate', speed: 'blitz', createdAt: 1730000050000, opening: { eco: 'C65', name: 'Ruy Lopez' }, players: { white: { rating: 1620 }, black: { rating: 1605 } }, pgn: pgnLichess1 }),
          JSON.stringify({ id: 'GameLoss', variant: 'standard', status: 'resign', speed: 'rapid', createdAt: 1730000040000, opening: { eco: 'D30', name: "Queen's Gambit Declined" }, players: { white: { rating: 1710 }, black: { rating: 1625 } }, pgn: pgnLichess2 })
        ].join('\n');
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  let file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'chromium', headless: true });

try {
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.route('https://api.chess.com/pub/player/**', async (route) => {
    const reqUrl = route.request().url();
    if (reqUrl.endsWith('/games/archives')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          archives: ['https://api.chess.com/pub/player/bobplayer/games/2026/11']
        })
      });
      return;
    }
    if (reqUrl.endsWith('/2026/11')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          games: [
            { url: 'https://www.chess.com/game/live/87654321', rules: 'chess', time_class: 'blitz', end_time: 1730000100, white: { rating: 1555 }, black: { rating: 1530 }, pgn: pgnChesscomOther },
            { url: 'https://www.chess.com/game/live/12345678', rules: 'chess', time_class: 'rapid', end_time: 1730000200, white: { rating: 1520 }, black: { rating: 1550 }, pgn: pgnChesscomCurrent }
          ]
        })
      });
      return;
    }
    await route.fulfill({ status: 404, body: '{}' });
  });

  // 1. Blank workbench entry + mobile viewport layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/analysis/?lang=en`);
  await page.waitForFunction(() => !!window.__maiaStudioApp?.recentGames);

  const importRect = await page.locator('#btn-home-import').boundingBox();
  assert(importRect && importRect.y + importRect.height < 844, 'Primary import CTA must stay above the fold on mobile');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'No horizontal overflow on mobile');
  assert.equal(await page.locator('#btn-home-recent-games').isVisible(), true);
  assert.equal(await page.locator('#btn-recent-games').isVisible(), false, 'Header recent-games button hidden on empty home');

  // Default #btn-home-import still opens Paste tab
  await page.locator('#btn-home-import').click();
  await page.locator('#pgn-modal.open #pgn-input').waitFor();
  assert.equal(await page.locator('#import-tab-paste').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Escape');

  // Clicking #btn-home-recent-games opens Account tab
  await page.locator('#btn-home-recent-games').click();
  await page.locator('#pgn-modal.open #recent-games-username').waitFor();
  assert.equal(await page.locator('#import-tab-account').getAttribute('aria-selected'), 'true');

  // Search Lichess username
  await page.locator('#recent-games-username').fill('Alice');
  await page.locator('#btn-recent-games-fetch').click();
  await page.locator('#recent-games-list .recent-game-item').first().waitFor();
  assert.equal(await page.locator('#recent-games-list .recent-game-item').count(), 2, 'Live/ongoing game must be filtered out');

  // Outcome filter: Loss -> only GameLoss
  await page.locator('#recent-games-filters').getByRole('button', { name: 'Loss' }).click();
  assert.equal(await page.locator('#recent-games-list .recent-game-item').count(), 1);
  assert.equal(await page.locator('#recent-games-list .recent-game-item').first().getAttribute('data-game-id'), 'GameLoss');

  // Click to analyze GameLoss (Alice was Black -> board orientation black)
  await page.locator('#recent-games-list .recent-game-item').first().click();
  await page.waitForFunction(() => window.__maiaStudioApp?.checkupGame?.gameId === 'GameLoss');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.orientation), 'black');
  assert.equal(await page.locator('#pgn-modal.open').count(), 0);
  assert.equal(await page.locator('#btn-recent-games').isVisible(), true, 'Header recent-games button visible after loading game');

  // 2. Floating-window handoff simulation: Chess.com game loaded with orientation=black
  await page.setViewportSize({ width: 1280, height: 800 });
  const handoffParams = new URLSearchParams({
    lang: 'en',
    pgn: pgnChesscomCurrent,
    orientation: 'black',
    checkupSource: 'chesscom',
    url: 'https://www.chess.com/game/live/12345678'
  });
  await page.goto(`${origin}/analysis/?${handoffParams}`);
  await page.waitForFunction(() => window.__maiaStudioApp?.checkupGame?.gameId === 'live:12345678');

  await page.locator('#btn-recent-games').click();
  await page.locator('#recent-games-list .recent-game-item').first().waitFor();
  assert.equal(await page.locator('#recent-games-username').inputValue(), 'BobPlayer');
  assert.equal(await page.locator('[data-recent-platform="chesscom"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#recent-games-list .recent-game-item.is-current').getAttribute('data-game-id'), 'live:12345678');

  // Switch to another game from the same player
  await page.locator('#recent-games-list .recent-game-item[data-game-id="live:87654321"]').click();
  await page.waitForFunction(() => window.__maiaStudioApp?.checkupGame?.gameId === 'live:87654321');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.boardUI.orientation), 'white');

  // 3. P1 #1: Paste PGN submit closes the modal on success & ArrowLeft/ArrowRight switches tabs
  await page.locator('#btn-import-pgn').click();
  await page.locator('#pgn-modal.open #import-tab-paste').waitFor();
  await page.locator('#import-tab-paste').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#import-tab-account').getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'import-tab-account');
  assert.equal(await page.locator('#import-panel-account').isVisible(), true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#import-tab-paste').getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'import-tab-paste');
  await page.locator('#pgn-input').fill(pgnLichess1);
  await page.locator('#btn-submit-pgn').click();
  await page.waitForFunction(() => window.__maiaStudioApp?.checkupGame?.gameId === 'GameWin1');
  assert.equal(await page.locator('#pgn-modal.open').count(), 0, 'Paste PGN modal must close after successful submit');

  // 4. Stale cancelled recent-games request must not clear newer request loading state
  let releaseSecondFetch;
  let markSecondFetchStarted;
  const secondFetchStarted = new Promise(resolve => { markSecondFetchStarted = resolve; });
  await page.route('**/api/lichess?*', async (route) => {
    const reqUrl = new URL(route.request().url());
    const user = reqUrl.searchParams.get('username');
    if (user === 'SlowUserOne') {
      await new Promise(resolve => setTimeout(resolve, 4000));
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '' });
      return;
    }
    if (user === 'FastUserTwo') {
      markSecondFetchStarted();
      await new Promise(resolve => { releaseSecondFetch = resolve; });
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: JSON.stringify({ id: 'GameWin1', variant: 'standard', status: 'mate', speed: 'blitz', createdAt: 1730000050000, pgn: pgnLichess1 })
      });
      return;
    }
    await route.continue();
  });
  await page.locator('#btn-recent-games').click();
  await page.locator('#pgn-modal.open #recent-games-username').waitFor();
  await page.locator('#recent-games-username').fill('SlowUserOne');
  await page.locator('#btn-recent-games-fetch').click();
  await page.waitForFunction(() => window.__maiaStudioApp?.recentGames?.loading === true);
  await page.evaluate(() => {
    const picker = window.__maiaStudioApp.recentGames;
    picker.usernameInput.value = 'FastUserTwo';
    void picker.loadGames({ forceRefresh: true });
  });
  await secondFetchStarted;
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.recentGames.loading), true, 'Cancelled first request must not clear second request loading state');
  assert.equal(await page.locator('#btn-recent-games-fetch').isDisabled(), true, 'Fetch button stays disabled while second request is pending');
  releaseSecondFetch();
  await page.waitForFunction(() => window.__maiaStudioApp?.recentGames?.loading === false);
  assert.equal(await page.locator('#btn-recent-games-fetch').isDisabled(), false);

  assert.deepEqual(errors, []);
  console.log('🎉 All recent-games browser tests passed!');
} finally {
  await browser.close();
  server.close();
}
