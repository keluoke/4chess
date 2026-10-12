/**
 * Task Lifecycle & Cancellation Controller
 * Provides generational taskId tracking, AbortSignal handling,
 * timeout protection and stale task disposal.
 */

class VisionTaskController {
  constructor(recognizerCore) {
    this.recognizer = recognizerCore;
    this.currentAbortController = null;
    this.currentCancelCallback = null;
    this.currentTaskId = 0;
  }

  cancelCurrentTask() {
    this.currentTaskId++;
    if (this.currentCancelCallback) {
      try {
        this.currentCancelCallback();
      } catch (_) {}
      this.currentCancelCallback = null;
    }
    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch (_) {}
      this.currentAbortController = null;
    }
  }

  /**
   * Executes a recognition task with cancellation protection.
   * @param {any} imageInfo
   * @param {object} [options={}]
   * @returns {Promise<object|null>}
   */
  async execute(imageInfo, options = {}) {
    // 1. Cancel previous pending task
    this.cancelCurrentTask();

    // If external caller signal is already aborted, abort immediately
    if (options.signal && options.signal.aborted) {
      return null;
    }

    const taskId = ++this.currentTaskId;
    const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    this.currentAbortController = ac;

    let externalAbortHandler = null;
    if (options.signal && ac) {
      externalAbortHandler = () => {
        this.currentTaskId++;
        try { ac.abort(); } catch (_) {}
      };
      if (typeof options.signal.addEventListener === 'function') {
        options.signal.addEventListener('abort', externalAbortHandler, { once: true });
      }
    }

    let cancelHandler = null;
    const cancelPromise = new Promise((resolve) => {
      cancelHandler = () => {
        if (!isTimedOut) {
          resolve({ cancelled: true });
        }
      };
      this.currentCancelCallback = cancelHandler;
      if (ac && ac.signal) {
        if (ac.signal.aborted && !isTimedOut) {
          resolve({ cancelled: true });
        } else {
          ac.signal.addEventListener('abort', cancelHandler, { once: true });
        }
      }
      if (options.signal) {
        if (options.signal.aborted) {
          resolve({ cancelled: true });
        } else if (typeof options.signal.addEventListener === 'function') {
          options.signal.addEventListener('abort', cancelHandler, { once: true });
        }
      }
    });

    let timeoutTimer = null;
    let isTimedOut = false;
    const timeoutMs = options.timeoutMs || 15000;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => {
        isTimedOut = true;
        const err = new Error(`[VisionTaskController] Task ${taskId} timed out after ${timeoutMs}ms`);
        err.name = 'TimeoutError';
        if (ac) {
          try { ac.abort(); } catch (_) {}
        }
        reject(err);
      }, timeoutMs);
      if (timeoutTimer && timeoutTimer.unref) timeoutTimer.unref();
    });

    try {
      const runPromise = this.recognizer.recognize(imageInfo, {
        ...options,
        signal: ac ? ac.signal : (options.signal || null),
        taskId
      });

      const raceWinner = await Promise.race([runPromise, timeoutPromise, cancelPromise]);

      if (isTimedOut) {
        const timeoutErr = new Error(`[VisionTaskController] Task ${taskId} timed out after ${timeoutMs}ms`);
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }

      if (raceWinner && raceWinner.cancelled) {
        return null;
      }

      // 2. Stale task discard: ensure task wasn't preempted or aborted while running
      if (taskId !== this.currentTaskId || (options.signal && options.signal.aborted)) {
        return null;
      }
      return raceWinner;
    } catch (err) {
      if (isTimedOut || err.name === 'TimeoutError') {
        const timeoutErr = new Error(`[VisionTaskController] Task ${taskId} timed out after ${timeoutMs}ms`);
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }
      if (err.name === 'AbortError' || (options.signal && options.signal.aborted)) {
        return null;
      }
      throw err;
    } finally {
      if (cancelHandler) {
        if (ac && ac.signal && typeof ac.signal.removeEventListener === 'function') {
          ac.signal.removeEventListener('abort', cancelHandler);
        }
        if (options.signal && typeof options.signal.removeEventListener === 'function') {
          options.signal.removeEventListener('abort', cancelHandler);
        }
      }
      if (options.signal && externalAbortHandler && typeof options.signal.removeEventListener === 'function') {
        options.signal.removeEventListener('abort', externalAbortHandler);
      }
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (this.currentAbortController === ac) {
        this.currentAbortController = null;
      }
      if (this.currentCancelCallback === cancelHandler) {
        this.currentCancelCallback = null;
      }
    }
  }
}

export { 
  VisionTaskController
 };
