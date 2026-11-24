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
  const first = '[TimeControl "300+0"]\n[White "Seanyan"]\n[WhiteElo "2180"]\n[Black "Rival"]\n[BlackElo "1400"]\n[ECO "C60"]\n[Opening "Ruy Lopez"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:00:22]} e5 2. Nf3 {[%clk 0:00:22]} Nc6 3. Bb5 {[%clk 0:00:22]} a6 4. Ba4 {[%clk 0:00:22]} Nf6 5. O-O {[%clk 0:00:22]} Be7 6. Re1 {[%clk 0:00:22]} b5 7. Bb3 {[%clk 0:00:22]} d6 8. c3 {[%clk 0:00:22]} O-O 1-0';
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
  const statistics = reportBox.locator('.checkup-statistics');
  const more = page.locator('.checkup-report-more');
  const allTraps = reportBox.locator('.checkup-all-traps');
  const openDetails = async details => {
    if (await details.getAttribute('open') === null) await details.locator('summary').first().click();
  };
  const shareDiagnosis = () => page.getByRole('button', { name: 'Share diagnosis' }).click();

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
    app.maiaEngine.predict = async (fen, elo) => ({
      moves: ['b3a4', 'b3c2', 'b3d5', 'c2c3', 'g8f6', 'f8e7', 'e8g8', 'b8d7', 'c7c6', 'd5c4', 'b7b5']
        .map(uci => ({ uci, rawProb: elo === 2200 ? 0.08 : 0.04 }))
    });
    window.restoreInitialStockfish = () => { app.stockfish.initialize = initialize; };
  });
  await page.locator('#checkup-username').fill('Clarkyan');
  await page.locator('#btn-checkup-fetch').click();
  await page.waitForFunction(() => window.__maiaStudioApp.checkup.latestReport?.gameCount === 2 &&
    !window.__maiaStudioApp.checkup.busy);
  assert(await clark.isHidden());
  await page.evaluate(async () => {
    const bank = window.__maiaStudioApp.mistakeBank;
    await bank.store.saveCheckupReviewEvidence('default', { platform: 'chesscom', gameId: 'live:12345673' },
      { w: { errors: { 3: true, 5: false, 7: false, 9: true, 11: false } } });
    await bank.refreshState();
  });
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
  assert(await statistics.locator('.checkup-stability-clock').isHidden());
  assert.match(await reportBox.locator('.checkup-summary-story').innerText(), /40%/);
  await openDetails(statistics);
  const clockText = await reportBox.locator('.checkup-stability-clock').innerText();
  assert(clockText.includes('40%') && clockText.includes('5 of 7 low-clock decisions reviewed'));

  const findNew = async () => {
    await openDetails(more);
    await more.getByRole('button', { name: /check for new games/i }).click();
  };
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
  await openDetails(statistics);
  await openDetails(more);
  const fitSpeed = page.getByRole('combobox', { name: 'Time control for intuition fit' });
  assert.equal(await fitSpeed.inputValue(), 'rapid');
  assert.match(await reportBox.locator('.checkup-fit-breakdown').innerText(), /fit samples across 2 games/);
  assert.match(await reportBox.locator('.checkup-report-context').innerText(), /Long-term fit · Rapid · 2\/30 games/);
  assert.match(await reportBox.locator('.checkup-report-byline').innerText(), /3\/10 covered/);
  assert.equal(await reportBox.locator('.checkup-stability-phase').count(), 3);
  await fitSpeed.selectOption('blitz');
  await openDetails(statistics);
  assert.match(await reportBox.locator('.checkup-fit-breakdown').innerText(), /fit samples from 1 game/);
  assert.match(await reportBox.locator('.checkup-report-byline').innerText(), /3\/10 covered/);
  assert.equal(await reportBox.locator('.checkup-stability-phase').count(), 3);
  await openDetails(more);
  await fitSpeed.selectOption('rapid');
  const cached = await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport.fitWindow.games.length);
  assert.equal(cached, 3);

  const scope = page.getByRole('combobox', { name: 'Report scope' });
  await scope.selectOption('batch');
  assert.match(await reportBox.locator('.checkup-report-byline').innerText(), /This batch · 1 game/);
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
  const overview = page.locator('#checkup-overview-body');
  await overview.getByText('3 completed games', { exact: true }).waitFor();
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
  await page.getByRole('button', { name: 'Share playing profile' }).click();
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
  const overviewFetches = archiveLookups;
  await page.locator('#checkup-tab-report').click();
  assert.equal(await reportBox.locator('.checkup-fit-bar').count(), 4);
  assert.match(await reportBox.locator('.checkup-fit-rating').innerText(), /2180/);
  await openDetails(statistics);
  assert(await reportBox.locator('.checkup-fit-raw').isVisible());
  await shareDiagnosis();
  await readyToShare();
  assert.deepEqual(await preview.evaluate(canvas => [canvas.width, canvas.height]), [1080, 1440]);
  await share.getByRole('button', { name: 'Copy text summary' }).click();
  const combinedSummary = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(combinedSummary, /3 games · Recent score 67%/);
  assert(combinedSummary.includes('Long-term fit · Rapid · 2/30 games'));
  assert(combinedSummary.includes('3 games'));
  assert.equal(await page.locator('#checkup-report-tools').getByRole('button', { name: 'Share diagnosis' }).count(), 1);
  assert.doesNotMatch(combinedSummary, /Clarkyan/);
  assert.equal(archiveLookups, overviewFetches, 'Report share uses only the displayed report');
  if (process.env.TEST_CHECKUP_CARDS) await preview.screenshot({ path: process.env.TEST_CHECKUP_CARDS + '-combined.png' });
  await closeShare();

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
  await alt.getByRole('button', { name: 'View report' }).click();
  failArchive = true;
  const missingOverviewFetches = archiveLookups;
  await shareDiagnosis();
  await readyToShare();
  await share.getByRole('button', { name: 'Copy text summary' }).click();
  const splitCardSummary = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(splitCardSummary, /2 games · Recent score 100%/);
  assert.equal(archiveLookups, missingOverviewFetches, 'Sharing uses the report even if the archive is unavailable');
  await closeShare();
  failArchive = false;
  await settings();
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
    app.maiaEngine.predict = async (fen, elo) => ({
      moves: [{ uci: fen.startsWith('rnbqkb1r') ? 'f3g1' : 'g1f3', rawProb: elo === 2200 ? 0.6 : 0.25 }]
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
  await page.locator('#checkup-fit-method').selectOption('fine');

  await page.locator('#btn-checkup-fetch').click();
  await page.locator('#checkup-confirm-name').fill('Trainee');
  await page.locator('#btn-checkup-start').click();
  await page.waitForFunction(() => window.__maiaStudioApp.checkup.latestReport?.traps?.length > 5 &&
    !window.__maiaStudioApp.checkup.busy);
  assert(await statistics.locator('.checkup-fit-breakdown').isHidden());
  assert.equal(await reportBox.locator('.checkup-key-board > span').count(), 64);
  const mini = reportBox.locator('.checkup-key-board');
  assert.equal(await mini.locator('[data-played="from"] > svg').count(), 1);
  assert.equal(await mini.locator('[data-played="to"]').count(), 1);
  assert.notEqual(await mini.locator('[data-played="from"]').evaluate(cell => getComputedStyle(cell).backgroundColor),
    await mini.locator('[data-played="to"]').evaluate(cell => getComputedStyle(cell).backgroundColor));
  assert(await reportBox.getByRole('button', { name: 'Practice top 3 now' }).isVisible());
  assert.match(await reportBox.locator('.checkup-summary-metrics').innerText(), /Recent score\s*50%/);
  if (process.env.TEST_CHECKUP_CARDS) {
    await reportBox.locator('.checkup-summary-card').screenshot({ path: process.env.TEST_CHECKUP_CARDS + '-mobile-layout.png' });
  }
  await openDetails(statistics);
  assert.match(await statistics.innerText(), /moves in the fit/);
  assert.equal(await reportBox.locator('.checkup-fit-bar').count(), 6);
  assert.equal(await reportBox.locator('.checkup-fit-evidence-row').count(), 2);
  assert.match(await reportBox.locator('.checkup-fit-evidence').innerText(), /predicted 60\.0%/);
  assert.equal(await reportBox.locator('.checkup-trap-row:visible').count(), 3);
  await openDetails(allTraps);
  const sixthJump = allTraps.locator('.checkup-trap-row').getByRole('button', { name: /Review this move/ }).nth(5);
  await sixthJump.waitFor();
  const replay = await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport);
  assert.equal(await reportBox.locator('.checkup-trap-row:visible').count(), replay.traps.length);
  await shareDiagnosis();
  await readyToShare();
  assert.deepEqual(await preview.evaluate(canvas => [canvas.width, canvas.height]), [1080, 1440]);
  await share.getByRole('button', { name: 'Copy text summary' }).click();
  assert.doesNotMatch(await page.evaluate(() => navigator.clipboard.readText()), /Trainee/);
  await share.getByRole('checkbox', { name: 'Hide player names' }).uncheck();
  await readyToShare();
  await share.getByRole('button', { name: 'Copy text summary' }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Trainee/);
  if (process.env.TEST_CHECKUP_CARDS) await preview.screenshot({ path: process.env.TEST_CHECKUP_CARDS + '-portrait.png' });
  await share.getByRole('button', { name: 'Find the move' }).click();
  await readyToShare();
  const spoiler = share.getByRole('checkbox', { name: 'Show the answer' });
  assert.equal(await spoiler.isChecked(), false);
  const boardOnly = await preview.evaluate(canvas => canvas.toDataURL());
  await spoiler.check();
  await readyToShare();
  assert.notEqual(await preview.evaluate(canvas => canvas.toDataURL()), boardOnly);
  await spoiler.uncheck();
  await readyToShare();
  if (process.env.TEST_CHECKUP_CARDS) {
    const png = await preview.evaluate(canvas => canvas.toDataURL().split(',')[1]);
    fs.writeFileSync(process.env.TEST_CHECKUP_CARDS + '-challenge.png', Buffer.from(png, 'base64'));
  }
  const palette = (reference = null) => preview.evaluate((canvas, reference) => {
    const ctx = canvas.getContext('2d');
    const expected = ['light', 'dark'].map(name => {
      const elem = document.querySelector(`#board-container .maia-square.${name}:not(.last-move-from):not(.last-move-to):not(.selected):not(.check)`);
      return getComputedStyle(elem).backgroundColor.match(/\d+/g).slice(0, 3).join(',');
    });
    const counts = [0, 0];
    const zoom = canvas.width / 960;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 242; y < 828; y += 7) {
      for (let x = 85; x < 523; x += 7) {
        const offset = 4 * (Math.round(y * zoom) * canvas.width + Math.round(x * zoom));
        const index = (reference || expected).indexOf([...pixels.slice(offset, offset + 3)].join(','));
        if (index >= 0) counts[index]++;
      }
    }
    return { counts, expected };
  }, reference);
  const lightBoard = await palette();
  assert(lightBoard.counts.every(count => count > 300), 'Shared board uses the workbench’s computed colors');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => {
    const elem = document.querySelector('#board-container .maia-square.light:not(.last-move-from):not(.last-move-to)');
    return getComputedStyle(elem).backgroundColor === 'rgb(191, 205, 190)';
  });
  await spoiler.check();
  await spoiler.uncheck();
  await readyToShare();
  const darkBoard = await palette(lightBoard.expected);
  assert.notDeepEqual(darkBoard.expected, lightBoard.expected);
  assert.deepEqual(darkBoard.counts, lightBoard.counts, 'Challenge PNG keeps its light board while the workbench changes theme');
  assert.equal(await preview.evaluate(canvas => canvas.toDataURL()), boardOnly);
  await page.emulateMedia({ colorScheme: 'light' });
  await share.getByRole('button', { name: 'Playing profile', exact: true }).click();
  await readyToShare();
  await share.getByRole('button', { name: '16:9' }).click();
  await readyToShare();
  const download = page.waitForEvent('download');
  await share.getByRole('button', { name: 'Download PNG' }).click();
  const png = await download;
  const bytes = fs.readFileSync(await png.path());
  assert.equal(png.suggestedFilename(), 'diverge-profile.png');
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [1280, 720]);
  if (process.env.TEST_CHECKUP_CARDS) await png.saveAs(process.env.TEST_CHECKUP_CARDS + '-report.png');
  await share.getByRole('button', { name: 'Copy image' }).click();
  await share.locator('#checkup-share-status').getByText('Copied to the clipboard.', { exact: true }).waitFor();
  assert(await page.evaluate(async () => (await navigator.clipboard.read()).some(item => item.types.includes('image/png'))));
  await closeShare();

  await page.evaluate(async () => {
    const { checkupCardData } = await import('/analysis/checkup-share.js?v=20261124-review-navigation');
    const checkup = __maiaStudioApp.checkup;
    const games = [1600, 1650, 1700].map(playedRating => ({
      platform: 'lichess', timeClass: 'rapid', playedRating, fitSamples: [{ scores: [0] }]
    }));
    const intuition = { games, fitGameCount: games.length, closestElo: 1900,
      fit: { status: 'stable', ranges: [{ low: 1900, high: 1900 }], logLead: 1 } };
    const ctx = document.getElementById('checkup-share-canvas').getContext('2d');
    const fillText = ctx.fillText.bind(ctx);
    window.fitBadgeLabels = [];
    ctx.fillText = (text, ...args) => {
      if (text.startsWith('Median rating')) window.fitBadgeLabels.push(text);
      return fillText(text, ...args);
    };
    checkup.share.open(checkupCardData({ report: { ...checkup.latestReport, intuition } }));
  });
  await readyToShare();
  assert.deepEqual(await page.evaluate(() => fitBadgeLabels), ['Median rating 1650 · Plays like Maia 1900']);
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
  const selfTest = puzzle.getByRole('link', { name: 'Test your playing intuition' });
  const options = puzzle.getByRole('group', { name: 'Choose your move' }).getByRole('button');
  const previewArrow = puzzle.locator('#maia-svg-arrows-group line[data-role="preview"]');
  assert(await analyze.isHidden(), 'Studio handoff is revealed after an answer');
  assert(await selfTest.isHidden(), 'The self-test is shown after the answer');
  assert.equal(await puzzle.locator('input').count(), 0);
  assert.equal(await options.count(), 2);
  const parsed = await puzzle.evaluate(async () => {
    const { decodeChallenge } = await import('/analysis/challenge-link.js?v=20261124-checkup-cards-r2');
    return decodeChallenge(new URLSearchParams(location.hash.slice(1)).get('p'));
  });
  const labelOrder = await options.allTextContents();
  await puzzle.reload();
  await options.first().waitFor();
  assert.deepEqual(await options.allTextContents(), labelOrder, 'Reload preserves the A/B order');
  const size = await options.first().boundingBox();
  assert(size.width > 100 && size.height >= 60, 'Choices have a large tap area on mobile');
  await puzzle.locator('.snapshot-brand').focus();
  await puzzle.keyboard.press('Tab');
  assert.equal(await previewArrow.getAttribute('opacity'), '0.34');
  assert.equal(await puzzle.locator('#maia-svg-arrows-group [data-move-badge]').count(), 0);
  await puzzle.keyboard.press('Shift+Tab');
  assert.equal(await previewArrow.count(), 0, 'Keyboard blur clears the preview');
  await options.first().hover();
  const previewColor = await previewArrow.getAttribute('stroke');
  await options.last().hover();
  assert.equal(await previewArrow.getAttribute('stroke'), previewColor, 'Each choice uses the same preview arrow style');
  await puzzle.locator('#challenge-status').hover();
  assert.equal(await previewArrow.count(), 0, 'Moving the pointer away clears the preview');
  await puzzle.locator('#challenge-choices').getByText(parsed.playedSan, { exact: true }).click();
  assert.match(await puzzle.locator('#challenge-status').innerText(), /tempting move/);
  assert.match(await puzzle.locator('#challenge-probability').innerText(), /2200 band.*60% chance/);
  assert(await puzzle.locator('#maia-svg-arrows-group > *').count() >= 2);
  assert.equal(await previewArrow.count(), 0);
  assert(await puzzle.locator('#challenge-choices').isHidden());
  assert(await selfTest.isVisible());
  assert.match(await selfTest.getAttribute('class'), /btn-primary/);
  assert(await analyze.isVisible());
  await puzzle.getByRole('button', { name: 'Try again' }).click();
  assert(await analyze.isHidden());
  assert(await selfTest.isHidden());
  assert.deepEqual(await options.allTextContents(), labelOrder);
  await puzzle.locator(`[data-square="${parsed.best.slice(0, 2)}"]`).click();
  await puzzle.locator(`[data-square="${parsed.best.slice(2, 4)}"]`).click();
  assert.match(await puzzle.locator('#challenge-status').innerText(), /avoided the trap/);
  await puzzle.getByRole('button', { name: 'Try again' }).click();
  const alternative = await puzzle.evaluate(async ({ fen, played, best }) => {
    const { ChessBoard } = await import('/engine/chess-core.js');
    return new ChessBoard(fen).getLegalMoves().find(move => move.uci !== played && move.uci !== best)?.uci;
  }, parsed);
  assert(alternative, 'The archived position has a third legal move');
  await puzzle.locator(`[data-square="${alternative.slice(0, 2)}"]`).click();
  await puzzle.locator(`[data-square="${alternative.slice(2, 4)}"]`).click();
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
  const bestOption = options.filter({ has: puzzle.getByText(parsed.bestSan, { exact: true }) });
  await bestOption.press('Enter');
  assert.match(await puzzle.locator('#challenge-status').innerText(), /avoided the trap/);
  await selfTest.click();
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
  await dialog.waitFor();
  await openDetails(statistics);
  await reportBox.locator('.checkup-fit-evidence-row').first().getByRole('button').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.deepEqual(await page.evaluate(() => {
    const app = window.__maiaStudioApp;
    return [app.currentPly, app.boardUI.chess.getFen()];
  }), [replay.fit.examples[0].ply, replay.fit.examples[0].fenBefore]);
  await page.locator('#btn-checkup-replay-back').click();
  await dialog.waitFor();
  await openDetails(reportBox.locator('.checkup-games-trends'));
  assert.match(await reportBox.innerText(), /Trainee – Rival/);
  await openDetails(allTraps);
  await reportBox.getByRole('button', { name: /Practice high-temptation moves/ }).click();
  await page.waitForFunction(() => !!window.reportPractice);
  const practiced = await page.evaluate(async () => {
    const bank = window.__maiaStudioApp.mistakeBank;
    return { queue: window.reportPractice.queue.map(trap => trap.id), stored: (await bank.store.listTraps(bank.activeProfile.id)).length };
  });
  assert.deepEqual(practiced.queue, replay.traps.map(trap => trap.id));
  assert.equal(practiced.stored, replay.traps.length);
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('#btn-intuition-checkup').click();
  await page.locator('#checkup-tab-report').click();
  const stability = reportBox.locator('.checkup-stability-section');
  const summaryCard = reportBox.locator('.checkup-summary-card');
  await page.evaluate(() => {
    const checkup = window.__maiaStudioApp.checkup;
    const legacy = { ...checkup.latestReport, id: 'legacy-local-saved',
      games: checkup.latestReport.games.map(game => ({ ...game, screenedMoves: undefined })),
      fit: null, closestElo: 2200, screenedMoves: undefined };
    checkup.latestReport = legacy;
    checkup.renderReport(legacy);
  });
  assert.equal(await stability.locator('.checkup-stability-value').count(), 0);
  assert.match(await summaryCard.innerText(), /older report is missing screening data/);
  await summaryCard.getByRole('button', { name: 'Recheck these games' }).click();
  await page.waitForFunction(() => {
    const { latestReport, busy } = window.__maiaStudioApp.checkup;
    return !busy && latestReport.id !== 'legacy-local-saved' && latestReport.screenedMoves > 0;
  });
  assert.equal(await page.locator('#checkup-tab-report').getAttribute('aria-selected'), 'true');

  await page.evaluate(() => {
    const checkup = window.__maiaStudioApp.checkup;
    const legacy = { ...checkup.latestReport, id: 'legacy-local-no-pgn', games: [],
      fit: null, closestElo: 2200, screenedMoves: undefined };
    checkup.latestReport = legacy;
    checkup.renderReport(legacy);
  });
  assert.equal(await reportBox.locator('.checkup-fit-number').textContent(), '2200*');
  const choosingPgn = page.waitForEvent('filechooser');
  await summaryCard.getByRole('button', { name: 'Import PGN to recheck' }).click();
  const fileChooser = await choosingPgn;
  assert.equal(await page.locator('#checkup-tab-report').getAttribute('aria-selected'), 'true');
  await fileChooser.setFiles({ name: 'saved.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(replayPgn) });
  await page.locator('#btn-checkup-start').waitFor();
  assert.equal(await page.locator('#checkup-tab-settings').getAttribute('aria-selected'), 'true');
  await page.locator('#checkup-confirm-name').fill('Trainee');
  await page.locator('#btn-checkup-start').click();
  await page.waitForFunction(() => {
    const { latestReport, busy } = window.__maiaStudioApp.checkup;
    return !busy && latestReport.id !== 'legacy-local-no-pgn' && latestReport.screenedMoves > 0;
  });

  await page.evaluate(() => {
    const checkup = window.__maiaStudioApp.checkup;
    const legacy = { ...checkup.latestReport, id: 'legacy-online', playerName: 'Altplayer', sourceLabel: 'chesscom:Altplayer',
      games: [], fit: null, screenedMoves: undefined, analyzedGameIds: ['live:12345676', 'live:12345677'] };
    checkup.source = 'chesscom';
    checkup.usernameInput.value = 'Clarkyan';
    checkup.latestReport = legacy;
    checkup.history = [legacy, ...checkup.history];
    checkup.renderReport(legacy);
  });
  assert.equal(await page.locator('#checkup-report-tools').getByRole('button', { name: 'Check for new games' }).count(), 0);
  await summaryCard.getByRole('button', { name: 'Reanalyze the last 10 games' }).click();
  await page.waitForFunction(() => {
    const { latestReport, busy } = window.__maiaStudioApp.checkup;
    return !busy && latestReport.id !== 'legacy-online' && latestReport.screenedMoves > 0;
  });
  assert.deepEqual(await page.evaluate(() => window.__maiaStudioApp.checkup.latestReport.analyzedGameIds),
    ['live:12345676', 'live:12345677']);
  assert.equal(await page.locator('#checkup-tab-report').getAttribute('aria-selected'), 'true');

  await page.setViewportSize({ width: 1200, height: 920 });
  await page.evaluate(() => {
    const checkup = window.__maiaStudioApp.checkup;
    const base = checkup.latestReport;
    const games = Array.from({ length: 10 }, (_, i) => ({
      ...base.games[i % 2], gameId: `live:${80000000 + i}`, timeClass: 'rapid',
      playedRating: 1409, playedAt: Date.UTC(2026, 10, 19 + (i % 4))
    }));
    const fit = { bands: [1100, 1500, 1900, 2200], weights: [.057, .224, .484, .235], logLead: Math.log(.484 / .235),
      runner: 2200, status: 'stable', checked: 10, retained: 9, ranges: [{ low: 1500, high: 2200 }], examplePolicy: 2,
      examples: [
        { ...games[0].fitSamples[0], gameIndex: 0, leaderProbability: .017, runnerProbability: .007 },
        { ...games[0].fitSamples[0], gameIndex: 0, leaderProbability: .24, runnerProbability: .1 },
        { ...games[1].fitSamples[0], gameIndex: 1, leaderProbability: .09, runnerProbability: .3 }
      ]
    };
    const summary = { games, gameCount: 10, analyzedMoves: 197, screenedMoves: 197, eloSampleCount: 24, fitGameCount: 10,
      closestElo: 1900, fit, phaseTraps: { opening: 1, middlegame: 10, endgame: 0 } };
    const report = { ...base, ...summary, rolling: summary, fitWindow: { games: [] } };
    checkup.latestReport = report;
    checkup.scopedHistory = [report, { ...report, id: 'old-summary', createdAt: report.createdAt - 180000 }];
    checkup.renderReport(report);
  });
  assert.equal(await reportBox.locator('.checkup-fit-number').textContent(), '1900*');
  assert.match(await reportBox.locator('.checkup-fit-section').innerText(), /Rapid rating median 1409/);
  assert(await statistics.locator('.checkup-fit-status').isHidden());
  await openDetails(statistics);
  assert.match(await reportBox.locator('.checkup-fit-metadata').innerText(), /1500–2200/);
  assert.match(await reportBox.locator('.checkup-fit-status.stable').innerText(), /Consistent leader/);
  assert.match(await reportBox.locator('.checkup-fit-bar.best').innerText(), /1900[\s\S]*48.4%/);
  const evidenceBox = reportBox.locator('.checkup-fit-evidence');
  assert.match(await evidenceBox.innerText(), /distinguish 1900 and 2200/);
  assert.deepEqual(await evidenceBox.locator('.checkup-fit-direction').allTextContents(), ['Closer to 1900', 'Closer to 2200']);
  assert.doesNotMatch(await evidenceBox.innerText(), /1.7%/);
  assert.match(await stability.innerText(), /5.6[\s\S]*About 1.1 traps per game/);
  assert.match(await summaryCard.innerText(), /10 of 11 traps came in the middlegame/);
  assert.deepEqual(await stability.locator('.checkup-stability-phase strong').allTextContents(), ['1', '10', '0']);
  assert.match(await reportBox.locator('.checkup-report-byline').innerText(), /Altplayer · Chess.com Rapid · Last 10 games \(197 decisions\)/);
  assert.match(await reportBox.locator('.checkup-report-context-detail').innerText(), /Nov 19/);
  await openDetails(more);
  const historyOptions = await more.locator('.checkup-history-select option').allTextContents();
  assert(historyOptions.length > 1);
  await more.locator('summary').click();
  assert(historyOptions.every(option => option.startsWith('Last 10 games · ') && !/Altplayer|Chess.com/.test(option)));
  const evidenceButton = evidenceBox.getByRole('button', { name: 'Review this move' }).first();
  assert(await evidenceButton.evaluate(button => button.classList.contains('checkup-review-move') &&
    getComputedStyle(button).borderTopWidth === '1px'));
  if (process.env.TEST_CHECKUP_CARDS) {
    await reportBox.locator('.checkup-summary-card').screenshot({ path: process.env.TEST_CHECKUP_CARDS + '-report-layout.png' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await reportBox.evaluate(box => box.scrollWidth <= box.clientWidth));

  await page.evaluate(() => {
    const checkup = window.__maiaStudioApp.checkup;
    const report = checkup.latestReport;
    const games = [...report.games, ...report.games.slice(0, 2)].map((game, index) => ({
      ...game, gameId: `live:${90000000 + index}`
    }));
    report.fitWindow = { games };
    checkup.renderReport(report);
  });
  assert.match(await reportBox.locator('.checkup-report-context-detail').innerText(), /Long-term fit · Rapid · 12\/30 games/);

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(errors, []);
  console.log('PASS checkup workbench: incremental reports, overview cache and openings, profile isolation, reminders, safe cancellation, exact replay, topic practice, scoped share cards, PNG export and anonymous engine-free challenges.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
