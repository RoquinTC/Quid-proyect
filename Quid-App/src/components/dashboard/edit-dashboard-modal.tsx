"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { ArrowUp, ArrowDown, Eye, EyeOff, LayoutTemplate, X } from "lucide-react";

const WIDGET_LABELS: Record<string, string> = {
  stats: "Estadísticas Rápidas",
  transport: "Mi Vehículo",
  water: "Rastreador de Agua",
  finance: "Resumen Financiero",
  aura: "Asistente Aura",
  actions: "Acciones Rápidas",
};

export function EditDashboardModal() {
  const { dashboardWidgets, setDashboardWidgets } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);

  // All possible widgets
  const allWidgets = Object.keys(WIDGET_LABELS);
  
  // Active widgets are in dashboardWidgets, inactive are the ones not in there
  const activeWidgets = dashboardWidgets;
  const inactiveWidgets = allWidgets.filter((w) => !dashboardWidgets.includes(w));

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newWidgets = [...activeWidgets];
    const temp = newWidgets[index - 1];
    newWidgets[index - 1] = newWidgets[index];
    newWidgets[index] = temp;
    setDashboardWidgets(newWidgets);
  };

  const moveDown = (index: number) => {
    if (index === activeWidgets.length - 1) return;
    const newWidgets = [...activeWidgets];
    const temp = newWidgets[index + 1];
    newWidgets[index + 1] = newWidgets[index];
    newWidgets[index] = temp;
    setDashboardWidgets(newWidgets);
  };

  const hideWidget = (widgetId: string) => {
    setDashboardWidgets(activeWidgets.filter((w) => w !== widgetId));
  };

  const showWidget = (widgetId: string) => {
    setDashboardWidgets([...activeWidgets, widgetId]);
  };

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        className="w-full h-12 border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 mt-4 rounded-xl"
        onClick={() => setIsOpen(true)}
      >
        <LayoutTemplate className="size-4 mr-2" />
        Personalizar Dashboard
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm flex flex-col p-4">
      <div className="flex items-center justify-between mb-6 pt-safe">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Personalizar</h2>
          <p className="text-sm text-gray-500">Reordena o esconde tus widgets</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="rounded-full bg-gray-200/50 dark:bg-gray-800/50">
          <X className="size-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pb-safe">
        {/* Active Widgets */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 px-1">Widgets Visibles</h3>
          <div className="space-y-2">
            {activeWidgets.map((widgetId, index) => (
              <div key={widgetId} className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-gray-900 border shadow-sm">
                <span className="font-medium text-sm text-gray-800 dark:text-gray-200">
                  {WIDGET_LABELS[widgetId] || widgetId}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => moveUp(index)} disabled={index === 0}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => moveDown(index)} disabled={index === activeWidgets.length - 1}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                  <Button variant="ghost" size="icon" className="size-8 text-red-500" onClick={() => hideWidget(widgetId)}>
                    <EyeOff className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {activeWidgets.length === 0 && (
              <p className="text-sm text-gray-500 italic p-3 text-center border border-dashed rounded-xl">No hay widgets visibles</p>
            )}
          </div>
        </div>

        {/* Inactive Widgets */}
        {inactiveWidgets.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 px-1">Widgets Ocultos</h3>
            <div className="space-y-2">
              {inactiveWidgets.map((widgetId) => (
                <div key={widgetId} className="flex items-center justify-between p-3 rounded-xl bg-gray-100 dark:bg-gray-800 border border-dashed opacity-70">
                  <span className="font-medium text-sm text-gray-600 dark:text-gray-400">
                    {WIDGET_LABELS[widgetId] || widgetId}
                  </span>
                  <Button variant="ghost" size="sm" className="h-8 text-emerald-600 dark:text-emerald-400" onClick={() => showWidget(widgetId)}>
                    <Eye className="size-4 mr-1.5" /> Mostrar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 pb-safe border-t border-gray-200 dark:border-gray-800">
        <Button className="w-full h-12 rounded-xl text-base font-semibold" onClick={() => setIsOpen(false)}>
          Guardar Cambios
        </Button>
      </div>
    </div>
  );
}
