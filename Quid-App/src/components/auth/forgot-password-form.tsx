"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Mail,
  Lock,
  ArrowLeft,
  KeyRound,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

type Step = "email" | "reset" | "success";

export function ForgotPasswordForm() {
  const { setAuthView } = useAppStore();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  // Step 1: Verify email exists
  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Por favor ingresa tu correo electrónico");
      return;
    }

    setVerifyingEmail(true);
    try {
      // Check if user exists by attempting a lightweight check
      const res = await fetch(
        `/api/auth/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            newPassword: "__check_only__",
            confirmPassword: "__check_only__",
          }),
        }
      );

      const data = await res.json();

      if (res.status === 404) {
        toast.error("No se encontró una cuenta con este correo");
        setVerifyingEmail(false);
        return;
      }

      // Email exists — move to step 2
      setStep("reset");
      setVerifyingEmail(false);
    } catch {
      toast.error("Error de conexión");
      setVerifyingEmail(false);
    }
  };

  // Step 2: Set new password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword, confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Error al restablecer la contraseña");
        setLoading(false);
        return;
      }

      toast.success("¡Contraseña actualizada!");
      setStep("success");
      setLoading(false);
    } catch {
      toast.error("Error de conexión");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/icon-192.png"
            alt="Quid"
            className="size-20 mx-auto mb-4 rounded-2xl shadow-lg shadow-emerald-500/30"
          />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            Quid
          </h1>
          <p className="text-sm text-gray-500 mt-1">Todo converge aqui</p>
        </div>

        {/* ====== STEP 1: Enter Email ====== */}
        {step === "email" && (
          <Card className="border-0 shadow-xl shadow-emerald-500/5 rounded-2xl">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-2 size-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <KeyRound className="size-6 text-amber-600" />
              </div>
              <CardTitle className="text-xl">¿Olvidaste tu contraseña?</CardTitle>
              <CardDescription>
                Ingresa tu correo y te ayudaremos a restablecerla
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerifyEmail} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Correo electrónico
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="correo@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11 rounded-xl border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={verifyingEmail}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all duration-200"
                  disabled={verifyingEmail}
                >
                  {verifyingEmail ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Verificar Correo"
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setAuthView("login")}
                  className="inline-flex items-center gap-1 text-sm text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
                >
                  <ArrowLeft className="size-4" />
                  Volver a Iniciar Sesión
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ====== STEP 2: Set New Password ====== */}
        {step === "reset" && (
          <Card className="border-0 shadow-xl shadow-emerald-500/5 rounded-2xl">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-2 size-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Lock className="size-6 text-emerald-600" />
              </div>
              <CardTitle className="text-xl">Nueva Contraseña</CardTitle>
              <CardDescription>
                Crea una nueva contraseña para{" "}
                <span className="font-medium text-gray-700">{email}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-sm font-medium">
                    Nueva Contraseña
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10 h-11 rounded-xl border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="confirmPassword"
                    className="text-sm font-medium"
                  >
                    Confirmar Contraseña
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Repite tu nueva contraseña"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 h-11 rounded-xl border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                      disabled={loading}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all duration-200"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Restablecer Contraseña"
                  )}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setAuthView("login")}
                  className="inline-flex items-center gap-1 text-sm text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
                >
                  <ArrowLeft className="size-4" />
                  Volver a Iniciar Sesión
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ====== STEP 3: Success ====== */}
        {step === "success" && (
          <Card className="border-0 shadow-xl shadow-emerald-500/5 rounded-2xl">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-2 size-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="size-6 text-emerald-600" />
              </div>
              <CardTitle className="text-xl">¡Contraseña Actualizada!</CardTitle>
              <CardDescription>
                Tu contraseña ha sido cambiada exitosamente. Ya puedes iniciar
                sesión con tu nueva contraseña.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setAuthView("login")}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 shadow-lg shadow-emerald-500/25 transition-all duration-200"
              >
                <ArrowLeft className="size-4" />
                Ir a Iniciar Sesión
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
