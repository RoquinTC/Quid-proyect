"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  ArrowRight,
  Check,
  Wallet,
  Bike,
  Heart,
  ShoppingBasket,
  Sparkles,
  TrendingUp,
  CreditCard,
  PiggyBank,
  Fuel,
  Wrench,
  Pill,
  Stethoscope,
  Refrigerator,
  ShoppingCart,
  ChefHat,
  ShieldCheck,
  ChevronLeft,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const steps = [
  {
    id: 0,
    title: "¡Bienvenido a Quid!",
    description:
      "Todo converge aqui. Gestiona tus finanzas, transporte, salud y despensa en un solo lugar. Diseñada para simplificar tu día a día.",
    icon: Sparkles,
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    id: 1,
    title: "Configuración Inicial",
    description: "Cuéntanos un poco sobre ti para personalizar tu experiencia.",
    field: "setup",
  },
  {
    id: 2,
    title: "Módulo de Finanzas",
    description:
      "Controla tus cuentas, presupuestos, deudas y ahorros. Crea bolsillos, alcancías y cajitas de ahorro con rendimientos automáticos.",
    icon: Wallet,
    gradient: "from-emerald-500 to-teal-500",
    features: [
      { icon: Wallet, text: "Cuentas y subcuentas" },
      { icon: TrendingUp, text: "Rendimientos automáticos" },
      { icon: CreditCard, text: "Tarjetas de crédito visuales" },
      { icon: PiggyBank, text: "Metas de ahorro con IA" },
    ],
  },
  {
    id: 3,
    title: "Módulo de Transporte",
    description:
      "Registra gastos de combustible, mantenimientos y recibe recordatorios. Todo se sincroniza automáticamente con tus finanzas.",
    icon: Bike,
    gradient: "from-blue-500 to-cyan-500",
    features: [
      { icon: Fuel, text: "Registro de combustible" },
      { icon: Wrench, text: "Mantenimientos y recordatorios" },
      { icon: Bike, text: "Múltiples vehículos" },
      { icon: Zap, text: "Sincronización con finanzas" },
    ],
  },
  {
    id: 4,
    title: "Módulo de Salud",
    description:
      "Lleva el control de tus medicamentos y citas médicas. Recibe recordatorios auditivos para nunca olvidar tu tratamiento.",
    icon: Heart,
    gradient: "from-rose-500 to-pink-500",
    features: [
      { icon: Pill, text: "Medicamentos con IA" },
      { icon: Stethoscope, text: "Citas médicas" },
      { icon: Heart, text: "Recordatorios auditivos" },
      { icon: ShieldCheck, text: "Perfiles de salud" },
    ],
  },
  {
    id: 5,
    title: "Módulo de Despensa",
    description:
      "Tu nevera virtual, lista de mercado inteligente y recetas con IA. Todo conectado a tu perfil de salud y finanzas.",
    icon: ShoppingBasket,
    gradient: "from-amber-500 to-orange-500",
    features: [
      { icon: Refrigerator, text: "Nevera virtual" },
      { icon: ShoppingCart, text: "Lista de mercado inteligente" },
      { icon: ChefHat, text: "Recetas con IA" },
      { icon: ShieldCheck, text: "Perfiles alimenticios" },
    ],
  },
  {
    id: 6,
    title: "¡Todo Listo!",
    description:
      "Ya conoces Quid. Comienza a organizar tu vida de forma inteligente. Recuerda que puedes volver a ver este tutorial en cualquier momento.",
    icon: Check,
    gradient: "from-emerald-500 to-teal-500",
    final: true,
  },
];

export function OnboardingFlow() {
  const { data: session } = useSession();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState("COP");
  const [name, setName] = useState(session?.user?.name || "");
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [loading, setLoading] = useState(false);

  const { update: updateSession } = useSession();

  const handleComplete = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          name,
          onboardingCompleted: true,
        }),
      });

      if (res.ok) {
        // Request notification permission if enabled
        if (enableNotifications && "Notification" in window) {
          try { await Notification.requestPermission(); } catch {}
        }
        // Update the NextAuth session - this triggers the JWT callback with trigger="update"
        // which will refresh onboardingCompleted from the database
        await updateSession();
        // Reload to apply the new session state
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Error al guardar preferencias");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const prevStep = () => {
    if (step > 0) setStep(step - 1);
  };

  const currentStep = steps[step];
  const StepIcon = currentStep.icon;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <div className="w-full max-w-sm">
        {/* Progress bar */}
        <div className="relative mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-400 font-medium">
              Paso {step + 1} de {steps.length}
            </span>
            <span className="text-[10px] text-gray-400 font-medium">
              {Math.round(((step + 1) / steps.length) * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${((step + 1) / steps.length) * 100}%`,
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Card className="border-0 shadow-xl shadow-emerald-500/5 rounded-2xl overflow-hidden">
              {/* Gradient header for module steps */}
              {currentStep.gradient && StepIcon && (
                <div
                  className={`bg-gradient-to-br ${currentStep.gradient} p-6 flex items-center justify-center`}
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                    className="size-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg"
                  >
                    <StepIcon className="size-10 text-white" />
                  </motion.div>
                </div>
              )}

              <CardContent className="pt-6 pb-6 px-6">
                {!currentStep.gradient && !currentStep.field && (
                  <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30 mb-4">
                    {StepIcon && <StepIcon className="size-7 text-white" />}
                  </div>
                )}

                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {currentStep.title}
                </h2>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  {currentStep.description}
                </p>

                {/* Setup step */}
                {currentStep.field === "setup" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Tu nombre</Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="¿Cómo te llamamos?"
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Moneda</Label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm bg-white focus:border-emerald-500 focus:ring-emerald-500/20 outline-none"
                      >
                        <option value="COP">🇨🇴 Peso Colombiano (COP)</option>
                        <option value="USD">🇺🇸 Dólar Americano (USD)</option>
                        <option value="EUR">🇪🇺 Euro (EUR)</option>
                        <option value="MXN">🇲🇽 Peso Mexicano (MXN)</option>
                        <option value="ARS">🇦🇷 Peso Argentino (ARS)</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Notificaciones
                        </p>
                        <p className="text-[10px] text-gray-500">
                          Recordatorios de medicamentos y citas
                        </p>
                      </div>
                      <Switch
                        checked={enableNotifications}
                        onCheckedChange={setEnableNotifications}
                      />
                    </div>
                  </div>
                )}

                {/* Feature grid for module steps */}
                {currentStep.features && (
                  <div className="grid grid-cols-2 gap-3">
                    {currentStep.features.map((feature, i) => {
                      const FeatureIcon = feature.icon;
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 * i, duration: 0.3 }}
                          className="flex items-center gap-2.5 p-3 bg-gray-50 rounded-xl"
                        >
                          <div
                            className={`size-8 rounded-lg bg-gradient-to-br ${currentStep.gradient} flex items-center justify-center shrink-0`}
                          >
                            <FeatureIcon className="size-4 text-white" />
                          </div>
                          <span className="text-xs font-medium text-gray-700 leading-tight">
                            {feature.text}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Final step */}
                {currentStep.final && (
                  <div className="space-y-3">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 20,
                      }}
                      className="mx-auto size-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
                    >
                      <Check className="size-8 text-white" />
                    </motion.div>
                    <p className="text-center text-sm text-gray-500">
                      Tu experiencia personalizada está lista
                    </p>
                  </div>
                )}

                {/* Navigation buttons */}
                <div className="flex items-center gap-3 mt-6">
                  {step > 0 && (
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      className="h-11 rounded-xl flex-1"
                    >
                      <ChevronLeft className="size-4 mr-1" />
                      Atrás
                    </Button>
                  )}
                  <Button
                    onClick={nextStep}
                    className="h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 shadow-lg shadow-emerald-500/25 flex-1"
                    disabled={loading}
                  >
                    {step === steps.length - 1 ? (
                      loading ? (
                        "Guardando..."
                      ) : (
                        <>
                          Comenzar
                          <Check className="size-4 ml-1" />
                        </>
                      )
                    ) : (
                      <>
                        Siguiente
                        <ArrowRight className="size-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>

                {/* Skip option on non-essential steps */}
                {step > 0 && step < steps.length - 1 && (
                  <button
                    onClick={handleComplete}
                    className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors py-2"
                    disabled={loading}
                  >
                    Saltar tutorial
                  </button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
