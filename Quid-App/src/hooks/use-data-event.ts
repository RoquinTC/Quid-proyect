/**
 * useDataEvent — React hook for the data event bus
 *
 * Subscribes to data change events and calls the callback when they occur.
 * Automatically unsubscribes on unmount.
 *
 * Usage:
 *   useDataEvent("fuelLogs", () => { refetchFuelLogs(); });
 *   useDataEvent("vehicles", () => { refetchVehicles(); });
 *   useDataEvent("*", () => { refetchAll(); }); // Listen to all events
 */

"use client";

import { useEffect } from "react";
import { onDataEvent } from "@/lib/data-events";

export function useDataEvent(
  tableOrModule: string,
  callback: () => void
): void {
  useEffect(() => {
    const unsubscribe = onDataEvent(tableOrModule, callback);
    return unsubscribe;
  }, [tableOrModule, callback]);
}
