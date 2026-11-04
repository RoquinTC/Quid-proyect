"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Refrigerator, ShoppingCart, ChefHat, ShieldCheck, Receipt } from "lucide-react";
import { useAppStore, type SidebarAction } from "@/lib/store";
import { ModuleShell, ModuleTabs, type ModuleTab } from "@/components/layout/module-kit";
import { NeveraView } from "./nevera-view";
import { NeveraHistory } from "./nevera-history";
import { DietaryProfilesView } from "./dietary-profiles-view";
import { ShoppingListsView } from "./shopping-lists-view";
import { RecipesView } from "./recipes-view";
import { HealthProfilesView } from "./health-profiles-view";
import { PantryItemForm } from "./pantry-item-form";
import { ShoppingListForm } from "./shopping-list-form";
import { HealthProfileForm } from "./health-profile-form";

type PantryTab = "fridge" | "shopping" | "recipes" | "health" | "history";

const tabs: ModuleTab<PantryTab>[] = [
  { id: "fridge", label: "Nevera", icon: Refrigerator, primary: true, hint: "Lo que hay en casa" },
  { id: "shopping", label: "Mercado", icon: ShoppingCart, primary: true, hint: "Listas de compra" },
  { id: "recipes", label: "Recetas", icon: ChefHat, primary: true, hint: "Qué cocinar hoy" },
  { id: "health", label: "Perfiles", icon: ShieldCheck, primary: false, hint: "Restricciones alimentarias" },
  { id: "history", label: "Historial", icon: Receipt, primary: false, hint: "Movimientos de despensa" },
];

export function PantryPage() {
  const { pantrySubView, setPantrySubView, sidebarAction, setSidebarAction } = useAppStore();
  const [activeTab, setActiveTab] = useState<PantryTab>("fridge");

  // Sidebar quick-action forms
  const [showPantryItemForm, setShowPantryItemForm] = useState(false);
  const [showShoppingListForm, setShowShoppingListForm] = useState(false);
  const [showHealthProfileForm, setShowHealthProfileForm] = useState(false);

  useEffect(() => {
    if (pantrySubView === "shopping-lists") {
      setActiveTab("shopping");
    }
  }, [pantrySubView]);

  // ─── Swipe gesture for tab switching ─────────────────────────
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY, time: Date.now() };
    const dx = touchEnd.x - touchStart.x;
    const dy = Math.abs(touchEnd.y - touchStart.y);
    const dt = touchEnd.time - touchStart.time;

    if (Math.abs(dx) > 50 && dy < 50 && dt < 500) {
      const target = e.target as HTMLElement;
      const carouselParent = target.closest('[data-carousel], .overflow-x-auto, .snap-x');
      if (carouselParent) return;

      const currentIdx = tabs.findIndex((t) => t.id === activeTab);
      if (dx < 0 && currentIdx < tabs.length - 1) {
        setActiveTab(tabs[currentIdx + 1].id);
      } else if (dx > 0 && currentIdx > 0) {
        setActiveTab(tabs[currentIdx - 1].id);
      }
    }
    setTouchStart(null);
  };

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
    if (handler) {
      handler();
      setSidebarAction(null);
    }
  }, [sidebarAction, setSidebarAction]);

  const renderContent = () => {
    switch (activeTab) {
      case "fridge":
        return <NeveraView />;
      case "shopping":
        return <ShoppingListsView />;
      case "recipes":
        return <RecipesView />;
      case "health":
        return <HealthProfilesView />;
      case "history":
        return <NeveraHistory />;
      default:
        return <NeveraView />;
    }
  };

  return (
    <>
      <ModuleShell
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        header={
          <ModuleTabs
            title="Despensa"
            icon={Refrigerator}
            tone="amber"
            tabs={tabs}
            activeId={activeTab}
            onSelect={(id) => {
              setActiveTab(id);
              setPantrySubView(id === "shopping" ? "shopping-lists" : "items");
            }}
            layoutId="pantryModuleTab"
          />
        }
      >
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
      </ModuleShell>

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
    </>
  );
}
