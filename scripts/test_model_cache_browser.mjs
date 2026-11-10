import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAIA_VARIANTS } from '../engine/engine-variants.js';

const root = path.resolve(import.meta.dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'diverge-model-cache-'));
function fixture(variant, size = 2048) {
  const meta = new TextEncoder().encode(JSON.stringify({ ...MAIA_VARIANTS[variant].expected, tensors: {} }));
  const buffer = Buffer.alloc(size);
  buffer.write('M3CF'); buffer.writeUInt32LE(meta.length, 4); buffer.set(meta, 8);
  return buffer;
}
const weights = fixture('5m', 33 * 1024 * 1024); // Exercise the production chunked IDB path.
let downloads = 0, customDownloads = 0, offline = false;
const mime = file => file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
async function launch() {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  await context.route('https://**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.example') {
      customDownloads++;
      return route.fulfill({ body: fixture('79m'), contentType: 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    if (url.hostname === 'weights.4chess.cc') {
      if (offline) return route.abort();
      downloads++;
      return route.fulfill({ body: weights, contentType: 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' } });
    }
    if (url.hostname === '4chess.cc') {
      const file = path.join(root, url.pathname === '/analysis/' ? 'engine/model-cache-frame.html' : url.pathname);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        // Empty shell, real modules. No inference/Stockfish downloads are needed for this storage test.
        return route.fulfill({ body: url.pathname === '/analysis/' ? '<!doctype html><title>Cache test</title>' : fs.readFileSync(file), contentType: mime(file) });
      }
    }
    return route.fulfill({ body: '<!doctype html><title>Cache fixture</title>', contentType: 'text/html' });
  });
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}
async function hostLoad(sw, page, id) {
  const tabId = await sw.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url).id, page.url());
  return sw.evaluate(async ({ tabId, id }) => {
    const [response] = await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', func: async extensionId => {
      const { loadModelBytes } = await import(`chrome-extension://${extensionId}/engine/model-cache-client.js`);
      const result = await loadModelBytes('https://weights.4chess.cc/maia3_model.bin');
      const { MaiaEngine } = await import(`chrome-extension://${extensionId}/engine/maia-engine.js`);
      const engine = new MaiaEngine(null, { isReady: true, initialize: async () => true });
      await engine.initialize();
      const ready = engine.isReady;
      engine.dispose();
      return { bytes: result.buffer.byteLength, source: result.source, persisted: result.persisted, ready };
    }, args: [id] });
    return response.result;
  }, { tabId, id });
}
async function studioLoad(page, moduleBase = '') {
  return page.evaluate(async base => {
    const { MaiaEngine } = await import(base + '/engine/maia-engine.js');
    const engine = new MaiaEngine(null, { isReady: true, initialize: async () => true });
    await engine.initialize();
    const result = { ready: engine.isReady, source: engine.status.maia.source, worker: !!engine.worker };
    engine.dispose();
    return result;
  }, moduleBase);
}
let run;
try {
  run = await launch();
  const lichess = await run.context.newPage(), chesscom = await run.context.newPage();
  await Promise.all([lichess.goto('https://lichess.org/analysis'), chesscom.goto('https://www.chess.com/analysis')]);
  const results = await Promise.all([hostLoad(run.sw, lichess, run.id), hostLoad(run.sw, chesscom, run.id)]);
  assert.equal(downloads, 1, 'Concurrent chess-site requests share one CDN download');
  assert(results.every(result => result.bytes === weights.length && result.persisted && result.ready));
  assert.deepEqual(results.map(result => result.source).sort(), ['cache', 'cdn']);
  const rejected = await lichess.evaluate(async id => {
    // Page-world access is limited to configured model reads, even on allowed hosts.
    const frame = document.querySelector('iframe[src$="model-cache-frame.html"]');
    const channel = new MessageChannel();
    const result = new Promise(resolve => { channel.port1.onmessage = ({ data }) => {
      if (data.type === 'ready') channel.port1.postMessage({ type: 'load', id: 'reject', url: 'https://untrusted.example/model.bin' });
      else { channel.port1.close(); resolve(data.error); }
    }; });
    frame.contentWindow.postMessage({ type: 'DIVERGE_MODEL_CACHE_CONNECT' }, '*', [channel.port2]);
    return result;
  }, run.id);
  assert.match(rejected, /not a configured CDN/);
  assert.equal(downloads, 1);
  const packaged = await run.context.newPage();
  await packaged.goto(`chrome-extension://${run.id}/engine/model-cache-frame.html`);
  assert.deepEqual(await studioLoad(packaged, `chrome-extension://${run.id}`), { ready: true, source: 'IndexedDB 缓存', worker: true });
  const website = await run.context.newPage();
  await website.goto('https://4chess.cc/analysis/');
  assert.deepEqual(await studioLoad(website), { ready: true, source: 'IndexedDB 缓存', worker: true });
  assert.equal(downloads, 1, 'Packaged and installed-extension website workers reuse the same bytes');
  await run.sw.evaluate(() => chrome.storage.local.set({ cloudflareCdnUrl: 'https://cdn.example/custom.bin' }));
  const custom = await website.evaluate(async () => {
    const { MaiaEngine } = await import('/engine/maia-engine.js');
    const engine = new MaiaEngine(null, { isReady: true, initialize: async () => true }, { variant: '79m' });
    await engine.initialize('https://cdn.example/custom.bin');
    const result = engine.modelMetadata.total_params;
    engine.dispose();
    return result;
  });
  assert.equal(custom, MAIA_VARIANTS['79m'].expected.total_params);
  assert.equal(customDownloads, 1, 'Configured custom CDN keeps the requested variant metadata');
  await run.sw.evaluate(() => chrome.storage.local.set({ cloudflareCdnUrl: '' }));
  offline = true;
  await website.reload();
  assert.deepEqual(await studioLoad(website), { ready: true, source: 'IndexedDB 缓存', worker: true });
  assert.equal(downloads, 1);
  await run.context.close();
  run = await launch();
  const restarted = await run.context.newPage();
  await restarted.goto(`chrome-extension://${run.id}/engine/model-cache-frame.html`);
  assert.equal((await studioLoad(restarted, `chrome-extension://${run.id}`)).ready, true);
  assert.equal(downloads, 1, 'Offline model persists across a browser restart');
  // Website-only context: no extension installed, normal website-origin persistence and workers.
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const standalone = await browser.newContext();
    let siteDownloads = 0;
    await standalone.route('https://4chess.cc/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/analysis/') return route.fulfill({ body: '<!doctype html><title>Standalone</title>', contentType: 'text/html' });
      const file = path.join(root, url.pathname);
      return route.fulfill({ body: fs.readFileSync(file), contentType: mime(file) });
    });
    await standalone.route('https://weights.4chess.cc/**', route => {
      siteDownloads++;
      return route.fulfill({ body: fixture('5m'), contentType: 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    const site = await standalone.newPage();
    await site.goto('https://4chess.cc/analysis/');
    assert.equal((await studioLoad(site)).ready, true);
    await standalone.route('https://weights.4chess.cc/**', route => route.abort());
    await site.reload();
    assert.equal((await studioLoad(site)).ready, true);
    assert.equal(siteDownloads, 1);
  } finally { await browser.close(); }
  console.log('PASS: shared extension-origin cache, concurrent download deduplication, 33 MiB chunking, both chess hosts, packaged/web workers, offline reload/restart, standalone website offline reuse.');
} finally {
  await run?.context.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
