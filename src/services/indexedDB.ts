import { Message } from '../types';

const DB_NAME = 'OnyxChatDB';
const DB_VERSION = 1;
const STORE_NAME = 'messages';
const INDEX_ROOM_TIMESTAMP = 'room_timestamp';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event);
      reject("IndexedDB failed to open");
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Create an index to query messages by room and timestamp
        objectStore.createIndex('roomId', 'roomId', { unique: false });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

export const saveMessageToCache = async (roomId: string, message: Message) => {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    // We modify the object to store roomId for indexing, though it's not in the Message type explicitly displayed
    store.put({ ...message, roomId }); 
  } catch (e) {
    console.error("Failed to cache message", e);
  }
};

export const saveBatchMessages = async (roomId: string, messages: Message[]) => {
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        messages.forEach(msg => {
            store.put({ ...msg, roomId });
        });
    } catch (e) {
        console.error("Failed to batch cache", e);
    }
};

export const getCachedMessages = async (roomId: string): Promise<Message[]> => {
  return new Promise(async (resolve) => {
    try {
      const db = await initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('roomId');
      const request = index.getAll(roomId);

      request.onsuccess = () => {
        const results = request.result || [];
        // Sort by timestamp as IndexedDB indices might not guarantee strict sort order depending on browser implementation
        const sorted = results.sort((a, b) => a.timestamp - b.timestamp);
        resolve(sorted);
      };
      
      request.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
};
