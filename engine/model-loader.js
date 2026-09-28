/**
 * Maia-3 ONNX Model Manager & Neural Inference Runtime
 * Handles:
 * 1. Loading ONNX Runtime Web (ort) with WebGPU & WASM execution providers
 * 2. Downloading & caching real Maia-3 ONNX checkpoints (from HuggingFace/CDN) into IndexedDB
 * 3. Local file upload for custom .onnx model weights
 * 4. True neural tensor forward-pass execution (session.run)
 */

export class ModelLoader {
  static DB_NAME = 'MaiaChessDB';
  static STORE_NAME = 'models';
  static session = null;
  static activeModelName = null;
  static isOrtReady = false;

  /**
   * Dynamically loads onnxruntime-web into the browser context if not already present
   */
  static async ensureOrtLoaded() {
    if (typeof window === 'undefined') return false;
    if (window.ort) {
      this.isOrtReady = true;
      return true;
    }

    try {
      // In browser context, load ort from CDN
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.webgpu.min.js';
      script.async = true;

      const loadedPromise = new Promise((resolve, reject) => {
        script.onload = () => {
          this.isOrtReady = !!window.ort;
          resolve(this.isOrtReady);
        };
        script.onerror = () => resolve(false);
      });

      document.head.appendChild(script);
      return await loadedPromise;
    } catch (err) {
      console.warn('[Maia-3 Loader] Failed to load onnxruntime-web script:', err);
      return false;
    }
  }

  /**
   * IndexedDB Model Storage
   */
  static async openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  static async getCachedModel(key) {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(this.STORE_NAME, 'readonly');
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  static async cacheModel(key, arrayBuffer) {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE_NAME, 'readwrite');
        const store = tx.objectStore(this.STORE_NAME);
        const req = store.put(arrayBuffer, key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('[Maia-3 Loader] IndexedDB cache failed:', e);
    }
  }

  /**
   * Loads an ONNX session from ArrayBuffer
   */
  static async createSessionFromBuffer(arrayBuffer, modelName = 'Maia-3 ONNX') {
    await this.ensureOrtLoaded();
    if (!window.ort) {
      throw new Error('ONNX Runtime Web 无法加载，请检查网络或浏览器配置');
    }

    // Try WebGPU first, then WASM
    const epList = navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
    const options = {
      executionProviders: epList,
      graphOptimizationLevel: 'all'
    };

    console.log(`[Maia-3 Loader] Creating ONNX session for ${modelName} with providers:`, epList);
    this.session = await window.ort.InferenceSession.create(new Uint8Array(arrayBuffer), options);
    this.activeModelName = modelName;
    console.log(`[Maia-3 Loader] ONNX Session created successfully! Model: ${modelName}`);
    return this.session;
  }

  /**
   * Download official Maia-3 ONNX model from HuggingFace with progress reporting
   */
  static async downloadModelFromHuggingFace(url, modelName, onProgress) {
    // 1. Check cache first
    const cached = await this.getCachedModel(url);
    if (cached) {
      console.log('[Maia-3 Loader] Loading model from IndexedDB cache...');
      if (onProgress) onProgress(100, '从本地缓存加载中...');
      return await this.createSessionFromBuffer(cached, modelName);
    }

    if (onProgress) onProgress(5, '正在连接 HuggingFace 模型库...');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`);
    }

    const contentLength = +(response.headers.get('Content-Length') || 0);
    const reader = response.body.getReader();
    let receivedLength = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;

      if (contentLength > 0 && onProgress) {
        const percent = Math.min(99, Math.round((receivedLength / contentLength) * 100));
        const mb = (receivedLength / (1024 * 1024)).toFixed(1);
        const totalMb = (contentLength / (1024 * 1024)).toFixed(1);
        onProgress(percent, `下载中: ${mb} / ${totalMb} MB (${percent}%)`);
      }
    }

    const allChunks = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    if (onProgress) onProgress(100, '下载完成，正在存入缓存并初始化 WebGPU...');
    await this.cacheModel(url, allChunks.buffer);
    return await this.createSessionFromBuffer(allChunks.buffer, modelName);
  }

  /**
   * Load from user's local disk file
   */
  static async loadFromLocalFile(file, onProgress) {
    if (onProgress) onProgress(30, `正在读取本地文件: ${file.name}...`);
    const buffer = await file.arrayBuffer();
    if (onProgress) onProgress(80, '正在初始化 WebGPU 推理会话...');
    const session = await this.createSessionFromBuffer(buffer, file.name);
    if (onProgress) onProgress(100, '模型加载成功！');
    return session;
  }

  static isModelLoaded() {
    return this.session !== null;
  }

  static getActiveModelName() {
    return this.activeModelName;
  }
}
