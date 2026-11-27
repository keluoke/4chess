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

await message({ type: "VISION_CLEAR", id: "new-mask", terminateIdle: true });
assert.equal(workers.at(-1).terminated, true, "terminateIdle disposes parked worker");
assert.equal(
  (await message({ type: "VISION_RECOGNIZE", id: "new-mask" })).ok,
  false,
  "Accepted results release the screenshot",
);
console.log(
  "PASS failed automatic detection supports manual retry, idle worker reuse & onerror recovery work, and acceptance releases screenshot",
);
