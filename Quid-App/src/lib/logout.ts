/**
 * performLogout — Centralized logout function
 *
 * The problem: calling signOut() + window.location.href = "/" causes a race condition.
 * The hard redirect kills the page before React effects can clean up:
 *   - Offline session in localStorage survives → auto-restores on next load
 *   - IndexedDB data survives → stale data for next user
 *   - Service Worker cache survives → serves old session
 *   - Credentials in localStorage survive → offline login still works
 *
 * Solution: SYNCHRONOUSLY clean everything BEFORE the redirect.
 *
 * Additionally, we set a "quid-just-logged-out" flag BEFORE clearing
 * so that useAppSession stops returning session data immediately,
 * preventing re-caching effects from re-saving the session.
 */

import { signOut } from "next-auth/react";
import { clearOfflineSession, clearOfflineCredentials } from "./offline-session";
import { useAppStore } from "./store";

export async function performLogout(): Promise<void> {
  // 0. Set logout flag FIRST — this prevents useAppSession from returning
  // session data and re-caching it while we're cleaning up
  try {
    sessionStorage.setItem("quid-just-logged-out", "true");
  } catch {}

  // 1. SYNCHRONOUSLY clear Zustand state
  const { setOfflineSession, setAuthView } = useAppStore.getState();
  setOfflineSession(null);
  setAuthView("login");

  // 2. SYNCHRONOUSLY clear localStorage
  clearOfflineSession();
  clearOfflineCredentials();

  // 3. Clear PIN hashes (all of them — keyed by userId, safe to clear all on logout)
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("quid-offline-pin-hash-")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage not available
  }

  // 4. Clear Zustand persisted store
  try {
    localStorage.removeItem("quid-store");
  } catch {}

  // 5. Clear Service Worker caches (session + API)
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      // Send message to SW to clear caches
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_SESSION" });
        navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
      }
      // Also clear caches from the main thread directly
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    } catch {
      // Caches API not available
    }
  }

  // 6. Clear IndexedDB (local data) — WITH TIMEOUT
  // clearLocalDB() can hang indefinitely if the SyncProvider is holding
  // a read-write transaction on the same tables. We race against a 5s timeout
  // so the user isn't stuck on a non-responsive logout.
  try {
    const { clearLocalDB } = await import("./local/db");
    const clearPromise = clearLocalDB();
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("clearLocalDB timeout")), 5000)
    );
    await Promise.race([clearPromise, timeoutPromise]);
  } catch {
    // Timeout or error — proceed with redirect anyway.
    // The Service Worker and server-side session will be cleared
    // so the user won't see stale data on next login.
  }

  // 7. Sign out from NextAuth (clears session cookie on server)
  try {
    await signOut({ redirect: false });
  } catch {
    // signOut may fail if server is unreachable — that's OK,
    // we already cleared everything locally
  }

  // 8. Hard redirect — now safe because everything is already cleaned up
  window.location.href = window.location.origin + "/";
}
