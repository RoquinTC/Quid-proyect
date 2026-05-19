"use client";

import { useAppStore, type ModuleType } from "@/lib/store";
import { Home, Wallet, Bike, Heart, ShoppingBasket } from "lucide-react";
import { motion } from "framer-motion";

const navItems: {
  id: ModuleType;
  label: string;
  icon: typeof Home;
}[] = [
  { id: "dashboard", label: "Inicio", icon: Home },
  { id: "finance", label: "Finanzas", icon: Wallet },
  { id: "transport", label: "Transporte", icon: Bike },
  { id: "health", label: "Salud", icon: Heart },
  { id: "pantry", label: "Despensa", icon: ShoppingBasket },
];

export function BottomNav() {
  const { activeModule, setActiveModule } = useAppStore();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-gray-100 safe-area-bottom dark:bg-gray-900/95 dark:border-gray-800">
      <div className="flex items-center justify-around px-2 py-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => setActiveModule(item.id)}
              className="relative flex flex-col items-center justify-center min-w-[56px] min-h-[56px] py-2 px-3 transition-all duration-200 rounded-xl active:scale-95"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-1 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500"
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}
              <Icon
                className={`size-[22px] relative z-10 transition-colors duration-200 ${
                  isActive ? "text-white" : "text-gray-400 dark:text-gray-500"
                }`}
              />
              <span
                className={`text-[10px] mt-0.5 relative z-10 font-medium transition-colors duration-200 ${
                  isActive ? "text-white" : "text-gray-400 dark:text-gray-500"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
