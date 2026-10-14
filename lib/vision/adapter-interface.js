/**
 * Abstract Platform Adapter Interface for Vision Core
 * Subclassed by WeChatAdapter, NodeAdapter, WebAdapter, ExtensionAdapter.
 */

import { sha256 } from './web-crypto.js';

class VisionPlatformAdapter {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Decodes an image from host-specific input into raw RGBA pixel data.
   * @param {any} source - file path, URL, Canvas, ImageData, ImageBitmap or buffer
   * @returns {Promise<{ data: Uint8ClampedArray|Uint8Array, width: number, height: number }>}
   */
  async decodeImage(source) {
    if (source && source.data && source.width && source.height) {
      return source;
    }
    throw new Error('Platform adapter must implement decodeImage()');
  }

  /**
   * Loads a binary asset (weights.bin, model.onnx, chess-cnn.wasm) by name or path.
   * @param {string} assetName - e.g. 'weights.bin' or 'chess-cnn.wasm'
   * @returns {Promise<ArrayBuffer>}
   */
  async loadAsset(assetName) {
    throw new Error(`Platform adapter must implement loadAsset(${assetName})`);
  }

  /**
   * Instantiates a WebAssembly module with imports.
   * @param {string|ArrayBuffer} wasmSource - asset path, URL, or raw ArrayBuffer
   * @param {object} [importObject={}]
   * @returns {Promise<{ instance: WebAssembly.Instance }>}
   */
  async instantiateWasm(wasmSource, importObject = {}) {
    let buffer;
    if (wasmSource instanceof ArrayBuffer || ArrayBuffer.isView(wasmSource)) {
      buffer = wasmSource;
    } else {
      buffer = await this.loadAsset(wasmSource);
    }
    if (typeof WebAssembly !== 'undefined' && WebAssembly.instantiate) {
      try {
        this.wasmSha256 = sha256(buffer);
      } catch (_) {
        this.wasmSha256 = null;
      }
      const wasmRes = await WebAssembly.instantiate(buffer, importObject);
      return {
        instance: wasmRes.instance || wasmRes,
        module: wasmRes.module,
        wasmSha256: this.wasmSha256
      };
    }
    throw new Error('WebAssembly not supported in this environment');
  }

  /**
   * Creates an optional native hardware inference session (e.g. wx.createInferenceSession, WebGPU).
   * Returns null if native acceleration is not available.
   * @param {string|object} modelOptions
   * @returns {Promise<any|null>}
   */
  async createInferenceSession(modelOptions) {
    return null;
  }

  /**
   * Returns current high-resolution timestamp in ms.
   * @returns {number}
   */
  now() {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  log(level, message, data = null) {
    if (level === 'error') {
      console.error(`[VisionCore] ${message}`, data || '');
    } else if (level === 'warn') {
      console.warn(`[VisionCore] ${message}`, data || '');
    } else {
      console.info(`[VisionCore] ${message}`, data || '');
    }
  }
}

export { 
  VisionPlatformAdapter
 };
