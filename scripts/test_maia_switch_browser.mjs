// Real CDN weights in a fresh installed Chromium profile; no accounts or live games.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { MAIA_VARIANTS } from '../engine/engine-variants.js';

const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const extension = process.env.TEST_EXTENSION_ROOT || path.join(root, 'releases', 'diverge-extension-v' + version);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'diverge-maia-switch-'));
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const hostUrl = 'https://www.chess.com/analysis/' + fen.replaceAll(' ', '_');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, locale: 'en-US',
  args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension]
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  await context.route(hostUrl, route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><wc-chess-board style="display:block;width:400px;height:400px"></wc-chess-board>'
  }));
  const host = await context.newPage();
  host.on('console', event => {
    if (/成功就绪|Candidate source|Engine initialization notice/.test(event.text())) console.log(event.text());
  });
  await host.goto(hostUrl);
  await host.waitForFunction(() => document.querySelectorAll('#maia-moves-container .weui-move-item').length > 0, null, { timeout: 180000 });
  const switchModel = async variant => {
    await host.locator('[data-model="' + variant + '"]').evaluate(button => button.click());
    await host.waitForFunction(name => {
      const dot = document.querySelector('#panel-engine-dot');
      const status = document.querySelector('#label-maia-status');
      const candidates = document.querySelectorAll('#maia-moves-container .weui-move-item');
      return dot?.title.includes(name) && status?.classList.contains('status-green') && candidates.length >= 3;
    }, MAIA_VARIANTS[variant].name, { timeout: 180000 }).catch(async error => {
      console.error(await host.locator('#panel-engine-summary, #label-maia-status, #model-switch-hint').allTextContents());
      throw error;
    });
    assert.equal((await worker.evaluate(() => chrome.storage.local.get(['maiaVariant']))).maiaVariant, variant);
    console.log('Floating panel applied ' + MAIA_VARIANTS[variant].name);
  };
  await switchModel('23m');
  await context.route(MAIA_VARIANTS['79m'].url, route =>
    route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' } }), { times: 1 });
  await host.locator('[data-model="79m"]').evaluate(button => button.click());
  await host.waitForFunction(() => document.querySelector('#model-switch-hint')?.textContent.includes('HTTP 503'), null, { timeout: 25000 });
  await host.locator('[data-retry-engine="maia"]').evaluate(button => button.click());
  await switchModel('79m');

  const studio = await context.newPage();
  await studio.goto('chrome-extension://' + id + '/analysis/index.html?lang=en#fen=' + encodeURIComponent(fen));
  await studio.waitForFunction(() => window.__maiaStudioApp?.positions.length);
  await studio.locator('#btn-settings').click();
  for (const variant of ['23m', '79m', '5m']) {
    await studio.locator('#intuition-edition').selectOption(variant);
    const spec = MAIA_VARIANTS[variant];
    await studio.waitForFunction(({ key, expected }) => {
      const app = window.__maiaStudioApp;
      const model = app.maiaEngine;
      const moves = app.positionAnalysis.active?.entry.prediction?.moves;
      return model.modelKey === key && model.isReady && model.modelMetadata.total_params === expected.total_params && moves?.length >= 3;
    }, spec, { timeout: 180000 });
    const source = await studio.evaluate(() => window.__maiaStudioApp.maiaEngine.status.maia.source);
    assert.equal(source, 'IndexedDB 缓存', 'Workbench must reuse the floating panel download');
    console.log('Packaged workbench applied ' + spec.name + ' from IndexedDB with real candidates');
  }

  await studio.keyboard.press('Escape');
  await studio.evaluate(async () => {
    const app = window.__maiaStudioApp;
    await app.stockfish.initialize();
    window.searchEvents = [];
    const post = app.stockfish.worker.postMessage.bind(app.stockfish.worker);
    app.stockfish.worker.postMessage = command => {
      searchEvents.push(command);
      post(command);
    };
    app.startNewSession({ pgn: '[Result "1-0"]\n1. e4 e5 2. Nf3 Nc6 1-0', autoReview: false });
    app.positionAnalysis.refresh();
  });
  await studio.waitForFunction(() => {
    const position = window.__maiaStudioApp.positionAnalysis;
    return position.active?.entry.sf?.depth >= 8 && position.searchCount > 0;
  });
  await studio.evaluate(() => window.__maiaStudioApp.goToPly(2));
  await studio.waitForFunction(() => {
    const position = window.__maiaStudioApp.positionAnalysis;
    return position.active?.ctx.ply === 2 && position.active.entry.sf?.depth >= 16;
  });
  assert.match(await studio.locator('#candidate-engine-status').innerText(), /D(1[6-9]|20)/);
  assert(await studio.evaluate(() => {
    const first = searchEvents.findIndex(command => command.startsWith('go depth 20'));
    return first >= 0 && searchEvents.slice(first + 1).includes('stop');
  }), 'Moving to another ply stops the current progressive search');
  await studio.locator('#btn-settings').click();
  await studio.locator('#review-mode').selectOption('deep');
  await studio.waitForFunction(() => window.__maiaStudioApp.coreReview?.reviewMode === 'deep');
  const deepKey = await studio.evaluate(() => window.__maiaStudioApp.coreReview.gameKey);
  await studio.locator('#position-depth').selectOption('22');
  await studio.waitForFunction(() => searchEvents.some(command => command.startsWith('go depth 22')));
  assert.equal(await studio.evaluate(() => window.__maiaStudioApp.coreReview.gameKey), deepKey);
  await studio.locator('#review-mode').selectOption('quick');
  await studio.waitForFunction(key => {
    const review = window.__maiaStudioApp.coreReview;
    return review?.reviewMode === 'quick' && review.gameKey !== key;
  }, deepKey);
  console.log('Packaged workbench streamed depth, stopped on navigation, and applied independent review settings');
} finally {
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
