"use client";

import { useAutoBackup } from "@/hooks/use-auto-backup";

/**
 * Thin wrapper component to activate the auto-backup hook
 * inside the component tree (where SessionProvider is available).
 */
export function AutoBackupHandler() {
  useAutoBackup();
  return null;
}
