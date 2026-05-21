// ============================================
// OFFLINE-AWARE API FETCH
// ============================================

// Data event bus for instant UI updates
import { emitMutationEvent } from "@/lib/data-events";
// This wrapper makes ALL existing apiFetch calls work offline:
//   - GET requests: Try server first, fall back to IndexedDB cache on network error
//   - POST/PUT/DELETE: Try server first, queue in mutation queue on network error
// No component changes needed — transparent offline support!

// Lazy-loaded to avoid SSR issues — Dexie/IndexedDB only works in the browser
let _localDB: any = null;
let _API_TABLE_MAP: Record<string, string> = {};
let _MutationQueueEntry: any = null;
let _generateTempId: (() => string) | null = null;

async function ensureLocalDB() {
  if (typeof window === "undefined") return false; // SSR guard
  if (_localDB) return true;
  try {
    const db = await import("./local/db");
    _localDB = db.localDB;
    _API_TABLE_MAP = db.API_TABLE_MAP;
    const utils = await import("./local/sync/utils");
    _generateTempId = utils.generateTempId;
    return true;
  } catch (err) {
    console.warn("[Offline] IndexedDB not available:", err);
    return false;
  }
}

/**
 * Determine if a URL is a GET request (no method or method=GET).
 */
function isGetRequest(options?: RequestInit): boolean {
  return !options?.method || options.method.toUpperCase() === "GET";
}

/**
 * Extract the API path and table name from a URL.
 * e.g. "/api/accounts" → { tableName: "accounts", isCollection: true }
 * e.g. "/api/accounts/abc123" → { tableName: "accounts", isCollection: false }
 * e.g. "/api/recurring/abc123/confirm" → { tableName: "recurringPayments", isCollection: false, isComplex: true }
 */
function parseApiUrl(url: string): { tableName: string | null; isCollection: boolean; isComplex: boolean; recordId: string | null } {
  // Check for complex operation endpoints (e.g., /confirm, /reverse, /pay, /abono, /contribute, /finalize)
  const complexPatterns = /\/(confirm|reverse|pay|abono|contribute|finalize|recalculate|generate)$/;
  const isComplex = complexPatterns.test(url);

  // Strip query params
  const cleanUrl = url.split("?")[0];

  // Match /api/{resource} or /api/{resource}/{id} or /api/{resource}/{id}/{sub}
  // Also handles sub-resources like /api/accounts/{id}/sub-accounts
  const match = cleanUrl.match(/^\/api\/([^/]+)(?:\/([^/]+))?(?:\/(.+))?$/);
  if (!match) return { tableName: null, isCollection: false, isComplex, recordId: null };

  const resource = match[1]; // e.g., "accounts", "recurring", "shopping-lists"
  let tableName = _API_TABLE_MAP[`/api/${resource}`] ?? null;

  // Handle sub-resource URLs
  const thirdSegment = match[3];
  let recordId: string | null = match[2] || null;

  // Special sub-resource mapping
  if (thirdSegment) {
    // /api/accounts/{id}/sub-accounts → subAccounts table
    if (thirdSegment === "sub-accounts") {
      tableName = "subAccounts";
      return { tableName, isCollection: true, isComplex: false, recordId };
    }
    // /api/vehicles/{id}/fuel-logs → fuelLogs table
    if (thirdSegment === "fuel-logs") {
      tableName = "fuelLogs";
      return { tableName, isCollection: true, isComplex: false, recordId };
    }
    // /api/vehicles/{id}/maintenance → maintenanceRecords table
    if (thirdSegment === "maintenance") {
      tableName = "maintenanceRecords";
      return { tableName, isCollection: true, isComplex: false, recordId };
    }
    // /api/debts/{id}/installments → installments table
    if (thirdSegment === "installments") {
      tableName = "installments";
      return { tableName, isCollection: true, isComplex: false, recordId };
    }
    // /api/savings/{id}/accounts → savingsGoalAccounts table
    if (thirdSegment === "accounts") {
      tableName = "savingsGoalAccounts";
      return { tableName, isCollection: true, isComplex: false, recordId };
    }
    // /api/shopping-lists/{id}/items → shoppingListItems table
    if (thirdSegment === "items") {
      tableName = "shoppingListItems";
      return { tableName, isCollection: true, isComplex: false, recordId };
    }
  }

  // If there's a third segment that's not a known sub-resource, it's complex
  const hasThirdSegment = !!thirdSegment;

  return {
    tableName,
    isCollection: !match[2], // No ID = collection endpoint
    isComplex: isComplex || hasThirdSegment,
    recordId,
  };
}

/**
 * Read data from IndexedDB when server is unreachable.
 * Handles both collection reads and single-record reads.
 */
async function readFromLocalDB<T>(url: string): Promise<T | null> {
  const { tableName, isCollection } = parseApiUrl(url);
  if (!tableName) return null;

  try {
    if (!_localDB) return null;
    const table = (_localDB as any)[tableName];
    if (!table) return null;

    if (isCollection) {
      // Collection endpoint — return all records for this user
      // Note: we return all records; the server would filter by userId,
      // but IndexedDB already has only the current user's data
      const allRecords = await table.where("_syncStatus").notEqual("pending_delete").toArray();
      // Strip sync metadata from response
      return allRecords.map(({ _syncStatus, _version, _lastModified, ...rest }: any) => rest) as T;
    } else {
      // Single record — extract ID from URL
      const cleanUrl = url.split("?")[0];
      const parts = cleanUrl.split("/");
      const id = parts[parts.length - 1]; // Last segment is the ID
      // But skip if it's a complex operation (e.g., "confirm", "reverse")
      const complexSuffixes = ["confirm", "reverse", "pay", "abono", "contribute", "finalize", "recalculate", "generate", "accounts", "items", "installments", "fuel-logs", "maintenance", "sub-accounts"];
      if (complexSuffixes.includes(id)) return null;

    if (!_localDB) return null;
      const record = await table.get(id);
      if (!record) return null;
      const { _syncStatus, _version, _lastModified, ...rest } = record as any;
      return rest as T;
    }
  } catch (err) {
    console.warn("[Offline] Error reading from IndexedDB:", err);
    return null;
  }
}

/**
 * Queue a mutation for later replay when the server is unreachable.
 */
async function queueOfflineMutation(url: string, options: RequestInit): Promise<void> {
  const method = options.method?.toUpperCase() || "POST";
  const { tableName, isComplex } = parseApiUrl(url);

  if (!_localDB || !_generateTempId) return;
  const now = Date.now();
  const entry = {
    id: _generateTempId(),
    operation: isComplex ? "complex" : method === "POST" ? "create" : method === "DELETE" ? "delete" : "update",
    tableName: tableName || "unknown",
    recordId: isComplex ? "complex" : (url.split("/").pop() || _generateTempId()),
    payload: options.body?.toString() || "{}",
    apiRoute: url,
    apiMethod: method,
    sequence: now,
    status: "pending",
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await _localDB.mutationQueue.add(entry);
    console.log(`[Offline] Queued ${method} ${url} for later sync`);
  } catch (err) {
    console.error("[Offline] Error queuing mutation:", err);
  }
}

/**
 * Apply an optimistic write to IndexedDB for immediate UI feedback.
 * This is a best-effort operation — the sync engine will correct any discrepancies.
 */
async function applyOptimisticWrite(url: string, options: RequestInit): Promise<void> {
  const method = options.method?.toUpperCase() || "POST";
  const { tableName, isComplex } = parseApiUrl(url);

  if (isComplex || !tableName || !_localDB) return; // Don't try optimistic writes for complex operations

  try {
    const table = (_localDB as any)[tableName];
    if (!table) return;

    const body = options.body ? JSON.parse(options.body.toString()) : {};
    const now = Date.now();

    if (method === "POST") {
      // Create: add with temp ID
      if (!_generateTempId) return;
      const tempId = _generateTempId();
      await table.put({
        ...body,
        id: tempId,
        _syncStatus: "pending_create",
        _version: 1,
        _lastModified: now,
      });
    } else if (method === "PUT") {
      // Update: modify existing record
      const parts = url.split("/");
      const id = parts[parts.length - 1];
      const existing = await table.get(id);
      if (existing) {
        await table.update(id, {
          ...body,
          _syncStatus: "pending_update",
          _version: (existing._version || 0) + 1,
          _lastModified: now,
        });
      }
    } else if (method === "DELETE") {
      // Delete: mark as pending_delete
      const parts = url.split("/");
      const id = parts[parts.length - 1];
      const existing = await table.get(id);
      if (existing) {
        await table.update(id, {
          _syncStatus: "pending_delete",
          _lastModified: now,
        });
      }
    }
  } catch (err) {
    // Best effort — don't fail the operation if optimistic write fails
    console.warn("[Offline] Optimistic write failed:", err);
  }
}

// Generic fetch wrapper for API calls — OFFLINE-AWARE
export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const isGet = isGetRequest(options);

  // For GET requests: try server, fall back to IndexedDB
  if (isGet) {
    // Ensure IndexedDB is available (lazy load)
    await ensureLocalDB();
    try {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Cache successful GET response in IndexedDB for offline use
      cacheGetResponse(url, data).catch(() => { /* non-blocking */ });

      return data as T;
    } catch (networkError) {
      // Server unreachable — try IndexedDB
      const localData = await readFromLocalDB<T>(url);
      if (localData !== null) {
        console.log(`[Offline] Serving ${url} from IndexedDB cache`);
        return localData;
      }
      throw new Error("Error de conexión: no se pudo contactar el servidor");
    }
  }

  // For POST/PUT/DELETE: try server, queue on failure
  await ensureLocalDB();
  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      let errorMsg = `Error: ${response.status}`;
      try {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
        } else {
          if (response.status === 500) {
            errorMsg = "Error interno del servidor. ¿Ejecutaste 'npx prisma db push' después de actualizar el esquema?";
          } else if (response.status === 404) {
            errorMsg = "Recurso no encontrado";
          } else if (response.status === 401) {
            errorMsg = "No autorizado";
          } else {
            errorMsg = `Error del servidor (${response.status})`;
          }
        }
      } catch {
        if (response.status === 500) {
          errorMsg = "Error interno del servidor. ¿Ejecutaste 'npx prisma db push' después de actualizar el esquema?";
        }
      }
      throw new Error(errorMsg);
    }

    // After successful mutation, update IndexedDB with server response
    try {
      const data = await response.json();
      await updateLocalAfterMutation(url, options!, data);
      // Emit data event for instant UI updates
      try { emitMutationEvent(url, options?.method || "POST"); } catch {}
      return data as T;
    } catch {
      // Response might not be JSON (e.g., 204 No Content for DELETE)
      // Still emit event for DELETE operations
      try { emitMutationEvent(url, options?.method || "DELETE"); } catch {}
      return undefined as T;
    }
  } catch (networkError) {
    // Server unreachable — queue mutation and apply optimistically
    console.log(`[Offline] Server unreachable, queuing ${options?.method} ${url}`);
    await queueOfflineMutation(url, options!);
    await applyOptimisticWrite(url, options!);
    // Emit data event for instant UI updates even when offline
    try { emitMutationEvent(url, options?.method || "POST"); } catch {}

    // Return a mock success response so the UI can continue
    return { success: true, offline: true } as T;
  }
}

/**
 * Cache a successful GET response into IndexedDB for offline use.
 */
async function cacheGetResponse(url: string, data: unknown): Promise<void> {
  const { tableName, isCollection } = parseApiUrl(url);
  if (!tableName || !_localDB) return;

  try {
    const table = (_localDB as any)[tableName];
    if (!table) return;

    if (isCollection && Array.isArray(data)) {
      // Replace all records for this table with server data.
      // We must delete stale records that no longer exist on the server,
      // so we use replaceAllInTable instead of bulkPut.
      // However, replaceAllInTable requires a userId — extract it from
      // the data if available, otherwise fall back to bulkPut.
      const userId = (data as any[])?.[0]?.userId;
      if (userId) {
        const { replaceAllInTable } = await import("./local/db");
        await replaceAllInTable(tableName, userId, data as any[]);
      } else {
        // No userId available — fall back to bulkPut (best effort)
        // This may leave stale records but is better than nothing
        const now = Date.now();
        const enriched = (data as any[]).map((record: any) => ({
          ...record,
          _syncStatus: "synced",
          _version: 1,
          _lastModified: now,
        }));
        await table.bulkPut(enriched);
      }
    }
    // Single record caching is handled by the sync engine
  } catch (err) {
    // Non-critical — don't fail the original request
    console.warn("[Offline] Cache write failed:", err);
  }
}

/**
 * Update IndexedDB after a successful mutation.
 * This keeps the local data in sync with the server.
 *
 * Also handles cross-table updates: when a transaction is created,
 * the server returns `updatedBalances` with the new account balances.
 * We update the accounts/subAccounts tables in IndexedDB so that
 * the finance UI reflects the new balance immediately without
 * needing a full refetch.
 */
async function updateLocalAfterMutation(url: string, options: RequestInit, data: any): Promise<void> {
  const method = options.method?.toUpperCase() || "POST";
  const { tableName, isComplex } = parseApiUrl(url);
  if (!tableName || isComplex || !_localDB) return;

  try {
    const table = (_localDB as any)[tableName];
    if (!table) return;

    const now = Date.now();

    if (method === "POST" && data?.id) {
      // After create: store the server response (with real ID)
      await table.put({
        ...data,
        _syncStatus: "synced",
        _version: 1,
        _lastModified: now,
      });
    } else if (method === "PUT" && data?.id) {
      // After update: store the server response
      await table.put({
        ...data,
        _syncStatus: "synced",
        _version: 1,
        _lastModified: now,
      });
    } else if (method === "DELETE") {
      // After delete: remove from IndexedDB
      const parts = url.split("/");
      const id = parts[parts.length - 1];
      await table.delete(id);
    }

    // ── Cross-table balance updates ──────────────────────────────
    // When a transaction changes account balances, the server returns
    // `updatedBalances` with the new balance for each affected account.
    // We must update the IndexedDB accounts/subAccounts tables so the
    // liveQuery subscriptions emit the new data immediately.
    //
    // The server now includes the `id` field in updatedBalances, allowing
    // direct lookup by primary key (O(1) and doesn't require an index on `name`).
    // For backward compatibility with older server responses that lack `id`,
    // we fall back to a full table scan filtered by name.
    if (data?.updatedBalances && Array.isArray(data.updatedBalances)) {
      for (const ub of data.updatedBalances) {
        if (ub.isSubAccount) {
          // Update subAccount balance in IndexedDB
          const subAccountsTable = (_localDB as any).subAccounts;
          if (subAccountsTable) {
            if (ub.id) {
              // Direct lookup by primary key — fast and reliable
              try {
                await subAccountsTable.update(ub.id, {
                  balance: ub.balance,
                  _lastModified: now,
                });
              } catch {
                // Record might not exist in local DB yet — that's OK
              }
            } else {
              // Fallback: scan by name (slower, but works with old server)
              const allSubs = await subAccountsTable.toArray();
              for (const sub of allSubs) {
                if (sub.name === ub.name || `${sub.accountName || ''} → ${sub.name}` === ub.name) {
                  await subAccountsTable.update(sub.id, {
                    balance: ub.balance,
                    _lastModified: now,
                  });
                }
              }
            }
          }
        } else {
          // Update account balance in IndexedDB
          const accountsTable = (_localDB as any).accounts;
          if (accountsTable) {
            if (ub.id) {
              // Direct lookup by primary key — fast and reliable
              try {
                await accountsTable.update(ub.id, {
                  balance: ub.balance,
                  _lastModified: now,
                });
              } catch {
                // Record might not exist in local DB yet — that's OK
              }
            } else {
              // Fallback: scan by name (slower, but works with old server)
              const allAccs = await accountsTable.toArray();
              for (const acc of allAccs) {
                if (acc.name === ub.name) {
                  await accountsTable.update(acc.id, {
                    balance: ub.balance,
                    _lastModified: now,
                  });
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    // Non-critical
    console.warn("[Offline] Post-mutation update failed:", err);
  }
}

// Format currency (COP by default) — always shows 2 decimal places
// Defensive: if the value is NaN, null, undefined, or a non-number
// (e.g., a Prisma Decimal that slipped through), falls back to 0
// instead of showing "$ NaN" on the UI.
export function formatCurrency(amount: number | string | null | undefined, currency: string = "COP"): string {
  const num = Number(amount);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return formatCurrency(0, currency);
  }
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// ============================================
// TIMEZONE UTILITIES — Colombia (America/Bogota = UTC-5)
// ============================================
// All dates in the app are treated as Colombia-local dates.
// The server may run in UTC, so we need to ensure dates are
// interpreted in the Colombia timezone for comparisons.

const COLOMBIA_TIMEZONE = "America/Bogota"; // UTC-5

/**
 * Get the current date/time in Colombia timezone.
 * Returns a Date object that represents "now" in Colombia.
 */
export function getColombiaNow(): Date {
  // Create a date string in Colombia timezone, then parse it back
  const now = new Date();
  const colombiaStr = now.toLocaleString("en-US", { timeZone: COLOMBIA_TIMEZONE });
  return new Date(colombiaStr);
}

/**
 * Get today's date in Colombia as a YYYY-MM-DD string.
 */
export function getColombiaTodayString(): string {
  const now = new Date();
  return now.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE }); // sv-SE gives YYYY-MM-DD
}

/**
 * Create a Colombia-local midnight Date from a date string (YYYY-MM-DD).
 * This avoids the UTC timezone offset issue where `new Date("2026-04-10")`
 * could show April 9th in negative-UTC-offset timezones.
 */
export function createColombiaDate(dateStr: string): Date {
  // Parse the date parts and create a date that represents midnight in Colombia
  const [y, m, d] = dateStr.split("-").map(Number);
  // Colombia is UTC-5, so midnight Colombia = 5:00 UTC
  return new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0));
}

/**
 * Format a Date to YYYY-MM-DD in Colombia timezone.
 */
export function formatDateToColombiaISO(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE });
}

/**
 * Get a YYYY-MM-DD date string from a Date or date string, in Colombia timezone.
 * Useful for populating date inputs from API data.
 */
export function toColombiaDateString(date: Date | string): string {
  if (typeof date === "string") {
    // If it's already a YYYY-MM-DD string, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    // Otherwise parse and convert to Colombia date
    const d = parseLocalDate(date);
    return d.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE });
  }
  return date.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE });
}

/**
 * Sanitize a date value for use in an `<input type="date">`.
 * Ensures the value conforms to the required "yyyy-MM-dd" format.
 * Returns "" if the value cannot be parsed into a valid date.
 */
export function sanitizeDateForInput(value: string | null | undefined): string {
  if (!value) return "";
  // If already a valid YYYY-MM-DD string, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // Try to extract a valid date from ISO strings or other formats
  try {
    const d = parseLocalDate(value);
    if (isNaN(d.getTime())) return "";
    const formatted = d.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE });
    // Double-check the format (sv-SE should give YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
    return "";
  } catch {
    return "";
  }
}

// Parse a date string as a Colombia-local date (avoids UTC/browser timezone offset shifting the day)
// Always creates Date at midnight Colombia (05:00 UTC) so toColombiaDateString() returns the correct date
function parseLocalDate(date: Date | string): Date {
  if (typeof date === "string") {
    // Extract the date portion (YYYY-MM-DD) and build a Colombia-midnight Date
    const datePart = date.split("T")[0]; // handles both "2026-04-10" and "2026-04-10T00:00:00.000Z"
    const [y, m, d] = datePart.split("-").map(Number);
    // Colombia is UTC-5, so midnight Colombia = 5:00 UTC
    return new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0));
  }
  return date;
}

// Format date in Spanish locale (Colombia timezone)
export function formatDate(date: Date | string): string {
  if (!date) return "—";
  const d = parseLocalDate(date);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: COLOMBIA_TIMEZONE,
  }).format(d);
}

// Format short date (Colombia timezone)
export function formatShortDate(date: Date | string): string {
  if (!date) return "—";
  const d = parseLocalDate(date);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    timeZone: COLOMBIA_TIMEZONE,
  }).format(d);
}

// Calculate percentage
export function calcPercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

// ============================================================
// CDT Calculation Utilities (Compound Interest for EA rates)
// ============================================================
// In Colombia, CDTs use Tasa Efectiva Anual (EA) which is compound by definition.
// The correct formula uses daily compound rate derived from the EA rate.

/** Get days elapsed between two dates (floor, minimum 0) — uses Colombia timezone */
export function getDaysBetween(start: Date | string, end: Date | string): number {
  const parseDate = (d: Date | string): Date => {
    if (typeof d === "string") {
      const datePart = d.split("T")[0];
      return createColombiaDate(datePart);
    }
    return d;
  };
  const s = parseDate(start);
  const e = parseDate(end);
  return Math.max(0, Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Calculate CDT interest using compound interest (EA rate).
 * Formula: amount * ((1 + rate/100)^(days/365) - 1)
 * This is the CORRECT way to calculate interest for a Tasa Efectiva Anual.
 */
export function calculateCDTInterest(amount: number, effectiveRateEA: number, days: number): number {
  // Coerce to number in case a Prisma Decimal slipped through (defense-in-depth)
  const a = Number(amount);
  const r = Number(effectiveRateEA);
  const d = Number(days);
  if (a <= 0 || r <= 0 || d <= 0) return 0;
  return a * (Math.pow(1 + r / 100, d / 365) - 1);
}

/**
 * Get the number of days in a specific month (handles Feb 28/29).
 */
export function getDaysInMonth(year: number, month: number): number {
  // month is 0-indexed (0 = January)
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Calculate proportional yield for a savings account using compound interest (EA rate).
 * Takes into account the actual number of days the money will be in the account.
 *
 * @param balance - Current account balance
 * @param effectiveRateEA - Annual effective rate (%)
 * @param daysRemaining - Days remaining in the month from today
 * @returns The projected yield for the remaining days
 */
export function calculateProportionalYield(balance: number, effectiveRateEA: number, daysRemaining: number): number {
  const a = Number(balance);
  const r = Number(effectiveRateEA);
  const d = Number(daysRemaining);
  if (a <= 0 || r <= 0 || d <= 0) return 0;
  return a * (Math.pow(1 + r / 100, d / 365) - 1);
}

/**
 * Calculate projected yield for the full month (assuming balance stays the same).
 * Uses compound interest with the actual number of days in the month.
 */
export function calculateMonthlyYield(balance: number, effectiveRateEA: number): number {
  const now = getColombiaNow();
  const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth());
  return calculateProportionalYield(balance, effectiveRateEA, daysInMonth);
}

/**
 * Calculate CDT ReteFuente (4% withholding tax on interest earnings in Colombia).
 */
export function calculateCDTReteFuente(interestEarned: number, rate: number = 0.04): number {
  return Number(interestEarned) * Number(rate);
}

/**
 * Get full CDT breakdown: interest, retefuente, net total.
 */
export function getCDTBreakdown(amount: number, effectiveRateEA: number, termDays: number) {
  // Coerce to number in case a Prisma Decimal slipped through (defense-in-depth)
  // This prevents string concatenation like "800000" + 52323 = "80000052323"
  const a = Number(amount);
  const grossInterest = calculateCDTInterest(a, Number(effectiveRateEA), Number(termDays));
  const retefuente = calculateCDTReteFuente(grossInterest);
  const netInterest = grossInterest - retefuente;
  const netTotal = a + netInterest;
  return { grossInterest, retefuente, netInterest, netTotal };
}

/**
 * Get current CDT interest earned (compound, from startDate to now in Colombia).
 */
export function getCurrentCDTInterest(amount: number, effectiveRateEA: number, startDate: Date | string): number {
  const daysElapsed = getDaysBetween(startDate, getColombiaNow());
  return calculateCDTInterest(amount, effectiveRateEA, daysElapsed);
}

// Get relative time string
export function getRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Ahora mismo";
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return formatShortDate(d);
}

// Export parseLocalDate for use in other components (e.g., groupByDate)
export { parseLocalDate };

// ============================================
// BUSINESS DAY UTILITIES (Colombia)
// ============================================

/**
 * Adjust a date to the previous business day if it falls on a weekend.
 * Saturday → Friday, Sunday → Friday.
 */
export function adjustForWeekend(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay(); // 0=Sun, 6=Sat
  if (day === 0) {
    // Sunday → go back 2 days to Friday
    date.setDate(date.getDate() - 2);
  } else if (day === 6) {
    // Saturday → go back 1 day to Friday
    date.setDate(date.getDate() - 1);
  }
  return date.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE });
}

/**
 * Colombian public holidays for a given year (fixed dates only).
 * Some holidays in Colombia are "Ley Emiliani" (move to next Monday),
 * but for simplicity we include the most common fixed ones.
 * Returns YYYY-MM-DD strings.
 */
export function getColombianHolidays(year: number): string[] {
  const holidays: string[] = [
    `${year}-01-01`, // Año Nuevo
    `${year}-05-01`, // Día del Trabajo
    `${year}-07-20`, // Grito de Independencia
    `${year}-08-07`, // Batalla de Boyacá
    `${year}-12-08`, // Inmaculada Concepción
    `${year}-12-25`, // Navidad
  ];

  // Ley Emiliani holidays (move to next Monday) - approximate
  // For simplicity, we compute the actual date for the current year
  const emilianiHolidays = [
    { month: 1, day: 6 },   // Reyes Magos
    { month: 3, day: 19 },  // San José
    { month: 6, day: 29 },  // San Pedro y San Pablo
    { month: 8, day: 15 },  // Asunción de la Virgen
    { month: 10, day: 12 }, // Día de la Raza
    { month: 11, day: 1 },  // Todos los Santos
    { month: 11, day: 11 }, // Independencia de Cartagena
  ];

  for (const h of emilianiHolidays) {
    const date = new Date(year, h.month - 1, h.day);
    const day = date.getDay();
    // Move to next Monday if not already Monday
    if (day !== 1) {
      const daysUntilMonday = day === 0 ? 1 : (8 - day);
      date.setDate(date.getDate() + daysUntilMonday);
    }
    const adjusted = date.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE });
    holidays.push(adjusted);
  }

  // Easter-based holidays (computed from Easter Sunday)
  const easter = computeEaster(year);
  const easterDate = new Date(year, easter.month - 1, easter.day);

  // Jueves Santo (3 days before Easter)
  const juevesSanto = new Date(easterDate);
  juevesSanto.setDate(juevesSanto.getDate() - 3);
  holidays.push(juevesSanto.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE }));

  // Viernes Santo (2 days before Easter)
  const viernesSanto = new Date(easterDate);
  viernesSanto.setDate(viernesSanto.getDate() - 2);
  holidays.push(viernesSanto.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE }));

  // Ascensión del Señor (39 days after Easter → moves to next Monday)
  const ascension = new Date(easterDate);
  ascension.setDate(ascension.getDate() + 39);
  const ascDay = ascension.getDay();
  if (ascDay !== 1) {
    ascension.setDate(ascension.getDate() + (ascDay === 0 ? 1 : (8 - ascDay)));
  }
  holidays.push(ascension.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE }));

  // Corpus Christi (60 days after Easter → moves to next Monday)
  const corpus = new Date(easterDate);
  corpus.setDate(corpus.getDate() + 60);
  const corpusDay = corpus.getDay();
  if (corpusDay !== 1) {
    corpus.setDate(corpus.getDate() + (corpusDay === 0 ? 1 : (8 - corpusDay)));
  }
  holidays.push(corpus.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE }));

  // Sagrado Corazón (68 days after Easter → moves to next Monday)
  const sagrado = new Date(easterDate);
  sagrado.setDate(sagrado.getDate() + 68);
  const sagradoDay = sagrado.getDay();
  if (sagradoDay !== 1) {
    sagrado.setDate(sagrado.getDate() + (sagradoDay === 0 ? 1 : (8 - sagradoDay)));
  }
  holidays.push(sagrado.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE }));

  return holidays;
}

/** Compute Easter Sunday for a given year (Anonymous Gregorian algorithm) */
function computeEaster(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/**
 * Adjust a date to the previous business day if it falls on a weekend or Colombian holiday.
 */
export function adjustForBusinessDay(dateStr: string, adjustWeekend: boolean = true, adjustHoliday: boolean = true): string {
  let adjusted = dateStr;

  if (adjustWeekend) {
    adjusted = adjustForWeekend(adjusted);
  }

  if (adjustHoliday) {
    const [y] = adjusted.split("-").map(Number);
    const holidays = getColombianHolidays(y);
    // If it's a holiday, move back one day and re-check
    let attempts = 0;
    while (holidays.includes(adjusted) && attempts < 5) {
      const [yr, mo, da] = adjusted.split("-").map(Number);
      const date = new Date(yr, mo - 1, da);
      date.setDate(date.getDate() - 1);
      adjusted = date.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE });
      if (adjustWeekend) {
        adjusted = adjustForWeekend(adjusted);
      }
      // Re-fetch holidays for new year if needed
      const [ny] = adjusted.split("-").map(Number);
      if (ny !== y) {
        const newHolidays = getColombianHolidays(ny);
        while (newHolidays.includes(adjusted) && attempts < 5) {
          const [yr2, mo2, da2] = adjusted.split("-").map(Number);
          const date2 = new Date(yr2, mo2 - 1, da2);
          date2.setDate(date2.getDate() - 1);
          adjusted = date2.toLocaleDateString("sv-SE", { timeZone: COLOMBIA_TIMEZONE });
          if (adjustWeekend) {
            adjusted = adjustForWeekend(adjusted);
          }
          attempts++;
        }
        break;
      }
      attempts++;
    }
  }

  return adjusted;
}
