"use client";

import { useState, useEffect } from "react";
import { useAppStore, type HealthSubView, type SidebarAction } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Pill, Stethoscope, Sparkles, Package } from "lucide-react";
import { MedicationsView } from "./medications-view";
import { AppointmentsView } from "./appointments-view";
import { MedicalOrdersView } from "./medical-orders-view";
import { RecommendationsView } from "./recommendations-view";
import { InventoryView } from "./inventory-view";
import { MedicationForm } from "./medication-form";
import { AppointmentForm } from "./appointment-form";
import { MedicalOrderForm } from "./medical-order-form";

const tabs: { id: HealthSubView; label: string; icon: any }[] = [
  { id: "medications", label: "Medicamentos", icon: Pill },
  { id: "appointments", label: "Citas", icon: Stethoscope },
  { id: "orders", label: "Órdenes", icon: ClipboardList },
  { id: "profiles", label: "Recomendaciones", icon: Sparkles },
  { id: "inventory", label: "Inventario", icon: Package },
];

export function HealthPage() {
  const { healthSubView, setHealthSubView, sidebarAction, setSidebarAction } = useAppStore();

  // Sidebar quick-action forms
  const [showMedicationForm, setShowMedicationForm] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showMedicalOrderForm, setShowMedicalOrderForm] = useState(false);

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

      const currentIdx = tabs.findIndex((t) => t.id === healthSubView);
      if (dx < 0 && currentIdx < tabs.length - 1) {
        setHealthSubView(tabs[currentIdx + 1].id);
      } else if (dx > 0 && currentIdx > 0) {
        setHealthSubView(tabs[currentIdx - 1].id);
      }
    }
    setTouchStart(null);
  };

  // ─── Listen for sidebar quick-actions ───────────────────────────
  useEffect(() => {
    if (!sidebarAction) return;

    const actionMap: Partial<Record<SidebarAction, () => void>> = {
      "create-medication": () => {
        setHealthSubView("medications");
        setShowMedicationForm(true);
      },
      "create-appointment": () => {
        setHealthSubView("appointments");
        setShowAppointmentForm(true);
      },
      "create-medical-order": () => {
        setHealthSubView("orders");
        setShowMedicalOrderForm(true);
      },
    };

    const handler = actionMap[sidebarAction];
    if (handler) handler();

    // Consume the action so it doesn't re-fire
    setSidebarAction(null);
  }, [sidebarAction, setSidebarAction, setHealthSubView]);

  const renderContent = () => {
    switch (healthSubView) {
      case "medications":
        return <MedicationsView />;
      case "appointments":
        return <AppointmentsView />;
      case "orders":
        return <MedicalOrdersView />;
      case "profiles":
        return <RecommendationsView />;
      case "inventory":
        return <InventoryView />;
      default:
        return <MedicationsView />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab navigation */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-x-auto scrollbar-none flex-nowrap max-w-full">
          {tabs.map((tab) => {
            const isActive = healthSubView === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setHealthSubView(tab.id)}
                className="relative flex items-center justify-center gap-1.5 flex-1 md:flex-initial py-2.5 px-3 rounded-xl text-sm font-medium transition-colors duration-200 flex-shrink-0 whitespace-nowrap cursor-pointer"
              >
                {isActive && (
                  <motion.div
                    layoutId="healthTab"
                    className="absolute inset-0 bg-white dark:bg-gray-700 rounded-xl shadow-sm"
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 35,
                    }}
                  />
                )}
                <Icon
                  className={`size-4 relative z-10 ${
                    isActive ? "text-rose-600" : "text-gray-400"
                  }`}
                />
                <span
                  className={`relative z-10 text-xs ${
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
      <div className="flex-1 overflow-y-auto" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <AnimatePresence mode="wait">
          <motion.div
            key={healthSubView}
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

      <MedicationForm
        open={showMedicationForm}
        onOpenChange={setShowMedicationForm}
      />

      <AppointmentForm
        open={showAppointmentForm}
        onOpenChange={setShowAppointmentForm}
      />

      <MedicalOrderForm
        open={showMedicalOrderForm}
        onOpenChange={setShowMedicalOrderForm}
      />
    </div>
  );
}
