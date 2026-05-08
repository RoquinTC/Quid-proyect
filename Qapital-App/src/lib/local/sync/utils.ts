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
 * Calculate the delay before the next retry using exponential backoff.
 */
export function getRetryDelay(retryCount: number): number {
  return Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount), 30000); // Max 30 seconds
}
