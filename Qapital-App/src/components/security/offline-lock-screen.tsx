"use client";

import { useState, useCallback } from "react";
import { compare } from "bcryptjs";
import { PinPad } from "./pin-pad";
import { cacheOfflinePinHash, getCachedPinHash, type CachedSession } from "@/lib/offline-session";
import { WifiOff } from "lucide-react";
import { motion } from "framer-motion";

interface OfflineLockScreenProps {
  cachedSession: CachedSession;
  onUnlock: () => void;
}

/**
 * Offline Lock Screen — shown when the server is unreachable
 * but the user has a previously cached session.
 * 
 * Allows the user to unlock with their PIN (verified locally
 * against the cached bcrypt hash) to access their data.
 */
export function OfflineLockScreen({ cachedSession, onUnlock }: OfflineLockScreenProps) {
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  
  const userId = cachedSession.user.id;
  const userName = cachedSession.user.name;
  const pinEnabled = cachedSession.user.pinEnabled;

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
          onUnlock();
          return;
        }
        setPinError("PIN incorrecto");
      } else {
        // No cached hash — we can't verify offline
        // This shouldn't normally happen if the user has ever used PIN while online
        setPinError("No se puede verificar sin conexión. Conéctate a internet primero.");
      }
    } catch {
      setPinError("Error de verificación");
    } finally {
      setVerifying(false);
    }
  }, [userId, onUnlock]);

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

        {/* PIN Pad */}
        {pinEnabled ? (
          <div className="w-full">
            <PinPad
              onComplete={handlePinComplete}
              error={pinError || undefined}
              title="Ingresa tu PIN"
              subtitle="Para acceder sin conexión"
            />
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-500">
              Activa el PIN en Ajustes para poder usar la app sin conexión.
            </p>
            <p className="text-xs text-gray-400">
              Necesitas conectarte a internet al menos una vez para configurarlo.
            </p>
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
