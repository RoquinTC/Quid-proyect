"use client";

import { useEffect, useState } from "react";
import { HandCoins, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch, formatCurrency } from "@/lib/api";

interface PersonLoan {
  id: string;
  direction: "lent" | "borrowed";
  personName: string;
  amount: number;
  balance: number;
  status: string;
}

interface PersonLoansResponse {
  loans: PersonLoan[];
  summary: { lent: number; borrowed: number; net: number };
}

/** F-25 · Préstamos entre personas: me deben / debo. */
export function PersonLoansCard() {
  const [data, setData] = useState<PersonLoansResponse | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  const load = () =>
    apiFetch<PersonLoansResponse>("/api/person-loans")
      .then(setData)
      .catch(() => undefined);

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    setError("");
    const value = Number(amount.replace(/[^\d]/g, ""));
    if (!personName.trim()) {
      setError("Escribe a quién.");
      return;
    }
    if (!value || value <= 0) {
      setError("Escribe un monto.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/person-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, personName: personName.trim(), amount: value }),
      });
      if (!response.ok) throw new Error("No se pudo guardar.");
      setPersonName("");
      setAmount("");
      setAdding(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const settle = async (loan: PersonLoan) => {
    setBusy(true);
    try {
      await fetch(`/api/person-loans/${loan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment: loan.balance }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;

  const open = data.loans.filter((loan) => loan.status !== "settled");

  return (
    <Card className="border-0 shadow-sm rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HandCoins className="size-4 text-emerald-500" />
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Préstamos entre personas
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
            className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
          >
            <Plus className="size-3.5" />
            Agregar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-2">
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Me deben</p>
            <p className="font-semibold quid-money">{formatCurrency(data.summary.lent)}</p>
          </div>
          <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 p-2">
            <p className="text-[11px] text-rose-700 dark:text-rose-300">Debo</p>
            <p className="font-semibold quid-money">{formatCurrency(data.summary.borrowed)}</p>
          </div>
        </div>

        {open.length === 0 ? (
          <p className="text-xs text-gray-400">Nada pendiente entre personas.</p>
        ) : (
          <div className="space-y-1.5">
            {open.map((loan) => (
              <div key={loan.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{loan.personName}</p>
                  <p className="text-[11px] text-gray-400">
                    {loan.direction === "lent" ? "me debe" : "le debo"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold quid-money">{formatCurrency(loan.balance)}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void settle(loan)}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400"
                  >
                    Saldar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {adding && (
          <div className="space-y-2 border-t border-border pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection("lent")}
                className={`flex-1 rounded-lg px-2 py-1 text-xs ${direction === "lent" ? "bg-emerald-600 text-white" : "bg-muted"}`}
              >
                Me deben
              </button>
              <button
                type="button"
                onClick={() => setDirection("borrowed")}
                className={`flex-1 rounded-lg px-2 py-1 text-xs ${direction === "borrowed" ? "bg-rose-600 text-white" : "bg-muted"}`}
              >
                Debo
              </button>
            </div>
            <input
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="Persona"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              placeholder="Monto"
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <Button className="w-full rounded-xl" disabled={busy} onClick={() => void add()}>
              Guardar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
