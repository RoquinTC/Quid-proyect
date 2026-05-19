"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { PinPad } from "./pin-pad";
import { BiometricPrompt } from "./biometric-prompt";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { cacheOfflinePinHash, getCachedPinHash } from "@/lib/offline-session";
import { performLogout } from "@/lib/logout";
import { compare } from "bcryptjs";

interface LockScreenProps {
  onUnlock: () => void;
}

type AuthMethod = "choose" | "biometric" | "pin";

export function LockScreen({ onUnlock }: LockScreenProps) {
  const { data: session } = useSession();
  const [method, setMethod] = useState<AuthMethod>("choose");
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const pinEnabled = session?.user?.pinEnabled ?? false;
  const biometricEnabled = session?.user?.biometricEnabled ?? false;

  // Determine default method based on enabled features
  useEffect(() => {
    if (biometricEnabled) {
      setMethod("biometric");
    } else if (pinEnabled) {
      setMethod("pin");
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
        body: JSON.stringify({ pin }),
      });

      if (result.success) {
        // Online verification succeeded — cache the pin hash for offline use
        if (userId) {
          try {
            const settings = await apiFetch<{ pinHash?: string }>("/api/settings");
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
      // Online verification failed — try offline verification with cached hash
      if (userId) {
        const cachedHash = getCachedPinHash(userId);
        if (cachedHash) {
          try {
            const isValid = await compare(pin, cachedHash);
            if (isValid) {
              onUnlock();
              return;
            }
          } catch {
            // bcrypt comparison failed
          }
        }
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
