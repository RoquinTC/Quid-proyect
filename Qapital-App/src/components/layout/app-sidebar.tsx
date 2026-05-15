"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useAppStore, type ModuleType } from "@/lib/store";
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
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

// ─── Menu structure ─────────────────────────────────
const moduleItems = [
  { id: "dashboard" as const, label: "Inicio", icon: Home, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  { id: "finance" as const, label: "Finanzas", icon: Wallet, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-100 dark:bg-teal-900/30" },
  { id: "transport" as const, label: "Transporte", icon: Car, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
  { id: "health" as const, label: "Salud", icon: Heart, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-900/30" },
  { id: "pantry" as const, label: "Despensa", icon: ShoppingCart, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
];

const simulatorItems = [
  { id: "simulator-yield" as const, label: "Cuentas de alto rendimiento", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", comingSoon: false },
  { id: "simulator-cdt" as const, label: "CDT", icon: Landmark, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", comingSoon: true },
  { id: "simulator-credit" as const, label: "Créditos", icon: CreditCard, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", comingSoon: true },
];

export function AppSidebar() {
  const { data: session } = useSession();
  const { sidebarOpen, setSidebarOpen, setActiveModule, setFinanceSubView, setAuthView } = useAppStore();
  const [simulatorsOpen, setSimulatorsOpen] = useState(false);

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

  return (
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <SheetContent side="left" className="w-[300px] p-0 rounded-r-3xl">
        {/* User Profile Header */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-500 p-5 pb-6 rounded-tr-3xl">
          <SheetHeader className="mb-3">
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
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 160px)" }}>
          {/* Module Navigation */}
          <div className="p-3 space-y-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
              Módulos
            </p>
            {moduleItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className={`size-9 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`size-4 ${item.color}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                    {item.label}
                  </span>
                  <ChevronRight className="size-4 text-gray-300 dark:text-gray-600" />
                </button>
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
                            if (!item.comingSoon) {
                              setActiveModule("finance");
                              setFinanceSubView("simulator");
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
                            <span className="text-[9px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full whitespace-nowrap">
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
        <div className="absolute bottom-6 left-0 right-0 px-6">
          <Button
            variant="ghost"
            className="w-full justify-start text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-xl gap-3 text-sm"
            onClick={async () => {
              setSidebarOpen(false);
              setAuthView("login");
              await signOut({ redirect: false });
              window.location.href = window.location.origin + "/";
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
