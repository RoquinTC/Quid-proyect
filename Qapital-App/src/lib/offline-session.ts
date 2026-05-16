/**
 * Offline Session Cache
 *
 * Caches the user's session data and PIN hash in localStorage
 * so the app can work offline. The Service Worker also caches
 * the session response, but this provides a fallback and allows
 * the lock screen to verify the PIN locally when offline.
 *
 * Security considerations:
 * - The pinHash is a bcrypt hash — it cannot be reversed to get the PIN
 * - The session data includes the same info that next-auth stores in cookies
 * - This is safe because:
 *   1. The data is only stored on the user's own device
 *   2. Accessing it requires unlocking the device first
 *   3. bcrypt hashes are computationally infeasible to reverse
 */

const SESSION_KEY = 'quid-offline-session';
const PIN_HASH_KEY = 'quid-offline-pin-hash';
const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (matches JWT maxAge)

export interface CachedSession {
  user: {
    id: string;
    email?: string;
    name?: string;
    image?: string | null;
    pinEnabled?: boolean;
    biometricEnabled?: boolean;
    currency?: string;
    onboardingCompleted?: boolean;
    onboardingStep?: number;
  };
  expires: string;
}

/**
 * Cache the session for offline access.
 * Called after successful authentication.
 */
export function cacheOfflineSession(session: CachedSession): void {
  try {
    const wrapper = {
      session,
      cachedAt: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(wrapper));
  } catch {
    // localStorage not available
  }
}

/**
 * Get the cached session for offline access.
 * Returns null if no cache or expired.
 */
export function getCachedSession(): CachedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const wrapper = JSON.parse(raw);
    const now = Date.now();

    // Check expiry
    if (wrapper.cachedAt && (now - wrapper.cachedAt) > SESSION_EXPIRY_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return wrapper.session as CachedSession;
  } catch {
    return null;
  }
}

/**
 * Cache the PIN hash for offline verification.
 * Called after successful online PIN verification or after session load.
 */
export function cacheOfflinePinHash(userId: string, pinHash: string): void {
  try {
    localStorage.setItem(`${PIN_HASH_KEY}-${userId}`, pinHash);
  } catch {
    // localStorage not available
  }
}

/**
 * Get the cached PIN hash for offline verification.
 */
export function getCachedPinHash(userId: string): string | null {
  try {
    return localStorage.getItem(`${PIN_HASH_KEY}-${userId}`);
  } catch {
    return null;
  }
}

/**
 * Clear all cached session data.
 * Called on logout.
 */
export function clearOfflineSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
    // Note: we don't clear PIN hashes on logout because the user
    // might log in as a different user. PIN hashes are keyed by userId.
  } catch {
    // localStorage not available
  }
}

/**
 * Check if we're likely offline (no server connection).
 * Uses navigator.onLine as a quick check.
 */
export function isLikelyOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}
