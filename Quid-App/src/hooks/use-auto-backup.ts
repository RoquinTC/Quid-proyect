"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";

/**
 * useAutoBackup
 *
 * Automatically saves a backup to the server on the first app open of the day.
 * The check is done by comparing the date of the latest server backup with today's date
 * in the user's timezone (America/Bogota).
 *
 * Logic:
 * 1. Wait for session to be authenticated
 * 2. Check if there's already a server backup from today
 * 3. If not, trigger a server backup silently
 * 4. Also check if DB is empty and offer to restore from server backup
 */

interface BackupInfo {
  hasBackup: boolean;
  id?: string;
  version?: number;
  recordCount?: number;
  createdAt?: string;
}

export function useAutoBackup() {
  const { data: session, status } = useSession();
  const hasCheckedRef = useRef(false);

  const getTodayStr = useCallback(() => {
    return new Date().toLocaleDateString("sv-SE", {
      timeZone: "America/Bogota",
    }); // Returns YYYY-MM-DD
  }, []);

  const isToday = useCallback((isoDate: string) => {
    const backupDate = new Date(isoDate).toLocaleDateString("sv-SE", {
      timeZone: "America/Bogota",
    });
    return backupDate === getTodayStr();
  }, [getTodayStr]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id || hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const runAutoBackup = async () => {
      try {
        // 1. Check if DB has data (if empty, maybe we should restore first)
        const statusRes = await fetch("/api/backup/status");
        if (statusRes.ok) {
          const statusData = await statusRes.json();

          // If DB is empty, check if there's a server backup to restore
          if (!statusData.hasData) {
            const latestRes = await fetch("/api/backup/server-latest");
            if (latestRes.ok) {
              const latestData: BackupInfo = await latestRes.json();
              if (latestData.hasBackup && latestData.createdAt) {
                // Auto-restore from server backup
                console.log("[AutoBackup] DB vacía, restaurando desde servidor...");
                const restoreRes = await fetch("/api/backup/server-restore", { method: "POST" });
                if (restoreRes.ok) {
                  console.log("[AutoBackup] Restauración exitosa, recargando...");
                  window.location.reload();
                  return;
                }
              }
            }
            // No data and no server backup — nothing to do
            return;
          }
        }

        // 2. DB has data — check if we already backed up today
        const latestRes = await fetch("/api/backup/server-latest");
        if (latestRes.ok) {
          const latestData: BackupInfo = await latestRes.json();

          if (latestData.hasBackup && latestData.createdAt && isToday(latestData.createdAt)) {
            console.log("[AutoBackup] Ya existe un backup del día de hoy, omitiendo.");
            return;
          }

          // No backup today → create one
          console.log("[AutoBackup] Creando backup automático del día...");
          const saveRes = await fetch("/api/backup/server-save", { method: "POST" });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            console.log(`[AutoBackup] Backup creado: ${saveData.recordCount} registros`);
          } else {
            console.error("[AutoBackup] Error al crear backup automático");
          }
        }
      } catch (error) {
        console.error("[AutoBackup] Error:", error);
      }
    };

    // Delay 5s after login to avoid race conditions with data loading
    const timer = setTimeout(runAutoBackup, 5000);
    return () => clearTimeout(timer);
  }, [status, session?.user?.id, isToday]);
}
