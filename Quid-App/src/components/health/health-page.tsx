"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore, type HealthSubView, type SidebarAction } from "@/lib/store";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ClipboardList,
  Heart,
  Package,
  Pill,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { MedicationsView } from "./medications-view";
import { AppointmentsView } from "./appointments-view";
import { MedicalOrdersView } from "./medical-orders-view";
import { RecommendationsView } from "./recommendations-view";
import { InventoryView } from "./inventory-view";
import { AuthorizationsTab } from "./authorizations-tab";
import { PendingClaimsTab } from "./pending-claims-tab";
import { HealthSummaryView } from "./health-summary-view";
import { MedicationForm } from "./medication-form";
import { AppointmentForm } from "./appointment-form";
import { MedicalOrderForm } from "./medical-order-form";
import { ModuleShell, ModuleTabs, type ModuleTab } from "@/components/layout/module-kit";

const TABS: ModuleTab<HealthSubView>[] = [
  { id: "summary", label: "Resumen", icon: Activity, primary: true, hint: "Tu día de salud" },
  { id: "medications", label: "Medicamentos", icon: Pill, primary: true, hint: "Tomas e inventario" },
  { id: "appointments", label: "Citas", icon: Stethoscope, primary: true, hint: "Agenda médica" },
  { id: "orders", label: "Órdenes", icon: ClipboardList, primary: false, hint: "Órdenes y entregas" },
  { id: "authorizations", label: "Autorizaciones", icon: ShieldCheck, primary: false, hint: "Trámites con la EPS" },
  { id: "claims", label: "Farmacia", icon: ShoppingBag, primary: false, hint: "Pendientes por reclamar" },
  { id: "profiles", label: "Recomendaciones", icon: Sparkles, primary: false, hint: "Sugerencias de Aura" },
  { id: "inventory", label: "Inventario", icon: Package, primary: false, hint: "Existencias en casa" },
];

const PRIMARY_TABS = TABS.filter((tab) => tab.primary !== false);

/**
 * Módulo Salud.
 *
 * El encabezado, las pestañas y la hoja "Más" viven en `module-kit`, igual que
 * en Finanzas, Despensa y Transporte: un solo lenguaje visual en toda la app.
 */
export function HealthPage() {
  const { healthSubView, setHealthSubView, sidebarAction, setSidebarAction } = useAppStore();

  const [showMedicationForm, setShowMedicationForm] = useState(false);
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showMedicalOrderForm, setShowMedicalOrderForm] = useState(false);

  // ─── Deslizar entre pestañas primarias ───
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
      if (target.closest("[data-carousel], .overflow-x-auto, .snap-x")) return;

      const currentIdx = PRIMARY_TABS.findIndex((t) => t.id === healthSubView);
      if (currentIdx === -1) return;
      if (dx < 0 && currentIdx < PRIMARY_TABS.length - 1) {
        setHealthSubView(PRIMARY_TABS[currentIdx + 1].id);
      } else if (dx > 0 && currentIdx > 0) {
        setHealthSubView(PRIMARY_TABS[currentIdx - 1].id);
      }
    }
    setTouchStart(null);
  };

  // ─── Acciones rápidas desde la barra lateral ───
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
    if (handler) {
      handler();
      setSidebarAction(null);
    }
  }, [sidebarAction, setSidebarAction, setHealthSubView]);

  const action = useMemo(() => {
    if (healthSubView === "medications") {
      return (
        <button
          type="button"
          onClick={() => setShowMedicationForm(true)}
          className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-emerald-600/20 active:scale-95"
        >
          <Pill className="size-3.5" />
          Agregar
        </button>
      );
    }
    if (healthSubView === "appointments") {
      return (
        <button
          type="button"
          onClick={() => setShowAppointmentForm(true)}
          className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-emerald-600/20 active:scale-95"
        >
          <Stethoscope className="size-3.5" />
          Agendar
        </button>
      );
    }
    return null;
  }, [healthSubView]);

  const renderContent = () => {
    switch (healthSubView) {
      case "summary":
        return <HealthSummaryView />;
      case "medications":
        return <MedicationsView />;
      case "appointments":
        return <AppointmentsView />;
      case "orders":
        return <MedicalOrdersView />;
      case "authorizations":
        return <AuthorizationsTab />;
      case "claims":
        return <PendingClaimsTab />;
      case "profiles":
        return <RecommendationsView />;
      case "inventory":
        return <InventoryView />;
      default:
        return <MedicationsView />;
    }
  };

  return (
    <>
      <ModuleShell
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        header={
          <ModuleTabs
            title="Salud"
            icon={Heart}
            tone="emerald"
            tabs={TABS}
            activeId={healthSubView}
            onSelect={setHealthSubView}
            layoutId="healthModuleTab"
            action={action}
          />
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={healthSubView}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </ModuleShell>

      <MedicationForm open={showMedicationForm} onOpenChange={setShowMedicationForm} />
      <AppointmentForm open={showAppointmentForm} onOpenChange={setShowAppointmentForm} />
      <MedicalOrderForm open={showMedicalOrderForm} onOpenChange={setShowMedicalOrderForm} />
    </>
  );
}
