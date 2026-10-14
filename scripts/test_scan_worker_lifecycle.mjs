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
assert.deepEqual(await second, { ok: true, result: { current: true } });
assert.equal(workers[1].terminated, true);
console.log(
  "PASS offscreen cancellation settles immediately, terminates computation, rejects late results and preserves a newer worker",
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
assert.equal(workers.at(-1).id, "new-mask");
workers
  .at(-1)
  .onmessage({ data: { ok: true, result: { maskedCapturePreserved: true } } });
assert.equal((await current).ok, true);
console.log("PASS asynchronous image masking cannot overwrite a newer capture");
