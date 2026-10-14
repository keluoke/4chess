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
      "!document.querySelector('#scan-capture').hidden || document.querySelector('#scan-status').textContent.includes('No visible')",
    );
    assert.equal(
      await popup.run("document.querySelector('#scan-capture').hidden"),
      false,
      url,
    );
    assert.deepEqual(
      await popup.run(
        "[...document.querySelector('#scan-preview').getContext('2d').getImageData(5,5,1,1).data]",
      ),
      [255, 255, 255, 255],
      "Non-image page content is masked",
    );
    await popup.run("document.querySelector('#scan-detect').click()");
    await popup.wait(
      "!document.querySelector('#scan-position').hidden || document.querySelector('#scan-status').textContent.includes('No reliable')",
      30000,
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
