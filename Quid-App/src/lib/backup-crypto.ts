"use client";

/**
 * F-17 · Respaldo cifrado.
 *
 * El respaldo viaja como un archivo `.quid`: un sobre JSON con los parámetros
 * de la derivación de llave y el contenido cifrado. La contraseña **no se
 * guarda** en ningún lado y el archivo no se puede abrir sin ella.
 *
 * Cifrado: AES-256-GCM con llave derivada por PBKDF2-SHA256 (200.000 vueltas,
 * sal aleatoria de 16 bytes). Cada archivo tiene su propio sal e IV.
 */

const MAGIC = "quid-backup";
const VERSION = 1;
const ITERATIONS = 200_000;

export interface BackupEnvelope {
  format: typeof MAGIC;
  version: number;
  createdAt: string;
  kdf: { name: "PBKDF2-SHA256"; iterations: number; salt: string };
  cipher: { name: "AES-256-GCM"; iv: string; data: string };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptBackup(payload: unknown, password: string): Promise<string> {
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    plaintext
  );

  const envelope: BackupEnvelope = {
    format: MAGIC,
    version: VERSION,
    createdAt: new Date().toISOString(),
    kdf: { name: "PBKDF2-SHA256", iterations: ITERATIONS, salt: toBase64(salt) },
    cipher: { name: "AES-256-GCM", iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) },
  };

  return JSON.stringify(envelope, null, 2);
}

export async function decryptBackup(file: string, password: string): Promise<unknown> {
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(file) as BackupEnvelope;
  } catch {
    throw new Error("El archivo no es un respaldo de Quid.");
  }

  if (envelope.format !== MAGIC) throw new Error("El archivo no es un respaldo de Quid.");

  const salt = fromBase64(envelope.kdf.salt);
  const iv = fromBase64(envelope.cipher.iv);
  const key = await deriveKey(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      fromBase64(envelope.cipher.data) as unknown as BufferSource
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    throw new Error("Contraseña incorrecta o archivo dañado.");
  }
}
