let active = null;
let generation = 0;
function cancelActive() {
  generation++;
  const job = active;
  active = null;
  job?.cancel?.();
  job?.worker?.terminate();
}
let capture = null;
let expiry;
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !msg.type?.startsWith("VISION_"))
    return;
  if (msg.type === "VISION_CAPTURE") {
    cancelActive();
    capture = { id: msg.id, dataUrl: msg.dataUrl };
    clearTimeout(expiry);
    expiry = setTimeout(() => (capture = null), 120000);
    reply({ ok: true });
    return;
  }
  if (msg.type === "VISION_CLEAR") {
    if (msg.id && msg.id !== capture?.id && msg.id !== active?.id) {
      reply({ ok: true });
      return;
    }
    capture = null;
    clearTimeout(expiry);
    cancelActive();
    reply({ ok: true });
    return;
  }
  if (msg.type !== "VISION_RECOGNIZE") return;
  (async () => {
    if (!capture || capture.id !== msg.id)
      throw Error("Screenshot expired; scan again");
    const dataUrl = capture.dataUrl;
    capture = null;
    clearTimeout(expiry);
    cancelActive();
    const job = {
      id: msg.id,
      generation: ++generation,
      worker: null,
      cancel: null,
    };
    active = job;
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    try {
      if (active !== job || job.generation !== generation)
        throw Error("Task cancelled");
      const crop = msg.crop || { x: 0, y: 0, width: 1, height: 1 };
      if (
        Object.values(crop).some((v) => !Number.isFinite(v)) ||
        crop.width <= 0 ||
        crop.height <= 0 ||
        crop.x < 0 ||
        crop.y < 0 ||
        crop.x + crop.width > 1.001 ||
        crop.y + crop.height > 1.001
      )
        throw Error("Invalid crop");
      const x = Math.round(crop.x * bitmap.width),
        y = Math.round(crop.y * bitmap.height),
        w = Math.max(1, Math.round(crop.width * bitmap.width)),
        h = Math.max(1, Math.round(crop.height * bitmap.height));
      // Bound input size/memory; coordinates are in screenshot pixels, independent of DPR/zoom.
      const scale = Math.min(1, 1400 / Math.max(w, h));
      const canvas = new OffscreenCanvas(
        Math.round(w * scale),
        Math.round(h * scale),
      );
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, x, y, w, h, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const worker = (job.worker = new Worker(
        "../lib/vision/vision-worker.js",
        { type: "module" },
      ));
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(Error("Recognition timed out"));
        }, 20000);
        job.cancel = () => {
          clearTimeout(timeout);
          reject(Error("Task cancelled"));
        };
        worker.onmessage = (e) => {
          clearTimeout(timeout);
          e.data.ok
            ? resolve(e.data.result)
            : reject(Error(e.data.error || "Recognition failed"));
        };
        worker.onerror = (e) => {
          clearTimeout(timeout);
          reject(Error(e.message || "Recognition failed"));
        };
        worker.postMessage(
          {
            id: msg.id,
            type: "RECOGNIZE",
            imageInfo: {
              data: data.data,
              width: data.width,
              height: data.height,
            },
            options: { activeTurn: "w", timeoutMs: 18000 },
            initOptions: { baseUrl: chrome.runtime.getURL("") },
          },
          [data.data.buffer],
        );
      });
      reply({ ok: true, result });
    } finally {
      bitmap.close();
      job.worker?.terminate();
      if (active === job) active = null;
    }
  })().catch((error) => reply({ ok: false, error: error.message }));
  return true;
});
