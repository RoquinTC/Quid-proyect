"use client";

/**
 * Maintenance intervals.
 *
 * The API returns EVERY rule it knows about: the built-in catalog plus one entry
 * per custom service name found in the user's past records, and most of those are
 * inactive. Rendering all of them as full cards buried the handful the user
 * actually uses under a wall of empty forms.
 *
 * So the list is split: active rules get the editable card, everything else waits
 * in a collapsed list of one-line rows that can be switched on with a tap. That
 * keeps the default view short without hiding anything.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import type { MaintenanceServiceRule } from "@/lib/types/transport";
import { normalizeMaintenanceTypeKey } from "@/lib/transport-maintenance-rules";
import { ChevronDown, Gauge, Loader2, Plus, Search, Settings, Wrench, X } from "lucide-react";
import { toast } from "sonner";

interface MaintenanceRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type EditableRule = MaintenanceServiceRule & {
  intervalKmText: string;
  intervalMonthsText: string;
  warningKmText: string;
};

function toEditable(rule: MaintenanceServiceRule): EditableRule {
  return {
    ...rule,
    intervalKmText: rule.intervalKm != null ? String(Math.round(rule.intervalKm)) : "",
    intervalMonthsText: rule.intervalMonths != null ? String(rule.intervalMonths) : "",
    warningKmText: rule.warningKm != null ? String(Math.round(rule.warningKm)) : "500",
  };
}

function toNumberOrNull(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function MaintenanceRulesDialog({ open, onOpenChange, onSuccess }: MaintenanceRulesDialogProps) {
  const [rules, setRules] = useState<EditableRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [showAvailable, setShowAvailable] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setSearch("");
    setNewName("");
    setShowAvailable(false);
    apiFetch<MaintenanceServiceRule[]>("/api/vehicles/maintenance/rules")
      .then((data) => {
        if (!cancelled) setRules((data || []).map(toEditable));
      })
      .catch((error) => {
        console.error("Error loading maintenance rules:", error);
        toast.error("No se pudieron cargar los intervalos");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const matchesSearch = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rules;
    return rules.filter((rule) => rule.name.toLowerCase().includes(query));
  }, [rules, search]);

  const activeRules = useMemo(
    () => matchesSearch.filter((rule) => rule.isActive).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [matchesSearch]
  );
  const availableRules = useMemo(
    () => matchesSearch.filter((rule) => !rule.isActive).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [matchesSearch]
  );

  function updateRule(typeKey: string, patch: Partial<EditableRule>) {
    setRules((prev) => prev.map((rule) => (rule.typeKey === typeKey ? { ...rule, ...patch } : rule)));
  }

  /** Turn a rule on and reveal it in the editable list. */
  function activateRule(rule: EditableRule) {
    updateRule(rule.typeKey, { isActive: true });
  }

  function handleCreate() {
    const label = newName.trim();
    if (!label) return;

    const typeKey = normalizeMaintenanceTypeKey(label);
    const existing = rules.find(
      (rule) => rule.typeKey === typeKey || normalizeMaintenanceTypeKey(rule.name) === typeKey
    );

    if (existing) {
      // Same service under a known key: activating it beats creating a twin that
      // the server would merge anyway.
      activateRule(existing);
      setNewName("");
      setSearch("");
      toast.info(`"${existing.name}" ya estaba en la lista: lo activé.`);
      return;
    }

    setRules((prev) => [
      ...prev,
      {
        typeKey,
        name: label,
        intervalKm: null,
        intervalMonths: null,
        warningKm: 500,
        isActive: true,
        isDefault: false,
        intervalKmText: "",
        intervalMonthsText: "",
        warningKmText: "500",
      },
    ]);
    setNewName("");
    setSearch("");
    toast.success(`"${label}" agregado. Definí cada cuánto se repite.`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/vehicles/maintenance/rules", {
        method: "PUT",
        body: JSON.stringify({
          rules: rules.map((rule) => ({
            typeKey: rule.typeKey,
            name: rule.name,
            intervalKm: toNumberOrNull(rule.intervalKmText),
            intervalMonths: toNumberOrNull(rule.intervalMonthsText),
            warningKm: toNumberOrNull(rule.warningKmText),
            isActive: rule.isActive,
          })),
        }),
      });
      toast.success("Intervalos de mantenimiento guardados");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving maintenance rules:", error);
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar los intervalos");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b px-4 py-4 dark:border-gray-800">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings className="size-5 text-cyan-600" />
            Intervalos de mantenimiento
          </DialogTitle>
          <DialogDescription className="text-xs">
            Activá solo los servicios que revisás. Cada cuántos kilómetros o meses debe volver el recordatorio.
          </DialogDescription>
        </DialogHeader>

        {/* Create a service that is not in the catalog yet */}
        <div className="border-b px-4 py-3 dark:border-gray-800">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Agregar un servicio nuevo (ej: cambio de bujías)"
              className="flex-1"
            />
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="shrink-0 bg-cyan-600 hover:bg-cyan-700"
            >
              <Plus className="size-4" />
              <span className="ml-1 hidden sm:inline">Agregar</span>
            </Button>
          </div>
        </div>

        {rules.length > 3 && (
          <div className="border-b px-4 py-3 dark:border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar en la lista..."
                className="pl-9"
              />
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-500">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Cargando intervalos...
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Active: fully editable ── */}
              <div className="space-y-2">
                {activeRules.map((rule) => (
                  <div key={rule.typeKey} className="rounded-xl border border-cyan-200/70 p-3 dark:border-cyan-900/50">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                          <Wrench className="size-4 text-cyan-600" />
                          {rule.name}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Se crea el recordatorio automático al registrarlo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateRule(rule.typeKey, { isActive: false })}
                        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                      >
                        <X className="size-3" />
                        Quitar
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Cada km</Label>
                        <Input
                          type="number"
                          min="0"
                          value={rule.intervalKmText}
                          onChange={(event) => updateRule(rule.typeKey, { intervalKmText: event.target.value })}
                          placeholder="2500"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cada meses</Label>
                        <Input
                          type="number"
                          min="0"
                          value={rule.intervalMonthsText}
                          onChange={(event) => updateRule(rule.typeKey, { intervalMonthsText: event.target.value })}
                          placeholder="6"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="flex items-center gap-1 text-xs">
                          <Gauge className="size-3" />
                          Avisar km antes
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          value={rule.warningKmText}
                          onChange={(event) => updateRule(rule.typeKey, { warningKmText: event.target.value })}
                          placeholder="500"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {activeRules.length === 0 && (
                  <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-800">
                    Todavía no activaste ningún servicio. Agregá uno arriba o elegí de la lista de abajo.
                  </p>
                )}
              </div>

              {/* ── Available: compact, one line each ── */}
              {availableRules.length > 0 && (
                <div className="rounded-xl border dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setShowAvailable((value) => !value)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5"
                    aria-expanded={showAvailable}
                  >
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                      Otros servicios ({availableRules.length})
                    </span>
                    <ChevronDown
                      className={`size-4 text-gray-400 transition-transform ${showAvailable ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showAvailable && (
                    <div className="space-y-1 border-t px-2 py-2 dark:border-gray-800">
                      {availableRules.map((rule) => (
                        <button
                          key={rule.typeKey}
                          type="button"
                          onClick={() => activateRule(rule)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
                        >
                          <span className="truncate text-[13px] text-gray-600 dark:text-gray-300">{rule.name}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                            Activar
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 bg-cyan-600 hover:bg-cyan-700"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
