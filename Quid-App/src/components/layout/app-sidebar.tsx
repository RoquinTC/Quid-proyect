"use client";

import { useState } from "react";
import { useAppSession } from "@/lib/use-app-session";
import { useAppStore, type ModuleType, type SidebarAction } from "@/lib/store";
import { performLogout } from "@/lib/logout";
import {
  Settings,
  LogOut,
  ChevronRight,
  Calculator,
  Landmark,
  CreditCard,
  TrendingUp,
  Share2,
  HandCoins,
} from "lucide-react";
import { QUID_MODULES, groupActions } from "@/lib/modules/registry";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ShareInvite } from "@/components/pwa/share-invite";
import { motion, AnimatePresence } from "framer-motion";
import { VehicleIcon } from "@/components/transport/vehicle-icon";
import { useLocalQuery } from "@/lib/local/hooks/queries";

// ─── Módulos y acciones ────────────────────────────────────────────
// La lista vive en `lib/modules/registry.ts`; aquí solo se decide cómo se
// agrupa. Cada módulo abre con "Abrir <módulo>" y luego sus acciones por
// verbo (crear · registrar · gestionar).

const VERB_ORDER = ["crear", "registrar", "gestionar"] as const;
type ActionVerb = (typeof VERB_ORDER)[number];

const VERB_LABEL: Record<ActionVerb, string> = {
  crear: "Crear",
  registrar: "Registrar",
  gestionar: "Gestionar",
};

const simulatorItems = [
  { id: "simulator-yield" as const, label: "Cuentas de alto rendimiento", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", comingSoon: false, subView: "simulator" as const },
  { id: "simulator-cdt" as const, label: "CDT", icon: Landmark, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", comingSoon: true, subView: null },
  { id: "simulator-credit" as const, label: "Créditos", icon: CreditCard, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", comingSoon: false, subView: "credit-simulator" as const },
  { id: "simulator-debt" as const, label: "Abonos a Deuda", icon: HandCoins, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-900/30", comingSoon: false, subView: "debt-simulator" as const },
];

export function AppSidebar() {
  const { session } = useAppSession();
  const { sidebarOpen, setSidebarOpen, setActiveModule, setFinanceSubView, setAuthView, setSidebarAction } = useAppStore();
  const { data: vehiclesData } = useLocalQuery<{ id: string; type: string; icon?: string | null }>("/api/vehicles");
  const primaryVehicle = vehiclesData?.[0];
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

  const handleSidebarOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    setExpandedModule(null);
    setSimulatorsOpen(false);
  };

  return (
    <Sheet open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
      <SheetContent side="left" className="quid-app-sidebar flex h-dvh w-[min(300px,92vw)] flex-col gap-0 overflow-hidden rounded-r-2xl border-r border-[color:var(--theme-panel-border)] p-0 text-foreground shadow-2xl backdrop-blur-xl">
        {/* User Profile Header */}
        <div className="shrink-0 border-b border-[color:var(--theme-panel-border)] bg-[color:color-mix(in_srgb,var(--surface-floating)_82%,transparent)] p-4 pb-4">
          <SheetTitle className="mb-3 text-left text-lg font-black tracking-tight text-foreground">
            Menú
          </SheetTitle>
          <div className="flex items-center gap-3">
            <Avatar className="size-11 ring-2 ring-primary/25">
              <AvatarImage
                src={session?.user?.image || ""}
                alt={session?.user?.name || "Usuario"}
              />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {session?.user?.name || "Usuario"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {session?.user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[color:color-mix(in_srgb,var(--surface-floating)_76%,transparent)] pb-3">
          {/* Module Navigation with expandable actions */}
          <div className="p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
              Módulos
            </p>
            {QUID_MODULES.map((item) => {
              const Icon = item.icon;
              const isExpanded = expandedModule === item.id;
              const hasActions = item.actions.length > 0;
              const groups = groupActions(item);

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
                    aria-expanded={hasActions ? isExpanded : undefined}
                    title={item.hint}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/10 transition-colors text-left"
                  >
                    <div className={`size-9 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                      {item.id === "transport" ? (
                        <motion.span
                          animate={isExpanded ? { y: [0, -1, 0] } : { y: 0 }}
                          transition={{ duration: 1.8, repeat: isExpanded ? Infinity : 0, ease: "easeInOut" }}
                        >
                          <VehicleIcon
                            type={primaryVehicle?.type || "motorcycle"}
                            icon={primaryVehicle?.icon}
                            className={`size-4 ${item.color}`}
                          />
                        </motion.span>
                      ) : (
                        <Icon className={`size-4 ${item.color}`} />
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground flex-1">
                      {item.label}
                    </span>
                    {hasActions ? (
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronRight className="size-4 text-muted-foreground/55" />
                      </motion.div>
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground/55" />
                    )}
                  </button>

                  {/* Antes la hamburguesa solo ofrecía crear; abrir el módulo
                      también vive aquí, junto a las acciones agrupadas. */}
                  <AnimatePresence>
                    {isExpanded && hasActions && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="pl-4 pr-1 py-1 space-y-1">
                          <button
                            onClick={() => handleNavigate(item.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors text-left"
                          >
                            <div className={`size-6 rounded-md ${item.bg} flex items-center justify-center shrink-0`}>
                              <Icon className={`size-3 ${item.color}`} />
                            </div>
                            <span className="text-[13px] font-semibold text-foreground flex-1">
                              Abrir {item.label}
                            </span>
                            <ChevronRight className="size-3.5 text-muted-foreground/55" />
                          </button>

                          {VERB_ORDER.map((verb) => {
                            const actions = groups[verb];
                            if (!actions || actions.length === 0) return null;

                            return (
                              <div key={verb} className="space-y-0.5">
                                <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                  {VERB_LABEL[verb]}
                                </p>
                                {actions.map((action) => {
                                  const ActionIcon = action.icon;
                                  return (
                                    <button
                                      key={action.id}
                                      onClick={() => handleQuickAction(item.id, action.id)}
                                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-primary/10 transition-colors text-left group"
                                    >
                                      <div className={`size-6 rounded-md ${item.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                                        <ActionIcon className={`size-3 ${item.color}`} />
                                      </div>
                                      <span className="text-[13px] text-muted-foreground flex-1">
                                        {action.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
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
          <div className="mx-5 my-2 border-t border-[color:var(--theme-panel-border)]" />

          {/* Simuladores Section */}
          <div className="p-3 space-y-1">
            <button
              onClick={() => setSimulatorsOpen(!simulatorsOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/10 transition-colors text-left"
            >
              <div className="size-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                <Calculator className="size-4 text-violet-600 dark:text-violet-400" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1">
                Simuladores
              </span>
              <motion.div
                animate={{ rotate: simulatorsOpen ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="size-4 text-muted-foreground/55" />
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
                              : "hover:bg-primary/10"
                          }`}
                        >
                          <div className={`size-7 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                            <Icon className={`size-3.5 ${item.color}`} />
                          </div>
                          <span className="text-[13px] font-medium text-muted-foreground flex-1">
                            {item.label}
                          </span>
                          {item.comingSoon && (
                            <span className="text-[11px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full whitespace-nowrap">
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
          <div className="mx-5 my-2 border-t border-[color:var(--theme-panel-border)]" />

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
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary/10 transition-colors text-left"
            >
              <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Settings className="size-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1">
                Ajustes
              </span>
              <ChevronRight className="size-4 text-muted-foreground/55" />
            </button>
          </div>
        </div>

        {/* Sign Out - Fixed at bottom */}
        <ShareInvite open={shareOpen} onOpenChange={setShareOpen} />

        <div className="shrink-0 border-t border-[color:var(--theme-panel-border)] bg-[color:color-mix(in_srgb,var(--surface-floating)_88%,transparent)] px-4 py-3 safe-area-bottom backdrop-blur">
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
