/**
 * IndexedDB High-Speed Model Cache for Maia-3
 * Ensures the 27.97 MB model is downloaded only ONCE from Cloudflare CDN,
 * and loads in 0ms on all subsequent page visits.
 */

const DB_NAME = 'Maia3ModelCache';
const STORE_NAME = 'model_binaries';
const DB_VERSION = 1;
// Chrome caps a single serialized IndexedDB value. Keep 79M weights below it.
const CHUNK_BYTES = 32 * 1024 * 1024;

export class ModelCache {
  static openDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('[ModelCache] IndexedDB open error:', req.error);
        resolve(null);
      };
    });
  }

  static async getModel(key = 'maia3-5m') {
    try {
      const db = await this.openDB();
      if (!db) return null;

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = async () => {
          const res = req.result;
          if (!res) {
            resolve(null);
            return;
          }
          if (res instanceof ArrayBuffer) {
            console.log(`[ModelCache] ⚡ 从浏览器 IndexedDB 极速装载缓存模型 (${(res.byteLength / 1024 / 1024).toFixed(1)} MB)!`);
            resolve(res);
          } else if (typeof Blob !== 'undefined' && res instanceof Blob) {
            const buf = await res.arrayBuffer();
            console.log(`[ModelCache] ⚡ 从浏览器 IndexedDB 极速装载缓存模型 (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)!`);
            resolve(buf);
          } else if (res.buffer instanceof ArrayBuffer) {
            resolve(res.buffer);
          } else if (Number.isInteger(res.chunks) && res.chunks > 0 && res.chunks <= 128 && Number.isInteger(res.byteLength) && res.byteLength > 0) {
            const reads = Array.from({ length: res.chunks }, (_, index) => new Promise(done => {
              const chunk = store.get(`${key}::chunk:${index}`);
              chunk.onsuccess = () => done(chunk.result);
              chunk.onerror = () => done(null);
            }));
            try {
              const chunks = await Promise.all(reads);
              if (chunks.some(chunk => !(chunk instanceof ArrayBuffer)) || chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) !== res.byteLength) { resolve(null); return; }
              const buffer = new Uint8Array(res.byteLength);
              let offset = 0;
              for (const chunk of chunks) { buffer.set(new Uint8Array(chunk), offset); offset += chunk.byteLength; }
              console.log(`[ModelCache] Loaded chunked model (${(res.byteLength / 1024 / 1024).toFixed(1)} MB)`);
              resolve(buffer.buffer);
            } catch { resolve(null); }
          } else {
            resolve(null);
          }
        };

        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('[ModelCache] getModel failed:', e);
      return null;
    }
  }

  static async saveModel(key = 'maia3-5m', arrayBuffer) {
    try {
      const db = await this.openDB();
      if (!db) return false;

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        if (arrayBuffer.byteLength > CHUNK_BYTES) {
          const count = Math.ceil(arrayBuffer.byteLength / CHUNK_BYTES);
          for (let index = 0; index < count; index++) {
            store.put(arrayBuffer.slice(index * CHUNK_BYTES, Math.min((index + 1) * CHUNK_BYTES, arrayBuffer.byteLength)), `${key}::chunk:${index}`);
          }
          store.put({ chunks: count, byteLength: arrayBuffer.byteLength }, key);
        } else {
          store.put(arrayBuffer, key);
        }
        tx.oncomplete = () => {
          db.close();
          console.log('[ModelCache] Model committed to IndexedDB');
          resolve(true);
        };
        tx.onabort = tx.onerror = () => {
          db.close();
          console.warn('[ModelCache] Failed to save to IndexedDB:', tx.error);
          resolve(false);
        };
      });
    } catch (e) {
      console.warn('[ModelCache] saveModel error:', e);
      return false;
    }
  }

  static async clearCache(key = 'maia3-5m') {
    try {
      const db = await this.openDB();
      if (!db) return false;

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          if (Number.isInteger(req.result?.chunks)) {
            for (let index = 0; index < req.result.chunks; index++) store.delete(`${key}::chunk:${index}`);
          }
          store.delete(key);
        };
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onabort = tx.onerror = () => { db.close(); resolve(false); };
      });
    } catch (e) {
      return false;
    }
  }

  static async hasModel() {
    try {
      const db = await this.openDB();
      if (!db) return false;
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.count();
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }

  static async clearAll() {
    try {
      const db = await this.openDB();
      if (!db) return false;

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => {
          console.log('[ModelCache] 🧹 IndexedDB 所有版本模型缓存已彻底清空');
          resolve(true);
        };
        req.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }
}
