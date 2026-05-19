"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Lock,
  Fingerprint,
  Loader2,
  Trash2,
  Smartphone,
  ShieldCheck,
  KeyRound,
  Eye,
} from "lucide-react";
import { PinPad } from "./pin-pad";
import { toast } from "sonner";
import { startRegistration } from "@simplewebauthn/browser";
import type { SecurityStatus, AuthCredentialInfo } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";

export function SecuritySettings() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // PIN setup dialog
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  // PIN disable dialog
  const [showPinDisable, setShowPinDisable] = useState(false);
  const [disablePinError, setDisablePinError] = useState<string | null>(null);

  // Delete credential dialog
  const [deletingCredentialId, setDeletingCredentialId] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<SecurityStatus>("/api/auth/security/status");
      setStatus(data);
    } catch (err) {
      console.error("Error fetching security status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ── PIN ──

  const handlePinSetupComplete = useCallback(async (pin: string) => {
    if (pinStep === "enter") {
      setFirstPin(pin);
      setPinStep("confirm");
      setPinError(null);
      return;
    }

    // Confirm step
    if (pin !== firstPin) {
      setPinError("Los PINs no coinciden");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/api/auth/pin/setup", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      toast.success("PIN configurado exitosamente");
      setShowPinSetup(false);
      setPinStep("enter");
      setFirstPin("");
      setPinError(null);
      fetchStatus();
    } catch {
      toast.error("Error al configurar el PIN");
    } finally {
      setSaving(false);
    }
  }, [pinStep, firstPin, fetchStatus]);

  const handlePinDisable = useCallback(async (pin: string) => {
    setSaving(true);
    try {
      const result = await apiFetch<{ success: boolean; error?: string }>("/api/auth/pin/disable", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      if (result.success) {
        toast.success("PIN desactivado");
        setShowPinDisable(false);
        setDisablePinError(null);
        fetchStatus();
      } else {
        setDisablePinError(result.error || "PIN incorrecto");
      }
    } catch {
      toast.error("Error al desactivar el PIN");
    } finally {
      setSaving(false);
    }
  }, [fetchStatus]);

  // ── Biometric ──

  const handleBiometricRegister = useCallback(async () => {
    setSaving(true);
    try {
      // Step 1: Get registration options
      const options = await apiFetch<any>("/api/auth/webauthn/register-options");

      // Step 2: Call browser WebAuthn API
      const regResp = await startRegistration({ optionsJSON: options });

      // Step 3: Verify and save
      await apiFetch("/api/auth/webauthn/register-verify", {
        method: "POST",
        body: JSON.stringify({
          credential: regResp,
          name: "Mi huella",
        }),
      });

      toast.success("Huella registrada exitosamente");
      fetchStatus();
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        // User cancelled
      } else {
        console.error("Biometric register error:", err);
        toast.error("No se pudo registrar la huella");
      }
    } finally {
      setSaving(false);
    }
  }, [fetchStatus]);

  const handleDeleteCredential = useCallback(async (credentialId: string) => {
    setSaving(true);
    try {
      await apiFetch("/api/auth/webauthn/delete-credential", {
        method: "DELETE",
        body: JSON.stringify({ credentialId }),
      });
      toast.success("Dispositivo eliminado");
      setDeletingCredentialId(null);
      fetchStatus();
    } catch {
      toast.error("Error al eliminar el dispositivo");
    } finally {
      setSaving(false);
    }
  }, [fetchStatus]);

  // ── Lock on resume ──

  const handleToggleLockOnResume = useCallback(async (value: boolean) => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ lockOnResume: value }),
      });
      fetchStatus();
    } catch {
      toast.error("Error al actualizar configuración");
    } finally {
      setSaving(false);
    }
  }, [fetchStatus]);

  // ── Toggle PIN ──

  const handleTogglePin = useCallback((enabled: boolean) => {
    if (enabled) {
      setPinStep("enter");
      setFirstPin("");
      setPinError(null);
      setShowPinSetup(true);
    } else {
      setDisablePinError(null);
      setShowPinDisable(true);
    }
  }, []);

  // ── Toggle biometric ──

  const handleToggleBiometric = useCallback((enabled: boolean) => {
    if (enabled) {
      handleBiometricRegister();
    } else {
      // Disable biometric by deleting all credentials
      if (status?.credentials?.length) {
        // Delete all credentials
        setSaving(true);
        Promise.all(
          status.credentials.map((c) =>
            apiFetch("/api/auth/webauthn/delete-credential", {
              method: "DELETE",
              body: JSON.stringify({ credentialId: c.id }),
            })
          )
        )
          .then(() => {
            toast.success("Biometría desactivada");
            fetchStatus();
          })
          .catch(() => toast.error("Error al desactivar biometría"))
          .finally(() => setSaving(false));
      }
    }
  }, [status, handleBiometricRegister, fetchStatus]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-3">
      {/* PIN Section */}
      <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <KeyRound className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-900 dark:text-white">Bloqueo con PIN</p>
                <p className="text-[10px] text-gray-400">Solicitar un PIN de 4 dígitos al abrir la app</p>
              </div>
            </div>
            <Switch
              checked={status.pinEnabled}
              onCheckedChange={handleTogglePin}
              disabled={saving}
            />
          </div>

          {status.pinEnabled && (
            <Button
              variant="outline"
              className="w-full rounded-xl text-xs gap-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 h-8"
              onClick={() => {
                setPinStep("enter");
                setFirstPin("");
                setPinError(null);
                setShowPinSetup(true);
              }}
            >
              Cambiar PIN
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Biometric Section */}
      <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <Fingerprint className="size-3.5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-900 dark:text-white">Autenticación biométrica</p>
                <p className="text-[10px] text-gray-400">Usar huella o rostro para desbloquear</p>
              </div>
            </div>
            <Switch
              checked={status.biometricEnabled}
              onCheckedChange={handleToggleBiometric}
              disabled={saving}
            />
          </div>

          {/* Registered credentials */}
          {status.credentials.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-500 font-medium">Dispositivos registrados</p>
              {status.credentials.map((cred) => (
                <div
                  key={cred.id}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-xl p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Fingerprint className="size-4 text-teal-500" />
                    <div>
                      <p className="text-[11px] font-medium text-gray-900 dark:text-white">
                        {cred.name || "Sin nombre"}
                      </p>
                      <p className="text-[9px] text-gray-400">
                        {cred.deviceType === "platform" ? "Huella/Rostro" : "Llave de seguridad"}
                        {cred.lastUsedAt && ` · Último uso: ${new Date(cred.lastUsedAt).toLocaleDateString("es-CO")}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    onClick={() => setDeletingCredentialId(cred.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new device button */}
          {status.biometricEnabled && (
            <Button
              variant="outline"
              className="w-full rounded-xl text-xs gap-2 border-teal-200 text-teal-600 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 h-8"
              onClick={handleBiometricRegister}
              disabled={saving}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Fingerprint className="size-3.5" />}
              Registrar otra huella
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Lock on Resume */}
      <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Eye className="size-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-900 dark:text-white">Bloquear al volver a la app</p>
                <p className="text-[10px] text-gray-400">Pedir autenticación cuando vuelves de otra app</p>
              </div>
            </div>
            <Switch
              checked={status.lockOnResume}
              onCheckedChange={handleToggleLockOnResume}
              disabled={saving || (!status.pinEnabled && !status.biometricEnabled)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Info about security */}
      {!status.pinEnabled && !status.biometricEnabled && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                Protege tu información
              </p>
              <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70">
                Activa el PIN o la autenticación biométrica para que nadie más pueda acceder a tus datos financieros.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── PIN Setup Dialog ── */}
      <Dialog open={showPinSetup} onOpenChange={(open) => {
        if (!open) {
          setShowPinSetup(false);
          setFirstPin("");
          setPinError(null);
          setPinStep("enter");
        }
      }}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">
              {pinStep === "enter" ? "Crear PIN" : "Confirmar PIN"}
            </DialogTitle>
            <DialogDescription className="text-center">
              {pinStep === "enter"
                ? "Elige un PIN de 4 dígitos"
                : "Ingresa el mismo PIN para confirmar"}
            </DialogDescription>
          </DialogHeader>
          <PinPad
            onComplete={handlePinSetupComplete}
            error={pinError || undefined}
            title={pinStep === "enter" ? "Nuevo PIN" : "Confirmar PIN"}
            subtitle={pinStep === "enter" ? "Elige 4 dígitos" : "Repite los 4 dígitos"}
          />
        </DialogContent>
      </Dialog>

      {/* ── PIN Disable Dialog ── */}
      <Dialog open={showPinDisable} onOpenChange={(open) => {
        if (!open) {
          setShowPinDisable(false);
          setDisablePinError(null);
        }
      }}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">Desactivar PIN</DialogTitle>
            <DialogDescription className="text-center">
              Ingresa tu PIN actual para desactivarlo
            </DialogDescription>
          </DialogHeader>
          <PinPad
            onComplete={handlePinDisable}
            error={disablePinError || undefined}
            title="Ingresa tu PIN"
            subtitle="Para desactivar el bloqueo"
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete Credential Confirm ── */}
      <Dialog open={!!deletingCredentialId} onOpenChange={(open) => {
        if (!open) setDeletingCredentialId(null);
      }}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center">¿Eliminar huella?</DialogTitle>
            <DialogDescription className="text-center">
              Ya no podrás usar esta huella para desbloquear la app.
              {status.credentials.length === 1 && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                  Al eliminar la última huella, se desactivará la autenticación biométrica.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-10"
              onClick={() => setDeletingCredentialId(null)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 rounded-xl h-10 bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deletingCredentialId && handleDeleteCredential(deletingCredentialId)}
              disabled={saving}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Eliminar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
