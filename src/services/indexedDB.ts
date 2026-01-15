import { Message } from '../types';

const DB_NAME = 'OnyxChatDB';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

const logDB = (msg: string, data?: any) => {
    console.log(`[DB_XRAY] ${msg}`, data !== undefined ? data : '');
};

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("[DB_XRAY] IndexedDB error:", event);
      reject("IndexedDB failed to open");
    };

    request.onsuccess = (event) => {
      // logDB("Database opened successfully");
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      logDB("Upgrading Database schema...");
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('roomId', 'roomId', { unique: false });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        logDB("Created object store and indices.");
      }
    };
  });
};

export const saveMessageToCache = async (roomId: string, message: Message) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ ...message, roomId });
    
    request.onsuccess = () => logDB(`Cached message ${message.id} for room ${roomId}`);
    request.onerror = (e) => console.error("[DB_XRAY] Save failed", e);
  } catch (e) {
    console.error("[DB_XRAY] Exception in saveMessageToCache", e);
  }
};

export const saveBatchMessages = async (roomId: string, messages: Message[]) => {
    if (messages.length === 0) return;
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        messages.forEach(msg => store.put({ ...msg, roomId }));
        
        tx.oncomplete = () => logDB(`Batch cached ${messages.length} messages for room ${roomId}`);
        tx.onerror = (e) => console.error("[DB_XRAY] Batch save failed", e);
    } catch (e) {
        console.error("[DB_XRAY] Exception in saveBatchMessages", e);
    }
};

export const getCachedMessages = async (roomId: string): Promise<Message[]> => {
  logDB(`Fetching cache for room: ${roomId}`);
  return new Promise(async (resolve) => {
    try {
      const db = await initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('roomId');
      const request = index.getAll(roomId);

      request.onsuccess = () => {
        const results = request.result || [];
        const sorted = results.sort((a, b) => a.timestamp - b.timestamp);
        logDB(`Cache HIT: Found ${sorted.length} messages for ${roomId}`);
        resolve(sorted);
      };
      
      request.onerror = (e) => {
        console.error("[DB_XRAY] Cache retrieval failed", e);
        resolve([]);
      };
    } catch (e) {
      console.error("[DB_XRAY] Exception in getCachedMessages", e);
      resolve([]);
    }
  });
};