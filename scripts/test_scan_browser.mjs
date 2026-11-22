import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { CHESS_PIECES_SVG } from "../analysis/chess-pieces.js";
import { loadBoard, roundedScreenshot } from "./fixtures/vision/scenes.cjs";
import { nativePopup } from "./native_popup_helper.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = path.resolve(import.meta.dirname, ".."),
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "diverge-scan-")),
  ext = path.join(tmp, "ext");
fs.mkdirSync(ext);
const version = JSON.parse(fs.readFileSync(root + "/manifest.json")).version;
execFileSync("unzip", [
  "-q",
  path.resolve(root, process.env.DIVERGE_RELEASE_DIR || 'releases', `diverge-extension-v${version}.zip`),
  "-d",
  ext,
]);
const context = await chromium.launchPersistentContext(tmp + "/profile", {
  channel: "chromium",
  headless: false,
  viewport: { width: 1100, height: 900 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
try {
  const sw =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(sw.url()).host;
  const errors = [];
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  // Real screenshot pixels of the shipped pieces, no DOM FEN shortcut on Wikipedia.
  let squares = "";
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
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++)
      squares += `<div style="background:${(r + f) % 2 ? "#8eaa8d" : "#e9eadc"};width:64px;height:64px;display:flex;align-items:center;justify-content:center">${CHESS_PIECES_SVG[rows[r][f]] || ""}</div>`;
  const body = `<!doctype html><html><body style="margin:0;background:#fff"><article><h1 style="margin:20px">Chess study diagram</h1><div style="display:grid;grid-template-columns:repeat(8,64px);width:512px;margin:24px">${squares}</div></article></body></html>`;
  await context.route("https://en.wikipedia.org/wiki/Chess", (r) =>
    r.fulfill({ contentType: "text/html", body }),
  );
  const host = await context.newPage();
  await host.goto("https://en.wikipedia.org/wiki/Chess");
  await sw.evaluate(async () => {
    await chrome.storage.local.set({ maia3_lang: "en" });
  });
  const session = await context.browser().newBrowserCDPSession();
  const all = await session.send("Target.getTargets", {
    filter: [{ type: "tab", exclude: false }],
  });
  const hostTarget = all.targetInfos.find(
    (t) => t.url === "https://en.wikipedia.org/wiki/Chess",
  );
  await session.send("Extensions.triggerAction", {
    id: extensionId,
    targetId: hostTarget.targetId,
  });
  let target;
  for (let n = 0; n < 30; n++) {
    const targets = await session.send("Target.getTargets");
    target = targets.targetInfos.find((t) =>
      t.url.includes("/popup/popup.html"),
    );
    if (target) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(target);
  const { sessionId } = await session.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: false,
  });
  let serial = 0;
  const pending = new Map();
  session.on("Target.receivedMessageFromTarget", (e) => {
    if (e.sessionId !== sessionId) return;
    const msg = JSON.parse(e.message),
      pair = pending.get(msg.id);
    if (pair) {
      pending.delete(msg.id);
      msg.error
        ? pair.reject(Error(msg.error.message))
        : pair.resolve(msg.result);
    }
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      session
        .send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch(reject);
    });
  const run = async (expression) => {
    const r = await rpc("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const wait = async (expression, timeout = 30000) =>
    run(
      `new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve(true)}else if(Date.now()-started>${timeout}){clearInterval(timer);reject(Error('Timed out: '+${JSON.stringify(expression)}))}},50)})`,
    );
  await wait("document.querySelector('#scan-launch')");
  await new Promise((r) => setTimeout(r, 300));
  await run("document.querySelector('#scan-launch').click()");
  await wait("!document.querySelector('#scan-position').hidden", 45000);
  assert.equal(
    await run("document.querySelector('#scan-capture').hidden"),
    true,
  );
  console.log(
    "recognition",
    await run(
      "({status:document.querySelector('#scan-status').textContent,fen:document.querySelector('#scan-fen').value})",
    ),
  );
  assert.equal(
    await run("document.querySelector('#scan-position').hidden"),
    false,
  );
  assert.equal(
    await run("document.querySelector('#scan-results').hidden"),
    true,
  );
  const recognized = await run("document.querySelector('#scan-fen').value");
  assert.equal(
    recognized.split(" ")[0],
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
    "Actual screenshot piece recognition",
  );
  await run("document.querySelector('#scan-compare').click()");
  assert.equal(await run("document.querySelector('#scan-comparison').hidden"), false);
  assert.equal(await run("document.querySelector('#scan-comparison').getContext('2d').getImageData(128,128,1,1).data[3]"), 255);
  await run("document.querySelector('#scan-flip').click()");
  assert.equal(await run("document.querySelector('#scan-comparison').classList.contains('flipped')"), true);
  await run("document.querySelector('#scan-flip').click(); document.querySelector('#scan-compare').click()");
  await run(`document.querySelector('[data-square=e2]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
  assert.equal(await run("document.querySelectorAll('#scan-candidates button').length"), 3);
  assert.equal(await run("document.querySelector('#scan-candidates button').dataset.piece"), "P");
  await run("document.querySelector('#scan-candidates button').click()");
  assert.equal(await run("document.querySelector('#scan-results').hidden"), true);
  await run("document.querySelector('#scan-confirm').click()");
  await wait(
    "document.querySelectorAll('#scan-lines button').length===3",
    20000,
  );
  assert.equal(await run("innerWidth"), 368);
  assert((await run("innerHeight")) <= 600);
  assert.equal(
    await run(
      "document.querySelector('#scan-lines').scrollWidth<=document.querySelector('#scan-lines').clientWidth",
    ),
    true,
  );
  fs.mkdirSync(root + "/artifacts/scan", { recursive: true });
  await run("document.body.scrollTop=0;document.documentElement.scrollTop=0");
  assert(
    await run(
      "document.querySelector('#scan-web').getBoundingClientRect().bottom<=innerHeight+1",
    ),
    "Board and SF lines fit the native popup",
  );
  await new Promise(resolve => setTimeout(resolve, 1800)); // Let native popup resize indicators disappear before capturing store artwork.
  let shot = await rpc("Page.captureScreenshot");
  fs.writeFileSync(
    root + "/artifacts/scan/native-scan-en.png",
    Buffer.from(shot.data, "base64"),
  );
  const centre = async (square) =>
    run(
      `(()=>{const r=document.querySelector('[data-square="${square}"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
  const drag = async (from, to, button = "left") => {
    const a = await centre(from),
      b = await centre(to);
    await rpc("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...a,
      button,
      clickCount: 1,
    });
    for (let i = 1; i <= 8; i++)
      await rpc("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: a.x + ((b.x - a.x) * i) / 8,
        y: a.y + ((b.y - a.y) * i) / 8,
        button,
        buttons: button === "left" ? 1 : 2,
      });
    await rpc("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...b,
      button,
      clickCount: 1,
    });
  };
  await drag("g1", "f3", "right");
  assert.equal(
    await run("document.querySelectorAll('.study-annotations line').length"),
    1,
  );
  await drag("e2", "e4");
  await wait("document.querySelector('#scan-fen').value.includes('4P3')");
  assert.equal(await run("document.querySelector('#scan-turn').value"), "b");
  await wait(
    "document.querySelectorAll('#scan-lines button').length===3",
    20000,
  );
  await run("document.querySelector('#scan-flip').click()");
  assert(
    await run(
      "document.querySelector('#scan-gauge').classList.contains('flipped')",
    ),
  );
  await run("document.querySelector('#scan-undo').click()");
  await wait("document.querySelector('#scan-turn').value==='w'");
  await run(`const turn = document.querySelector('#scan-turn');
    turn.value='b'; turn.dispatchEvent(new Event('change')); true`);
  await wait("document.querySelector('#scan-fen').value.includes(' b ') && document.querySelectorAll('#scan-lines button').length===3");
  assert.equal(await run("document.querySelector('#scan-confirm').hidden"), true);
  await run(`document.querySelector('#scan-edit').click();
    document.querySelector('[data-square=e1]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    document.querySelector('#scan-popover-grid button:last-child').click(); true`);
  assert.equal(await run("document.querySelector('#scan-results').hidden"), true);
  assert.match(await run("document.querySelector('#scan-status').textContent"), /Invalid position/);
  await run(`document.querySelector('[data-square=e1]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    document.querySelector('#scan-candidates button[data-piece=K]').click(); true`);
  await wait("document.querySelectorAll('#scan-lines button').length===3");
  assert.equal(await run("document.querySelector('#scan-confirm').hidden"), true);
  await run("document.querySelector('#scan-edit').click()");
  await run(
    "document.querySelector('#scan-settings').click();document.querySelector('#ui-language').value='zh';document.querySelector('#ui-language').dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await wait("document.documentElement.lang==='zh-CN'");
  await run("document.querySelector('#scan-settings-back').click()");
  await wait("document.querySelectorAll('#scan-lines button').length===3");
  shot = await rpc("Page.captureScreenshot");
  fs.writeFileSync(
    root + "/artifacts/scan/native-scan-zh.png",
    Buffer.from(shot.data, "base64"),
  );
  // Lock immediately when a live clock appears on a whitelisted supported platform.
  // Navigate invalidates the source; old results must disappear regardless of new origin.
  await host.goto("https://en.wikipedia.org/wiki/Chess#new-source");
  await wait("document.querySelector('#scan-position').hidden");
  assert.equal(
    await run("document.querySelector('#scan-results').hidden"),
    true,
  );
  assert.equal(await run("document.querySelector('#scan-comparison').width"), 1);
  const domBoard = (matches) => rows.map((row, rank) => [...row].map((piece, file) => {
    if (piece === ".") return "";
    const color = piece === piece.toUpperCase() ? "w" : "b";
    const visibleRank = matches && piece === "P" && file === 4 ? 4 : 8 - rank;
    return `<div class="piece ${color}${piece.toLowerCase()} square-${file + 1}${visibleRank}"></div>`;
  }).join("")).join("");
  await context.route("https://www.chess.com/analysis/scan-**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><wc-chess-board style="display:block;width:400px;height:400px">${domBoard(route.request().url().endsWith("verified"))}</wc-chess-board>
        <div class="vertical-move-list"><div class="node selected">e4</div></div>`,
    }),
  );
  const domSource = await context.newPage();
  await domSource.goto("https://www.chess.com/analysis/scan-verified");
  let domPopup = await nativePopup(context, sw, domSource);
  await domPopup.run("document.querySelector('#scan-launch').click()");
  await domPopup.wait("document.querySelectorAll('#scan-lines button').length===3");
  assert.equal(await domPopup.run("document.querySelector('#scan-confirm').hidden"), true);
  assert.match(await domPopup.run("document.querySelector('#scan-fen').value"), /4P3.* b KQkq e3 /);
  assert.equal(await domPopup.run(`chrome.runtime.sendMessage({type:'SCAN_VALIDATE',id:'obsolete'}).then(r=>r.ok)`), false);
  assert.equal(await domPopup.run("document.querySelector('#scan-results').hidden"), false);
  await domSource.evaluate(() => {
    const clock = document.createElement("div");
    clock.className = "clock-running";
    clock.textContent = "10:00";
    document.body.append(clock);
  });
  await domPopup.wait("document.querySelector('#scan-position').hidden");
  assert.equal(await domPopup.run("document.querySelectorAll('#scan-lines button').length"), 0);
  await domSource.goto("https://www.chess.com/analysis/scan-mismatch");
  domPopup = await nativePopup(context, sw, domSource);
  await domPopup.run("document.querySelector('#scan-launch').click()");
  await domPopup.wait("!document.querySelector('#scan-position').hidden");
  assert.equal(await domPopup.run("document.querySelector('#scan-results').hidden"), true);
  assert.equal(await domPopup.run("document.querySelector('#scan-confirm').hidden"), false);
  const board = loadBoard("board-endgame");
  const rounded = roundedScreenshot(board);
  const packed = deflateSync(rounded.data).toString("base64");
  const recovery = await domPopup.run(`(async () => {
    const raw = Uint8Array.from(atob(${JSON.stringify(packed)}), c => c.charCodeAt(0));
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'));
    const pixels = new Uint8ClampedArray(await new Response(stream).arrayBuffer());
    const canvas = document.createElement('canvas');
    canvas.width = ${rounded.width}; canvas.height = ${rounded.height};
    canvas.getContext('2d').putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
    const id = 'rounded-test';
    const send = (type, data = {}) => chrome.runtime.sendMessage({ type, id, ...data });
    try {
      const capture = await send('VISION_CAPTURE', { dataUrl: canvas.toDataURL() });
      if (!capture?.ok) throw Error(capture?.error || 'Unable to load screenshot');
      const reply = await send('VISION_RECOGNIZE');
      if (!reply?.ok) throw Error(reply?.error || 'Unable to recognize screenshot');
      return {
        boardFen: reply.result.boardFen,
        preprocessing: reply.result.metadata.screenshotPreprocessing,
        suspicious: reply.result.suspiciousSquares.length
      };
    } finally { await send('VISION_CLEAR'); }
  })()`);
  assert.deepEqual(recovery, {
    boardFen: board.board, preprocessing: "roundedCorners", suspicious: 0,
  });
  console.log(
    "PASS actual action popup: screenshot capture, offscreen WASM and rounded recovery, confirmation, real SF3, legal branch, undo, flip, bilingual layout and source-navigation lock",
  );
  assert.deepEqual(errors, []);
} finally {
  await context.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
