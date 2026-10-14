import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  root + `/releases/diverge-extension-v${version}.zip`,
  "-d",
  ext,
]);
const c = await chromium.launchPersistentContext(tmp + "/profile", {
  channel: "chromium",
  headless: false,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
try {
  const sw = c.serviceWorkers()[0] || (await c.waitForEvent("serviceworker"));
  await sw.evaluate(() =>
    chrome.storage.local.set({
      maia3_lang: "en",
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
    "PASS DOM read, confirmation, underpromotion, popup reopen, current-FEN web handoff, position-only UI, live-game stop/clear in " +
      elapsed +
      "ms",
  );
} finally {
  await c.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
