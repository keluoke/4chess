import { ChessBoard } from "../engine/chess-core.js";
import fs from "node:fs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  imagePosition,
  saneFenFields,
  validHistoricalFields,
} from "../scan/position.js";
const script = fs.readFileSync(
  new URL("../content/scan-source.js", import.meta.url),
  "utf8",
);
const cases = [
  ["https://www.chess.com/analysis", "<wc-chess-board></wc-chess-board>", true],
  [
    "https://www.chess.com/analysis",
    '<div class="clock-running">10:00</div>',
    false,
  ],
  [
    "https://www.chess.com/play/online",
    '<div class="game-over-modal"><div class="game-over-header">White won by checkmate</div></div>',
    true,
  ],
  [
    "https://www.chess.com/play/online",
    '<div class="move-list-result">1-0</div>',
    true,
  ],
  [
    "https://lichess.org/study/abcd",
    '<div class="rclock-running">10:00</div>',
    false,
  ],
  ["https://unknown.example/analysis", "<article>study</article>", false],
  [
    "https://x.com/home",
    '<article data-testid="tweet"><p>White to move and win</p><img src="https://pbs.twimg.com/media/board.jpg"></article><article><video></video></article>',
    true,
  ],
  [
    "https://blog.example/chess",
    '<article><h1>A study</h1><img src="https://blog.example/diagram.png"></article>',
    true,
  ],
  [
    "https://x.com/home",
    '<article data-testid="tweet"><p>Live chess broadcast</p><img src="https://pbs.twimg.com/media/board.jpg"></article>',
    false,
  ],
  [
    "https://x.com/home",
    '<article data-testid="tweet"><video></video><img src="https://pbs.twimg.com/media/board.jpg"></article>',
    false,
  ],
  [
    "https://game.example/play",
    '<div class="clock-running">1:00</div><img src="https://game.example/board.png">',
    false,
  ],
  [
    "https://game.example/game/123",
    '<article><img src="https://game.example/board.png"></article>',
    false,
  ],
  [
    "https://game.example/play",
    '<chess-board></chess-board><img src="https://game.example/board.png">',
    false,
  ],
  [
    "https://blog.example/chess",
    '<article><iframe></iframe><img src="https://blog.example/diagram.png"></article>',
    false,
  ],
  ["https://en.wikipedia.org/wiki/Chess", "<article><img></article>", true],
  [
    "https://en.wikipedia.org/wiki/Chess",
    "<article><iframe></iframe></article>",
    false,
  ],
];
for (const [url, html, allowed] of cases) {
  const dom = new JSDOM("<!doctype html><body>" + html, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.getComputedStyle = dom.window.getComputedStyle;
  globalThis.innerWidth = 1000;
  globalThis.innerHeight = 800;
  globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
    width: 100,
    height: 30,
  });
  for (const image of document.images) {
    Object.defineProperties(image, {
      naturalWidth: { value: 400 },
      naturalHeight: { value: 400 },
      complete: { value: true },
    });
    image.getBoundingClientRect = () => ({
      left: 200,
      top: 100,
      right: 600,
      bottom: 500,
      width: 400,
      height: 400,
    });
  }
  let listener;
  const sent = [];
  globalThis.chrome = {
    runtime: {
      getURL: (relative) => new URL("../" + relative, import.meta.url).href,
      onMessage: {
        addListener: (fn) => (listener = fn),
        removeListener: () => {},
      },
      sendMessage: async (msg) => {
        sent.push(msg);
      },
    },
  };
  delete globalThis.__divergeScanSource;
  await eval(script);
  let result;
  listener({ type: "SCAN_SOURCE_CHECK" }, {}, (value) => (result = value));
  assert.equal(result.allowed, allowed, url + " " + html);
  if (result.allowed && result.imageOnly) {
    assert.equal(result.regions.length, 1);
    assert.deepEqual(result.regions[0], {
      x: 0.2,
      y: 0.125,
      width: 0.4,
      height: 0.5,
    });
    assert.equal(
      result.candidates,
      undefined,
      "Never send DOM nodes outside the source document",
    );
    const image = document.images[0];
    image.src += "?changed";
    await new Promise((r) => setTimeout(r, 20));
    assert(
      sent.some(
        (m) => m.type === "SCAN_REVOKED" && m.reason === "sourceChanged",
      ),
      "Replacing a timeline image must revoke analysis",
    );
    listener(
      { type: "SCAN_SOURCE_CHECK", resetImages: true },
      {},
      (value) => (result = value),
    );
    assert.equal(
      result.allowed,
      true,
      "Explicit rescan can bind the new image",
    );
    const clock = document.createElement("div");
    clock.className = "clock-running";
    document.body.append(clock);
    await new Promise((r) => setTimeout(r, 20));
    assert(
      sent.some((m) => m.type === "SCAN_REVOKED" && m.reason === "liveLocked"),
    );
  }
  if (url.includes("chess.com/analysis") && allowed) {
    const start = Date.now();
    const clock = document.createElement("div");
    clock.className = "clock-running";
    document.body.append(clock);
    await new Promise((r) => setTimeout(r, 20));
    assert(
      sent.some((m) => m.type === "SCAN_REVOKED" && m.reason === "liveLocked"),
    );
    assert(Date.now() - start < 150);
  }
  globalThis.__divergeScanSource.dispose();
  dom.window.close();
}
assert(saneFenFields("7k/8/8/8/8/8/8/K7 w - - 0 1"));
assert(!saneFenFields("7k/8/8/8/8/8/8/K7 w - a3 0 1"));
assert(!saneFenFields("7k/8/8/8/8/8/8/K7 w - - -1 1"));
const raw = Array(64).fill("1");
raw[0] = "K";
raw[63] = "k";
const corrected = Array(64).fill("1");
corrected[4] = "k";
corrected[60] = "K";
const result = {
  rawGrid: raw,
  grid: corrected,
  orientation: { perspective: "b" },
  activeTurn: { turn: "b" },
};
assert.equal(
  imagePosition(result),
  "k7/8/8/8/8/8/8/7K b - - 0 1",
  "Review preserves raw labels, correctly rotates black perspective",
);
console.log(
  "PASS static post/article images, image identity and live revocation, guard precedence, completion persistence, unknown/embedded source lock and raw-label/FEN protocol",
);

assert(
  !validHistoricalFields(
    "7k/8/8/8/8/8/8/K7 w K - 0 1",
    new ChessBoard("7k/8/8/8/8/8/8/K7 w K - 0 1"),
  ),
);
