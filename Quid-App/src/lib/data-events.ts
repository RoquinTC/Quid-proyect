/**
 * Data Event Bus — Simple event emitter for instant UI updates
 *
 * When a mutation (create/update/delete) happens via apiFetch or useLocalMutation,
 * we emit an event so any listening component can re-fetch its data.
 *
 * This bridges the gap between the existing apiFetch-based forms and the
 * liveQuery-based reads, providing instant UI updates without full page navigation.
 *
 * Usage in components:
 *   useDataEventListener("fuelLogs", () => refetch());
 *   useDataEventListener("transactions", () => refetch());
 */

type EventCallback = () => void;
type EventType = string;

const listeners = new Map<EventType, Set<EventCallback>>();

/**
 * Emit a data change event. Called after successful mutations.
 */
export function emitDataEvent(tableOrModule: string): void {
  const callbacks = listeners.get(tableOrModule);
  if (callbacks) {
    callbacks.forEach((cb) => {
      try { cb(); } catch (err) {
        console.warn(`[DataEvents] Error in listener for ${tableOrModule}:`, err);
      }
    });
  }

  // Also emit a wildcard event for any global listeners
  const wildcardCallbacks = listeners.get("*");
  if (wildcardCallbacks) {
    wildcardCallbacks.forEach((cb) => {
      try { cb(); } catch (err) {
        console.warn(`[DataEvents] Error in wildcard listener:`, err);
      }
    });
  }
}

/**
 * Subscribe to data change events.
 * Returns an unsubscribe function.
 */
export function onDataEvent(tableOrModule: string, callback: EventCallback): () => void {
  if (!listeners.has(tableOrModule)) {
    listeners.set(tableOrModule, new Set());
  }
  listeners.get(tableOrModule)!.add(callback);

  return () => {
    const callbacks = listeners.get(tableOrModule);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        listeners.delete(tableOrModule);
      }
    }
  };
}

/**
 * React hook to subscribe to data change events.
 * Automatically unsubscribes on unmount.
 *
 * @param tableOrModule - The table name (e.g. "fuelLogs", "vehicles") or "*" for all events
 * @param callback - Function to call when data changes
 *
 * Usage:
 *   useDataEventListener("fuelLogs", () => { refetchFuelLogs(); });
 *   useDataEventListener("vehicles", () => { refetchVehicles(); });
 */
export function useDataEventListenerHook(
  tableOrModule: string,
  callback: EventCallback
): void {
  // This must be used inside a React component with useEffect
  // We export the hook from a separate file to avoid circular deps
}

/**
 * Emit events for common mutations.
 * Called from apiFetch after successful mutations.
 */
export function emitMutationEvent(url: string, method: string): void {
  // Parse the URL to determine which table was affected
  const tableName = getTableFromUrl(url);
  if (tableName) {
    emitDataEvent(tableName);
  }
  // Always emit wildcard
  emitDataEvent("*");
}

function getTableFromUrl(url: string): string | null {
  const API_TABLE_MAP: Record<string, string> = {
    "/api/accounts": "accounts",
    "/api/transactions": "transactions",
    "/api/budgets": "budgets",
    "/api/debts": "debts",
    "/api/savings": "savingsGoals",
    "/api/cdts": "cdts",
    "/api/recurring": "recurringPayments",
    "/api/payroll": "payrollGroups",
    "/api/vehicles": "vehicles",
    "/api/medications": "medications",
    "/api/appointments": "appointments",
    "/api/pantry": "pantryItems",
    "/api/shopping-lists": "shoppingLists",
    "/api/health-profiles": "healthProfiles",
    "/api/fuel-prices": "fuelPrices",
    "/api/settings": "userSettings",
  };

  // Extract the base API path
  const cleanUrl = url.split("?")[0];
  const match = cleanUrl.match(/^\/api\/([^/]+)/);
  if (!match) return null;

  const basePath = `/api/${match[1]}`;

  // Direct match
  if (API_TABLE_MAP[basePath]) return API_TABLE_MAP[basePath];

  // Sub-resource mapping
  if (cleanUrl.includes("/fuel-logs")) return "fuelLogs";
  if (cleanUrl.includes("/maintenance")) return "maintenanceRecords";
  if (cleanUrl.includes("/sub-accounts")) return "subAccounts";
  if (cleanUrl.includes("/installments")) return "installments";
  if (cleanUrl.includes("/items")) return "shoppingListItems";

  return null;
}
