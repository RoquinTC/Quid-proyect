"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkIdle,
  clearPin,
  hasPin,
  isLocked,
  lockNow,
  onLockChange,
  onPinSetupRequest,
  setPin,
  touchActivity,
  unlock,
  verifyPin,
} from "@/lib/pin-lock";

/**
 * F-16 · Capa de bloqueo. Vive en el shell: si hay PIN configurado y la app
 * estuvo inactiva, cubre la pantalla hasta que se escriba el PIN.
 * También hospeda el diálogo para activarlo o quitarlo desde el menú.
 */
export function PinLockGate() {
  const [locked, setLocked] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [has, setHas] = useState(false);
  const [pin, setPinValue] = useState("");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHas(hasPin());
    setLocked(isLocked());

    const offLock = onLockChange(setLocked);
    const offSetup = onPinSetupRequest(() => {
      setSetupOpen(true);
      setHas(hasPin());
      setFirst("");
      setSecond("");
      setError("");
    });

    const activity = () => touchActivity();
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const timer = window.setInterval(checkIdle, 15000);
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        touchActivity();
        lockNow();
      }
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      offLock();
      offSetup();
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange", onHidden);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (locked) inputRef.current?.focus();
  }, [locked]);

  if (!locked && !setupOpen) return null;

  const submitUnlock = async () => {
    if (await verifyPin(pin)) {
      setPinValue("");
      setError("");
      unlock();
      return;
    }
    setPinValue("");
    setError("PIN incorrecto");
  };

  const savePin = async () => {
    if (first.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos");
      return;
    }
    if (first !== second) {
      setError("Los dos PIN no coinciden");
      return;
    }
    await setPin(first);
    setSetupOpen(false);
    setHas(true);
    setError("");
  };

  const removePin = () => {
    clearPin();
    setHas(false);
    setSetupOpen(false);
    setError("");
  };

  return (
    <>
      {locked && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background/95 px-8 backdrop-blur-sm">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/15">
            <Lock className="size-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">Quid está bloqueado</p>
            <p className="mt-1 text-sm text-muted-foreground">Escribe tu PIN para entrar</p>
          </div>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(event) => setPinValue(event.target.value.replace(/\D/g, ""))}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submitUnlock();
            }}
            className="h-12 w-44 rounded-xl border border-border bg-card text-center text-2xl tracking-[0.4em]"
            maxLength={8}
          />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <Button className="h-11 w-44 rounded-xl" onClick={() => void submitUnlock()}>
            Desbloquear
          </Button>
        </div>
      )}

      {setupOpen && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-card p-5 shadow-xl">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
              <p className="font-semibold">Bloqueo con PIN</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Se guarda solo en este dispositivo. Al abrir la app o tras 3 minutos inactivo, Quid
              pedirá el PIN.
            </p>

            {has ? (
              <div className="space-y-3">
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  El bloqueo está activo.
                </p>
                <Button variant="outline" className="w-full rounded-xl" onClick={removePin}>
                  Quitar bloqueo
                </Button>
              </div>
            ) : (
              <>
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="PIN (mínimo 4 dígitos)"
                  value={first}
                  onChange={(event) => setFirst(event.target.value.replace(/\D/g, ""))}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-center tracking-[0.3em]"
                  maxLength={8}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="Repite el PIN"
                  value={second}
                  onChange={(event) => setSecond(event.target.value.replace(/\D/g, ""))}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-center tracking-[0.3em]"
                  maxLength={8}
                />
                {error && <p className="text-sm text-rose-500">{error}</p>}
                <Button className="w-full rounded-xl" onClick={() => void savePin()}>
                  Activar bloqueo
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              className="w-full rounded-xl"
              onClick={() => {
                setSetupOpen(false);
                setError("");
              }}
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
