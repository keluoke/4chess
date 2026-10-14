import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { nativePopup } from "./native_popup_helper.mjs";
import { CHESS_PIECES_SVG } from "../analysis/chess-pieces.js";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = path.resolve(import.meta.dirname, ".."),
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "diverge-crop-")),
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
  viewport: { width: 1200, height: 900 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const grid = (rows, left, id) =>
  `<div id="${id}" style="position:absolute;left:${left}px;top:90px;display:grid;grid-template-columns:repeat(8,64px);width:512px;height:512px">` +
  rows
    .flatMap((row, r) =>
      [...row].map(
        (p, f) =>
          `<div style="background:${(r + f) % 2 ? "#8eaa8d" : "#e9eadc"};width:64px;height:64px">${CHESS_PIECES_SVG[p] || ""}</div>`,
      ),
    )
    .join("") +
  "</div>";
try {
  const sw = c.serviceWorkers()[0] || (await c.waitForEvent("serviceworker"));
  await sw.evaluate(() => chrome.storage.local.set({ maia3_lang: "en" }));
  const url = "https://en.wikipedia.org/wiki/Chess";
  await c.route(url, (r) =>
    r.fulfill({
      contentType: "text/html",
      body:
        "<!doctype html><body><article><h1>Two study diagrams</h1>" +
        grid(
          [
            "rnbqkbnr",
            "pppppppp",
            "........",
            "........",
            "........",
            "........",
            "PPPPPPPP",
            "RNBQKBNR",
          ],
          24,
          "boardA",
        ) +
        grid(
          [
            ".......k",
            "P.......",
            "........",
            "........",
            "........",
            "........",
            "........",
            "K.......",
          ],
          600,
          "boardB",
        ) +
        "</article></body>",
    }),
  );
  const host = await c.newPage();
  await host.goto(url);
  console.log(
    "host probe",
    await host.evaluate(() => ({
      url: location.href,
      article: !!document.querySelector("article"),
      blocked: !!document.querySelector(
        "iframe,canvas,video,[class*=clock],button[aria-label*=resign i]",
      ),
      type: document.contentType,
      body: document.body.textContent.slice(0, 80),
    })),
  );
  let popup = await nativePopup(c, sw, host);
  console.log(
    "active tabs",
    await popup.run(
      "chrome.tabs.query({active:true,currentWindow:true}).then(t=>t.map(x=>({id:x.id,url:x.url})))",
    ),
  );
  await popup.run("document.querySelector('#scan-launch').click()");
  await popup.wait(
    "!document.querySelector('#scan-position').hidden || !document.querySelector('#scan-capture').hidden",
    30000,
  );
  if (await popup.run("document.querySelector('#scan-capture').hidden")) {
    await popup.run(
      "document.querySelector('#scan-edit').click();document.querySelector('#scan-reselect').click()",
    );
  }

  await popup.wait(
    "!document.querySelector('#scan-capture').hidden || document.querySelector('#scan-status').textContent.includes('supports') || document.querySelector('#scan-status').textContent.includes('Could not')",
  );
  console.log(
    "capture status",
    await popup.run("document.querySelector('#scan-status').textContent"),
  );
  if (await popup.run("document.querySelector('#scan-capture').hidden")) {
    console.log(
      "failure detail",
      await popup.run(
        "chrome.runtime.sendMessage({type:'SCAN_START'}).then(r=>({ok:r.ok,error:r.error,source:r.state?.source}))",
      ),
    );
    throw Error("Scan did not reach preview");
  }
  const source = await host.evaluate(() => {
    const r = document.querySelector("#boardB").getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  const preview = await popup.run(
    "(()=>{const r=document.querySelector('#scan-preview').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()",
  );
  const a = {
      x: preview.x + ((source.x - 1) / source.viewportWidth) * preview.width,
      y: preview.y + ((source.y - 1) / source.viewportHeight) * preview.height,
    },
    b = {
      x:
        preview.x +
        ((source.x + source.width + 1) / source.viewportWidth) * preview.width,
      y:
        preview.y +
        ((source.y + source.height + 1) / source.viewportHeight) *
          preview.height,
    };
  await popup.rpc("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: a.x,
    y: a.y,
    button: "left",
    clickCount: 1,
  });
  await popup.rpc("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: b.x,
    y: b.y,
    button: "left",
    buttons: 1,
  });
  await popup.rpc("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: b.x,
    y: b.y,
    button: "left",
    clickCount: 1,
  });
  assert.equal(
    await popup.run("document.querySelector('#scan-crop').disabled"),
    false,
  );
  await popup.run("document.querySelector('#scan-crop').click()");
  await popup.wait("!document.querySelector('#scan-position').hidden", 30000);
  assert.equal(
    await popup.run("document.querySelector('#scan-fen').value.split(' ')[0]"),
    "7k/P7/8/8/8/8/8/K7",
  );
  assert.equal(
    await popup.run("document.querySelector('#scan-results').hidden"),
    true,
  );
  // No board: no evaluation and a recoverable explanation.
  await host.bringToFront();
  await c.route("https://en.wikipedia.org/wiki/No_diagram", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><article><h1>No chess diagram here</h1><p>A plain study article.</p></article>",
    }),
  );
  await host.goto("https://en.wikipedia.org/wiki/No_diagram");
  popup = await nativePopup(c, sw, host);
  await popup.run("document.querySelector('#scan-launch').click()");
  await popup.wait(
    "!document.querySelector('#scan-capture').hidden || document.querySelector('#scan-status').textContent.includes('supports') || document.querySelector('#scan-status').textContent.includes('Could not')",
  );
  console.log(
    "capture status",
    await popup.run("document.querySelector('#scan-status').textContent"),
  );
  if (await popup.run("document.querySelector('#scan-capture').hidden")) {
    console.log(
      "failure detail",
      await popup.run(
        "chrome.runtime.sendMessage({type:'SCAN_START'}).then(r=>({ok:r.ok,error:r.error,source:r.state?.source}))",
      ),
    );
    throw Error("Scan did not reach preview");
  }

  await popup.wait(
    "!document.querySelector('#scan-position').hidden || !document.querySelector('#scan-status').textContent.includes('Recognizing')",
    30000,
  );
  console.log(
    "no-board result",
    await popup.run(
      "({status:document.querySelector('#scan-status').textContent,positionHidden:document.querySelector('#scan-position').hidden})",
    ),
  );
  assert.equal(
    await popup.run("document.querySelector('#scan-position').hidden"),
    true,
  );
  assert.equal(
    await popup.run("document.querySelector('#scan-results').hidden"),
    true,
  );
  assert.equal(
    await popup.run("document.querySelectorAll('#scan-lines button').length"),
    0,
  );
  console.log(
    "PASS actual pointer crop selects the second diagram at DPR 2, raw position awaits confirmation, no-board capture cannot start SF",
  );
} finally {
  await c.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
