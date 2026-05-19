/**
 * Offline Session Cache
 *
 * Caches the user's session data, PIN hash, and credentials in localStorage
 * so the app can work offline. The Service Worker also caches
 * the session response, but this provides a fallback and allows
 * the lock screen to verify the PIN locally when offline.
 *
 * Security considerations:
 * - The pinHash is a bcrypt hash — it cannot be reversed to get the PIN
 * - The passwordHash is a bcrypt hash — it cannot be reversed to get the password
 * - The session data includes the same info that next-auth stores in cookies
 * - This is safe because:
 *   1. The data is only stored on the user's own device
 *   2. Accessing it requires unlocking the device first
 *   3. bcrypt hashes are computationally infeasible to reverse
 */

const SESSION_KEY = 'quid-offline-session';
const PIN_HASH_KEY = 'quid-offline-pin-hash';
const CREDENTIALS_KEY = 'quid-offline-credentials';
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
 * Cache user credentials for offline login.
 * Stores the bcrypt password hash so we can verify offline.
 * Only called after a successful online login.
 */
export function cacheOfflineCredentials(email: string, passwordHash: string, userId: string): void {
  try {
    const data = { email, passwordHash, userId, cachedAt: Date.now() };
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(data));
  } catch {
    // localStorage not available
  }
}

/**
 * Get cached credentials for offline login.
 * Returns null if no cache or expired.
 */
export function getCachedCredentials(): { email: string; passwordHash: string; userId: string } | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    const now = Date.now();

    // Check expiry (same 30-day window as session)
    if (data.cachedAt && (now - data.cachedAt) > SESSION_EXPIRY_MS) {
      localStorage.removeItem(CREDENTIALS_KEY);
      return null;
    }

    return { email: data.email, passwordHash: data.passwordHash, userId: data.userId };
  } catch {
    return null;
  }
}

/**
 * Verify a password against cached offline credentials.
 * Uses bcrypt comparison (same as server-side).
 * Returns the userId if valid, null otherwise.
 */
export async function verifyOfflinePassword(email: string, password: string): Promise<string | null> {
  const cached = getCachedCredentials();
  if (!cached || cached.email !== email) return null;

  try {
    const { compare } = await import('bcryptjs');
    const isValid = await compare(password, cached.passwordHash);
    return isValid ? cached.userId : null;
  } catch {
    return null;
  }
}

/**
 * Clear cached credentials.
 * Called on logout.
 */
export function clearOfflineCredentials(): void {
  try {
    localStorage.removeItem(CREDENTIALS_KEY);
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
