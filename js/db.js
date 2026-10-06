import { MODULE, STORE_NAMES } from './constants.js';

let dbPromise = null;

export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB non disponibile in questo browser.'));
      return;
    }

    const request = indexedDB.open(MODULE.dbName, MODULE.dbVersion);

    request.onupgradeneeded = event => {
      const db = event.target.result;
      for (const storeName of STORE_NAMES) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          if (['projects', 'milestones', 'tasks', 'notes', 'references', 'timelineEntries', 'templates'].includes(storeName)) {
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
          if (['milestones', 'tasks', 'notes', 'references', 'timelineEntries'].includes(storeName)) {
            store.createIndex('projectId', 'projectId', { unique: false });
          }
          if (storeName === 'tasks') {
            store.createIndex('dueDate', 'dueDate', { unique: false });
            store.createIndex('status', 'status', { unique: false });
          }
          if (storeName === 'projects') {
            store.createIndex('status', 'status', { unique: false });
            store.createIndex('priority', 'priority', { unique: false });
          }
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Errore apertura IndexedDB.'));
    request.onblocked = () => reject(new Error('Aggiornamento database bloccato da un’altra scheda.'));
  });

  return dbPromise;
}

export async function initializeDatabase() {
  const db = await openDatabase();
  await putRecord('metadata', {
    id: 'module',
    moduleId: MODULE.moduleId,
    appVersion: MODULE.appVersion,
    schemaVersion: MODULE.schemaVersion,
    updatedAt: new Date().toISOString()
  });

  const defaults = [
    { id: 'locale', value: 'it-IT' },
    { id: 'currency', value: 'EUR' },
    { id: 'upcomingMilestoneDays', value: 7 }
  ];

  for (const item of defaults) {
    const existing = await getRecord('settings', item.id);
    if (!existing) {
      await putRecord('settings', { ...item, updatedAt: new Date().toISOString() });
    }
  }

  return db;
}

export async function getRecord(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function putRecord(storeName, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteRecord(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllRecords(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getStoreCounts() {
  const db = await openDatabase();
  const counts = {};
  for (const storeName of STORE_NAMES) {
    counts[storeName] = await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return counts;
}

export async function replaceDatabaseContents(snapshot = {}) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES, 'readwrite');
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Errore durante la scrittura del database.'));
    tx.onabort = () => reject(tx.error || new Error('Import annullato: transazione database interrotta.'));

    for (const storeName of STORE_NAMES) {
      const store = tx.objectStore(storeName);
      store.clear();
      for (const record of snapshot[storeName] || []) store.put(record);
    }
  });
}
