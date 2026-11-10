"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { emitDataEvent } from "@/lib/data-events";
import { money } from "@/lib/finance/monthly-report";
import type { SubscriptionCandidate } from "@/lib/finance/subscription-detector";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sparkles,
  ChevronRight,
  Loader2,
  Repeat,
  ArrowLeftRight,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";

type RecurringType = "expense" | "income" | "transfer";

const TYPE_OPTIONS: Array<{ id: RecurringType; label: string; hint: string }> = [
  { id: "expense", label: "Gasto", hint: "Plata que sale todos los meses" },
  { id: "income", label: "Ingreso", hint: "Plata que entra" },
  { id: "transfer", label: "Transferencia", hint: "Movimiento entre cuentas" },
];

type AccountLite = { id: string; name: string };

function shortDate(key: string): string {
  const date = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/**
 * F-23 · Posibles suscripciones.
 *
 * Cápsula discreta: no interrumpe, solo avisa que hay patrones repetidos. Al
 * abrirla se ve cada candidato y, si el usuario quiere, se crea el pago
 * recurrente eligiendo si es gasto, ingreso o transferencia.
 *
 * El descarte ("No es") se guarda en la base, así que no vuelve a aparecer en
 * ningún equipo.
 */
export function SubscriptionSuggestions() {
  const [candidates, setCandidates] = useState<SubscriptionCandidate[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [type, setType] = useState<RecurringType>("expense");
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ candidates: SubscriptionCandidate[] }>(
        "/api/finance/subscriptions/detect"
      );
      setCandidates(data.candidates ?? []);
    } catch {
      setCandidates([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Las cuentas solo se piden si el usuario elige transferencia.
  useEffect(() => {
    if (type !== "transfer" || accounts.length > 0) return;
    let cancelled = false;
    apiFetch<AccountLite[]>("/api/accounts")
      .then((list) => {
        if (!cancelled) setAccounts(list ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [type, accounts.length]);

  const count = candidates?.length ?? 0;
  const label = useMemo(() => {
    if (count === 1) return "1 posible suscripción";
    return `${count} posibles suscripciones`;
  }, [count]);

  const restart = () => {
    setExpanded(null);
    setType("expense");
    setSourceId("");
    setDestId("");
  };

  const create = async (candidate: SubscriptionCandidate) => {
    if (type === "transfer" && (!sourceId || !destId)) {
      toast.error("Elige la cuenta origen y la destino");
      return;
    }

    setBusy(candidate.merchantKey);
    try {
      await apiFetch("/api/recurring", {
        method: "POST",
        body: JSON.stringify({
          description: candidate.label,
          amount: candidate.amount,
          type,
          frequency: "monthly",
          // 05:00Z = medianoche en Colombia, igual que el resto de recurrentes.
          scheduledDate: `${candidate.nextCharge}T05:00:00.000Z`,
          ...(candidate.category ? { category: candidate.category } : {}),
          ...(type === "transfer"
            ? { accountId: sourceId, destinationAccountId: destId }
            : {}),
        }),
      });

      emitDataEvent("recurring_payments");
      setCandidates((current) =>
        (current ?? []).filter((entry) => entry.merchantKey !== candidate.merchantKey)
      );
      restart();
      toast.success(`Pago recurrente creado: ${candidate.label}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo crear el pago recurrente"
      );
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (candidate: SubscriptionCandidate) => {
    setBusy(candidate.merchantKey);
    try {
      await apiFetch("/api/finance/subscriptions/dismiss", {
        method: "POST",
        body: JSON.stringify({ merchantKey: candidate.merchantKey }),
      });
      setCandidates((current) =>
        (current ?? []).filter((entry) => entry.merchantKey !== candidate.merchantKey)
      );
      restart();
      toast.success("Listo, no volverá a aparecer");
    } catch {
      toast.error("No se pudo descartar la sugerencia");
    } finally {
      setBusy(null);
    }
  };

  if (count === 0) return null;

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) restart();
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70"
        >
          <Sparkles className="size-3.5" />
          {label}
          <ChevronRight className="size-3 opacity-70" />
        </button>
      </SheetTrigger>

      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl p-0 flex flex-col">
        <div className="shrink-0 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <SheetTitle className="text-sm font-bold">Posibles suscripciones</SheetTitle>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            Cobros repetidos en los últimos 12 meses. Nada se crea sin tu permiso.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {candidates === null && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-amber-500" />
            </div>
          )}

          {candidates?.map((candidate) => {
            const isOpen = expanded === candidate.merchantKey;
            const working = busy === candidate.merchantKey;

            return (
              <div
                key={candidate.merchantKey}
                className="rounded-2xl border border-gray-100 dark:border-gray-800 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="size-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <Repeat className="size-4 text-amber-600 dark:text-amber-300" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">
                      {candidate.label}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      cada {candidate.cadenceDays} días · último {shortDate(candidate.lastCharge)} ·{" "}
                      {candidate.occurrences} cobros
                    </p>
                    <p className="text-[11px] text-gray-400">
                      próximo estimado: {shortDate(candidate.nextCharge)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[13px] font-bold text-gray-900 dark:text-white">
                      {money(candidate.monthlyAmount)}
                    </p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide">/ mes</p>
                  </div>
                </div>

                {!isOpen && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3 text-[11px]"
                      onClick={() => {
                        setExpanded(candidate.merchantKey);
                        setType("expense");
                      }}
                    >
                      Crear recurrente
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full px-2 text-[11px] text-gray-500"
                      disabled={working}
                      onClick={() => void dismiss(candidate)}
                    >
                      No es
                    </Button>
                  </div>
                )}

                {isOpen && (
                  <div className="mt-3 space-y-2 rounded-xl bg-gray-50 dark:bg-gray-800/50 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      ¿Qué tipo de movimiento es?
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {TYPE_OPTIONS.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setType(option.id)}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            type === option.id
                              ? "bg-emerald-600 text-white"
                              : "bg-white text-gray-600 border border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700"
                          }`}
                          title={option.hint}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {type === "transfer" && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="text-[10px] text-gray-500">
                          Desde
                          <select
                            className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] dark:border-gray-700 dark:bg-gray-900"
                            value={sourceId}
                            onChange={(event) => setSourceId(event.target.value)}
                          >
                            <option value="">Cuenta…</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-[10px] text-gray-500">
                          Hacia
                          <select
                            className="mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] dark:border-gray-700 dark:bg-gray-900"
                            value={destId}
                            onChange={(event) => setDestId(event.target.value)}
                          >
                            <option value="">Cuenta…</option>
                            {accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}

                    {type === "transfer" && (
                      <p className="flex items-center gap-1 text-[10px] text-gray-400">
                        <ArrowLeftRight className="size-3" />
                        Se creará un pago recurrente mensual entre esas cuentas.
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Button
                        size="sm"
                        className="h-7 rounded-full px-3 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        disabled={working}
                        onClick={() => void create(candidate)}
                      >
                        {working ? (
                          <LoaderCircle className="size-3 animate-spin" />
                        ) : null}
                        Crear pago recurrente
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-full px-2 text-[11px] text-gray-500"
                        onClick={restart}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <p className="pt-1 text-center text-[10px] text-gray-400">
            Se detecta por comercio, monto e intervalo mensual. No es una lista de
            cobros confirmados.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
