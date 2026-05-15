"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mail, Lock, LogIn, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function LoginForm() {
  const { setAuthView } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30 mb-4">
            <span className="text-2xl font-bold text-white">Q</span>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            Quid
          </h1>
          <p className="text-sm text-gray-500 mt-1">Tu centro financiero</p>
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
