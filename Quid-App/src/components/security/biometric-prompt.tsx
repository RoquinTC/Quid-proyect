"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Fingerprint, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { startAuthentication } from "@simplewebauthn/browser";
import { toast } from "sonner";

interface BiometricPromptProps {
  userId?: string;
  onSuccess: (userId: string, email: string) => void;
  onFallback?: () => void;
  onError?: (error: string) => void;
}

export function BiometricPrompt({ userId, onSuccess, onFallback, onError }: BiometricPromptProps) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleBiometricAuth = useCallback(async () => {
    setLoading(true);
    setFailed(false);

    try {
      // Step 1: Get authentication options from the server
      const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const optionsRes = await fetch(`/api/auth/webauthn/auth-options${params}`);
      if (!optionsRes.ok) {
        throw new Error("No se pudieron obtener las opciones de autenticación");
      }
      const options = await optionsRes.json();

      // Step 2: Call the browser WebAuthn API
      const asseResp = await startAuthentication({ optionsJSON: options });

      // Step 3: Verify the response with the server
      const verifyRes = await fetch("/api/auth/webauthn/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: asseResp,
          userId,
        }),
      });

      const verifyData = await verifyRes.json();

      if (verifyData.verified && verifyData.userId) {
        onSuccess(verifyData.userId, verifyData.email);
      } else {
        setFailed(true);
        onError?.(verifyData.error || "Verificación fallida");
        toast.error("Huella no reconocida");
      }
    } catch (err: any) {
      console.warn("[Biometric] Auth error:", err);
      setFailed(true);

      // User cancelled or browser doesn't support it
      if (err?.name === "NotAllowedError") {
        // User cancelled the biometric prompt
      } else {
        onError?.(err?.message || "Error de autenticación biométrica");
        toast.error("No se pudo autenticar con huella");
      }
    } finally {
      setLoading(false);
    }
  }, [userId, onSuccess, onError]);

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        animate={failed ? { x: [-6, 6, -4, 4, 0] } : {}}
        transition={{ duration: 0.3 }}
      >
        <Button
          onClick={handleBiometricAuth}
          disabled={loading}
          className="h-14 px-8 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25 gap-3 text-sm font-semibold"
        >
          {loading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Fingerprint className="size-5" />
          )}
          Usar huella
        </Button>
      </motion.div>

      {onFallback && (
        <button
          onClick={onFallback}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Usar PIN o contraseña
        </button>
      )}
    </div>
  );
}
