import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const file = path.join(root, pathname, pathname.endsWith('/') ? 'index.html' : '');
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'chromium', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 850 },
    serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  const first = '[White "Seanyan"]\n[WhiteElo "2180"]\n[Black "Rival"]\n[BlackElo "1400"]\n[ECO "C60"]\n[Opening "Ruy Lopez"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0';
  const second = '[White "Rival"]\n[Black "Seanyan"]\n[BlackElo "2180"]\n[Result "0-1"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3 dxc4 0-1';
  await context.route('https://weights.4chess.cc/**', route => route.abort());
  let clarkNew = false;
  let archiveLookups = 0;
  let failArchive = false;
  await context.route('https://api.chess.com/**', route => {
    const url = route.request().url();
    if (url.endsWith('/archives')) {
      archiveLookups++;
      return failArchive ? route.fulfill({ status: 503 }) : route.fulfill({ json: { archives: [] } });
    }
    const player = new URL(url).pathname.split('/')[3];
    const name = { clarkyan: 'Clarkyan', altplayer: 'Altplayer' }[player] || 'Seanyan';
    const base = { clarkyan: 12345673, altplayer: 12345676 }[player] || 12345671;
    const archived = (id, pgn, more = {}) => ({
      rules: 'chess', time_class: 'rapid', url: `https://www.chess.com/game/live/${id}`, pgn: pgn.replaceAll('Seanyan', name), ...more
    });
    const games = [archived(base + 1, second), archived(base, first)];
    if (clarkNew && player === 'clarkyan') games.push(archived(base + 2, first.replaceAll('1-0', '0-1').replace('C60', 'C65')
      .replace('[Opening "Ruy Lopez"]', '[ECOUrl "https://www.chess.com/openings/Ruy-Lopez-Opening-Berlin-Defense-4.O-O"]'), {
      time_class: 'blitz', white: { result: 'timeout' }
    }));
    return route.fulfill({ json: { games } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/analysis/?lang=en');
  await page.waitForFunction(() => window.__maiaStudioApp?.positions.length);
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    app.checkupReminders.probe = async () => false;
    app.positionAnalysis.refresh = () => {};
  });
  const dialog = page.locator('#checkup-dialog');
  const settings = () => page.locator('#checkup-tab-settings').click();
  const reportBox = page.locator('#checkup-report-box');
  const share = page.locator('#checkup-share-dialog');
  const preview = page.locator('#checkup-share-canvas');
  const readyToShare = () => share.getByRole('button', { name: 'Download PNG', exact: true }).and(page.locator(':enabled')).waitFor();
  const closeShare = () => page.locator('#checkup-share-close').click();
  const editor = page.locator('#study-profile-dialog');
  const profileSelect = page.locator('#checkup-profile-select');
  const badge = page.locator('#checkup-new-dot');

  assert(await page.locator('#studio-profile-select').isHidden());
  await page.locator('#btn-studio-new-profile').click();
  await editor.waitFor();
  await page.locator('#study-profile-cancel').click();
  await page.locator('#btn-intuition-checkup').click();
  await dialog.waitFor();
  assert(await profileSelect.isHidden());
  await page.locator('#btn-checkup-new-profile').click();
  assert(await editor.isVisible());
  await page.keyboard.press('Escape');
  await editor.waitFor({ state: 'hidden' });
  assert(await dialog.isVisible());

  await page.locator('[data-checkup-source="chesscom"]').click();
  const link = async username => {
    await page.locator('#checkup-username').fill(username);
    await page.locator('#btn-checkup-save-account').click();
  };
  const clark = page.locator('[data-account="chesscom:clarkyan"]');
  const sean = page.locator('[data-account="chesscom:seanyan"]');
  const clarkIdentity = clark.getByRole('button', { name: 'Select Chess.com · Clarkyan' });
  const seanIdentity = sean.getByRole('button', { name: 'Select Chess.com · Seanyan' });
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    const initialize = app.stockfish.initialize.bind(app.stockfish);
    window.checkupStarts = 0;
    app.stockfish.initialize = async () => { window.checkupStarts++; return true; };
    app.maiaEngine.initialize = async () => true;
    app.maiaEngine.predict = async () => ({ moves: [{ uci: 'a4b3', rawProb: 0.08 }] });
    window.restoreInitialStockfish = () => { app.stockfish.initialize = initialize; };
  });
  await page.locator('#checkup-username').fill('Clarkyan');
  await page.locator('#btn-checkup-fetch').click();
  await page.waitForFunction(() => window.__maiaStudioApp.checkup.latestReport?.gameCount === 2 &&
    !window.__maiaStudioApp.checkup.busy);
  assert(await clark.isHidden());
  const initialReport = await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport.id);
  await settings();
  await link('Clarkyan');
  await clark.getByRole('button', { name: /check for new games/i }).waitFor();
  assert.match(await clark.locator('.checkup-account-status').innerText(), /last checkup/i);
  assert.match(await page.locator('#btn-checkup-fetch').innerText(), /reanalyze the last 10 games/i);
  await clark.getByRole('button', { name: /view report/i }).click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport.id), initialReport);
  assert.equal(await page.locator('#checkup-tab-report').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'checkup-report-box');
  const findNew = () => page.locator('#checkup-report-tools').getByRole('button', { name: /check for new games/i }).click();
  await findNew();
  await page.getByText('No new games to analyze.').waitFor();
  assert.equal(await page.evaluate(() => window.checkupStarts), 1, 'An unchanged batch does not start the engines');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport.id), initialReport);
  clarkNew = true;
  await findNew();
  await page.waitForFunction(() => window.__maiaStudioApp.checkup.latestReport?.gameCount === 1 &&
    !window.__maiaStudioApp.checkup.busy);
  assert.deepEqual(await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport.analyzedGameIds), ['live:12345675']);
  assert.equal(await page.evaluate(() => window.checkupStarts), 2);
  assert.match(await reportBox.innerText(), /3\/10 covered/);
  assert.equal(await reportBox.locator('.checkup-charts svg').count(), 2);
  assert.equal(await reportBox.locator('.checkup-chart-endpoint').count(), 4);
  assert.equal(await reportBox.locator('.checkup-chart-guide').count(), 7);
  const scope = page.getByRole('combobox', { name: 'Report scope' });
  await scope.selectOption('batch');
  assert.equal(await reportBox.locator('.checkup-window-coverage').count(), 0);
  await scope.selectOption('rolling');
  await page.evaluate(() => {
    const Analyzer = window.__maiaStudioApp.analyzer.constructor;
    const parse = Analyzer.parsePgn;
    window.clockParses = 0;
    Analyzer.parsePgn = (...args) => {
      if (args[1]?.clocks) window.clockParses++;
      return parse(...args);
    };
  });
  const beforeOverview = archiveLookups;
  await page.locator('#checkup-tab-overview').click();
  await page.getByText('3 completed games', { exact: true }).waitFor();
  const overview = page.locator('#checkup-overview-body');
  assert.match(await overview.locator('.checkup-result-total').innerText(), /67%[\s\S]*2 W[\s\S]*0 D[\s\S]*1 L/);
  assert.match(await overview.locator('.checkup-hero-summary').innerText(), /Black scores 50 percentage points higher.*100% of losses were on time/);
  const moreOpenings = overview.locator('[data-detail="more-w"]');
  assert(await moreOpenings.locator('[data-detail="w:C65"]').isHidden());
  await moreOpenings.getByText('See more common openings').click();
  assert(await moreOpenings.locator('[data-detail="w:C65"]').isVisible());
  assert.match(await moreOpenings.locator('[data-detail="w:C65"] summary').innerText(), /Ruy Lopez Opening Berlin Defense/);
  assert.equal(archiveLookups, beforeOverview + 1);
  const speeds = page.locator('#checkup-overview-speeds');
  await speeds.getByRole('button', { name: 'Blitz', exact: true }).click();
  assert.match(await overview.locator('.checkup-result-total').innerText(), /0%[\s\S]*0 W[\s\S]*0 D[\s\S]*1 L/);
  assert.match(await overview.locator('.checkup-result-b').innerText(), /—/);
  assert.equal(await overview.locator('.checkup-result-b .checkup-result-bar > span').count(), 0);
  await page.getByRole('button', { name: 'Share game overview card' }).click();
  await readyToShare();
  assert.deepEqual(await preview.evaluate(canvas => [canvas.width, canvas.height]), [1080, 1440]);
  await share.getByRole('button', { name: 'Copy text summary' }).click();
  const blitzSummary = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(blitzSummary, /1 game · 0% score/);
  assert.doesNotMatch(blitzSummary, /Clarkyan/);
  assert.equal(blitzSummary.split('\n').length, 3);
  if (process.env.TEST_CHECKUP_CARDS) {
    await preview.screenshot({ path: process.env.TEST_CHECKUP_CARDS + '-overview.png' });
  }
  await closeShare();
  assert.equal(await page.evaluate(() => window.clockParses), 3, 'Changing filters does not parse clocks again');
  assert.equal(archiveLookups, beforeOverview + 1, 'Changing filters uses cached archive data');
  await overview.locator('[data-detail="w:C65"] summary').click();
  await overview.locator('[data-detail="w:C65"]').getByRole('button', { name: /Open game/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.checkupGame?.gameId), 'live:12345675');
  const backToOverview = page.getByRole('button', { name: 'Back to game overview' });
  await backToOverview.click();
  await speeds.getByRole('button', { name: 'Blitz', pressed: true }).waitFor();
  assert(await overview.locator('[data-detail="w:C65"]').getByRole('button', { name: /Open game/ }).isVisible());
  await overview.getByText(/View 1 losses on time/).click();
  const timeoutReplay = overview.locator('[data-detail="timeout"]').getByRole('button', { name: /Open game/ });
  await timeoutReplay.click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.checkupGame?.gameId), 'live:12345675');
  await backToOverview.click();
  await timeoutReplay.waitFor();
  assert.equal(archiveLookups, beforeOverview + 1, 'Replaying and returning uses the original cached overview');
  failArchive = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText(/Archive HTTP 503/).waitFor();
  assert(await overview.getByText('Recent results').isVisible(), 'A failed refresh leaves the previous results visible');
  failArchive = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.waitForFunction(() => window.clockParses === 6);
  await speeds.getByRole('button', { name: 'Blitz', pressed: true }).waitFor();
  assert.equal(await page.evaluate(() => window.checkupStarts), 2, 'The overview does not start an engine');
  await page.evaluate(() => window.restoreInitialStockfish());
  await settings();
  await link('Seanyan');
  assert.match(await editor.innerText(), /another player/i);
  await page.locator('#study-profile-keep').click();
  await sean.waitFor();
  await page.waitForFunction(() => !window.__maiaStudioApp.checkup.busy);
  const clarkHitArea = await clarkIdentity.boundingBox();
  assert(clarkHitArea.width >= 165 && clarkHitArea.height >= 44);
  await clarkIdentity.click({ position: { x: clarkHitArea.width - 12, y: clarkHitArea.height / 2 } });
  assert.equal(await clark.getAttribute('data-selected'), 'true');
  assert.equal(await clarkIdentity.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#checkup-username').inputValue(), 'Clarkyan');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport?.playerName), 'Clarkyan');
  assert.equal(await page.locator('#checkup-tab-settings').getAttribute('aria-selected'), 'true');
  await seanIdentity.press('Space');
  assert.equal(await seanIdentity.getAttribute('aria-pressed'), 'true');
  assert.equal(await clarkIdentity.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#checkup-username').inputValue(), 'Seanyan');
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport), null);
  assert.equal(await page.evaluate(() => window.checkupStarts), 2, 'Selecting accounts does not launch a checkup');
  await clarkIdentity.press('Enter');

  await page.evaluate(async () => {
    const app = window.__maiaStudioApp;
    const store = app.mistakeBank.store;
    await store.updateCheckupReminder('default', { platform: 'chesscom', username: 'clarkyan' },
      () => ({ checkedAt: Date.now(), baseline: [], games: [] }));
    await store.updateCheckupReminder('default', { platform: 'chesscom', username: 'seanyan' },
      () => ({ checkedAt: Date.now(), baseline: [], games: ['live:12345671', 'live:12345672'].map(id => ({ id, at: Date.now() })) }));
    await app.checkupReminders.reload('default');
  });
  assert.equal(await badge.textContent(), '2');
  assert.match(await page.locator('#btn-intuition-checkup').getAttribute('title'), /Chess\.com · Seanyan \+2/);
  assert.equal(await page.locator('#checkup-accounts li').first().getAttribute('data-account'), 'chesscom:seanyan');
  await sean.locator('.checkup-ignore').click();
  await badge.waitFor({ state: 'hidden' });
  assert.equal(await clarkIdentity.getAttribute('aria-pressed'), 'true', 'Ignoring another account does not change selection');
  await page.evaluate(async () => {
    const app = window.__maiaStudioApp;
    const store = app.mistakeBank.store;
    await store.updateCheckupReminder('default', { platform: 'chesscom', username: 'seanyan' }, record => ({
      ...record, diagnosed: []
    }));
    await app.checkupReminders.reload('default');
    const initialize = app.stockfish.initialize.bind(app.stockfish);
    app.stockfish.initialize = async () => true;
    app.maiaEngine.initialize = async () => true;
    app.maiaEngine.predict = async () => {
      if (app.checkup.progress.gameIndex === 2 && !window.releasePrediction) {
        await new Promise(resolve => { window.releasePrediction = resolve; });
      }
      return { moves: [{ uci: 'a4b3', rawProb: 0.08 }] };
    };
    window.restoreStockfish = () => { app.stockfish.initialize = initialize; };
  });
  await sean.locator('.checkup-account-run').click();
  await page.waitForFunction(() => Boolean(window.releasePrediction));
  assert.match(await page.locator('#checkup-eta').innerText(), /seconds remaining/);
  await page.mouse.click(5, 5);
  assert(await dialog.isVisible());
  assert(await page.locator('#checkup-stop-dialog').isHidden());
  await page.keyboard.press('Escape');
  await page.locator('#checkup-stop-dialog').waitFor();
  assert.match(await page.locator('#checkup-stop-message').innerText(), /1\/2 games complete/);
  await page.keyboard.press('Escape');
  assert(await dialog.isVisible());
  await page.locator('#btn-close-checkup').click();
  await page.locator('#btn-checkup-stop-confirm').click();
  await page.evaluate(() => window.releasePrediction());
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await badge.textContent(), '1');
  const partial = await page.evaluate(async () => (await window.__maiaStudioApp.mistakeBank.store.listCheckups('default'))[0]);
  assert.equal(partial.partial, true);
  assert.equal(partial.screenElo, 2200);
  assert.deepEqual(partial.analyzedGameIds, ['live:12345671']);

  await page.evaluate(async () => {
    window.restoreStockfish();
    const app = window.__maiaStudioApp;
    const pgn = '[White "Rival"]\n[Black "Seanyan"]\n[Result "0-1"]\n1. f3 e5 2. g4 Qh4# 0-1';
    app.maiaEngine.initialize = async () => false;
    app.startNewSession({ pgn, publicGameUrl: 'https://www.chess.com/game/live/12345672', autoReview: false });
    await app.runFullReview();
  });
  await badge.waitFor({ state: 'hidden' });

  await page.locator('#btn-intuition-checkup').click();
  await settings();
  await clarkIdentity.click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport?.playerName), 'Clarkyan');
  await seanIdentity.click();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport?.playerName), 'Seanyan');
  await sean.getByRole('button', { name: /move.*new profile/i }).click();
  assert.match(await editor.innerText(), /previous practice traps and reports/i);
  await page.locator('#study-profile-save').click();
  await page.waitForFunction(() => window.__maiaStudioApp.mistakeBank.activeProfile?.displayName === 'Seanyan');
  await sean.waitFor();
  assert(await clark.isHidden());
  assert.equal(await profileSelect.locator('option').count(), 2);
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    app.stockfish.initialize = async () => true;
    app.maiaEngine.initialize = async () => true;
  });
  await page.locator('#checkup-username').fill('Altplayer');
  await page.locator('#btn-checkup-fetch').click();
  await page.waitForFunction(() => window.__maiaStudioApp.checkup.latestReport?.playerName === 'Altplayer' &&
    !window.__maiaStudioApp.checkup.busy);
  const splitReport = await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport.id);
  await settings();
  await link('Altplayer');
  assert.match(await editor.innerText(), /move the report you just ran/i);
  await page.locator('#study-profile-save').click();
  await page.waitForFunction(() => window.__maiaStudioApp.mistakeBank.activeProfile?.displayName === 'Altplayer');
  const alt = page.locator('[data-account="chesscom:altplayer"]');
  await alt.getByRole('button', { name: /check for new games/i }).waitFor();
  assert.equal(await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport?.id), splitReport);
  const isolation = await page.evaluate(async () => {
    const bank = window.__maiaStudioApp.mistakeBank;
    const player = bank.profiles.find(profile => profile.displayName === 'Seanyan');
    const original = bank.profiles.find(profile => profile.id === 'default');
    return {
      newAccounts: bank.activeProfile.accounts.map(account => account.username),
      movedAccounts: player.accounts.map(account => account.username),
      originalAccounts: original.accounts.map(account => account.username),
      originalReports: (await bank.store.listCheckups(original.id)).length,
      movedReports: (await bank.store.listCheckups(player.id)).length,
      splitReports: (await bank.store.listCheckups(bank.activeProfile.id)).map(report => report.id),
      splitDiagnosed: bank.activeProfile.checkupReminders['chesscom:altplayer'].diagnosed
    };
  });
  assert.deepEqual(isolation, {
    newAccounts: ['Altplayer'], movedAccounts: ['Seanyan'], originalAccounts: ['Clarkyan'], originalReports: 3, movedReports: 0,
    splitReports: [splitReport], splitDiagnosed: ['live:12345676', 'live:12345677']
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await alt.evaluate(row => row.querySelector('.checkup-account-identity').offsetWidth >= row.clientWidth - 18),
    'The tap target spans the account row on mobile');
  assert(await page.locator('#btn-checkup-new-profile').isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.locator('#btn-close-checkup').click();
  const setRating = async elo => {
    const id = await page.evaluate(value => {
      const app = window.__maiaStudioApp;
      const selector = app.el.eloSelector;
      if (![...selector.options].some(option => option.value === String(value))) selector.add(new Option(value, value));
      selector.value = String(value);
      selector.dispatchEvent(new Event('change'));
      return app.mistakeBank.activeProfile.id;
    }, elo);
    await page.waitForFunction(async ({ id, elo }) =>
      (await window.__maiaStudioApp.mistakeBank.store.get('profiles', id))?.defaultElo === elo, { id, elo });
  };
  await setRating(2200);
  const profile = page.locator('#studio-profile-select');
  const altId = await profile.inputValue();
  await profile.selectOption('default');
  await page.waitForFunction(() => window.__maiaStudioApp.mistakeBank.activeProfile.id === 'default');
  await setRating(1400);
  await profile.selectOption(altId);
  await page.waitForFunction(() => window.__maiaStudioApp.currentElo === 2200);
  await page.reload();
  await page.waitForFunction(() => window.__maiaStudioApp?.positions.length && window.__maiaStudioApp.currentElo === 2200);
  await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    app.positionAnalysis.refresh = () => {};
    app.stockfish.initialize = async () => true;
    app.stockfish.evaluate = async (fen, depth) => {
      const white = fen.split(' ')[1] === 'w';
      const uci = white ? 'e2e4' : 'e7e5';
      return { depth, scoreCp: white ? 300 : 0, bestMove: { uci, san: white ? 'e4' : 'e5' }, pv: [uci] };
    };
    app.maiaEngine.initialize = async () => true;
    app.maiaEngine.predict = async fen => ({
      moves: [{ uci: fen.startsWith('rnbqkb1r') ? 'f3g1' : 'g1f3', rawProb: 0.6 }]
    });
    app.startPractice = (item, { queue }) => { window.reportPractice = { item, queue }; };
  });
  const replayMoves = Array.from({ length: 14 }, (_, i) =>
    `${i + 1}. ${i % 2 ? 'Ng1 Ng8' : 'Nf3 Nf6'}`).join(' ');
  const replayPgn = '[Event "Replay fixture"]\n[White "Trainee"]\n[Black "Rival"]\n[WhiteElo "2200"]\n[Result "1/2-1/2"]\n\n' +
    replayMoves + ' 1/2-1/2';
  await page.locator('#btn-intuition-checkup').click();
  await settings();
  await page.locator('[data-checkup-source="local"]').click();
  await page.locator('#checkup-pgn-text').fill(replayPgn);
  await page.locator('#btn-checkup-fetch').click();
  await page.locator('#checkup-confirm-name').fill('Trainee');
  await page.locator('#btn-checkup-start').click();
  await page.waitForFunction(() => window.__maiaStudioApp.checkup.latestReport?.traps?.length > 5 &&
    !window.__maiaStudioApp.checkup.busy);
  assert.match(await reportBox.innerText(), /fit samples from 1 game/);
  assert.equal(await reportBox.locator('.checkup-trap-row:visible').count(), 5);
  await reportBox.getByText(/Show .* more traps/).click();
  const sixthJump = reportBox.getByRole('button', { name: /Review this move/ }).nth(5);
  await sixthJump.waitFor();
  const replay = await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport);
  assert.equal(await reportBox.locator('.checkup-trap-row:visible').count(), replay.traps.length);
  await page.getByRole('button', { name: 'Share diagnosis card' }).click();
  await readyToShare();
  assert.deepEqual(await preview.evaluate(canvas => [canvas.width, canvas.height]), [1080, 1440]);
  await share.getByRole('button', { name: 'Copy text summary' }).click();
  assert.doesNotMatch(await page.evaluate(() => navigator.clipboard.readText()), /Trainee/);
  await share.getByRole('checkbox', { name: 'Hide player names' }).uncheck();
  await share.getByRole('button', { name: 'Copy text summary' }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Trainee/);
  await share.getByRole('button', { name: '16:9' }).click();
  await readyToShare();
  const download = page.waitForEvent('download');
  await share.getByRole('button', { name: 'Download PNG' }).click();
  const png = await download;
  const bytes = fs.readFileSync(await png.path());
  assert.equal(png.suggestedFilename(), 'diverge-report.png');
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [1280, 720]);
  if (process.env.TEST_CHECKUP_CARDS) await png.saveAs(process.env.TEST_CHECKUP_CARDS + '-report.png');
  await share.getByRole('button', { name: 'Copy image' }).click();
  await share.locator('#checkup-share-status').getByText('Copied to the clipboard.', { exact: true }).waitFor();
  assert(await page.evaluate(async () => (await navigator.clipboard.read()).some(item => item.types.includes('image/png'))));
  await closeShare();

  await reportBox.getByRole('button', { name: 'Share a challenge' }).first().click();
  await share.getByRole('button', { name: 'Copy challenge link' }).click();
  const challengeUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(challengeUrl.pathname, '/analysis/challenge.html');
  assert(challengeUrl.href.length < 270);
  await closeShare();
  const recipient = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await recipient.route('https://weights.4chess.cc/**', route => route.abort());
  const engineRequests = [];
  recipient.on('request', request => {
    if (/\b(maia-engine|maia-worker|stockfish|weights\.4chess)/i.test(request.url())) engineRequests.push(request.url());
  });
  const puzzle = await recipient.newPage();
  puzzle.on('pageerror', error => errors.push(error.message));
  const challengeResponse = await puzzle.goto(origin + challengeUrl.pathname + challengeUrl.hash);
  const challengeHtml = await challengeResponse.text();
  assert.match(challengeHtml, /<meta property="og:title" content="Diverge · 直觉挑战">/);
  assert.match(challengeHtml, /<meta property="og:description" content="一道来自完赛棋局/);
  assert.match(challengeHtml, /<meta name="twitter:card" content="summary_large_image">/);
  const coverUrl = new URL(challengeHtml.match(/<meta property="og:image" content="([^"]+)">/)?.[1]);
  assert.equal(coverUrl.origin, 'https://4chess.cc');
  const cover = await puzzle.request.get(origin + coverUrl.pathname);
  assert.equal(cover.status(), 200);
  const coverBytes = await cover.body();
  assert.deepEqual([coverBytes.readUInt32BE(16), coverBytes.readUInt32BE(20)], [1200, 630]);
  await puzzle.locator('#challenge-board .maia-square').first().waitFor();
  assert(await puzzle.locator('#challenge-answer').isHidden());
  assert.equal(await puzzle.locator('#maia-svg-arrows-group > *').count(), 0);
  const analyze = puzzle.getByRole('link', { name: 'Analyze this position in the studio' });
  assert(await analyze.isHidden(), 'Studio handoff is revealed after an answer');
  const parsed = await puzzle.evaluate(async () => {
    const { decodeChallenge } = await import('/analysis/challenge-link.js?v=20261123-checkup-account-selection');
    return decodeChallenge(new URLSearchParams(location.hash.slice(1)).get('p'));
  });
  await puzzle.locator('#challenge-move').fill(parsed.played);
  await puzzle.getByRole('button', { name: 'Submit move' }).click();
  assert.match(await puzzle.locator('#challenge-status').innerText(), /tempting move/);
  assert.match(await puzzle.locator('#challenge-probability').innerText(), /Maia 2200 assigned 60% probability/);
  assert(await puzzle.locator('#maia-svg-arrows-group > *').count() >= 2);
  assert(await analyze.isVisible());
  await puzzle.getByRole('button', { name: 'Try again' }).click();
  assert(await analyze.isHidden());
  await puzzle.locator(`[data-square="${parsed.best.slice(0, 2)}"]`).click();
  await puzzle.locator(`[data-square="${parsed.best.slice(2, 4)}"]`).click();
  assert.match(await puzzle.locator('#challenge-status').innerText(), /verified as best/);
  await puzzle.getByRole('button', { name: 'Try again' }).click();
  const alternative = await puzzle.evaluate(async ({ fen, played, best }) => {
    const { ChessBoard } = await import('/engine/chess-core.js');
    return new ChessBoard(fen).getLegalMoves().find(move => move.uci !== played && move.uci !== best)?.uci;
  }, parsed);
  assert(alternative, 'The archived position has a third legal move');
  await puzzle.locator('#challenge-move').fill(alternative);
  await puzzle.getByRole('button', { name: 'Submit move' }).click();
  assert.match(await puzzle.locator('#challenge-status').innerText(), /chose a different move/);
  assert.deepEqual(engineRequests, []);
  const analyzeUrl = new URL(await analyze.getAttribute('href'));
  assert.equal(analyzeUrl.pathname, '/analysis/');
  const analyzeParams = new URLSearchParams(analyzeUrl.hash.slice(1));
  const orientation = parsed.turn === 'w' ? 'white' : 'black';
  assert.deepEqual([analyzeParams.get('fen'), analyzeParams.get('orientation'), analyzeParams.get('lang')],
    [parsed.fen, orientation, 'en']);
  await analyze.click();
  await puzzle.waitForFunction(({ fen, orientation }) => {
    const app = window.__maiaStudioApp;
    return app?.hasAnalysisInput && app.boardUI?.orientation === orientation && app.positions[0]?.fen === fen;
  }, { fen: parsed.fen, orientation });
  await puzzle.goto(origin + challengeUrl.pathname + challengeUrl.hash);
  await puzzle.getByRole('link', { name: 'Test your playing intuition' }).click();
  await puzzle.locator('#checkup-tab-settings[aria-selected="true"]').waitFor();
  assert(await puzzle.locator('#checkup-dialog').isVisible());
  await recipient.close();
  await page.bringToFront();
  await reportBox.getByRole('button', { name: `Save all ${replay.traps.length} traps` }).click();
  await page.waitForFunction(async count => {
    const bank = window.__maiaStudioApp.mistakeBank;
    return (await bank.store.listTraps(bank.activeProfile.id)).length === count &&
      !window.__maiaStudioApp.checkup.savingTraps;
  }, replay.traps.length);
  assert(await reportBox.evaluate(box => box.scrollWidth <= box.clientWidth), 'Expanded traps fit the mobile dialog');
  const sixth = replay.traps[5];
  await sixthJump.click();
  await dialog.waitFor({ state: 'hidden' });
  const focused = await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    return { ply: app.currentPly, before: app.isReviewingMove, fen: app.boardUI.chess.getFen() };
  });
  assert.deepEqual(focused, { ply: sixth.ply, before: true, fen: sixth.fenBefore });
  await page.locator('#btn-checkup-replay-back').click();
  await reportBox.getByText(/Game details/).click();
  assert.match(await reportBox.innerText(), /Trainee – Rival/);
  await reportBox.getByRole('button', { name: /Practice high-temptation moves/ }).click();
  await page.waitForFunction(() => !!window.reportPractice);
  const practiced = await page.evaluate(async () => {
    const bank = window.__maiaStudioApp.mistakeBank;
    return { queue: window.reportPractice.queue.map(trap => trap.id), stored: (await bank.store.listTraps(bank.activeProfile.id)).length };
  });
  assert.deepEqual(practiced.queue, replay.traps.map(trap => trap.id));
  assert.equal(practiced.stored, replay.traps.length);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(errors, []);
  console.log('PASS checkup workbench: incremental reports, overview cache and openings, profile isolation, reminders, safe cancellation, exact replay, topic practice, scoped share cards, PNG export and anonymous engine-free challenges.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
