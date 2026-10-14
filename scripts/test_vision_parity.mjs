import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { createRequire } from "node:module";
import { VisionRecognizerCore } from "../lib/vision/recognizer-core.js";
import { WebAdapter } from "../lib/vision/web-adapter.js";
import { imageContext } from "../scan/position.js";
import { defaultTurn } from "../lib/vision/default-context.js";
const root = path.resolve(import.meta.dirname, "..");
class LocalAdapter extends WebAdapter {
  async loadAsset(name) {
    const b = fs.readFileSync(root + "/models/" + path.basename(name));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }
  async instantiateWasm(name, imports) {
    const buffer = await this.loadAsset(name);
    const r = await WebAssembly.instantiate(buffer, imports);
    return {
      ...r,
      wasmSha256:
        "cd54b2122ed679eb5f935785a3db425131591f253d1e961c82ce516b456fe169",
    };
  }
}
const fixture = {
  ...JSON.parse(
    fs.readFileSync(root + "/scripts/fixtures/vision/board-endgame.json"),
  ),
  data: new Uint8ClampedArray(
    zlib.inflateSync(
      fs.readFileSync(
        root + "/scripts/fixtures/vision/board-endgame.rgba.zlib",
      ),
    ),
  ),
};
const rec = new VisionRecognizerCore({ adapter: new LocalAdapter() });
await rec.init();
const result = await rec.recognize(fixture);
assert.equal(result.boardFen, "1K6/2R3r1/1P6/1p6/2pk4/3b4/8/7B");
assert.equal(result.metadata.isVerifiedManifest, true);
assert.equal(result.squares.length, 64);
if (process.argv.includes("--source")) {
  const require = createRequire(import.meta.url);
  const Source = require(
    path.join(
      process.env.VISION_SOURCE || path.resolve(root, "../chesspuzzle"),
      "services/vision/core/recognizer-core.js",
    ),
  ).VisionRecognizerCore;
  const other = new Source({ adapter: new LocalAdapter() });
  await other.init();
  const reference = await other.recognize({ ...fixture, gray: undefined });
  for (const key of [
    "layout",
    "rawGrid",
    "grid",
    "boardFen",
    "orientation",
    "activeTurn",
    "suspiciousSquares",
    "fen",
    "validation",
  ])
    assert.deepEqual(result[key], reference[key], key);
  other.destroy();
}
const coordinates = JSON.parse(
  fs.readFileSync(root + "/scripts/fixtures/vision/black-coordinates.json"),
);
const image = {
  width: coordinates.width,
  height: coordinates.height,
  data: new Uint8ClampedArray(
    zlib.inflateSync(
      fs.readFileSync(
        root + "/scripts/fixtures/vision/black-coordinates.rgba.zlib",
      ),
    ),
  ),
};
const detected = await rec.recognize(image);
assert.equal(detected.orientation.perspective, "b");
assert.equal(detected.orientation.requiresConfirmation, false);
assert.equal(detected.boardFen, coordinates.expectedBoard);
const context = imageContext(detected);
assert.equal(context.fen, coordinates.expectedBoard + " b - - 0 1");
assert.equal(context.orientation, "black");
assert.equal(
  context.turnKnown,
  false,
  "Coordinates identify orientation, not whose turn it is",
);
if (process.argv.includes("--source")) {
  const require = createRequire(import.meta.url);
  const reference = require(
    path.join(
      process.env.VISION_SOURCE || path.resolve(root, "../chesspuzzle"),
      "services/vision/default-context.js",
    ),
  ).defaultTurn;
  assert.deepEqual(
    defaultTurn(detected.fen.analysisFen, detected.activeTurn, {
      perspective: "b",
    }),
    reference(detected.fen.analysisFen, detected.activeTurn, {
      perspective: "b",
    }),
  );
}
assert.equal(
  defaultTurn("4k3/8/8/8/8/8/4R3/4K3 w - - 0 1", {}, { perspective: "w" }).turn,
  "b",
  "Check status overrides orientation default",
);
assert.equal(
  defaultTurn(
    context.fen,
    { evidence: [{ type: "text_indicator", turn: "w", confidence: 0.95 }] },
    { perspective: "b" },
  ).turn,
  "w",
  "Explicit turn overrides orientation default",
);
assert.equal(
  defaultTurn(
    context.fen,
    {
      evidence: [
        { type: "text_indicator", turn: "w", confidence: 0.95 },
        { type: "side_to_move", turn: "b", confidence: 0.99 },
      ],
    },
    { perspective: "b" },
  ).conflict,
  true,
);
rec.destroy();
console.log(
  "PASS real pixel golden boards, black coordinate orientation, shared unconfirmed turn defaults, evidence precedence, verified local WASM/weights" +
    (process.argv.includes("--source")
      ? ", identical source/browser recognition"
      : ""),
);
