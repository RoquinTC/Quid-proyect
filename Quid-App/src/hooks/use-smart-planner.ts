"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { RadarEvent } from "@/lib/types";

export function useSmartPlanner() {
  const [events, setEvents] = useState<RadarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await apiFetch<RadarEvent[]>("/api/smart-planner");
      if (mountedRef.current) {
        setEvents(result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el radar");
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setSyncing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { events, loading, syncing, error, refresh };
}
