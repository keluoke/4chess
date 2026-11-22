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
  const context = await browser.newContext({ viewport: { width: 1200, height: 850 }, serviceWorkers: 'block' });
  const first = '[White "Seanyan"]\n[WhiteElo "2180"]\n[Black "Rival"]\n[BlackElo "1400"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0';
  const second = '[White "Rival"]\n[Black "Seanyan"]\n[BlackElo "2180"]\n[Result "0-1"]\n\n1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3 dxc4 0-1';
  await context.route('https://weights.4chess.cc/**', route => route.abort());
  await context.route('https://api.chess.com/**', route => route.fulfill({ json: route.request().url().endsWith('/archives')
    ? { archives: [] }
    : { games: [
      { rules: 'chess', url: 'https://www.chess.com/game/live/12345672', pgn: second },
      { rules: 'chess', url: 'https://www.chess.com/game/live/12345671', pgn: first }
    ] } }));
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
  await link('Clarkyan');
  const clark = page.locator('[data-account="chesscom:clarkyan"]');
  const sean = page.locator('[data-account="chesscom:seanyan"]');
  await clark.waitFor();
  await link('Seanyan');
  assert.match(await editor.innerText(), /another player/i);
  await page.locator('#study-profile-keep').click();
  await sean.waitFor();
  await page.waitForFunction(() => !window.__maiaStudioApp.checkup.busy);

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
  await sean.locator('button').first().click();
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
  await sean.getByRole('button', { name: /move.*new profile/i }).click();
  assert.match(await editor.innerText(), /previous practice traps and reports/i);
  await page.locator('#study-profile-save').click();
  await page.waitForFunction(() => window.__maiaStudioApp.mistakeBank.activeProfile?.displayName === 'Seanyan');
  await sean.waitFor();
  assert(await clark.isHidden());
  assert.equal(await profileSelect.locator('option').count(), 2);
  await link('Altplayer');
  await page.locator('#study-profile-save').click();
  await page.waitForFunction(() => window.__maiaStudioApp.mistakeBank.activeProfile?.displayName === 'Altplayer');
  await page.locator('[data-account="chesscom:altplayer"]').waitFor();
  const isolation = await page.evaluate(async () => {
    const bank = window.__maiaStudioApp.mistakeBank;
    const player = bank.profiles.find(profile => profile.displayName === 'Seanyan');
    const original = bank.profiles.find(profile => profile.id === 'default');
    return {
      newAccounts: bank.activeProfile.accounts.map(account => account.username),
      movedAccounts: player.accounts.map(account => account.username),
      originalAccounts: original.accounts.map(account => account.username),
      originalReports: (await bank.store.listCheckups(original.id)).length,
      movedReports: (await bank.store.listCheckups(player.id)).length
    };
  });
  assert.deepEqual(isolation, {
    newAccounts: ['Altplayer'], movedAccounts: ['Seanyan'], originalAccounts: ['Clarkyan'], originalReports: 1, movedReports: 0
  });
  await page.setViewportSize({ width: 390, height: 844 });
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
  assert.deepEqual(errors, []);
  console.log('PASS checkup workbench: profile creation and account split, badge counts and dismissal, progress ETA, backdrop and Escape, partial persistence and completed-review acknowledgement.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
