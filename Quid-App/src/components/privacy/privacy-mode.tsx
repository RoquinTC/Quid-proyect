"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  readPrivacyMode,
  setPrivacyMode,
  syncPrivacyMode,
  onPrivacyModeChange,
} from "@/lib/privacy-mode";

/** Aplica el modo guardado en cuanto arranca la app. */
export function PrivacyModeBoot() {
  useEffect(() => {
    syncPrivacyMode();
    return onPrivacyModeChange(() => undefined);
  }, []);

  return null;
}

/** Botón del encabezado: oculta o muestra las cifras. */
export function PrivacyToggle() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(readPrivacyMode());
    return onPrivacyModeChange(setHidden);
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={hidden ? "Mostrar montos" : "Ocultar montos"}
      title={hidden ? "Mostrar montos" : "Ocultar montos"}
      className="text-white hover:bg-white/20"
      onClick={() => {
        const next = !hidden;
        setPrivacyMode(next);
        setHidden(next);
      }}
    >
      {hidden ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </Button>
  );
}
