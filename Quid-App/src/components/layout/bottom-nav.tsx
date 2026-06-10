"use client";

import { useAppStore, type ModuleType } from "@/lib/store";
import { Wallet, Heart, ShoppingBasket } from "lucide-react";
import { motion } from "framer-motion";
import { QuickActionFab } from "@/components/layout/quick-action-fab";
import { VehicleIcon } from "@/components/transport/vehicle-icon";
import { useLocalQuery } from "@/lib/local/hooks/queries";

const navItems: {
  id: ModuleType;
  label: string;
  icon: typeof Wallet;
}[] = [
  { id: "finance", label: "Finanzas", icon: Wallet },
  { id: "transport", label: "Transporte", icon: Wallet },
  { id: "health", label: "Salud", icon: Heart },
  { id: "pantry", label: "Despensa", icon: ShoppingBasket },
];

export function BottomNav() {
  const { activeModule, setActiveModule } = useAppStore();
  const { data: vehiclesData } = useLocalQuery<{ id: string; type: string; icon?: string | null }>("/api/vehicles");
  const primaryVehicle = vehiclesData?.[0];
  const leftItems = navItems.slice(0, 2);
  const rightItems = navItems.slice(2);

  const renderItem = (item: (typeof navItems)[number]) => {
    const isActive = activeModule === item.id;
    const Icon = item.icon;

    return (
      <button
        key={item.id}
        onClick={() => setActiveModule(item.id)}
        className="relative flex min-h-[56px] min-w-0 flex-col items-center justify-center rounded-xl px-1 py-2 transition-all duration-200 active:scale-95"
      >
        {isActive && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-1 rounded-xl bg-primary"
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 35,
            }}
          />
        )}
        {item.id === "transport" ? (
          <motion.span
            className="relative z-10"
            animate={isActive ? { y: [0, -1, 0] } : { y: 0 }}
            transition={{ duration: 1.8, repeat: isActive ? Infinity : 0, ease: "easeInOut" }}
          >
            <VehicleIcon
              type={primaryVehicle?.type || "motorcycle"}
              icon={primaryVehicle?.icon}
              className={`size-[21px] transition-colors duration-200 ${
                isActive ? "text-white" : "text-gray-400 dark:text-gray-500"
              }`}
            />
          </motion.span>
        ) : (
          <Icon
            className={`relative z-10 size-[21px] transition-colors duration-200 ${
              isActive ? "text-white" : "text-gray-400 dark:text-gray-500"
            }`}
          />
        )}
        <span
          className={`relative z-10 mt-0.5 text-[11px] font-medium transition-colors duration-200 ${
            isActive ? "text-white" : "text-gray-400 dark:text-gray-500"
          }`}
        >
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white/95 backdrop-blur-lg safe-area-bottom dark:border-gray-800 dark:bg-gray-900/95">
      <div className="relative mx-auto grid max-w-lg grid-cols-5 items-center gap-0 px-1 py-1">
        {leftItems.map(renderItem)}
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-3">
          <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white dark:bg-gray-900" />
          <div className="pointer-events-auto relative z-10">
            <QuickActionFab />
          </div>
        </div>
        <div aria-hidden="true" />
        {rightItems.map(renderItem)}
      </div>
    </nav>
  );
}
