import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { VisionRecognizerCore } from "../lib/vision/recognizer-core.js";
import { WebAdapter } from "../lib/vision/web-adapter.js";
import { imageContext } from "../scan/position.js";
import { defaultTurn } from "../lib/vision/default-context.js";
import { loadBoard, scanCases } from "./fixtures/vision/scenes.cjs";
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
const rec = new VisionRecognizerCore({ adapter: new LocalAdapter() });
const sourceRoot = process.env.VISION_SOURCE || path.resolve(root, "../chesspuzzle");
let source;
if (process.argv.includes("--source")) {
  const require = createRequire(import.meta.url);
  const { VisionRecognizerCore: Source } = require(
    path.join(sourceRoot, "services/vision/core/recognizer-core.js"),
  );
  source = new Source();
}
const coordinates = loadBoard("black-coordinates");
const detected = await rec.recognize(coordinates, { recoverRoundedScreenshot: true });
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
      sourceRoot,
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
for (const fixture of scanCases()) {
  const options = { recoverRoundedScreenshot: true };
  const result = await rec.recognize({ ...fixture.image }, options);
  assert.equal(result.boardFen, fixture.boardFen, fixture.name);
  assert.equal(result.validation.needsReview, fixture.needsReview, fixture.name);
  assert.equal(result.layout.hasBoard, fixture.hasBoard, fixture.name);
  assert.equal(result.metadata.screenshotPreprocessing, fixture.preprocessing, fixture.name);
  if (fixture.hasBoard) {
    assert.equal(result.metadata.isVerifiedManifest, true, fixture.name);
    assert.equal(result.squares.length, 64, fixture.name);
  }
  if (source) {
    const reference = await source.recognize({ ...fixture.image }, options);
    for (const key of ["layout", "rawGrid", "grid", "boardFen", "orientation", "activeTurn",
      "suspiciousSquares", "fen", "validation"])
      assert.deepEqual(result[key], reference[key], `${fixture.name}: ${key}`);
    assert.equal(result.metadata.screenshotPreprocessing, reference.metadata.screenshotPreprocessing, fixture.name);
  }
}
source?.destroy();
rec.destroy();
console.log("PASS shared screenshots, rounded retry, perspective review, blank rejection and turn context" +
  (source ? ", with matching Qimi source and browser results" : ""));
