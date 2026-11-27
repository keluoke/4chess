/**
 * Dedicated Web Worker for Chess Vision Recognition (Chrome MV3)
 * Runs inference off the main thread with cancellation and abort protection.
 */
import { VisionRecognizerCore } from './recognizer-core.js';
import { WebAdapter } from './web-adapter.js';

let recognizer = null;
let currentTaskId = 0;
let activeAbortController = null;
let activeMsgId = null;

function resetRecognizer() {
  if (!recognizer) return;
  try {
    recognizer.destroy();
  } catch (_) {}
  recognizer = null;
}

async function getRecognizer(initOptions = {}, isStale = () => false) {
  if (!recognizer) {
    const baseUrl = initOptions.baseUrl || '';
    const adapter = new WebAdapter({ baseUrl });
    const instance = new VisionRecognizerCore({
      adapter,
      wasmPath: 'models/chess-cnn.wasm',
      weightsPath: 'models/chessimg2pos_weights.bin'
    });
    try {
      await instance.init();
    } catch (error) {
      try { instance.destroy(); } catch (_) {}
      throw error;
    }
    if (isStale()) {
      try { instance.destroy(); } catch (_) {}
      return null;
    }
    recognizer = instance;
  }
  return recognizer;
}

self.onmessage = async (e) => {
  const { id, requestId, type, imageInfo, options, initOptions } = e.data || {};
  const corr = requestId !== undefined ? { requestId } : {};
  if (type === 'CANCEL') {
    currentTaskId++;
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    const cancelReplyId = (id !== undefined && id !== null) ? id : activeMsgId;
    activeMsgId = null;
    if (cancelReplyId !== undefined && cancelReplyId !== null) {
      self.postMessage({ id: cancelReplyId, ...corr, ok: false, error: 'Task cancelled', cancelled: true });
    }
    return;
  }

  // Abort and settle any previously running in-flight task
  if (activeAbortController) {
    activeAbortController.abort();
    if (activeMsgId !== null && activeMsgId !== undefined) {
      self.postMessage({ id: activeMsgId, ok: false, error: 'Task superseded by new request', cancelled: true });
    }
  }
  const abortController = new AbortController();
  activeAbortController = abortController;
  activeMsgId = id;

  const thisTaskId = ++currentTaskId;
  const timeoutMs = (options && options.timeoutMs) || 15000;
  let timeoutTimer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutTimer = setTimeout(() => {
      const err = new Error('Task ' + id + ' timed out after ' + timeoutMs + 'ms');
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });

  try {
    const taskPromise = (async () => {
      const isStale = () => thisTaskId !== currentTaskId || abortController.signal.aborted;
      const rec = await getRecognizer(initOptions, isStale);
      if (!rec || isStale()) {
        return;
      }

      if (type === 'LOCATE') {
        const loc = rec.locate(imageInfo);
        if (isStale()) return;
        return { ok: true, result: loc };
      } else if (type === 'RECOGNIZE') {
        const runOptions = { ...options, signal: abortController.signal, recoverRoundedScreenshot: true };
        const res = await rec.recognize(imageInfo, runOptions);
        if (isStale()) return;
        return { ok: true, result: res };
      }
    })();

    const result = await Promise.race([taskPromise, timeoutPromise]);
    if (thisTaskId !== currentTaskId || abortController.signal.aborted) {
      return;
    }
    if (result) {
      const degraded = recognizer?.classifier?.backend === 'js' || result?.result?.metadata?.backend === 'js';
      if (degraded) {
        resetRecognizer();
        self.postMessage({ id, ...corr, degraded: true, ...result });
      } else {
        self.postMessage({ id, ...corr, ...result });
      }
    }
  } catch (err) {
    if (thisTaskId !== currentTaskId || abortController.signal.aborted) {
      return;
    }
    if (err.name === 'TimeoutError') {
      abortController.abort();
      resetRecognizer();
      self.postMessage({ id, ...corr, ok: false, error: err.message, timeout: true });
      return;
    }
    self.postMessage({ id, ...corr, ok: false, error: err.message });
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (thisTaskId === currentTaskId) {
      activeAbortController = null;
      activeMsgId = null;
    }
  }
};
