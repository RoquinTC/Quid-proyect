"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

/**
 * Hook that periodically checks /api/health for a new buildId.
 * When a new build is detected (Docker container restarted with new code),
 * shows a toast notification offering to reload the page.
 */
export function useUpdateChecker(intervalMs = 60000) {
  const initialBuildId = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const toastShownRef = useRef(false);

  // Fetch the current buildId from the server
  const checkForUpdate = async () => {
    try {
      const res = await fetch("/api/health?" + Date.now()); // bust cache
      if (!res.ok) return;
      const data = await res.json();
      const serverBuildId = data.buildId;

      if (!initialBuildId.current) {
        // First check — store the initial buildId
        initialBuildId.current = serverBuildId;
        return;
      }

      // If the server's buildId differs from our initial one, there's a new deploy
      if (serverBuildId !== initialBuildId.current && !toastShownRef.current) {
        toastShownRef.current = true;
        setUpdateAvailable(true);

        toast(`Nueva actualización disponible: ${serverBuildId}`, {
          description: "Hay una versión nueva de Quid lista para instalar.",
          duration: Infinity,
          action: {
            label: "Actualizar Ahora",
            onClick: () => {
              // Limpiar caché antes de recargar para asegurar frescura
              if ('caches' in window) {
                caches.keys().then(names => {
                  for (let name of names) caches.delete(name);
                });
              }
              window.location.reload();
            },
          },
          dismissible: true,
          onDismiss: () => {
            // If dismissed, check again in 2 minutes
            toastShownRef.current = false;
          },
        });
      }
    } catch {
      // Network error — ignore, will retry next interval
    }
  };

  useEffect(() => {
    // Only run when authenticated and in the browser
    if (typeof window === "undefined") return;

    // Initial check
    checkForUpdate();

    // Periodic check
    const interval = setInterval(checkForUpdate, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return { updateAvailable };
}
