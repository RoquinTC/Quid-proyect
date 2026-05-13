/**
 * Sync Utility Functions
 *
 * Shared utilities for the local-first sync system.
 */

/**
 * Generate a temporary client-side ID for optimistic creates.
 * Format: "temp_" + timestamp + random suffix
 * This ID will be replaced with the server-assigned ID after sync.
 */
export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Check if an ID is a temporary client-generated ID.
 */
export function isTempId(id: string): boolean {
  return id.startsWith("temp_");
}

/**
 * Check if the browser is online.
 */
export function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Maximum number of retries for a sync queue item.
 */
export const MAX_RETRY_COUNT = 5;

/**
 * Base delay for exponential backoff (in milliseconds).
 */
export const BASE_RETRY_DELAY = 1000;

/**
 * Calculate the delay before the next retry using exponential backoff + jitter.
 * Jitter randomizes the delay to prevent thundering herd when multiple
 * mutations fail simultaneously and retry at the same time.
 *
 * Formula: min(BASE * 2^retryCount, 30s) * random(0.5, 1.0)
 */
export function getRetryDelay(retryCount: number): number {
  const baseDelay = Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount), 30000);
  const jitter = 0.5 + Math.random() * 0.5; // Random between 0.5 and 1.0
  return Math.floor(baseDelay * jitter);
}

/**
 * Calculate the absolute timestamp when a mutation should be retried.
 */
export function getNextRetryAt(retryCount: number): number {
  return Date.now() + getRetryDelay(retryCount);
}

/**
 * Check if a mutation is ready to be retried (nextRetryAt has passed).
 * Mutations without nextRetryAt are always ready.
 */
export function isReadyForRetry(mutation: { nextRetryAt?: number }): boolean {
  if (!mutation.nextRetryAt) return true;
  return Date.now() >= mutation.nextRetryAt;
}
