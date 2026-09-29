/**
 * IndexedDB High-Speed Model Cache for Maia-3
 * Ensures the 27.97 MB model is downloaded only ONCE from Cloudflare CDN,
 * and loads in 0ms on all subsequent page visits.
 */

const DB_NAME = 'Maia3ModelCache';
const STORE_NAME = 'model_binaries';
const DB_VERSION = 1;

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
        const req = store.put(arrayBuffer, key);

        req.onsuccess = () => {
          console.log(`[ModelCache] 💾 模型已永久缓存至 IndexedDB，后续访问 0ms 秒开！`);
          resolve(true);
        };
        req.onerror = () => {
          console.warn('[ModelCache] Failed to save to IndexedDB:', req.error);
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
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
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
