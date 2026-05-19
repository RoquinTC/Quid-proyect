"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Refrigerator, ShoppingCart, ChefHat, ShieldCheck } from "lucide-react";
import { useAppStore, type SidebarAction } from "@/lib/store";
import { PantryView } from "./pantry-view";
import { ShoppingListsView } from "./shopping-lists-view";
import { RecipesView } from "./recipes-view";
import { HealthProfilesView } from "./health-profiles-view";
import { PantryItemForm } from "./pantry-item-form";
import { ShoppingListForm } from "./shopping-list-form";
import { HealthProfileForm } from "./health-profile-form";

type PantryTab = "fridge" | "shopping" | "recipes" | "health";

const tabs: { id: PantryTab; label: string; icon: typeof Refrigerator }[] = [
  { id: "fridge", label: "Nevera", icon: Refrigerator },
  { id: "shopping", label: "Mercado", icon: ShoppingCart },
  { id: "recipes", label: "Recetas", icon: ChefHat },
  { id: "health", label: "Salud", icon: ShieldCheck },
];

export function PantryPage() {
  const { sidebarAction, setSidebarAction } = useAppStore();
  const [activeTab, setActiveTab] = useState<PantryTab>("fridge");

  // Sidebar quick-action forms
  const [showPantryItemForm, setShowPantryItemForm] = useState(false);
  const [showShoppingListForm, setShowShoppingListForm] = useState(false);
  const [showHealthProfileForm, setShowHealthProfileForm] = useState(false);

  // ─── Listen for sidebar quick-actions ───────────────────────────
  useEffect(() => {
    if (!sidebarAction) return;

    const actionMap: Partial<Record<SidebarAction, () => void>> = {
      "create-pantry-item": () => {
        setActiveTab("fridge");
        setShowPantryItemForm(true);
      },
      "create-shopping-list": () => {
        setActiveTab("shopping");
        setShowShoppingListForm(true);
      },
      "create-health-profile": () => {
        setActiveTab("health");
        setShowHealthProfileForm(true);
      },
    };

    const handler = actionMap[sidebarAction];
    if (handler) handler();

    // Consume the action so it doesn't re-fire
    setSidebarAction(null);
  }, [sidebarAction, setSidebarAction]);

  const renderContent = () => {
    switch (activeTab) {
      case "fridge":
        return <PantryView />;
      case "shopping":
        return <ShoppingListsView />;
      case "recipes":
        return <RecipesView />;
      case "health":
        return <HealthProfilesView />;
      default:
        return <PantryView />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab navigation */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex items-center justify-center gap-1 flex-1 py-2.5 px-1 rounded-xl text-sm font-medium transition-colors duration-200"
              >
                {isActive && (
                  <motion.div
                    layoutId="pantryTab"
                    className="absolute inset-0 bg-white dark:bg-gray-700 rounded-xl shadow-sm"
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <Icon
                  className={`size-3.5 relative z-10 ${
                    isActive ? "text-amber-600" : "text-gray-400"
                  }`}
                />
                <span
                  className={`relative z-10 text-[11px] ${
                    isActive ? "text-gray-900 dark:text-white" : "text-gray-500"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ─── Sidebar Quick-Action Forms ───────────────────────────── */}

      <PantryItemForm
        open={showPantryItemForm}
        onOpenChange={setShowPantryItemForm}
      />

      <ShoppingListForm
        open={showShoppingListForm}
        onOpenChange={setShowShoppingListForm}
      />

      <HealthProfileForm
        open={showHealthProfileForm}
        onOpenChange={setShowHealthProfileForm}
      />
    </div>
  );
}
