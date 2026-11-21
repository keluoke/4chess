import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { createRequire } from "node:module";
import { VisionRecognizerCore } from "../lib/vision/recognizer-core.js";
import { WebAdapter } from "../lib/vision/web-adapter.js";
import { imageContext } from "../scan/position.js";
import { defaultTurn } from "../lib/vision/default-context.js";
import { recognizeScreenshot } from "../scan/screenshot-recognition.js";
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
// Preserve the original board pixels and reproduce a rounded screenshot with
// a tight evaluation bar and enough side-panel edges to trigger the quad path.
const scene = { width: 1400, height: 950 };
scene.data = new Uint8ClampedArray(scene.width * scene.height * 4);
const left = 180, top = 130, radius = 40;
for (let y = 0; y < scene.height; y++) {
  for (let x = 0; x < scene.width; x++) {
    const dx = x - left, dy = y - top;
    const clipX = Math.max(0, radius - Math.min(dx, fixture.width - 1 - dx));
    const clipY = Math.max(0, radius - Math.min(dy, fixture.height - 1 - dy));
    const index = (y * scene.width + x) * 4;
    const inside = dx >= 0 && dy >= 0 && dx < fixture.width && dy < fixture.height;
    if (inside && clipX ** 2 + clipY ** 2 < radius ** 2) {
      const pixel = (dy * fixture.width + dx) * 4;
      scene.data.set(fixture.data.subarray(pixel, pixel + 4), index);
    } else {
      let gray = 31;
      if (x >= left - 19 && x < left - 2 && dy >= 0 && dy < fixture.height)
        gray = dy < fixture.height * 0.56 ? 5 : 240;
      if (dx >= fixture.width + 10 && x < scene.width - 30 &&
          dy >= 32 && y < scene.height - 30) {
        gray = y % 27 < 10 && x % 43 > 9 ? 235 : 52;
        if (x % 100 < 12 || y % 83 < 12) gray = 245;
      }
      scene.data.set([gray, gray, gray, 255], index);
    }
  }
}
const repaired = await recognizeScreenshot(rec, scene);
assert.equal(repaired.metadata.screenshotPreprocessing, "roundedCorners");
assert.equal(repaired.boardFen, fixture.board, "Rounded and cluttered screenshot restores all 64 squares");
assert.deepEqual(repaired.suspiciousSquares, []);
assert.equal(repaired.metadata.isVerifiedManifest, true);
rec.destroy();
console.log(
  "PASS real pixel golden boards, black coordinate orientation, shared unconfirmed turn defaults, evidence precedence, verified local WASM/weights" +
    (process.argv.includes("--source")
      ? ", identical source/browser recognition"
      : ""),
);
