// IndexedDB helper for storing loyalty card photos locally on the user's device.
// These blobs never leave the device — no server storage cost.
// Warning: if the user clears site data or uninstalls the app, images are lost.

const DB_NAME = "homesync-loyalty-images";
const STORE = "images";
const VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function key(cardId: string, side: "front" | "back" | "logo") {
  return `${cardId}:${side}`;
}

export async function saveLocalImage(
  cardId: string,
  side: "front" | "back" | "logo",
  file: Blob,
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file, key(cardId, side));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getLocalImageURL(
  cardId: string,
  side: "front" | "back" | "logo",
): Promise<string | null> {
  const db = await openDB();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key(cardId, side));
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob ? URL.createObjectURL(blob) : null;
}

export async function deleteLocalImages(cardId: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    for (const side of ["front", "back", "logo"] as const) {
      tx.objectStore(STORE).delete(key(cardId, side));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
