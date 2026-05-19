"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mail, Lock, User, UserPlus, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export function RegisterForm() {
  const { setAuthView } = useAppStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || !password || !confirmPassword) {
      toast.error("Por favor completa todos los campos");
      return;
    }

    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Error al crear la cuenta");
        setLoading(false);
        return;
      }

      toast.success("¡Cuenta creada exitosamente!");

      // Auto sign in after registration
      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.ok) {
        toast.success("¡Bienvenido!");
        // Hard redirect for iframe context (see login-form for explanation)
        setTimeout(() => {
          window.location.href = window.location.origin + "/";
        }, 600);
      } else {
        // Registration succeeded but auto-login failed - go to login
        toast.success("Cuenta creada. Por favor inicia sesión.");
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
            <CardTitle className="text-xl">Crear Cuenta</CardTitle>
            <CardDescription>Regístrate para comenzar a organizar tu vida</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  Nombre
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Tu nombre completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                    disabled={loading}
                  />
                </div>
              </div>

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
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirmar Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repite tu contraseña"
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
                  <>
                    <UserPlus className="size-4" />
                    Crear Cuenta
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => setAuthView("login")}
                className="inline-flex items-center gap-1 text-sm text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
              >
                <ArrowLeft className="size-4" />
                Ya tengo cuenta, Iniciar Sesión
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
