"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, HandCoins, Plus, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";

interface Installment {
  id: string;
  number: number;
  amount: number;
  paidAmount: number;
  isPaid: boolean;
  dueDate: string;
  hasPayment: boolean;
}

interface PersonLoan {
  id: string;
  direction: "lent" | "borrowed";
  personName: string;
  amount: number;
  balance: number;
  status: string;
  installments: Installment[];
}

interface PersonLoansResponse {
  loans: PersonLoan[];
  summary: { lent: number; borrowed: number; net: number };
}

interface AccountOption {
  id: string;
  name: string;
}

/** F-25 · Préstamos entre personas, con cuotas, cobro y reversión. */
export function PersonLoansCard() {
  const [data, setData] = useState<PersonLoansResponse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [payFor, setPayFor] = useState<{ loanId: string; installment: Installment } | null>(null);
  const [payAccount, setPayAccount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [cuotas, setCuotas] = useState("1");

  const load = useCallback(
    () => apiFetch<PersonLoansResponse>("/api/person-loans").then(setData).catch(() => undefined),
    []
  );

  useEffect(() => {
    void load();
    apiFetch<unknown>("/api/accounts")
      .then((response) => {
        const list = Array.isArray(response)
          ? response
          : ((response as { accounts?: AccountOption[] })?.accounts ?? []);
        setAccounts(
          (list as Array<{ id: string; name: string }>).map((account) => ({
            id: account.id,
            name: account.name,
          }))
        );
      })
      .catch(() => setAccounts([]));
  }, [load]);

  const add = async () => {
    setError("");
    const value = Number(amount.replace(/[^\d]/g, ""));
    if (!personName.trim() || !value) {
      setError("Escribe persona y monto.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/person-loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          personName: personName.trim(),
          amount: value,
          installments: Number(cuotas) || 1,
        }),
      });
      if (!response.ok) throw new Error("No se pudo guardar.");
      setPersonName("");
      setAmount("");
      setCuotas("1");
      setAdding(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!payFor) return;
    if (!payAccount) {
      setError("Elige la cuenta.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/person-loans/${payFor.loanId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installmentId: payFor.installment.id,
          accountId: payAccount,
          date: payDate || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "No se pudo registrar el pago.");
      setPayFor(null);
      setPayDate("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo registrar el pago.");
    } finally {
      setBusy(false);
    }
  };

  const reverse = async (loan: PersonLoan, installment: Installment) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/person-loans/${loan.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installmentId: installment.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "No se pudo revertir.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo revertir.");
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
          <div className="space-y-2">
            {open.map((loan) => {
              const isOpen = expanded === loan.id;
              return (
                <div key={loan.id} className="rounded-xl border border-border/60 p-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => setExpanded(isOpen ? null : loan.id)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{loan.personName}</p>
                      <p className="text-[11px] text-gray-400">
                        {loan.direction === "lent" ? "me debe" : "le debo"} ·{" "}
                        {loan.installments.filter((row) => row.isPaid).length}/
                        {loan.installments.length} cuotas
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold quid-money">
                        {formatCurrency(loan.balance)}
                      </span>
                      {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                      {loan.installments.map((installment) => (
                        <div
                          key={installment.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="text-gray-500">
                            Cuota {installment.number} · {formatDate(installment.dueDate)}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className={installment.isPaid ? "text-emerald-600" : ""}>
                              {formatCurrency(installment.amount)}
                            </span>
                            {installment.isPaid ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void reverse(loan, installment)}
                                className="flex items-center gap-1 text-[11px] text-amber-600"
                              >
                                <Undo2 className="size-3" />
                                Revertir
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayFor({ loanId: loan.id, installment });
                                  setPayAccount(accounts[0]?.id ?? "");
                                  setError("");
                                }}
                                className="text-[11px] text-emerald-600"
                              >
                                Pagar
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
            <div className="flex gap-2">
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="numeric"
                placeholder="Monto"
                className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
              />
              <input
                value={cuotas}
                onChange={(event) => setCuotas(event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Cuotas"
                className="h-10 w-20 rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <Button className="w-full rounded-xl" disabled={busy} onClick={() => void add()}>
              Guardar
            </Button>
          </div>
        )}

        {error && <p className="text-xs text-rose-500">{error}</p>}
      </CardContent>

      {payFor && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-5 shadow-xl">
            <p className="font-semibold">
              Pagar cuota {payFor.installment.number} ·{" "}
              {formatCurrency(payFor.installment.amount)}
            </p>
            <select
              value={payAccount}
              onChange={(event) => setPayAccount(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">Elige la cuenta</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={payDate}
              onChange={(event) => setPayDate(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Se registra un movimiento y se mueve el saldo de la cuenta.
            </p>
            {error && <p className="text-sm text-rose-500">{error}</p>}
            <Button className="w-full rounded-xl" disabled={busy} onClick={() => void pay()}>
              {busy ? "Registrando…" : "Registrar pago"}
            </Button>
            <Button
              variant="ghost"
              className="w-full rounded-xl"
              onClick={() => setPayFor(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
