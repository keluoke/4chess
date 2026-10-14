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
const root = path.resolve(import.meta.dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "diverge-timeline-"));
const ext = path.join(tmp, "ext");
fs.mkdirSync(ext);
const version = JSON.parse(fs.readFileSync(root + "/manifest.json")).version;
execFileSync("unzip", [
  "-q",
  root + `/releases/diverge-extension-v${version}.zip`,
  "-d",
  ext,
]);
const context = await chromium.launchPersistentContext(tmp + "/profile", {
  channel: "chromium",
  headless: false,
  viewport: { width: 1200, height: 900 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
try {
  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  await sw.evaluate(() => chrome.storage.local.set({ maia3_lang: "en" }));
  const raster = await context.newPage();
  const rows = [
    "rnbqkbnr",
    "pppppppp",
    "........",
    "........",
    "........",
    "........",
    "PPPPPPPP",
    "RNBQKBNR",
  ];
  await raster.setContent(
    '<!doctype html><body style="margin:0"><div id="fixture" style="width:512px;height:512px;display:grid;grid-template-columns:repeat(8,64px)">' +
      rows
        .flatMap((row, r) =>
          [...row].map(
            (p, f) =>
              `<div style="width:64px;height:64px;background:${(r + f) % 2 ? "#8eaa8d" : "#e9eadc"}">${CHESS_PIECES_SVG[p] || ""}</div>`,
          ),
        )
        .join("") +
      "</div>",
  );
  const png = process.env.SCAN_SAMPLE_IMAGE
    ? fs.readFileSync(process.env.SCAN_SAMPLE_IMAGE)
    : await raster.locator("#fixture").screenshot();
  await raster.close();
  await context.route("https://pbs.twimg.com/media/*", (r) =>
    r.fulfill({ contentType: "image/png", body: png }),
  );
  const timeline = `<!doctype html><body style="margin:0;background:#181818;color:white;font:16px sans-serif">
    <nav style="position:absolute;left:20px;top:50px">Home / Explore / Profile</nav>
    <main style="width:560px;margin:25px 0 0 220px"><h1>For you</h1>
    <article data-testid="tweet"><p>@chessstudy · White to move</p><div data-testid="tweetPhoto"><img id="diagram" src="https://pbs.twimg.com/media/study.png" style="display:block;width:448px;height:448px"></div><p>Reply · Repost · Like</p></article>
    <article data-testid="tweet"><p>Another post</p><video style="width:300px;height:150px"></video></article></main>
    <aside style="position:absolute;left:860px;top:80px">Trending / Search</aside></body>`;
  const urls = ["https://x.com/home", "https://forum.example/thread/chess"];
  await context.route(urls[0], (r) =>
    r.fulfill({
      contentType: "text/html",
      body: timeline.replace(
        '<img id="diagram" src="https://pbs.twimg.com/media/study.png" style="display:block;width:448px;height:448px">',
        '<div style="position:relative;width:448px;height:448px"><div style="position:absolute;inset:0;background-image:url(https://pbs.twimg.com/media/study.png);background-size:cover"></div><img id="diagram" src="https://pbs.twimg.com/media/study.png" style="position:absolute;inset:0;width:100%;height:100%;opacity:0"></div>',
      ),
    }),
  );
  await context.route(urls[1], (r) =>
    r.fulfill({
      contentType: "text/html",
      body: timeline.replace('data-testid="tweet"', 'class="post"'),
    }),
  );
  const host = await context.newPage();
  for (const url of urls) {
    await host.goto(url);
    await host.locator("#diagram").evaluate((image) => image.decode());
    const popup = await nativePopup(context, sw, host);
    await popup.run("document.querySelector('#scan-launch').click()");
    await popup.wait(
      "!document.querySelector('#scan-position').hidden || (!document.querySelector('#scan-capture').hidden && document.querySelector('#scan-status').textContent.includes('No reliable'))",
      30000,
    );
    assert.equal(
      await popup.run("document.querySelector('#scan-capture').hidden"),
      true,
      "Automatic recognition skips the crop step",
    );
    assert.equal(
      await popup.run("document.querySelector('#scan-position').hidden"),
      false,
      await popup.run("document.querySelector('#scan-status').textContent"),
    );
    assert.equal(
      await popup.run(
        "document.querySelector('#scan-fen').value.split(' ')[0]",
      ),
      process.env.SCAN_SAMPLE_FEN ||
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
    );
    if (url === urls[0] && !process.env.SCAN_SAMPLE_IMAGE) {
      const originalFen = await popup.run(
        "document.querySelector('#scan-fen').value",
      );
      assert.equal(
        await popup.run(
          "document.querySelector('#scan-rotate').getClientRects().length",
        ),
        0,
        "Direction correction lives only in the editor",
      );
      await popup.run("document.querySelector('#scan-flip').click()");
      assert.equal(
        await popup.run("document.querySelector('#scan-fen').value"),
        originalFen,
        "Viewing angle keeps the FEN",
      );
      await popup.run(
        "document.querySelector('#scan-flip').click();document.querySelector('#scan-edit').click()",
      );
      await popup.run(
        "document.querySelector('#scan-rotate').click();document.querySelector('#scan-rotate').click()",
      );
      assert.equal(
        await popup.run("document.querySelector('#scan-fen').value"),
        originalFen,
        "Direction correction remaps the pieces, and repeating restores them",
      );
      await popup.run(
        "document.querySelector('#scan-palette button:last-child').click()",
      );
      const square = await popup.run(
        "(()=>{const r=document.querySelector('#scan-board [data-square=\"a2\"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()",
      );
      await popup.rpc("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...square,
        button: "left",
        clickCount: 1,
      });
      await popup.rpc("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...square,
        button: "left",
        clickCount: 1,
      });
      const draftFen = await popup.run(
        "document.querySelector('#scan-fen').value",
      );
      assert.notEqual(
        draftFen,
        originalFen,
        "Direct board correction changes the draft",
      );
      await popup.run("document.querySelector('#scan-settings').click()");
      assert.equal(
        await popup.run("document.querySelector('#popup-settings').hidden"),
        false,
      );
      assert.equal(
        await popup.run("document.querySelector('#scan-view').inert"),
        true,
      );
      await popup.run(
        "document.querySelector('#model-preset-select').value='79m';document.querySelector('#model-preset-select').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.advanced-settings').open=true;document.querySelector('.custom-cdn').open=true",
      );
      assert.equal(
        (await popup.run("chrome.storage.local.get('maiaVariant')"))
          .maiaVariant,
        "79m",
      );
      await popup.run(
        "document.querySelector('.settings-content').scrollTop=9999",
      );
      const bounds = await popup.run(
        "(()=>{const s=document.querySelector('.settings-content'),f=document.querySelector('.popup-footer').getBoundingClientRect();return{scrollable:s.scrollHeight>s.clientHeight,bottom:f.bottom,height:innerHeight}})()",
      );
      assert.equal(bounds.scrollable, true);
      assert(
        bounds.bottom <= bounds.height + 1,
        "Settings footer remains reachable in the native popup",
      );
      fs.mkdirSync(root + "/artifacts/scan", { recursive: true });
      const settingsShot = await popup.rpc("Page.captureScreenshot");
      fs.writeFileSync(
        root + "/artifacts/scan/settings-screen-en.png",
        Buffer.from(settingsShot.data, "base64"),
      );
      await popup.run("document.querySelector('#scan-settings-back').click()");
      assert.equal(
        await popup.run("document.querySelector('#scan-fen').value"),
        draftFen,
      );
      assert.equal(
        await popup.run("document.querySelector('#scan-editor').hidden"),
        false,
        "Returning from settings preserves edit mode",
      );
      await popup.run(
        "document.querySelector('#scan-settings').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))",
      );
      assert.equal(
        await popup.run("document.querySelector('#popup-settings').hidden"),
        true,
      );
      await popup.run(
        `document.querySelector('#scan-fen').value=${JSON.stringify(originalFen)};document.querySelector('#scan-fen').dispatchEvent(new Event('change',{bubbles:true}))`,
      );
      await popup.run("document.querySelector('#scan-edit').click()");
      assert.equal(
        await popup.run("document.querySelector('#scan-editor').hidden"),
        true,
      );
      console.log(
        "PASS viewing/correction semantics, dedicated scrollable settings, explicit Back/Escape and edit draft preservation",
      );
    }
    if (process.env.SCAN_SAMPLE_IMAGE) {
      const s = await popup.run(
        "chrome.storage.session.get('divergeScan').then(r=>r.divergeScan)",
      );
      assert.equal(s.orientation, "black");
      assert.equal(s.fen.split(" ")[1], "b");
      assert.equal(s.recognitionContext.turnKnown, false);
      assert.match(
        await popup.run("document.querySelector('#scan-status').textContent"),
        /default.*confirm/,
      );
      fs.mkdirSync(root + "/artifacts/scan", { recursive: true });
      await popup.run("chrome.storage.local.set({maia3_lang:'zh'})");
      await popup.wait(
        "document.querySelector('#scan-status').textContent.includes('默认值')",
      );
      assert.match(
        await popup.run("document.querySelector('#scan-status').textContent"),
        /黑方视角.*坐标已识别.*黑方行棋.*默认值/,
      );
      const reviewShot = await popup.rpc("Page.captureScreenshot");
      fs.writeFileSync(
        root + "/artifacts/scan/user-coordinates-review-zh.png",
        Buffer.from(reviewShot.data, "base64"),
      );
      await popup.run("chrome.storage.local.set({maia3_lang:'en'})");
      await popup.wait(
        "document.querySelector('#scan-status').textContent.includes('default')",
      );
      console.log(
        "User sample context:",
        JSON.stringify({
          orientation: s.recognition.orientation,
          turn: s.recognition.activeTurn,
          context: s.recognitionContext,
        }),
      );
    }
    await popup.run("document.querySelector('#scan-confirm').click()");
    await popup.wait(
      "document.querySelectorAll('#scan-lines button').length === 3",
      30000,
    );
    fs.mkdirSync(root + "/artifacts/scan", { recursive: true });
    const image = await popup.rpc("Page.captureScreenshot");
    fs.writeFileSync(
      root +
        `/artifacts/scan/${url.includes("x.com") ? "timeline" : "article"}-scan-en.png`,
      Buffer.from(image.data, "base64"),
    );
    await host.evaluate(
      () => (document.querySelector("#diagram").src += "?replacement"),
    );
    await popup.wait(
      "document.querySelector('#scan-position').hidden && document.querySelector('#scan-results').hidden",
    );
    assert.equal(
      await popup.run("document.querySelectorAll('#scan-lines button').length"),
      0,
      "Timeline image replacement stops and clears analysis",
    );
    console.log(
      "PASS native Scan, DPR2 screenshot/masking, local WASM exact initial position, real SF MultiPV3, image replacement revocation:",
      url,
    );
  }
  const lockedUrl = "https://unknown-chess.example/play";
  await context.route(lockedUrl, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: timeline.replace(
        "<main",
        '<div class="clock-running">0:59</div><main',
      ),
    }),
  );
  await host.goto(lockedUrl);
  await host.locator("#diagram").evaluate((image) => image.decode());
  const locked = await nativePopup(context, sw, host);
  await locked.run("document.querySelector('#scan-launch').click()");
  await locked.wait(
    "document.querySelector('#scan-status').textContent.includes('Fair-play')",
  );
  assert.equal(
    await locked.run("document.querySelector('#scan-capture').hidden"),
    true,
  );
  assert.equal(
    await locked.run("document.querySelector('#scan-results').hidden"),
    true,
  );
  console.log(
    "PASS unknown interactive live-game page cannot capture or analyze a diagram",
  );
} finally {
  await context.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
