const DB_NAME = "a11y-garden-extension";
const DB_VERSION = 1;
const AUDIT_STORE = "audits";

let dbPromise;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIT_STORE)) {
        const store = db.createObjectStore(AUDIT_STORE, { keyPath: "id" });
        store.createIndex("scannedAt", "scannedAt");
        store.createIndex("url", "url");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open extension database."));
  });

  return dbPromise;
}

function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("Extension database transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error || new Error("Extension database transaction was aborted."));
  });
}

export async function saveAudit(audit) {
  const db = await openDatabase();
  const transaction = db.transaction(AUDIT_STORE, "readwrite");
  transaction.objectStore(AUDIT_STORE).put(audit);
  await txDone(transaction);
  return audit;
}

export async function getAudit(id) {
  const db = await openDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIT_STORE, "readonly");
    const request = transaction.objectStore(AUDIT_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Failed to load audit."));
  });
}

export async function updateAudit(id, updater) {
  const current = await getAudit(id);
  if (!current) return null;
  const next = typeof updater === "function" ? updater(current) : { ...current, ...updater };
  await saveAudit(next);
  return next;
}

export async function listAudits(limit = 50) {
  const db = await openDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIT_STORE, "readonly");
    const index = transaction.objectStore(AUDIT_STORE).index("scannedAt");
    const request = index.openCursor(null, "prev");
    const audits = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || audits.length >= limit) {
        resolve(audits);
        return;
      }
      audits.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error("Failed to list audits."));
  });
}

export async function deleteAudit(id) {
  const db = await openDatabase();
  const transaction = db.transaction(AUDIT_STORE, "readwrite");
  transaction.objectStore(AUDIT_STORE).delete(id);
  await txDone(transaction);
}

export async function clearAudits() {
  const db = await openDatabase();
  const transaction = db.transaction(AUDIT_STORE, "readwrite");
  transaction.objectStore(AUDIT_STORE).clear();
  await txDone(transaction);
}
