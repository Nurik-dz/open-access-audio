import { HistoryItem } from '../types';

const DB_NAME = 'OpenAudioVideoSuiteDB';
const STORE_NAME = 'history_items';
const DB_VERSION = 1;
const LEGACY_STORAGE_KEY = 'eleven_open_audio_suite_history_v1';

/**
 * Opens or initializes the IndexedDB database.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });
}

/**
 * Loads all history items sorted by timestamp descending.
 */
export async function loadHistoryFromStorage(): Promise<HistoryItem[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = async () => {
        let items: HistoryItem[] = (request.result as HistoryItem[]) || [];

        // Migrate from legacy localStorage if IndexedDB is currently empty
        if (items.length === 0) {
          try {
            const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacy) {
              const parsed = JSON.parse(legacy);
              if (Array.isArray(parsed) && parsed.length > 0) {
                items = parsed;
                // Save migrated items to IndexedDB
                await saveHistoryToStorage(items);
                // Clear bulky legacy key from localStorage to free 5MB quota
                localStorage.removeItem(LEGACY_STORAGE_KEY);
              }
            }
          } catch (migErr) {
            console.warn('Migration from localStorage skipped:', migErr);
          }
        }

        // Sort descending by timestamp
        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(items);
      };

      request.onerror = () => {
        resolve(loadFallbackLocalStorage());
      };
    });
  } catch (err) {
    console.warn('IndexedDB unavailable, falling back to localStorage:', err);
    return loadFallbackLocalStorage();
  }
}

/**
 * Saves all history items into IndexedDB.
 */
export async function saveHistoryToStorage(items: HistoryItem[]): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Clear existing records in store and re-populate
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        items.forEach((item) => {
          store.put(item);
        });
      };

      tx.oncomplete = () => {
        resolve();
      };

      tx.onerror = () => {
        console.warn('Transaction error during history save:', tx.error);
        saveFallbackLocalStorage(items);
        resolve();
      };
    });
  } catch (err) {
    console.warn('IndexedDB save failed, using fallback storage:', err);
    saveFallbackLocalStorage(items);
  }
}

/**
 * Adds a single history item to storage.
 */
export async function addHistoryItemToStorage(item: HistoryItem, allItems: HistoryItem[]): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(item);

      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        saveHistoryToStorage(allItems);
        resolve();
      };
    });
  } catch (err) {
    saveFallbackLocalStorage(allItems);
  }
}

/**
 * Deletes a single history item from storage.
 */
export async function deleteHistoryItemFromStorage(id: string, remainingItems: HistoryItem[]): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);

      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        saveHistoryToStorage(remainingItems);
        resolve();
      };
    });
  } catch (err) {
    saveFallbackLocalStorage(remainingItems);
  }
}

/**
 * Clears all history items from storage.
 */
export async function clearAllHistoryFromStorage(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();

      tx.oncomplete = () => {
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {}
        resolve();
      };
      tx.onerror = () => {
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {}
        resolve();
      };
    });
  } catch {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {}
  }
}

/**
 * Purges history items and updates both IndexedDB and fallback storage.
 */
export async function purgeHistoryToStorage(remainingItems: HistoryItem[]): Promise<void> {
  await saveHistoryToStorage(remainingItems);
}

/**
 * Calculates estimated memory / storage size for history items in bytes.
 */
export function estimateStorageUsage(items: HistoryItem[]): {
  totalBytes: number;
  audioBytes: number;
  imageBytes: number;
  videoBytes: number;
  metadataBytes: number;
} {
  let audioBytes = 0;
  let imageBytes = 0;
  let videoBytes = 0;
  let metadataBytes = 0;

  for (const item of items) {
    if (item.audioUrl) {
      audioBytes += item.audioUrl.length;
    }
    if (item.imageUrl) {
      imageBytes += item.imageUrl.length;
    }
    if (item.videoUrl) {
      videoBytes += item.videoUrl.length;
    }
    const metaStr = JSON.stringify({
      id: item.id,
      type: item.type,
      title: item.title,
      text: item.text,
      voiceOrModel: item.voiceOrModel,
      timestamp: item.timestamp,
    });
    metadataBytes += metaStr.length;
  }

  const totalBytes = audioBytes + imageBytes + videoBytes + metadataBytes;
  return {
    totalBytes,
    audioBytes,
    imageBytes,
    videoBytes,
    metadataBytes,
  };
}

/**
 * Format bytes into human-readable string (KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/**
 * Fallback loader for restricted environments.
 */
function loadFallbackLocalStorage(): HistoryItem[] {
  try {
    const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved) {
      const items = JSON.parse(saved);
      if (Array.isArray(items)) {
        return items;
      }
    }
  } catch {}
  return [];
}

/**
 * Fallback saver that safely trims large media blobs if quota is limited.
 */
function saveFallbackLocalStorage(items: HistoryItem[]): void {
  try {
    // Attempt standard save
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(items.slice(0, 30)));
  } catch (quotaError) {
    // Quota exceeded: trim large base64 data payloads so metadata is always retained
    try {
      const sanitized = items.slice(0, 20).map((item) => ({
        ...item,
        // If data URL exceeds 50KB, omit inline raw data in restricted localStorage fallback
        audioUrl: item.audioUrl && item.audioUrl.length > 50000 ? undefined : item.audioUrl,
        imageUrl: item.imageUrl && item.imageUrl.length > 50000 ? undefined : item.imageUrl,
        videoUrl: item.videoUrl && item.videoUrl.length > 50000 ? undefined : item.videoUrl,
      }));
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Ignore fallback failure to prevent UI crash
    }
  }
}
