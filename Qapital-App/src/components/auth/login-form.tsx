"use client";

import { useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mail, Lock, LogIn, Loader2, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { startAuthentication } from "@simplewebauthn/browser";

export function LoginForm() {
  const { setAuthView } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Check if WebAuthn is available in this browser
  const webAuthnAvailable = typeof window !== "undefined" && 
    typeof PublicKeyCredential !== "undefined";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        const errorMessages: Record<string, string> = {
          "CredentialsSignin": "Correo o contraseña incorrectos",
          "SessionRequired": "Debes iniciar sesión",
        };
        const msg = errorMessages[result.error] || result.error;
        toast.error(msg);
        setLoading(false);
      } else if (result?.ok) {
        toast.success("¡Sesión iniciada!");
        // Use a hard redirect instead of client-side navigation.
        // In iframe/embedded contexts, the session cookie (SameSite=None; Secure)
        // needs a full page load to be properly recognized by the browser.
        // Using window.location.href forces a full page reload which ensures
        // the SessionProvider picks up the new session from /api/auth/session.
        setTimeout(() => {
          window.location.href = window.location.origin + "/";
        }, 600);
      }
    } catch {
      toast.error("Error de conexión");
      setLoading(false);
    }
  };

  const handleBiometricLogin = useCallback(async () => {
    setBiometricLoading(true);
    try {
      // We need the user's email to look up their WebAuthn credentials
      // If they haven't typed their email yet, ask for it
      let loginEmail = email;
      if (!loginEmail) {
        // Prompt user for email
        loginEmail = window.prompt("Ingresa tu correo electrónico para buscar tu huella registrada:") || "";
        if (!loginEmail) {
          setBiometricLoading(false);
          return;
        }
      }

      // Step 0: Look up user by email to get their userId
      const lookupRes = await fetch(`/api/auth/webauthn/lookup?email=${encodeURIComponent(loginEmail)}`);
      if (!lookupRes.ok) {
        toast.error("No se encontró huella registrada para este correo");
        setBiometricLoading(false);
        return;
      }
      const lookupData = await lookupRes.json();
      const userId = lookupData.userId;

      if (!userId) {
        toast.error("No se encontró huella registrada para este correo");
        setBiometricLoading(false);
        return;
      }

      // Step 1: Get authentication options with the user's credentials
      const optionsRes = await fetch(`/api/auth/webauthn/auth-options?userId=${userId}`);
      if (!optionsRes.ok) {
        throw new Error("No se pudieron obtener las opciones de autenticación");
      }
      const options = await optionsRes.json();

      // Step 2: Call browser WebAuthn API
      const asseResp = await startAuthentication({ optionsJSON: options });

      // Step 3: Verify with server
      const verifyRes = await fetch("/api/auth/webauthn/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: asseResp, userId }),
      });

      const verifyData = await verifyRes.json();

      if (verifyData.verified && verifyData.email) {
        // Sign in via next-auth credentials with a special biometric flow
        const result = await signIn("credentials", {
          email: verifyData.email,
          password: "__webauthn_bypass__",
          redirect: false,
        });

        if (result?.ok) {
          toast.success("Sesión iniciada con huella!");
          setTimeout(() => {
            window.location.href = window.location.origin + "/";
          }, 600);
        } else {
          toast.error("Error al iniciar sesión con huella");
        }
      } else {
        toast.error("Huella no reconocida");
      }
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") {
        console.error("Biometric login error:", err);
        toast.error("No se pudo autenticar con huella");
      }
      // User cancelled — don't show error
    } finally {
      setBiometricLoading(false);
    }
  }, [email]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
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

        <Card className="border-0 shadow-xl shadow-emerald-500/5 rounded-2xl">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl">Iniciar Sesión</CardTitle>
            <CardDescription>Ingresa a tu cuenta para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                  <>
                    <LogIn className="size-4" />
                    Iniciar Sesión
                  </>
                )}
              </Button>
            </form>

            {/* Biometric Login */}
            {webAuthnAvailable && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white dark:bg-gray-900 px-2 text-gray-400">o</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 rounded-xl border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/10 gap-2 transition-all duration-200"
                  onClick={handleBiometricLogin}
                  disabled={biometricLoading || loading}
                >
                  {biometricLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Fingerprint className="size-4" />
                  )}
                  Ingresar con huella
                </Button>
              </>
            )}

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                ¿No tienes cuenta?{" "}
                <button
                  onClick={() => setAuthView("register")}
                  className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
                >
                  Regístrate
                </button>
              </p>
              <p className="text-sm text-gray-500 mt-3">
                ¿Olvidaste tu contraseña?{" "}
                <button
                  onClick={() => setAuthView("forgot-password")}
                  className="text-amber-600 font-semibold hover:text-amber-700 transition-colors"
                >
                  Recuperar
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
