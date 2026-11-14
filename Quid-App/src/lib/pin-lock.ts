"use client";

/**
 * F-16 · Bloqueo con PIN.
 *
 * El PIN **no se guarda**: se guarda su hash SHA-256 con sal. Vive en el
 * dispositivo (`localStorage`), no en el servidor, así que no viaja ni aparece
 * en la base. Es una barrera para miradas ajenas; no reemplaza la contraseña de
 * la cuenta.
 *
 * La biometría queda pendiente: requiere instalar un plugin nativo y
 * reconstruir la APK, por eso no está aquí todavía.
 */

const PIN_KEY = "quid-pin-hash";
const IDLE_MS = 3 * 60 * 1000;
const EVENT = "quid-lock-change";
const SETUP_EVENT = "quid-pin-setup";

let locked = false;
let lastActivity = Date.now();

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: isLocked() }));
  }
}

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`quid::${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hasPin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(PIN_KEY));
  } catch {
    return false;
  }
}

export async function setPin(pin: string): Promise<void> {
  const stored = await hashPin(pin);
  window.localStorage.setItem(PIN_KEY, stored);
  locked = false;
  lastActivity = Date.now();
  emit();
}

export function clearPin(): void {
  window.localStorage.removeItem(PIN_KEY);
  locked = false;
  emit();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = window.localStorage.getItem(PIN_KEY);
  if (!stored) return true;
  return stored === (await hashPin(pin));
}

export function isLocked(): boolean {
  return locked && hasPin();
}

export function lockNow(): void {
  if (!hasPin()) return;
  locked = true;
  emit();
}

export function unlock(): void {
  locked = false;
  lastActivity = Date.now();
  emit();
}

export function touchActivity(): void {
  lastActivity = Date.now();
}

/** Bloquea si pasó el tiempo de inactividad. Se llama desde un intervalo. */
export function checkIdle(): void {
  if (!hasPin() || locked) return;
  if (Date.now() - lastActivity > IDLE_MS) lockNow();
}

export function onLockChange(handler: (locked: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<boolean>).detail;
    handler(typeof detail === "boolean" ? detail : isLocked());
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Abre el diálogo de configuración desde el menú de usuario. */
export function requestPinSetup(): void {
  window.dispatchEvent(new CustomEvent(SETUP_EVENT));
}

export function onPinSetupRequest(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(SETUP_EVENT, handler);
  return () => window.removeEventListener(SETUP_EVENT, handler);
}
