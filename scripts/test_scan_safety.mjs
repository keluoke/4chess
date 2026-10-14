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
  globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
    width: 100,
    height: 30,
  });
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
  "PASS scan source allow-list, guard precedence, completion persistence, unknown/embedded source lock, live revocation and raw-label/FEN protocol",
);

assert(
  !validHistoricalFields(
    "7k/8/8/8/8/8/8/K7 w K - 0 1",
    new ChessBoard("7k/8/8/8/8/8/8/K7 w K - 0 1"),
  ),
);
