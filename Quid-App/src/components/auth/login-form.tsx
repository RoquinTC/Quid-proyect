"use client";

import { useState, useCallback, useEffect } from "react";
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
import { apiRequest } from "@/lib/api-url";

async function cacheCurrentSessionForOffline() {
  try {
    const sessionRes = await apiRequest("/api/auth/session");
    if (sessionRes.ok) {
      const sessionData = await sessionRes.json();
      if (sessionData?.user) {
        cacheOfflineSession(sessionData as CachedSession);
      }
    }
  } catch {
    // Non-critical
  }
}

function finishSuccessfulLogin(message: string) {
  toast.success(message);
  try {
    sessionStorage.setItem("quid-just-logged-in", "true");
  } catch {}

  setTimeout(() => {
    window.location.href = window.location.origin + "/";
  }, 250);
}

export function LoginForm() {
  const { setAuthView, setOfflineSession } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiRequest("/api/auth/providers")
      .then((response) => (response.ok ? response.json() : null))
      .then((providers) => {
        if (!cancelled) setGoogleAvailable(Boolean(providers?.google));
      })
      .catch(() => {
        if (!cancelled) setGoogleAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
        // Mark fresh login so AppShell skips the lock screen on reload
        try { sessionStorage.setItem("quid-just-logged-in", "true"); } catch {}

        // Cache credentials for offline login (fetch password hash from server)
        try {
          const credsResponse = await apiRequest("/api/auth/offline-credentials");
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
        await cacheCurrentSessionForOffline();
        finishSuccessfulLogin("¡Sesión iniciada!");
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
      const optionsRes = await apiRequest("/api/auth/webauthn/auth-options");
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
      const verifyRes = await apiRequest("/api/auth/webauthn/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: asseResp }),
      });

      const verifyData = await verifyRes.json();

      if (verifyData.verified && verifyData.email && verifyData.loginToken) {
        // Success! Sign in via next-auth with a short-lived, one-time biometric token.
        const result = await signIn("credentials", {
          email: verifyData.email,
          password: `__webauthn:${verifyData.loginToken}`,
          redirect: false,
        });

        if (result?.ok) {
          await cacheCurrentSessionForOffline();
          finishSuccessfulLogin("¡Sesión iniciada con huella!");
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

  const handleGoogleLogin = async () => {
    const result = await signIn("google");
    if (result?.error === "GoogleNativeUnavailable") {
      toast.info("El ingreso con Google estará disponible cuando terminemos la integración nativa de Android.");
    } else if (result?.error) {
      toast.error(result.error);
    } else if (result?.ok) {
      await cacheCurrentSessionForOffline();
      finishSuccessfulLogin("¡Sesión iniciada con Google!");
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
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
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Todo converge aqui</p>
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

            {googleAvailable && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100 dark:border-zinc-800/80" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white dark:bg-zinc-950 px-2 text-gray-400">o continuar con</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 rounded-xl border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900/50 gap-2 transition-all duration-200 flex items-center justify-center font-semibold bg-white dark:bg-transparent"
                  onClick={handleGoogleLogin}
                  disabled={loading || biometricLoading}
                >
                  <svg className="size-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </Button>
              </>
            )}

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ¿No tienes cuenta?{" "}
                <button
                  onClick={() => setAuthView("register")}
                  className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
                >
                  Regístrate
                </button>
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
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
