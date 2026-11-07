"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { setShowDecimals } from "@/lib/preferences";

/**
 * F-51 · Carga las preferencias de presentación al arrancar.
 *
 * `formatCurrency` lee un valor de módulo, así que basta con fijarlo una vez:
 * a partir de ahí todos los formateos de la app respetan la preferencia sin
 * tener que pasarla por props.
 */
export function usePreferencesSync() {
  useEffect(() => {
    apiFetch<{ showDecimals?: boolean }>("/api/settings")
      .then((settings) => {
        // Por defecto se muestran centavos; solo se apagan si el ajuste dice false.
        setShowDecimals(settings?.showDecimals !== false);
      })
      .catch(() => { /* sin sesión o sin ajustes: se queda el valor por defecto */ });
  }, []);
}
