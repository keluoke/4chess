import assert from "node:assert/strict";
let listener;
const workers = [];
globalThis.chrome = {
  runtime: {
    id: "test",
    getURL: () => "",
    onMessage: { addListener: (fn) => (listener = fn) },
  },
};
globalThis.fetch = async () => ({ blob: async () => new Blob() });
globalThis.createImageBitmap = async () => ({
  width: 8,
  height: 8,
  close() {},
});
globalThis.OffscreenCanvas = class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
  }
  getContext() {
    return {
      drawImage() {},
      getImageData: () => ({
        data: new Uint8ClampedArray(this.width * this.height * 4),
        width: this.width,
        height: this.height,
      }),
    };
  }
};
globalThis.Worker = class {
  constructor() {
    this.terminated = false;
    workers.push(this);
  }
  postMessage(msg) {
    this.id = msg.id;
    this.requestId = msg.requestId;
  }
  terminate() {
    this.terminated = true;
  }
};
await import("../offscreen/vision.js");
const message = (payload) =>
  new Promise((resolve) => listener(payload, { id: "test" }, resolve));
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
await message({
  type: "VISION_CAPTURE",
  id: "a",
  dataUrl: "data:image/png;base64,",
});
const first = message({ type: "VISION_RECOGNIZE", id: "a" });
await turn();
assert.equal(workers.length, 1);
await message({ type: "VISION_CLEAR", id: "a" });
assert.equal((await first).ok, false);
assert.equal(workers[0].terminated, true);
await message({
  type: "VISION_CAPTURE",
  id: "b",
  dataUrl: "data:image/png;base64,",
});
const second = message({ type: "VISION_RECOGNIZE", id: "b" });
await turn();
assert.equal(workers.length, 2);
await message({ type: "VISION_CLEAR", id: "a" });
assert.equal(
  workers[1].terminated,
  false,
  "Old task cancellation must not stop a new worker",
);
workers[0].onmessage({
  data: { id: "a", ok: true, result: { obsolete: true } },
});
await turn();
assert.equal(
  workers[1].terminated,
  false,
  "Old completion/finally must not stop a new worker",
);
workers[1].onmessage({
  data: { id: "b", ok: true, result: { current: true } },
});
const secondReply = await second;
assert.equal(secondReply.ok, true);
assert.deepEqual(secondReply.result, { current: true });
assert.deepEqual(secondReply.frame, {
  x: 0, y: 0, width: 8, height: 8, inputWidth: 8, inputHeight: 8,
  screenshotWidth: 8, screenshotHeight: 8,
});
assert.equal(workers[1].terminated, false, "Healthy completed worker stays parked for reuse");
assert.equal(workers[1].onmessage, null, "Parked idle worker detaches onmessage");
console.log(
  "PASS offscreen cancellation settles immediately, terminates computation, rejects late results and parks healthy worker",
);
// Mask preparation also belongs to its capture, even before a vision worker exists.
let decoded;
globalThis.createImageBitmap = () =>
  new Promise((resolve) => (decoded = resolve));
globalThis.OffscreenCanvas.prototype.convertToBlob = async () => new Blob();
globalThis.OffscreenCanvas.prototype.getContext = function () {
  return {
    fillRect() {},
    drawImage() {},
    getImageData: () => ({
      data: new Uint8ClampedArray(this.width * this.height * 4),
      width: this.width,
      height: this.height,
    }),
  };
};
globalThis.FileReader = class {
  readAsDataURL() {
    this.result = "data:image/png;base64,masked";
    queueMicrotask(() => this.onload());
  }
};
const preparing = message({
  type: "VISION_CAPTURE",
  id: "old-mask",
  dataUrl: "data:image/png;base64,",
  regions: [{ x: 0, y: 0, width: 0.5, height: 1 }],
});
await turn();
await message({
  type: "VISION_CAPTURE",
  id: "new-mask",
  dataUrl: "data:image/png;base64,new",
});
decoded({ width: 8, height: 8, close() {} });
assert.equal(
  (await preparing).ok,
  false,
  "Late mask preparation must not replace a newer capture",
);
globalThis.createImageBitmap = async () => ({
  width: 8,
  height: 8,
  close() {},
});
const current = message({ type: "VISION_RECOGNIZE", id: "new-mask" });
await turn();
assert.equal(workers.length, 2, "New recognition reuses parked idle worker");
assert.equal(workers.at(-1).id, "new-mask");
const req1 = workers.at(-1).requestId;
// Mismatched requestId reply on reused worker must be ignored
workers
  .at(-1)
  .onmessage({ data: { id: "new-mask", requestId: req1 + 999, ok: true, result: { stale: true } } });
workers
  .at(-1)
  .onmessage({ data: { id: "new-mask", requestId: req1, ok: true, result: { maskedCapturePreserved: true } } });
assert.deepEqual((await current).result, { maskedCapturePreserved: true });
console.log("PASS asynchronous image masking cannot overwrite a newer capture and ignores mismatched requestId");

const failed = message({ type: "VISION_RECOGNIZE", id: "new-mask" });
await turn();
assert.equal(workers.length, 2, "Subsequent recognition still reuses healthy worker");
workers.at(-1).onmessage({ data: { id: "new-mask", requestId: workers.at(-1).requestId, ok: false, error: "No board" } });
assert.equal((await failed).ok, false);
assert.equal(workers.at(-1).terminated, false, "Clean business error keeps worker parked for manual retry");
const retried = message({
  type: "VISION_RECOGNIZE",
  id: "new-mask",
  crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
});
await turn();
assert.equal(workers.length, 2, "Manual crop retry reuses the same parked worker");
workers.at(-1).onmessage({ data: { id: "new-mask", requestId: workers.at(-1).requestId, ok: true, result: { retry: true } } });
assert.equal(
  (await retried).ok,
  true,
  "Failure preserves screenshot for a manual crop retry",
);

// Worker crash (onerror) must terminate worker and spawn a fresh one next time
const crashing = message({ type: "VISION_RECOGNIZE", id: "new-mask" });
await turn();
workers.at(-1).onerror({ message: "WASM crashed" });
assert.equal((await crashing).ok, false);
assert.equal(workers.at(-1).terminated, true, "onerror must terminate broken worker");
const recovered = message({ type: "VISION_RECOGNIZE", id: "new-mask" });
await turn();
assert.equal(workers.length, 3, "Fresh worker spawned after onerror");
workers.at(-1).onmessage({ data: { id: "new-mask", requestId: workers.at(-1).requestId, ok: true, result: { recovered: true } } });
assert.equal((await recovered).ok, true);

// Internal worker timeout must terminate worker and spawn a fresh one next time
const timedOut = message({ type: "VISION_RECOGNIZE", id: "new-mask" });
await turn();
assert.equal(workers.length, 3, "Timed-out attempt still reuses healthy worker");
workers.at(-1).onmessage({
  data: { id: "new-mask", requestId: workers.at(-1).requestId, ok: false, error: "Task timed out", timeout: true },
});
assert.equal((await timedOut).ok, false);
assert.equal(workers.at(-1).terminated, true, "Internal worker timeout must terminate worker");

// Degraded JS fallback must deliver result, then terminate worker so next scan retries WASM
const degradedExplicit = message({ type: "VISION_RECOGNIZE", id: "new-mask" });
await turn();
assert.equal(workers.length, 4, "Fresh worker spawned after internal timeout");
workers.at(-1).onmessage({
  data: {
    id: "new-mask",
    requestId: workers.at(-1).requestId,
    ok: true,
    degraded: true,
    result: { metadata: { backend: "js" } },
  },
});
assert.equal((await degradedExplicit).ok, true);
assert.equal(workers.at(-1).terminated, true, "Degraded worker with explicit flag must terminate after scan");

const degradedBackend = message({ type: "VISION_RECOGNIZE", id: "new-mask" });
await turn();
assert.equal(workers.length, 5, "Fresh worker spawned after degraded JS fallback");
workers.at(-1).onmessage({
  data: {
    id: "new-mask",
    requestId: workers.at(-1).requestId,
    ok: true,
    result: { metadata: { backend: "js" } },
  },
});
assert.equal((await degradedBackend).ok, true);
assert.equal(workers.at(-1).terminated, true, "Worker reporting backend=js must terminate after scan");

await message({ type: "VISION_CLEAR", id: "new-mask", terminateIdle: true });
assert.equal(workers.at(-1).terminated, true, "terminateIdle disposes parked worker");
assert.equal(
  (await message({ type: "VISION_RECOGNIZE", id: "new-mask" })).ok,
  false,
  "Accepted results release the screenshot",
);
console.log(
  "PASS failed automatic detection supports manual retry, idle worker reuse, timeout/degraded/onerror recovery work, and acceptance releases screenshot",
);

// Real vision-worker.js failure-recovery tests (hung weights timeout + transient WASM load failure)
const fs = await import("node:fs");
const path = await import("node:path");
const { loadBoard } = await import("./fixtures/vision/scenes.cjs");
const rootDir = path.resolve(import.meta.dirname, "..");
const weightsBytes = fs.readFileSync(path.join(rootDir, "models/chessimg2pos_weights.bin"));
const wasmBytes = fs.readFileSync(path.join(rootDir, "models/chess-cnn.wasm"));
const boardImage = loadBoard("black-coordinates");

async function runWorkerScenario(queryTag, fetchImpl) {
  const replies = [];
  const waitReply = (countBefore) =>
    new Promise((resolve, reject) => {
      const deadline = Date.now() + 10000;
      const poll = () => {
        if (replies.length > countBefore) return resolve(replies[countBefore]);
        if (Date.now() > deadline) return reject(new Error("Timed out waiting for worker reply"));
        setTimeout(poll, 10);
      };
      poll();
    });
  delete globalThis.chrome;
  globalThis.fetch = fetchImpl;
  globalThis.self = {
    postMessage: (msg) => replies.push(msg),
  };
  await import(`../lib/vision/vision-worker.js?${queryTag}`);
  const dispatch = async (payload) => {
    const before = replies.length;
    globalThis.self.onmessage({ data: payload });
    return waitReply(before);
  };
  return { dispatch };
}

// Scenario A: hung weights fetch triggers timeout, then recovery re-fetches weights and succeeds on WASM
let hangWeights = true;
let weightsFetches = 0;
const scenarioA = await runWorkerScenario("timeout-recovery", async (url) => {
  if (String(url).includes("chessimg2pos_weights.bin")) {
    weightsFetches++;
    if (hangWeights) return new Promise(() => {});
    return {
      ok: true,
      arrayBuffer: async () => weightsBytes.buffer.slice(weightsBytes.byteOffset, weightsBytes.byteOffset + weightsBytes.byteLength),
    };
  }
  if (String(url).includes("chess-cnn.wasm")) {
    return {
      ok: true,
      arrayBuffer: async () => wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength),
    };
  }
  throw new Error("Unexpected fetch: " + url);
});
const timeoutReply = await scenarioA.dispatch({
  id: "w-timeout",
  requestId: 1,
  type: "RECOGNIZE",
  imageInfo: { data: boardImage.data, width: boardImage.width, height: boardImage.height },
  options: { activeTurn: "w", timeoutMs: 40 },
  initOptions: { baseUrl: "https://example.test" },
});
assert.equal(timeoutReply.ok, false);
assert.equal(timeoutReply.timeout, true);
assert.equal(weightsFetches, 1);

hangWeights = false;
const afterTimeoutReply = await scenarioA.dispatch({
  id: "w-recover",
  requestId: 2,
  type: "RECOGNIZE",
  imageInfo: { data: boardImage.data, width: boardImage.width, height: boardImage.height },
  options: { activeTurn: "w", timeoutMs: 10000 },
  initOptions: { baseUrl: "https://example.test" },
});
assert.equal(afterTimeoutReply.ok, true);
assert.equal(afterTimeoutReply.result.metadata.backend, "wasm");
assert.equal(afterTimeoutReply.degraded, undefined);
assert.equal(weightsFetches, 2, "Recovered worker must re-fetch weights after timeout");
console.log("PASS vision-worker resets hung recognizer on timeout and recovers to WASM");

// Scenario B: transient WASM load failure falls back to JS once, then next scan retries WASM and recovers
let failWasm = true;
let wasmFetches = 0;
const scenarioB = await runWorkerScenario("wasm-fallback-recovery", async (url) => {
  if (String(url).includes("chessimg2pos_weights.bin")) {
    return {
      ok: true,
      arrayBuffer: async () => weightsBytes.buffer.slice(weightsBytes.byteOffset, weightsBytes.byteOffset + weightsBytes.byteLength),
    };
  }
  if (String(url).includes("chess-cnn.wasm")) {
    wasmFetches++;
    if (failWasm) return { ok: false, statusText: "Temporary Unavailable" };
    return {
      ok: true,
      arrayBuffer: async () => wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength),
    };
  }
  throw new Error("Unexpected fetch: " + url);
});
const jsFallbackReply = await scenarioB.dispatch({
  id: "w-js",
  requestId: 1,
  type: "RECOGNIZE",
  imageInfo: { data: boardImage.data, width: boardImage.width, height: boardImage.height },
  options: { activeTurn: "w", timeoutMs: 10000 },
  initOptions: { baseUrl: "https://example.test" },
});
assert.equal(jsFallbackReply.ok, true);
assert.equal(jsFallbackReply.result.metadata.backend, "js");
assert.equal(jsFallbackReply.degraded, true);
const wasmFetchesBefore = wasmFetches;
assert.ok(wasmFetchesBefore >= 1);

failWasm = false;
const wasmRecoveredReply = await scenarioB.dispatch({
  id: "w-wasm",
  requestId: 2,
  type: "RECOGNIZE",
  imageInfo: { data: boardImage.data, width: boardImage.width, height: boardImage.height },
  options: { activeTurn: "w", timeoutMs: 10000 },
  initOptions: { baseUrl: "https://example.test" },
});
assert.equal(wasmRecoveredReply.ok, true);
assert.equal(wasmRecoveredReply.result.metadata.backend, "wasm");
assert.equal(wasmRecoveredReply.degraded, undefined);
assert.ok(wasmFetches > wasmFetchesBefore, "Next scan after JS fallback must retry WASM");
console.log("PASS vision-worker completes JS fallback then recycles degraded recognizer to recover WASM");
