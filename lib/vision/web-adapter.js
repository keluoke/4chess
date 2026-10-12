/**
 * Web & Chrome Extension Platform Adapter for Vision Core
 * Works in modern browsers, Web Workers, and Chrome Extension MV3 background/workers.
 */

import { VisionPlatformAdapter } from './adapter-interface.js';
import { sha256 } from './crypto-utils.js';

class WebAdapter extends VisionPlatformAdapter {
  constructor(options = {}) {
    super(options);
    this.baseUrl = options.baseUrl || '';
  }

  resolveUrl(assetName) {
    const clean = assetName.replace(/^\/+/, '');
    const fileName = clean.split('/').pop();
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return chrome.runtime.getURL(`models/${fileName}`);
    }
    if (this.baseUrl) {
      const base = this.baseUrl.replace(/\/+$/, '');
      const rel = clean.startsWith('models/') ? clean : `models/${fileName}`;
      return `${base}/${rel}`;
    }
    // Default to root-relative path on host origin, avoiding relative subpath resolution in workers
    return `/models/${fileName}`;
  }

  async loadAsset(assetName) {
    const url = this.resolveUrl(assetName);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`[WebAdapter] Failed to fetch asset ${assetName} from ${url}: ${res.statusText}`);
    }
    return res.arrayBuffer();
  }

  async instantiateWasm(wasmSource, importObject = {}) {
    if (typeof WebAssembly === 'undefined') {
      throw new Error('[WebAdapter] WebAssembly is not supported in this browser/worker');
    }
    let buffer;
    if (typeof wasmSource === 'string') {
      const url = this.resolveUrl(wasmSource);
      try {
        const res = await fetch(url);
        if (res.ok) {
          buffer = await res.arrayBuffer();
        }
      } catch (_) {}
      if (!buffer) {
        buffer = await this.loadAsset(wasmSource);
      }
    } else if (wasmSource instanceof ArrayBuffer || ArrayBuffer.isView(wasmSource)) {
      buffer = wasmSource;
    } else {
      buffer = await this.loadAsset(wasmSource);
    }

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

  async decodeImage(source) {
    if (source && source.data && source.width && source.height) {
      return source;
    }

    // 1. ImageBitmap or Blob or File
    if (typeof createImageBitmap === 'function' && (source instanceof Blob || (typeof ImageData !== 'undefined' && source instanceof ImageData))) {
      const bmp = await createImageBitmap(source);
      let canvas;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(bmp.width, bmp.height);
      } else if (typeof document !== 'undefined') {
        canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
      }
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const imgData = ctx.getImageData(0, 0, bmp.width, bmp.height);
        return { data: imgData.data, width: bmp.width, height: bmp.height };
      }
    }

    // 2. OffscreenCanvas or HTMLCanvasElement
    if (source && typeof source.getContext === 'function') {
      const ctx = source.getContext('2d');
      const imgData = ctx.getImageData(0, 0, source.width, source.height);
      return { data: imgData.data, width: source.width, height: source.height };
    }

    throw new Error('[WebAdapter] Unsupported source for decodeImage in Web environment');
  }
}

export { 
  WebAdapter
 };
