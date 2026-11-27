const IDLE_WORKER_TTL_MS = 60_000;
let active = null;
let generation = 0;
let idleWorker = null;
let idleTimer = null;
let requestSeq = 0;

function disposeIdleWorker() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const worker = idleWorker;
  idleWorker = null;
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
}

function parkIdleWorker(worker) {
  if (!worker) return;
  disposeIdleWorker();
  worker.onmessage = null;
  worker.onerror = () => {
    if (idleWorker === worker) disposeIdleWorker();
  };
  idleWorker = worker;
  idleTimer = setTimeout(() => {
    if (idleWorker === worker) disposeIdleWorker();
  }, IDLE_WORKER_TTL_MS);
  if (typeof idleTimer?.unref === "function") idleTimer.unref();
}

function acquireWorker() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const worker = idleWorker;
  idleWorker = null;
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    return worker;
  }
  return new Worker("../lib/vision/vision-worker.js", { type: "module" });
}

function cancelActive() {
  generation++;
  const job = active;
  active = null;
  job?.cancel?.();
  job?.worker?.terminate();
}
let capture = null;
let expiry;
async function maskImages(dataUrl, regions) {
  if (
    !Array.isArray(regions) ||
    !regions.length ||
    regions.length > 32 ||
    regions.some(
      (r) =>
        !r ||
        ["x", "y", "width", "height"].some((k) => !Number.isFinite(r[k])) ||
        r.x < 0 ||
        r.y < 0 ||
        r.width <= 0 ||
        r.height <= 0 ||
        r.x + r.width > 1.001 ||
        r.y + r.height > 1.001,
    )
  )
    throw Error("Invalid image regions");
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const r of regions) {
      const x = Math.ceil(r.x * bitmap.width),
        y = Math.ceil(r.y * bitmap.height);
      const w = Math.floor((r.x + r.width) * bitmap.width) - x;
      const h = Math.floor((r.y + r.height) * bitmap.height) - y;
      if (w > 0 && h > 0) ctx.drawImage(bitmap, x, y, w, h, x, y, w, h);
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error("Image preparation failed"));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !msg.type?.startsWith("VISION_"))
    return;
  if (msg.type === "VISION_CAPTURE") {
    cancelActive();
    const version = generation;
    capture = { id: msg.id, dataUrl: null };
    clearTimeout(expiry);
    (async () => {
      const dataUrl = msg.regions
        ? await maskImages(msg.dataUrl, msg.regions)
        : msg.dataUrl;
      if (version !== generation || capture?.id !== msg.id)
        throw Error("Task cancelled");
      capture.dataUrl = dataUrl;
      expiry = setTimeout(() => (capture = null), 120000);
      reply({ ok: true, dataUrl });
    })().catch((error) => reply({ ok: false, error: error.message }));
    return true;
  }
  if (msg.type === "VISION_CLEAR") {
    if (msg.terminateIdle === true) disposeIdleWorker();
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
    if (!capture?.dataUrl || capture.id !== msg.id)
      throw Error("Screenshot expired; scan again");
    const dataUrl = capture.dataUrl;
    cancelActive();
    const requestId = ++requestSeq;
    const job = {
      id: msg.id,
      requestId,
      generation: ++generation,
      worker: null,
      cancel: null,
    };
    active = job;
    let reusable = false;
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    try {
      if (active !== job || job.generation !== generation)
        throw Error("Task cancelled");
      const crop = msg.crop || { x: 0, y: 0, width: 1, height: 1 };
      if (
        [crop.x, crop.y, crop.width, crop.height].some((v) => !Number.isFinite(v)) ||
        crop.width <= 0 ||
        crop.height <= 0 ||
        crop.x < 0 ||
        crop.y < 0 ||
        crop.x + crop.width > 1.001 ||
        crop.y + crop.height > 1.001
      )
        throw Error("Invalid crop");
      const x = Math.min(bitmap.width - 1, Math.round(crop.x * bitmap.width)),
        y = Math.min(bitmap.height - 1, Math.round(crop.y * bitmap.height)),
        right = Math.min(bitmap.width, Math.round((crop.x + crop.width) * bitmap.width)),
        bottom = Math.min(bitmap.height, Math.round((crop.y + crop.height) * bitmap.height)),
        w = Math.max(1, right - x),
        h = Math.max(1, bottom - y);
      // Bound input size/memory; coordinates are in screenshot pixels, independent of DPR/zoom.
      const scale = Math.min(1, 1400 / Math.max(w, h));
      const canvas = new OffscreenCanvas(
        Math.round(w * scale),
        Math.round(h * scale),
      );
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, x, y, w, h, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const worker = (job.worker = acquireWorker());
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
          if (active !== job || job.generation !== generation) return;
          if (e.data?.requestId !== undefined && e.data.requestId !== job.requestId) return;
          if (e.data?.id !== undefined && e.data.id !== job.id) return;
          const degraded =
            e.data?.degraded === true ||
            (e.data?.ok === true &&
              e.data?.result?.metadata?.backend !== undefined &&
              e.data.result.metadata.backend !== "wasm" &&
              e.data.result.metadata.backend !== "native");
          reusable = !e.data?.timeout && !e.data?.cancelled && !degraded;
          clearTimeout(timeout);
          e.data.ok
            ? resolve(e.data.result)
            : reject(Error(e.data.error || "Recognition failed"));
        };
        worker.onerror = (e) => {
          reusable = false;
          clearTimeout(timeout);
          reject(Error(e.message || "Recognition failed"));
        };
        worker.postMessage(
          {
            id: msg.id,
            requestId: job.requestId,
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
      const frame = {
        x, y, width: w, height: h,
        inputWidth: canvas.width,
        inputHeight: canvas.height,
        screenshotWidth: bitmap.width,
        screenshotHeight: bitmap.height,
      };
      reply({ ok: true, result, frame });
    } finally {
      bitmap.close();
      if (reusable && job.worker) {
        parkIdleWorker(job.worker);
      } else {
        job.worker?.terminate();
      }
      if (active === job) active = null;
    }
  })().catch((error) => reply({ ok: false, error: error.message }));
  return true;
});
