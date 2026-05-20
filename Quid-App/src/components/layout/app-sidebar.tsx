"use client";

import { useState } from "react";
import { useAppSession } from "@/lib/use-app-session";
import { useAppStore, type ModuleType, type SidebarAction } from "@/lib/store";
import { performLogout } from "@/lib/logout";
import {
  Home,
  Wallet,
  Car,
  Heart,
  ShoppingCart,
  Settings,
  LogOut,
  ChevronRight,
  Calculator,
  Landmark,
  CreditCard,
  TrendingUp,
  Share2,
  // Finance actions
  ArrowLeftRight,
  Banknote,
  Receipt,
  PiggyBank,
  Landmark as DebtIcon,
  Clock,
  Tag,
  HandCoins,
  // Transport actions
  PlusCircle,
  Fuel,
  Wrench,
  Shield,
  // Health actions
  Pill,
  Stethoscope,
  // Pantry actions
  Refrigerator,
  ListPlus,
  ShieldCheck,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ShareInvite } from "@/components/pwa/share-invite";
import { motion, AnimatePresence } from "framer-motion";

// ─── Module definitions with quick actions ─────────────────────────

type QuickAction = {
  id: SidebarAction;
  label: string;
  icon: typeof Home;
};

type ModuleDef = {
  id: ModuleType;
  label: string;
  icon: typeof Home;
  color: string;
  bg: string;
  actions?: QuickAction[];
};

const moduleItems: ModuleDef[] = [
  {
    id: "dashboard",
    label: "Inicio",
    icon: Home,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    // Dashboard has no sub-actions — it just navigates
  },
  {
    id: "finance",
    label: "Finanzas",
    icon: Wallet,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-100 dark:bg-teal-900/30",
    actions: [
      { id: "create-transaction", label: "Nueva Transacción", icon: ArrowLeftRight },
      { id: "create-account", label: "Nueva Cuenta", icon: Banknote },
      { id: "create-budget", label: "Nuevo Presupuesto", icon: Receipt },
      { id: "create-savings-goal", label: "Nueva Meta de Ahorro", icon: PiggyBank },
      { id: "create-debt", label: "Nueva Deuda", icon: CreditCard },
      { id: "create-cdt", label: "Nuevo CDT", icon: DebtIcon },
      { id: "create-recurring", label: "Nuevo Pago Recurrente", icon: Clock },
      { id: "manage-categories", label: "Gestionar Categorías", icon: Tag },
    ],
  },
  {
    id: "transport",
    label: "Transporte",
    icon: Car,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/30",
    actions: [
      { id: "create-vehicle", label: "Nuevo Vehículo", icon: PlusCircle },
      { id: "log-fuel", label: "Registrar Recarga", icon: Fuel },
      { id: "log-maintenance", label: "Registrar Mantenimiento", icon: Wrench },
      { id: "register-document", label: "Registrar Documento", icon: Shield },
      { id: "update-fuel-price", label: "Actualizar Precio Combustible", icon: Landmark },
    ],
  },
  {
    id: "health",
    label: "Salud",
    icon: Heart,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-900/30",
    actions: [
      { id: "create-medication", label: "Nuevo Medicamento", icon: Pill },
      { id: "create-appointment", label: "Nueva Cita Médica", icon: Stethoscope },
    ],
  },
  {
    id: "pantry",
    label: "Despensa",
    icon: ShoppingCart,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    actions: [
      { id: "create-pantry-item", label: "Nuevo Producto", icon: Refrigerator },
      { id: "create-shopping-list", label: "Nueva Lista de Mercado", icon: ListPlus },
      { id: "create-health-profile", label: "Perfil de Salud", icon: ShieldCheck },
    ],
  },
];

const simulatorItems = [
  { id: "simulator-yield" as const, label: "Cuentas de alto rendimiento", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", comingSoon: false, subView: "simulator" as const },
  { id: "simulator-cdt" as const, label: "CDT", icon: Landmark, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", comingSoon: true, subView: null },
  { id: "simulator-credit" as const, label: "Créditos", icon: CreditCard, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", comingSoon: false, subView: "credit-simulator" as const },
  { id: "simulator-debt" as const, label: "Abonos a Deuda", icon: HandCoins, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-900/30", comingSoon: false, subView: "debt-simulator" as const },
];

export function AppSidebar() {
  const { session } = useAppSession();
  const { sidebarOpen, setSidebarOpen, setActiveModule, setFinanceSubView, setAuthView, setSidebarAction } = useAppStore();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [simulatorsOpen, setSimulatorsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const userInitials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "Q";

  const handleNavigate = (moduleId: ModuleType) => {
    setActiveModule(moduleId);
    setSidebarOpen(false);
  };

  const handleToggleModule = (moduleId: string) => {
    setExpandedModule(expandedModule === moduleId ? null : moduleId);
  };

  const handleQuickAction = (moduleId: ModuleType, action: SidebarAction) => {
    setActiveModule(moduleId);
    setSidebarAction(action);
    setSidebarOpen(false);
  };

  return (
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <SheetContent side="left" className="w-[300px] p-0 gap-0 rounded-r-3xl bg-transparent">
        {/* User Profile Header */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-500 p-5 pb-6 rounded-tr-3xl">
          <SheetHeader className="mb-3 p-0 space-y-0">
            <SheetTitle className="text-white text-left text-lg">Menú</SheetTitle>
          </SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar className="size-12 ring-2 ring-white/30">
              <AvatarImage
                src={session?.user?.image || ""}
                alt={session?.user?.name || "Usuario"}
              />
              <AvatarFallback className="bg-white/20 text-white text-sm font-bold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {session?.user?.name || "Usuario"}
              </p>
              <p className="text-[11px] text-emerald-100 truncate">
                {session?.user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto max-h-[calc(100dvh-14rem)]">
          {/* Module Navigation with expandable actions */}
          <div className="p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
              Módulos
            </p>
            {moduleItems.map((item) => {
              const Icon = item.icon;
              const isExpanded = expandedModule === item.id;
              const hasActions = item.actions && item.actions.length > 0;

              return (
                <div key={item.id}>
                  <button
                    onClick={() => {
                      if (hasActions) {
                        handleToggleModule(item.id);
                      } else {
                        handleNavigate(item.id);
                      }
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className={`size-9 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`size-4 ${item.color}`} />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                      {item.label}
                    </span>
                    {hasActions ? (
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronRight className="size-4 text-gray-300 dark:text-gray-600" />
                      </motion.div>
                    ) : (
                      <ChevronRight className="size-4 text-gray-300 dark:text-gray-600" />
                    )}
                  </button>

                  {/* Expandable quick actions */}
                  <AnimatePresence>
                    {isExpanded && hasActions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pl-4 pr-1 py-1 space-y-0.5">
                          {item.actions!.map((action) => {
                            const ActionIcon = action.icon;
                            return (
                              <button
                                key={action.id}
                                onClick={() => handleQuickAction(item.id, action.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left group"
                              >
                                <div className={`size-6 rounded-md ${item.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                                  <ActionIcon className={`size-3 ${item.color}`} />
                                </div>
                                <span className="text-[13px] text-gray-600 dark:text-gray-400 flex-1">
                                  {action.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className="mx-5 my-2 border-t dark:border-gray-800" />

          {/* Simuladores Section */}
          <div className="p-3 space-y-1">
            <button
              onClick={() => setSimulatorsOpen(!simulatorsOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <div className="size-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                <Calculator className="size-4 text-violet-600 dark:text-violet-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                Simuladores
              </span>
              <motion.div
                animate={{ rotate: simulatorsOpen ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="size-4 text-gray-300 dark:text-gray-600" />
              </motion.div>
            </button>

            <AnimatePresence>
              {simulatorsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pl-4 space-y-0.5">
                    {simulatorItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            if (!item.comingSoon && item.subView) {
                              setActiveModule("finance");
                              setFinanceSubView(item.subView);
                              setSidebarOpen(false);
                            }
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left ${
                            item.comingSoon
                              ? "opacity-50 cursor-default"
                              : "hover:bg-gray-100 dark:hover:bg-gray-800"
                          }`}
                        >
                          <div className={`size-7 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                            <Icon className={`size-3.5 ${item.color}`} />
                          </div>
                          <span className="text-[13px] font-medium text-gray-600 dark:text-gray-400 flex-1">
                            {item.label}
                          </span>
                          {item.comingSoon && (
                            <span className="text-[11px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                              Próximamente
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Divider */}
          <div className="mx-5 my-2 border-t dark:border-gray-800" />

          {/* Share / Invite */}
          <div className="px-3">
            <button
              onClick={() => { setShareOpen(true); setSidebarOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors text-left group"
            >
              <div className="size-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                <Share2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex-1">
                Invitar a Quid
              </span>
              <ChevronRight className="size-4 text-emerald-300 dark:text-emerald-600" />
            </button>
          </div>

          {/* Settings */}
          <div className="px-3">
            <button
              onClick={() => handleNavigate("settings")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <div className="size-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                <Settings className="size-4 text-gray-500 dark:text-gray-400" />
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                Ajustes
              </span>
              <ChevronRight className="size-4 text-gray-300 dark:text-gray-600" />
            </button>
          </div>
        </div>

        {/* Sign Out - Fixed at bottom */}
        <ShareInvite open={shareOpen} onOpenChange={setShareOpen} />

        <div className="absolute bottom-6 left-0 right-0 px-6 safe-area-bottom">
          <Button
            variant="ghost"
            className="w-full justify-start text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-xl gap-3 text-sm"
            onClick={async () => {
              setSidebarOpen(false);
              await performLogout();
            }}
          >
            <LogOut className="size-4" />
            Cerrar Sesión
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
