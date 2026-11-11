"use client";

/**
 * F-30 · Modo privacidad de montos.
 *
 * Un solo interruptor oculta las cifras en toda la app. Se guarda en
 * `localStorage` y se aplica como clase en `<html>`, así el CSS oculta
 * cualquier elemento marcado con `quid-money` sin que cada pantalla tenga que
 * saber si el modo está activo.
 *
 * Lo que NO hace: cifrar ni bloquear. Es para miradas ajenas (el bus, una
 * reunión), no para seguridad. El PIN es F-16.
 */

const STORAGE_KEY = "quid-hide-amounts";
const ROOT_CLASS = "quid-hide-amounts";
const EVENT = "quid-privacy-change";

export function readPrivacyMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function applyClass(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(ROOT_CLASS, enabled);
}

export function setPrivacyMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Sin almacenamiento: el modo dura lo que la pestaña.
  }
  applyClass(enabled);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: enabled }));
}

export function onPrivacyModeChange(handler: (enabled: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<boolean>).detail;
    handler(typeof detail === "boolean" ? detail : readPrivacyMode());
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** Aplica el estado guardado al arrancar (y cuando otra pestaña lo cambia). */
export function syncPrivacyMode(): void {
  applyClass(readPrivacyMode());
}
