"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAchievements } from "@/hooks/use-achievements";
import { useAppStore, type FinanceSubView, type HealthSubView, type ModuleType, type PantrySubView, type SidebarAction, type TransportSubView } from "@/lib/store";

type DiscoveryTip = {
  module: Exclude<ModuleType, "dashboard" | "settings">;
  feature: SidebarAction;
  title: string;
  message: string;
  actionLabel: string;
  subView?: string;
};

const tips: DiscoveryTip[] = [
  {
    module: "finance",
    feature: "create-account",
    title: "Empieza por tus cuentas",
    message: "Agrega una cuenta o bolsillo para que Quid pueda calcular tu balance y darte mejores alertas.",
    actionLabel: "Crear cuenta",
    subView: "accounts",
  },
  {
    module: "finance",
    feature: "create-budget",
    title: "Dale un límite a tus gastos",
    message: "Un presupuesto mensual permite que Quid compare lo planeado contra lo real.",
    actionLabel: "Crear presupuesto",
    subView: "budgets",
  },
  {
    module: "finance",
    feature: "create-recurring",
    title: "Automatiza tus pagos",
    message: "Registra arriendo, servicios, cuotas o nómina para que aparezcan en el Radar.",
    actionLabel: "Crear pago",
    subView: "recurring",
  },
  {
    module: "transport",
    feature: "create-vehicle",
    title: "Registra tu vehículo",
    message: "Con un vehículo, Quid puede proyectar tanqueos, documentos y mantenimientos.",
    actionLabel: "Crear vehículo",
    subView: "vehicles",
  },
  {
    module: "transport",
    feature: "log-fuel",
    title: "Enséñale tu consumo a Quid",
    message: "Cada tanqueo mejora la predicción de combustible y autonomía.",
    actionLabel: "Registrar tanqueo",
    subView: "fuel",
  },
  {
    module: "health",
    feature: "create-appointment",
    title: "Agenda una cita",
    message: "Las citas médicas entran al Radar para que no dependas solo de la memoria.",
    actionLabel: "Crear cita",
    subView: "appointments",
  },
  {
    module: "health",
    feature: "create-medication",
    title: "Cuida tus tratamientos",
    message: "Registra medicamentos y horarios para tener recordatorios más útiles.",
    actionLabel: "Crear medicamento",
    subView: "medications",
  },
  {
    module: "pantry",
    feature: "create-pantry-item",
    title: "Construye tu despensa",
    message: "Agrega productos con vencimiento o stock mínimo para recibir señales tempranas.",
    actionLabel: "Agregar producto",
    subView: "items",
  },
  {
    module: "pantry",
    feature: "create-shopping-list",
    title: "Prepara una lista",
    message: "Las listas ayudan a conectar compras, despensa y hábitos de consumo.",
    actionLabel: "Crear lista",
    subView: "shopping-lists",
  },
];

export function DiscoveryCoach() {
  const { activeModule, setActiveModule, setFinanceSubView, setTransportSubView, setHealthSubView, setPantrySubView, setSidebarAction } = useAppStore();
  const { loading, isUndiscovered } = useAchievements();
  const [hiddenTips, setHiddenTips] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem("quid-discovery-hidden");
      if (stored) setHiddenTips(new Set(JSON.parse(stored) as string[]));
    } catch {}
  }, []);

  if (loading) return null;

  const moduleToUse = activeModule === "dashboard" ? "finance" : activeModule;
  if (moduleToUse === "settings") return null;

  const tip = tips.find((candidate) =>
    candidate.module === moduleToUse &&
    !hiddenTips.has(`${candidate.module}:${candidate.feature}`) &&
    isUndiscovered(candidate.module, candidate.feature)
  );

  if (!tip) return null;

  const explore = () => {
    setActiveModule(tip.module);
    if (tip.module === "finance" && tip.subView) setFinanceSubView(tip.subView as FinanceSubView);
    if (tip.module === "transport" && tip.subView) setTransportSubView(tip.subView as TransportSubView);
    if (tip.module === "health" && tip.subView) setHealthSubView(tip.subView as HealthSubView);
    if (tip.module === "pantry" && tip.subView) setPantrySubView(tip.subView as PantrySubView);
    setSidebarAction(tip.feature);
  };

  const hideTip = () => {
    const key = `${tip.module}:${tip.feature}`;
    setHiddenTips((current) => {
      const next = new Set(current);
      next.add(key);
      try {
        localStorage.setItem("quid-discovery-hidden", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-40 px-4 md:left-auto md:right-5 md:w-96 md:px-0">
      <div className="pointer-events-auto rounded-2xl border border-emerald-100 bg-white p-4 shadow-xl shadow-emerald-900/10 dark:border-emerald-900/50 dark:bg-gray-900">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <Lightbulb className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{tip.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{tip.message}</p>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" className="h-8 rounded-xl text-xs" onClick={explore}>
                {tip.actionLabel}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-xl text-xs"
                onClick={hideTip}
              >
                Luego
              </Button>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 rounded-lg shrink-0"
            onClick={hideTip}
            title="Ocultar sugerencia"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
