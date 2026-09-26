import { getOrCreatePhotoTransferKeys } from "./local-images";

function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export async function sha256Base64(value: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", await value.arrayBuffer())));
}

export async function exportRecipientPublicKey(): Promise<string> {
  const keys = await getOrCreatePhotoTransferKeys();
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey)));
}

export async function encryptPhotoForRecipient(photo: Blob, recipientPublicKey: string) {
  const recipientKey = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(recipientPublicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, await photo.arrayBuffer());
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientKey, rawAesKey);
  return {
    encrypted: new Blob([encrypted], { type: "application/octet-stream" }),
    encryptedKey: bytesToBase64(new Uint8Array(wrappedKey)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptTransferredPhoto(
  encrypted: Blob,
  encryptedKey: string,
  iv: string,
  contentType: string,
): Promise<Blob> {
  const keys = await getOrCreatePhotoTransferKeys();
  const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, keys.privateKey, base64ToBytes(encryptedKey));
  const aesKey = await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    aesKey,
    await encrypted.arrayBuffer(),
  );
  return new Blob([plain], { type: contentType });
}
