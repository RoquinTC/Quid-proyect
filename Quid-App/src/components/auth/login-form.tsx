"use client";

import { useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mail, Lock, LogIn, Loader2, Fingerprint, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  cacheOfflineSession,
  getCachedSession,
  cacheOfflineCredentials,
  getCachedCredentials,
  verifyOfflinePassword,
  clearOfflineCredentials,
  type CachedSession,
} from "@/lib/offline-session";

export function LoginForm() {
  const { setAuthView, setOfflineSession } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);

  // Check if WebAuthn is available in this browser
  const webAuthnAvailable = typeof window !== "undefined" &&
    typeof PublicKeyCredential !== "undefined";

  // Check if we have cached credentials for offline login
  const hasOfflineCredentials = typeof window !== "undefined" && !!getCachedCredentials();

  /**
   * Handle offline login success — set the offline session and navigate to app
   * WITHOUT needing a page reload. This is the key to making offline login work.
   */
  const handleOfflineLoginSuccess = useCallback((cachedSession: CachedSession) => {
    cacheOfflineSession(cachedSession);
    setOfflineSession(cachedSession);
    setOfflineMode(true);
    toast.success("¡Sesión iniciada (sin conexión)!");
    try { sessionStorage.setItem("quid-just-logged-in", "true"); } catch {}
  }, [setOfflineSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    setLoading(true);
    try {
      // Try online login first
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Check if it's a network error (server unreachable)
        if (result.error === "TypeError: Failed to fetch" || !navigator.onLine) {
          // Try offline login
          const userId = await verifyOfflinePassword(email, password);
          if (userId) {
            // Get the cached session for this user
            const cachedSession = getCachedSession();
            if (cachedSession) {
              handleOfflineLoginSuccess(cachedSession);
              return;
            }
            // No cached session but valid credentials — create a minimal one
            const minimalSession: CachedSession = {
              user: {
                id: userId,
                email,
                pinEnabled: false,
                biometricEnabled: false,
              },
              expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            };
            handleOfflineLoginSuccess(minimalSession);
            return;
          }
          toast.error("Sin conexión. Verifica que hayas iniciado sesión antes en este dispositivo.");
        } else {
          const errorMessages: Record<string, string> = {
            "CredentialsSignin": "Correo o contraseña incorrectos",
            "SessionRequired": "Debes iniciar sesión",
          };
          const msg = errorMessages[result.error] || result.error;
          toast.error(msg);
        }
        setLoading(false);
      } else if (result?.ok) {
        toast.success("¡Sesión iniciada!");
        // Mark fresh login so AppShell skips the lock screen on reload
        try { sessionStorage.setItem("quid-just-logged-in", "true"); } catch {}

        // Cache credentials for offline login (fetch password hash from server)
        try {
          const credsResponse = await fetch("/api/auth/offline-credentials");
          if (credsResponse.ok) {
            const creds = await credsResponse.json();
            if (creds.passwordHash && creds.email && creds.userId) {
              cacheOfflineCredentials(creds.email, creds.passwordHash, creds.userId);
            }
          }
        } catch {
          // Not critical — offline credentials will be cached next time
        }

        // Cache session for offline use
        try {
          const sessionRes = await fetch("/api/auth/session");
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            if (sessionData?.user) {
              cacheOfflineSession(sessionData as CachedSession);
            }
          }
        } catch {
          // Non-critical
        }

        // Hard redirect to pick up the new session from next-auth cookies
        setTimeout(() => {
          window.location.href = window.location.origin + "/";
        }, 600);
      }
    } catch {
      // Network error — try offline login
      const userId = await verifyOfflinePassword(email, password);
      if (userId) {
        const cachedSession = getCachedSession();
        if (cachedSession) {
          handleOfflineLoginSuccess(cachedSession);
          return;
        }
        const minimalSession: CachedSession = {
          user: {
            id: userId,
            email,
            pinEnabled: false,
            biometricEnabled: false,
          },
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };
        handleOfflineLoginSuccess(minimalSession);
        return;
      }
      toast.error("Sin conexión al servidor. Inicia sesión al menos una vez con conexión para habilitar el acceso offline.");
      setLoading(false);
    }
  };

  const handleBiometricLogin = useCallback(async () => {
    setBiometricLoading(true);
    try {
      // === USERNAMELESS FLOW (preferred) ===
      // Try to authenticate without asking for email first.

      // Step 1: Get authentication options WITHOUT userId
      const optionsRes = await fetch("/api/auth/webauthn/auth-options");
      if (!optionsRes.ok) {
        throw new Error("No se pudieron obtener las opciones de autenticación");
      }
      const options = await optionsRes.json();

      // Step 2: Call browser WebAuthn API — will show fingerprint prompt
      let asseResp;
      try {
        asseResp = await startAuthentication({ optionsJSON: options });
      } catch (err: any) {
        if (err?.name === "NotAllowedError") {
          // User cancelled the biometric prompt — don't show error
          setBiometricLoading(false);
          return;
        }
        throw err;
      }

      // Step 3: Verify with server
      const verifyRes = await fetch("/api/auth/webauthn/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: asseResp }),
      });

      const verifyData = await verifyRes.json();

      if (verifyData.verified && verifyData.email) {
        // Success! Sign in via next-auth with the biometric bypass
        const result = await signIn("credentials", {
          email: verifyData.email,
          password: "__webauthn_bypass__",
          redirect: false,
        });

        if (result?.ok) {
          toast.success("¡Sesión iniciada con huella!");
          // Mark fresh login so AppShell skips the lock screen on reload
          try { sessionStorage.setItem("quid-just-logged-in", "true"); } catch {}
        } else {
          toast.error("Error al iniciar sesión con huella");
        }
      } else {
        toast.error("Huella no reconocida");
      }
    } catch (err: any) {
      console.error("Biometric login error:", err);
      toast.error("No se pudo autenticar con huella. Intenta con correo y contraseña.");
    } finally {
      setBiometricLoading(false);
    }
  }, []);

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

        {/* Offline indicator */}
        {offlineMode && (
          <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 rounded-full mb-4">
            <WifiOff className="size-4" />
            <span className="text-sm font-medium">Modo sin conexión</span>
          </div>
        )}

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
