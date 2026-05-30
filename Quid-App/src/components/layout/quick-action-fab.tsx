"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  Bell,
  Car,
  Clock,
  CreditCard,
  Fuel,
  Heart,
  Home,
  Landmark,
  ListPlus,
  MoreHorizontal,
  PackagePlus,
  PiggyBank,
  Pill,
  Plus,
  Receipt,
  Shield,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Tag,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { useAppStore, type ModuleType, type SidebarAction } from "@/lib/store";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

type QuickAction = {
  id: SidebarAction;
  module: ModuleType;
  label: string;
  description: string;
  icon: typeof Plus;
  color: string;
  bg: string;
};

const action = (
  id: SidebarAction,
  module: ModuleType,
  label: string,
  description: string,
  icon: typeof Plus,
  color: string,
  bg: string,
): QuickAction => ({ id, module, label, description, icon, color, bg });

const financeActions = [
  action("create-transaction", "finance", "Movimiento", "Ingreso o gasto", ArrowLeftRight, "text-emerald-600", "bg-emerald-100 dark:bg-emerald-900/30"),
  action("create-account", "finance", "Cuenta", "Banco, efectivo o bolsillo", Banknote, "text-teal-600", "bg-teal-100 dark:bg-teal-900/30"),
  action("create-budget", "finance", "Presupuesto", "Planifica el mes", Receipt, "text-cyan-600", "bg-cyan-100 dark:bg-cyan-900/30"),
  action("create-debt", "finance", "Deuda", "Crédito o préstamo", CreditCard, "text-rose-600", "bg-rose-100 dark:bg-rose-900/30"),
  action("create-savings-goal", "finance", "Meta de ahorro", "Crea un objetivo", PiggyBank, "text-violet-600", "bg-violet-100 dark:bg-violet-900/30"),
  action("create-cdt", "finance", "CDT", "Registra una inversión", Landmark, "text-amber-600", "bg-amber-100 dark:bg-amber-900/30"),
  action("create-recurring", "finance", "Pago recurrente", "Programa un pago", Clock, "text-orange-600", "bg-orange-100 dark:bg-orange-900/30"),
  action("manage-categories", "finance", "Categorías", "Organiza movimientos", Tag, "text-slate-600", "bg-slate-100 dark:bg-slate-800"),
];

const transportActions = [
  action("log-fuel", "transport", "Tanqueo", "Registra combustible", Fuel, "text-cyan-600", "bg-cyan-100 dark:bg-cyan-900/30"),
  action("update-fuel-price", "transport", "Precio combustible", "Actualiza la proyección", Landmark, "text-blue-600", "bg-blue-100 dark:bg-blue-900/30"),
  action("log-maintenance", "transport", "Mantenimiento", "Servicio o reparación", Wrench, "text-indigo-600", "bg-indigo-100 dark:bg-indigo-900/30"),
  action("register-document", "transport", "Documento", "SOAT, tecnomecánica y más", Shield, "text-violet-600", "bg-violet-100 dark:bg-violet-900/30"),
  action("create-vehicle-reminder", "transport", "Recordatorio", "Programa una alerta", Bell, "text-sky-600", "bg-sky-100 dark:bg-sky-900/30"),
  action("manage-maintenance-rules", "transport", "Intervalos", "Configura mantenimientos", Clock, "text-teal-600", "bg-teal-100 dark:bg-teal-900/30"),
  action("create-vehicle", "transport", "Vehículo", "Añade carro o moto", Car, "text-slate-600", "bg-slate-100 dark:bg-slate-800"),
];

const healthActions = [
  action("create-appointment", "health", "Cita médica", "Agenda y recuerda", Stethoscope, "text-violet-600", "bg-violet-100 dark:bg-violet-900/30"),
  action("create-medication", "health", "Medicamento", "Añade tratamiento", Pill, "text-rose-600", "bg-rose-100 dark:bg-rose-900/30"),
  action("create-medical-order", "health", "Orden médica", "Registra una orden", Heart, "text-cyan-600", "bg-cyan-100 dark:bg-cyan-900/30"),
];

const pantryActions = [
  action("create-shopping-list", "pantry", "Lista mercado", "Prepara tus compras", ListPlus, "text-amber-600", "bg-amber-100 dark:bg-amber-900/30"),
  action("create-pantry-item", "pantry", "Producto", "Añade a la nevera", PackagePlus, "text-orange-600", "bg-orange-100 dark:bg-orange-900/30"),
  action("create-health-profile", "pantry", "Perfil de salud", "Personaliza recetas", ShieldCheck, "text-emerald-600", "bg-emerald-100 dark:bg-emerald-900/30"),
];

const homeActions = [
  financeActions[0],
  financeActions[2],
  transportActions[0],
  healthActions[0],
  healthActions[1],
  pantryActions[0],
];

const moduleActions: Partial<Record<ModuleType, QuickAction[]>> = {
  finance: financeActions,
  transport: transportActions,
  health: healthActions,
  pantry: pantryActions,
};

const moduleLabels: Partial<Record<ModuleType, string>> = {
  finance: "Finanzas",
  transport: "Transporte",
  health: "Salud",
  pantry: "Despensa",
};

const moduleFabStyles: Partial<Record<ModuleType, string>> = {
  finance: "from-emerald-500 to-teal-600 shadow-emerald-600/30",
  transport: "from-cyan-500 to-blue-600 shadow-blue-600/30",
  health: "from-rose-500 to-pink-600 shadow-rose-600/30",
  pantry: "from-amber-500 to-orange-600 shadow-orange-600/30",
};

export function QuickActionFab() {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { activeModule, setActiveModule, setSidebarAction } = useAppStore();
  const contextualActions = moduleActions[activeModule] || homeActions;
  const visibleActions = showAll ? homeActions : contextualActions;
  const isContextual = Boolean(moduleActions[activeModule]) && !showAll;
  const fabStyle = moduleFabStyles[activeModule] || "from-primary to-primary shadow-primary/30";

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setShowAll(false);
  };

  const handleAction = (module: ModuleType, selectedAction: SidebarAction) => {
    setActiveModule(module);
    setSidebarAction(selectedAction);
    handleOpenChange(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex size-12 items-center justify-center rounded-full bg-gradient-to-br ${fabStyle} text-white shadow-lg ring-[5px] ring-white transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95 dark:ring-gray-900`}
        aria-label="Abrir acciones rápidas"
      >
        <Plus className="size-6" />
      </button>

      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="rounded-t-3xl border-0 bg-white/95 pb-3 backdrop-blur-xl dark:bg-gray-950/95">
          <DrawerHeader className="px-5 pb-3 pt-3 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DrawerTitle className="text-lg">
                  {isContextual ? `Crear en ${moduleLabels[activeModule]}` : "Crear rápido"}
                </DrawerTitle>
                <DrawerDescription>
                  {isContextual ? "Acciones útiles para esta pantalla." : "Abre directamente el formulario que necesitas."}
                </DrawerDescription>
              </div>
              <DrawerClose className="flex size-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                <X className="size-4" />
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="grid max-h-[48dvh] grid-cols-2 gap-2 overflow-y-auto px-4 pb-1">
            {visibleActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAction(item.module, item.id)}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${item.bg}`}>
                    <Icon className={`size-5 ${item.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 px-4 pt-3">
            {activeModule !== "dashboard" && (
              <button
                type="button"
                onClick={() => {
                  setActiveModule("dashboard");
                  handleOpenChange(false);
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 dark:border-gray-800 dark:text-gray-300"
              >
                <Home className="size-4" />
                Ir a Inicio
              </button>
            )}
            {moduleActions[activeModule] && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-semibold text-gray-600 dark:border-gray-800 dark:text-gray-300"
              >
                <MoreHorizontal className="size-4" />
                {showAll ? `Volver a ${moduleLabels[activeModule]}` : "Más acciones"}
              </button>
            )}
          </div>

          <div className="px-4 pt-2">
            <button
              type="button"
              onClick={() => window.open("https://t.me/Aura_RQC_Bot", "_blank", "noopener,noreferrer")}
              className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-sky-500 p-3 text-left text-white shadow-lg shadow-violet-500/20 transition-transform active:scale-[0.99]"
            >
              <div className="flex size-10 items-center justify-center rounded-xl bg-white/20">
                <Sparkles className="size-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Consultar a Aura</p>
                <p className="text-[11px] text-white/80">Pregunta o registra algo por chat</p>
              </div>
              <Wallet className="size-4 text-white/70" />
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
