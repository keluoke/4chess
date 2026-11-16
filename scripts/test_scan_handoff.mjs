import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { nativePopup } from "./native_popup_helper.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = path.resolve(import.meta.dirname, ".."),
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "diverge-handoff-")),
  ext = path.join(tmp, "ext");
fs.mkdirSync(ext);
const version = JSON.parse(fs.readFileSync(root + "/manifest.json")).version;
execFileSync("unzip", [
  "-q",
  process.env.SCAN_EXTENSION_ZIP || root + `/releases/diverge-extension-v${version}.zip`,
  "-d",
  ext,
]);
const profile = path.join(tmp, 'profile');
// Connect without Playwright's focus emulation or timer-throttling overrides.
const chrome = spawn(chromium.executablePath(), [
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run',
  '--enable-unsafe-extension-debugging', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`,
], { stdio: 'ignore' });
const exited = once(chrome, 'exit');
let browser;
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 50 && !fs.existsSync(portFile) && chrome.exitCode === null; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const [port, browserPath] = fs.readFileSync(portFile, 'utf8').split('\n');
  browser = await chromium.connectOverCDP(`ws://127.0.0.1:${port}${browserPath}`, { noDefaults: true });
  const [c] = browser.contexts();
  const isExtensionWorker = worker => worker.url().startsWith('chrome-extension://') && worker.url().endsWith('/background.js');
  const sw = c.serviceWorkers().find(isExtensionWorker) || await c.waitForEvent('serviceworker', isExtensionWorker);
  await sw.evaluate(() =>
    chrome.storage.local.set({
      maia3_lang: "en",
      diverge_sound_enabled: false,
      liveEvaluation: false,
      maiaVariant: "5m",
      stockfishVariant: "lite",
    }),
  );
  await c.route("https://weights.4chess.cc/**", (r) => r.abort());
  const fen = "7k/P7/8/8/8/8/8/K7 w - - 0 1";
  const source = "https://www.chess.com/analysis/" + fen.replaceAll(" ", "_");
  await c.route("https://www.chess.com/analysis/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<!doctype html><body><wc-chess-board style="display:block;width:400px;height:400px"><div class="piece wk square-11"></div><div class="piece wp square-17"></div><div class="piece bk square-88"></div></wc-chess-board></body>',
    }),
  );
  if(!process.env.SCAN_PRODUCTION) await c.route("https://4chess.cc/**", (r) => {
    let file = path.join(root, new URL(r.request().url()).pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, "index.html");
    if (!file.startsWith(root + "/") || !fs.existsSync(file))
      return r.fulfill({ status: 404 });
    return r.fulfill({
      path: file,
      contentType:
        {
          ".js": "application/javascript",
          ".css": "text/css",
          ".html": "text/html",
          ".wasm": "application/wasm",
        }[path.extname(file)] || "text/plain",
    });
  });
  const host = await c.newPage();
  await host.goto(source);
  let popup = await nativePopup(c, sw, host);
  await popup.run("document.querySelector('#scan-launch').click()");
  await popup.wait("!document.querySelector('#scan-position').hidden");
  assert.equal(
    await popup.run("document.querySelector('#scan-fen').value"),
    fen,
  );
  assert.equal(
    await popup.run("document.querySelector('#scan-results').hidden"),
    true,
  );
  await popup.run("document.querySelector('#scan-confirm').click()");
  await popup.wait("document.querySelectorAll('#scan-lines button').length>0");
  // User branch with underpromotion must be handed off instead of the scanned original.
  await popup.run(
    "document.querySelector('[data-square=a7]').click();document.querySelector('[data-square=a8]').click()",
  );
  await popup.wait(
    "document.querySelectorAll('.promotion-picker button').length===4",
  );
  await popup.run("document.querySelector('[data-promotion=n]').click()");
  const current = await popup.run("document.querySelector('#scan-fen').value");
  assert(current.startsWith("N6k/"));
  await popup.run("document.querySelector('#scan-flip').click()");
  // Popup close/reopen: current confirmed branch and original survive; engine recomputes.
  await host.bringToFront();
  popup = await nativePopup(c, sw, host);
  await popup.wait("!document.querySelector('#scan-position').hidden");
  assert.equal(
    await popup.run("document.querySelector('#scan-fen').value"),
    current,
  );
  await popup.wait("document.querySelectorAll('#scan-lines button').length>0");
  const created = c.waitForEvent("page");
  await popup.run("document.querySelector('#scan-web').click()");
  const web = await created;
  await web.waitForURL("https://4chess.cc/analysis/**");
  await web.waitForFunction(() => window.__maiaStudioApp?.positions[0]?.fen);
  assert.equal(await web.evaluate(()=>window.__maiaStudioApp.boardUI.orientation),"black");
  assert.equal(await web.locator("#setting-orientation").inputValue(),"black");
  assert.equal(
    await web.evaluate(() => window.__maiaStudioApp.positions[0].fen),
    current,
  );
  assert.equal(await web.locator(".key-moves-section").isVisible(), false);
  assert.equal(await web.locator("#eval-chart-container").isVisible(), false);
  assert.equal(
    await web.evaluate(() => window.__maiaStudioApp.hasAnalysisInput),
    true,
  );
  assert.equal(
    await web.evaluate(() => window.__maiaStudioApp.reviewResult),
    null,
  );
  await web.waitForFunction(() => document.querySelector('#engine-candidate-lines .candidate-line'));
  const branchFen = await web.evaluate(() => {
    const app = window.__maiaStudioApp;
    const move = app.boardUI.chess.getLegalMoves()[0];
    app.boardUI.moveTo(move.fromSq, move.toSq);
    return app.branchFen;
  });
  assert(branchFen);
  const { webId, otherId } = await sw.evaluate(async url => {
    const webTab = (await chrome.tabs.query({})).find(tab => tab.url === url);
    const otherTab = await chrome.tabs.create({ url: 'about:blank', windowId: webTab.windowId, active: true });
    return { webId: webTab.id, otherId: otherTab.id };
  }, web.url());
  await web.waitForFunction(() => document.hidden, null, { polling: 100, timeout: 4000 });
  // Chrome batches background timers on a cadence longer than the old 500ms lease.
  await new Promise(resolve => setTimeout(resolve, 2500));
  assert.equal(await web.locator('#scan-source-lock').count(), 0);
  assert.equal(await web.evaluate(() => document.querySelector('main').inert), true);
  await sw.evaluate(id => chrome.tabs.update(id, { active: true }), webId);
  await web.waitForFunction(() => !document.hidden && !document.querySelector('main').inert, null, { timeout: 3000 });
  assert.equal(await web.locator('#scan-source-lock').count(), 0);
  assert.equal(await web.evaluate(() => window.__maiaStudioApp.branchFen), branchFen);
  await web.waitForFunction(() => document.querySelector('#engine-candidate-lines .candidate-line'));
  await sw.evaluate(id => chrome.tabs.remove(id), otherId);
  const began = await host.evaluate(() => {
    const t = Date.now();
    const clock = document.createElement("div");
    clock.className = "clock-running";
    clock.textContent = "10:00";
    document.body.append(clock);
    return t;
  });
  await web.waitForFunction(() => document.querySelector("#scan-source-lock"));
  const elapsed = Date.now() - began;
  assert(elapsed < 150, "Live source must revoke within 150ms: " + elapsed);
  assert.equal(
    await web.evaluate(() => window.__maiaStudioApp.stockfish.worker),
    null,
  );
  assert.equal(
    await web.locator("#engine-candidate-lines .candidate-line").count(),
    0,
  );
  assert.equal(await web.evaluate(()=>window.__maiaStudioApp.startNewSession({fen:"7k/8/8/8/8/8/8/K7 w - - 0 1",autoReview:true})),false,"A locked scan cannot start another analysis session");
  await web.evaluate(()=>window.__maiaStudioApp.positionAnalysis.refresh());
  assert.equal(await web.evaluate(()=>window.__maiaStudioApp.stockfish.worker),null);
  const copied = await c.newPage();await copied.goto(web.url());await copied.waitForSelector('#scan-source-lock');assert.equal(await copied.evaluate(()=>window.__maiaStudioApp),undefined);assert.match(await copied.locator('#scan-source-lock').innerText(),/scan source/i);await copied.close();
  popup = await nativePopup(c, sw, host);
  await popup.run("document.querySelector('#scan-launch').click()");
  await popup.wait(
    "document.querySelector('#scan-status').textContent.includes('Game in progress')",
  );
  assert.equal(
    await popup.run("document.querySelector('#scan-position').hidden"),
    true,
  );
  console.log(
    "PASS DOM read, confirmation, underpromotion, popup reopen, current-FEN web handoff, tab switch with branch recovery, live-game stop/clear in " +
      elapsed +
      "ms",
  );
} finally {
  await browser?.close();
  chrome.kill();
  await exited;
  fs.rmSync(tmp, { recursive: true, force: true });
}
