import { HttpError } from "./http";

const encoder = new TextEncoder();

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64(value: string): Uint8Array {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(500, "server_configuration", "The encryption key is invalid.");
  }
}

export async function sha256Base64Url(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes))));
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  const bytes = fromBase64(env.TOKEN_ENCRYPTION_KEY);
  if (bytes.byteLength !== 32) {
    throw new HttpError(500, "server_configuration", "The encryption key must contain 32 bytes.");
  }
  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(
  plaintext: string,
  context: string,
  env: Env,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await encryptionKey(env);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(encoder.encode(context)),
    },
    key,
    toArrayBuffer(encoder.encode(plaintext)),
  );
  return { ciphertext: toBase64Url(new Uint8Array(ciphertext)), iv: toBase64Url(iv) };
}

export async function decryptSecret(
  ciphertext: string,
  iv: string,
  context: string,
  env: Env,
): Promise<string> {
  try {
    const key = await encryptionKey(env);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(fromBase64(iv)),
        additionalData: toArrayBuffer(encoder.encode(context)),
      },
      key,
      toArrayBuffer(fromBase64(ciphertext)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new HttpError(500, "credential_decryption_failed", "A stored provider credential could not be decrypted.");
  }
}

export async function createAccountBinding(googleSubject: string, env: Env): Promise<string> {
  const keyBytes = fromBase64(env.TOKEN_ENCRYPTION_KEY);
  if (keyBytes.byteLength !== 32) {
    throw new HttpError(503, "encryption_not_configured", "Cloud Sync encryption is not configured on the sync service.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    toArrayBuffer(encoder.encode(`infinitecanvas-account-v1:${googleSubject}`)),
  );
  return toBase64Url(new Uint8Array(signature));
}
