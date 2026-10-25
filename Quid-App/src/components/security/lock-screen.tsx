"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppSession } from "@/lib/use-app-session";
import { PinPad } from "./pin-pad";
import { BiometricPrompt } from "./biometric-prompt";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { cacheOfflinePinHash, getCachedPinHash } from "@/lib/offline-session";
import { performLogout } from "@/lib/logout";
import { compare } from "bcryptjs";
import { isNativeAndroid } from "@/lib/native/biometric";

interface LockScreenProps {
  onUnlock: () => void;
}

type AuthMethod = "choose" | "biometric" | "pin";

export function LockScreen({ onUnlock }: LockScreenProps) {
  const { session } = useAppSession();
  const [method, setMethod] = useState<AuthMethod>("choose");
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  /**
   * Flags del servidor. No se confía solo en el JWT: si el PIN se activó
   * después de iniciar sesión, el token sigue diciendo `pinEnabled: false` y la
   * pantalla terminaba ofreciendo únicamente huella.
   */
  const [status, setStatus] = useState<{ pinEnabled: boolean; biometricEnabled: boolean } | null>(
    null,
  );

  const userId = session?.user?.id;
  const hasCachedPin = Boolean(userId && getCachedPinHash(userId));

  const pinEnabled =
    status?.pinEnabled ?? (Boolean(session?.user?.pinEnabled) || hasCachedPin);
  const biometricEnabled =
    status?.biometricEnabled ?? Boolean(session?.user?.biometricEnabled);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ pinEnabled?: boolean; biometricEnabled?: boolean }>(
          "/api/auth/security/status",
        );
        if (cancelled) return;
        setStatus({
          pinEnabled: Boolean(data.pinEnabled),
          biometricEnabled: Boolean(data.biometricEnabled),
        });
      } catch {
        // Sin red: queda lo que diga el JWT o el hash cacheado.
      }

      // Deja el hash del PIN en caché para poder desbloquear sin conexión.
      try {
        const settings = await apiFetch<{ pinHash?: string }>("/api/settings");
        if (!cancelled && settings.pinHash && userId) {
          cacheOfflinePinHash(userId, settings.pinHash);
        }
      } catch {
        // Sin red o sin permiso: no es crítico aquí.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // La elección inicial se hace una sola vez; si el usuario cambia a PIN, no se
  // vuelve a forzar huella cuando llega el estado del servidor.
  const initialChoiceDone = useRef(false);
  useEffect(() => {
    if (initialChoiceDone.current) return;
    if (!pinEnabled && !biometricEnabled) return;
    initialChoiceDone.current = true;

    // Android: la huella es el camino más rápido, pero el PIN siempre queda a un toque.
    if (biometricEnabled && isNativeAndroid()) {
      setMethod("biometric");
    } else if (pinEnabled) {
      setMethod("pin");
    } else {
      setMethod("biometric");
    }
  }, [pinEnabled, biometricEnabled]);

  const handlePinComplete = useCallback(async (pin: string) => {
    setVerifying(true);
    setPinError(null);
    const userId = session?.user?.id;

    try {
      // Try online verification first
      const result = await apiFetch<{ success: boolean; error?: string }>("/api/auth/pin/verify", {
        method: "POST",
        headers: userId ? { "x-user-id": userId } : undefined,
        body: JSON.stringify({ pin }),
      });

      if (result.success) {
        // Online verification succeeded — cache the pin hash for offline use
        if (userId) {
          try {
            const settings = await apiFetch<{ pinHash?: string }>("/api/settings", {
              headers: { "x-user-id": userId }
            });
            if (settings.pinHash) {
              cacheOfflinePinHash(userId, settings.pinHash);
            }
          } catch {
            // Settings fetch failed — not critical
          }
        }
        onUnlock();
      } else {
        setPinError(result.error || "PIN incorrecto");
      }
    } catch {
      // Sin red o sesión inválida: se intenta con el hash cacheado del PIN.
      if (userId) {
        const cachedHash = getCachedPinHash(userId);
        if (cachedHash) {
          try {
            const isValid = await compare(pin, cachedHash);
            if (isValid) {
              onUnlock();
              return;
            }
            setPinError("PIN incorrecto");
            return;
          } catch {
            // La comparación falló: se informa abajo.
          }
        }
        setPinError(
          cachedHash
            ? "No se pudo verificar el PIN. Intenta de nuevo."
            : "Verifica el PIN una vez con internet para poder usarlo sin conexión.",
        );
        return;
      }
      setPinError("Sin conexión. PIN no disponible sin conexión.");
    } finally {
      setVerifying(false);
    }
  }, [onUnlock, session?.user?.id]);

  const handleBiometricSuccess = useCallback((_userId: string, _email: string) => {
    onUnlock();
  }, [onUnlock]);

  const handleBiometricFallback = useCallback(() => {
    if (pinEnabled) {
      setMethod("pin");
    }
  }, [pinEnabled]);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm flex flex-col items-center gap-8"
      >
        {/* Logo */}
        <div className="text-center">
          <img
            src="/icon-192.png"
            alt="Quid"
            className="size-16 mx-auto mb-3 rounded-2xl shadow-lg shadow-emerald-500/30"
          />
          <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            Quid
          </h1>
          <p className="text-xs text-gray-400 mt-1">App bloqueada</p>
        </div>

        {/* Auth methods */}
        <AnimatePresence mode="wait">
          {method === "biometric" && biometricEnabled && (
            <motion.div
              key="biometric"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col items-center gap-6"
            >
              <BiometricPrompt
                userId={session?.user?.id}
                onSuccess={handleBiometricSuccess}
                onFallback={handleBiometricFallback}
                autoStartNative
              />
            </motion.div>
          )}

          {method === "pin" && pinEnabled && (
            <motion.div
              key="pin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full"
            >
              <PinPad
                onComplete={handlePinComplete}
                error={pinError || undefined}
                title="Ingresa tu PIN"
                subtitle="Para desbloquear la app"
              />
            </motion.div>
          )}

          {method === "choose" && (
            <motion.div
              key="choose"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-4"
            >
              <p className="text-sm text-gray-500">Configura un método de seguridad en Ajustes</p>
              <button
                onClick={onUnlock}
                className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                Continuar sin bloqueo
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Use password link */}
        <button
          onClick={performLogout}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          Usar contraseña
        </button>

        {/* Switch between methods if both enabled */}
        {pinEnabled && biometricEnabled && (
          <div className="flex gap-3">
            {method === "pin" && (
              <button
                onClick={() => setMethod("biometric")}
                className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1"
              >
                Usar huella
              </button>
            )}
            {method === "biometric" && (
              <button
                onClick={() => setMethod("pin")}
                className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1"
              >
                Usar PIN
              </button>
            )}
          </div>
        )}
      </motion.div>

      {/* Loading overlay */}
      {verifying && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-xl">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="size-8 border-2 border-emerald-500 border-t-transparent rounded-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
