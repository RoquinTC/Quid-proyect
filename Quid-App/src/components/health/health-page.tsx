"use client";

import { useState, useEffect } from "react";
import { useAppStore, type HealthSubView, type SidebarAction } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Stethoscope } from "lucide-react";
import { MedicationsView } from "./medications-view";
import { AppointmentsView } from "./appointments-view";
import { MedicationForm } from "./medication-form";
import { AppointmentForm } from "./appointment-form";

const tabs: { id: HealthSubView; label: string; icon: typeof Pill }[] = [
  { id: "medications", label: "Medicamentos", icon: Pill },
  { id: "appointments", label: "Citas Médicas", icon: Stethoscope },
];

export function HealthPage() {
  const { healthSubView, setHealthSubView, sidebarAction, setSidebarAction } = useAppStore();

  // Sidebar quick-action forms
  const [showMedicationForm, setShowMedicationForm] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);

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
      case "profiles":
        return <MedicationsView />;
      default:
        return <MedicationsView />;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab navigation */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
          {tabs.map((tab) => {
            const isActive = healthSubView === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setHealthSubView(tab.id)}
                className="relative flex items-center justify-center gap-1.5 flex-1 py-2.5 px-2 rounded-xl text-sm font-medium transition-colors duration-200"
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
      <div className="flex-1 overflow-y-auto">
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
    </div>
  );
}
