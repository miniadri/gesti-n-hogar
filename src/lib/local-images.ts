// IndexedDB helper for storing loyalty card photos locally on the user's device.
// These blobs never leave the device — no server storage cost.
// Warning: if the user clears site data or uninstalls the app, images are lost.

const DB_NAME = "homesync-loyalty-images";
const STORE = "images";
const KEY_STORE = "transfer-keys";
const VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
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

/** Return the processed local image for an encrypted transfer. */
export async function getLocalImageBlob(
  cardId: string,
  side: "front" | "back" | "logo",
): Promise<Blob | null> {
  const db = await openDB();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key(cardId, side));
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

/**
 * Resize and compress a photo before it is ever persisted.  The output is a
 * WebP/JPEG blob suitable for local storage and temporary transfer.
 */
export async function optimizeLocalImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // WebP keeps card text legible at a small size. Safari versions without it
  // return null, in which case JPEG is a compatible fallback.
  return (await encode("image/webp", 0.82)) ?? (await encode("image/jpeg", 0.86)) ?? file;
}

async function keyStoreGet<T>(name: string): Promise<T | null> {
  const db = await openDB();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readonly");
    const req = tx.objectStore(KEY_STORE).get(name);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

async function keyStorePut(name: string, value: unknown): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, "readwrite");
    tx.objectStore(KEY_STORE).put(value, name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getOrCreatePhotoTransferKeys(): Promise<CryptoKeyPair> {
  const current = await keyStoreGet<CryptoKeyPair>("recipient-rsa-oaep");
  if (current?.privateKey && current?.publicKey) return current;
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"],
  );
  await keyStorePut("recipient-rsa-oaep", pair);
  return pair as CryptoKeyPair;
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

/** Remove one side of a locally stored loyalty card photo. */
export async function deleteLocalImage(
  cardId: string,
  side: "front" | "back" | "logo",
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key(cardId, side));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
