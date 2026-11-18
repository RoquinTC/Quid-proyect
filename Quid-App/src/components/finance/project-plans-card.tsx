"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Target, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch, formatCurrency } from "@/lib/api";

/**
 * F-52 · Planes de proyecto.
 *
 * Muestra el objetivo, la fecha y cada escenario con su tasa **editable**.
 * Al cambiar una tasa se guarda y el servidor recalcula: nunca se promete un
 * rendimiento, se muestra un rango con el supuesto a la vista y su fuente.
 */

interface Projection {
  name: string;
  kind: string;
  annualRatePercent: number;
  projectedAmount: number;
  lowAmount: number;
  highAmount: number;
  monthsToGoal: number | null;
  gap: number;
  requiredMonthly: number;
}

interface Scenario {
  id: string;
  name: string;
  kind: string;
  annualRatePercent: number;
  volatilityPercent: number;
  source: string | null;
}

interface Plan {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  targetDate: string | null;
  status: string;
  goalId: string | null;
  scenarios: Scenario[];
  projections: Projection[];
}

export function ProjectPlansCard() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [monthly, setMonthly] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [cdtRate, setCdtRate] = useState("11");
  const [etfRate, setEtfRate] = useState("8");

  const load = useCallback(
    () => apiFetch<{ plans: Plan[] }>("/api/finance/plans").then((data) => setPlans(data.plans)).catch(() => undefined),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setError("");
    const target = Number(targetAmount.replace(/[^\d]/g, ""));
    if (!name.trim() || !target) {
      setError("Escribe el nombre del proyecto y cuánto necesitas.");
      return;
    }

    const scenarios: Array<{
      name: string;
      kind: string;
      annualRatePercent: number;
      volatilityPercent?: number;
      source: string;
    }> = [];
    if (Number(cdtRate) > 0) {
      scenarios.push({
        name: `CDT ${cdtRate}%`,
        kind: "cdt",
        annualRatePercent: Number(cdtRate),
        source: "Supuesto tuyo · verificar con el banco",
      });
    }
    if (Number(etfRate) > 0) {
      scenarios.push({
        name: `ETF ${etfRate}%`,
        kind: "etf",
        annualRatePercent: Number(etfRate),
        volatilityPercent: 15,
        source: "Supuesto histórico · no es promesa",
      });
    }
    scenarios.push({
      name: "Ahorro",
      kind: "savings",
      annualRatePercent: 0,
      source: "Sin rendimiento",
    });

    setBusy(true);
    try {
      const response = await fetch("/api/finance/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          targetAmount: target,
          monthlyContribution: Number(monthly.replace(/[^\d]/g, "")) || 0,
          targetDate: targetDate || null,
          scenarios,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "No se pudo crear el plan.");
      setName("");
      setTargetAmount("");
      setMonthly("");
      setTargetDate("");
      setAdding(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo crear el plan.");
    } finally {
      setBusy(false);
    }
  };

  const saveRate = async (plan: Plan, scenario: Scenario, rate: number) => {
    setBusy(true);
    setError("");
    try {
      const scenarios = plan.scenarios.map((row) =>
        row.id === scenario.id
          ? {
              name: `${row.kind === "cdt" ? "CDT" : row.kind === "etf" ? "ETF" : row.name} ${rate}%`,
              kind: row.kind,
              annualRatePercent: rate,
              volatilityPercent: row.volatilityPercent,
              source: row.source,
            }
          : {
              name: row.name,
              kind: row.kind,
              annualRatePercent: row.annualRatePercent,
              volatilityPercent: row.volatilityPercent,
              source: row.source,
            }
      );
      const response = await fetch(`/api/finance/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarios }),
      });
      if (!response.ok) throw new Error("No se pudo actualizar la tasa.");
      setEditing(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar.");
    } finally {
      setBusy(false);
    }
  };

  const applyPlan = async (plan: Plan) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/finance/plans/${plan.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioName: plan.scenarios[0]?.name ?? null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "No se pudo crear la meta.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo crear la meta.");
    } finally {
      setBusy(false);
    }
  };

  if (plans.length === 0 && !adding) {
    return (
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-emerald-500" />
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Planes de proyecto
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
            >
              <Plus className="size-3.5" />
              Nuevo plan
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Planea una casa, un carro o unos estudios: cuánto aportar y qué rendimiento suponer.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-emerald-500" />
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Planes de proyecto
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
            className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
          >
            <Plus className="size-3.5" />
            Nuevo plan
          </button>
        </div>

        {plans.map((plan) => (
          <div key={plan.id} className="rounded-xl border border-border/60 p-2 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{plan.name}</p>
                <p className="text-[11px] text-gray-400">
                  Meta {formatCurrency(plan.targetAmount)}
                  {plan.targetDate ? ` · ${plan.targetDate.slice(0, 10)}` : ""} · aportas{" "}
                  {formatCurrency(plan.monthlyContribution)}/mes
                </p>
              </div>
              {plan.goalId ? (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  meta creada
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void applyPlan(plan)}
                  className="shrink-0 text-[11px] text-emerald-600 dark:text-emerald-400"
                >
                  Crear meta
                </button>
              )}
            </div>

            <div className="space-y-1">
              {plan.projections.map((projection) => {
                const scenario = plan.scenarios.find((row) => row.name === projection.name);
                const isEditing = scenario && editing === scenario.id;
                return (
                  <div key={projection.name} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!scenario) return;
                          setEditing(isEditing ? null : scenario.id);
                          setDraft(String(projection.annualRatePercent));
                        }}
                        className="flex items-center gap-1 text-gray-600 dark:text-gray-300"
                      >
                        <TrendingUp className="size-3" />
                        {projection.name}
                        <Pencil className="size-3 text-gray-400" />
                      </button>
                      <span className="font-semibold quid-money">
                        {formatCurrency(projection.projectedAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>
                        {projection.highAmount > projection.projectedAmount
                          ? `rango ${formatCurrency(projection.lowAmount)}–${formatCurrency(projection.highAmount)}`
                          : "sin volatilidad"}
                      </span>
                      <span>
                        {projection.monthsToGoal
                          ? `llega en ${projection.monthsToGoal} meses`
                          : "no llega en el plazo"}
                      </span>
                    </div>
                    {scenario?.source && (
                      <p className="text-[10px] text-gray-400">Fuente: {scenario.source}</p>
                    )}

                    {isEditing && scenario && (
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          value={draft}
                          onChange={(event) => setDraft(event.target.value.replace(/[^\d.,]/g, ""))}
                          inputMode="decimal"
                          className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-xs"
                        />
                        <span className="text-[11px] text-gray-400">% anual</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveRate(plan, scenario, Number(draft.replace(",", ".")))}
                          className="text-[11px] text-emerald-600 dark:text-emerald-400"
                        >
                          Guardar y recalcular
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-gray-400">
              Supuestos, no promesas: el rango depende de la tasa y la volatilidad que pongas.
            </p>
          </div>
        ))}

        {adding && (
          <div className="space-y-2 border-t border-border pt-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Proyecto (casa, carro…)"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
            <div className="flex gap-2">
              <input
                value={targetAmount}
                onChange={(event) => setTargetAmount(event.target.value)}
                inputMode="numeric"
                placeholder="Cuánto necesitas"
                className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <input
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="h-10 w-40 rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <input
              value={monthly}
              onChange={(event) => setMonthly(event.target.value)}
              inputMode="numeric"
              placeholder="Aporte mensual"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
            <div className="flex gap-2">
              <input
                value={cdtRate}
                onChange={(event) => setCdtRate(event.target.value)}
                inputMode="decimal"
                placeholder="CDT %"
                className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <input
                value={etfRate}
                onChange={(event) => setEtfRate(event.target.value)}
                inputMode="decimal"
                placeholder="ETF %"
                className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <Button className="w-full rounded-xl" disabled={busy} onClick={() => void create()}>
              Crear plan
            </Button>
          </div>
        )}

        {error && <p className="text-xs text-rose-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
