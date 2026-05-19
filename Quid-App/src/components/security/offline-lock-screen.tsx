"use client";

import { useState, useCallback } from "react";
import { compare } from "bcryptjs";
import { PinPad } from "./pin-pad";
import { cacheOfflinePinHash, getCachedPinHash, getCachedCredentials, verifyOfflinePassword, cacheOfflineSession, type CachedSession } from "@/lib/offline-session";
import { WifiOff, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface OfflineLockScreenProps {
  cachedSession: CachedSession;
  onUnlock: () => void;
}

type AuthMethod = "pin" | "password";

/**
 * Offline Lock Screen — shown when the server is unreachable
 * but the user has a previously cached session.
 *
 * Allows the user to unlock with their PIN or password (verified locally)
 * to access their data.
 *
 * On successful unlock, calls onUnlock which sets the offline session
 * in the Zustand store — no page reload needed.
 */
export function OfflineLockScreen({ cachedSession, onUnlock }: OfflineLockScreenProps) {
  const [method, setMethod] = useState<AuthMethod>(cachedSession.user.pinEnabled ? "pin" : "password");
  const [pinError, setPinError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);

  const userId = cachedSession.user.id;
  const userName = cachedSession.user.name;
  const pinEnabled = cachedSession.user.pinEnabled;
  const hasOfflineCredentials = !!getCachedCredentials();

  const handleUnlockSuccess = useCallback(() => {
    // Cache the session for the Service Worker
    cacheOfflineSession(cachedSession);
    toast.success("¡Desbloqueado (sin conexión)!");
    onUnlock();
  }, [cachedSession, onUnlock]);

  const handlePinComplete = useCallback(async (pin: string) => {
    setVerifying(true);
    setPinError(null);

    try {
      // Try to verify PIN against cached hash
      const cachedHash = getCachedPinHash(userId);

      if (cachedHash) {
        // We have a cached hash — verify locally (works offline!)
        const isValid = await compare(pin, cachedHash);
        if (isValid) {
          handleUnlockSuccess();
          return;
        }
        setPinError("PIN incorrecto");
      } else {
        // No cached hash — try to use password instead
        setPinError("PIN no disponible sin conexión. Usa tu contraseña.");
        setMethod("password");
      }
    } catch {
      setPinError("Error de verificación");
    } finally {
      setVerifying(false);
    }
  }, [userId, handleUnlockSuccess]);

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setVerifying(true);
    setPasswordError(null);

    try {
      const verifiedUserId = await verifyOfflinePassword(cachedSession.user.email || "", password);
      if (verifiedUserId) {
        handleUnlockSuccess();
        return;
      }
      setPasswordError("Contraseña incorrecta");
    } catch {
      setPasswordError("Error de verificación");
    } finally {
      setVerifying(false);
    }
  }, [password, cachedSession.user.email, handleUnlockSuccess]);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm flex flex-col items-center gap-6"
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
          <p className="text-xs text-gray-400 mt-1">Modo sin conexión</p>
        </div>

        {/* Offline indicator */}
        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 rounded-full">
          <WifiOff className="size-4" />
          <span className="text-sm font-medium">Sin conexión al servidor</span>
        </div>

        {/* User info */}
        {userName && (
          <p className="text-sm text-gray-500">
            Hola, <span className="font-medium text-gray-700 dark:text-gray-300">{userName}</span>
          </p>
        )}

        {/* Auth methods */}
        <AnimatePresence mode="wait">
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
                subtitle="Para acceder sin conexión"
              />
            </motion.div>
          )}

          {method === "password" && (
            <motion.div
              key="password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full"
            >
              {hasOfflineCredentials ? (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-4">Ingresa tu contraseña para acceder sin conexión</p>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                    <Input
                      type="password"
                      placeholder="Tu contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-11 rounded-xl border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={verifying}
                      autoFocus
                    />
                  </div>
                  {passwordError && (
                    <p className="text-sm text-red-500 text-center">{passwordError}</p>
                  )}
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600"
                    disabled={verifying || !password}
                  >
                    {verifying ? "Verificando..." : "Desbloquear"}
                  </Button>
                </form>
              ) : (
                <div className="text-center space-y-4">
                  <p className="text-sm text-gray-500">
                    Necesitas haber iniciado sesión al menos una vez con conexión para acceder sin conexión.
                  </p>
                  <p className="text-xs text-gray-400">
                    Conéctate a internet para iniciar sesión y habilitar el acceso offline.
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Switch between methods */}
        <div className="flex gap-3">
          {pinEnabled && method === "password" && (
            <button
              onClick={() => setMethod("pin")}
              className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1"
            >
              Usar PIN
            </button>
          )}
          {pinEnabled && method === "pin" && hasOfflineCredentials && (
            <button
              onClick={() => setMethod("password")}
              className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1"
            >
              Usar contraseña
            </button>
          )}
        </div>
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
