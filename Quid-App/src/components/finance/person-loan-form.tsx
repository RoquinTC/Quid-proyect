"use client";

import { useEffect, useState } from "react";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

/**
 * F-25c · Alta de un préstamo entre personas.
 * Vive en el botón + de Finanzas. Genera las cuotas al guardar.
 */

interface AccountOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function PersonLoanForm({ open, onClose, onSaved }: Props) {
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState("1");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    apiFetch<unknown>("/api/accounts")
      .then((response) => {
        const list = Array.isArray(response)
          ? response
          : ((response as { accounts?: AccountOption[] })?.accounts ?? []);
        setAccounts(
          (list as Array<{ id: string; name: string }>)
            .filter((account) => account && account.id)
            .map((account) => ({ id: account.id, name: account.name }))
        );
      })
      .catch(() => setAccounts([]));
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setError("");
    const value = Number(amount.replace(/[^\d]/g, ""));
    const count = Number(installments) || 1;

    if (!personName.trim()) {
      setError("Escribe a quién.");
      return;
    }
    if (!value || value <= 0) {
      setError("Escribe un monto.");
      return;
    }
    if (count < 1 || count > 60) {
      setError("Las cuotas van de 1 a 60.");
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
          installments: count,
          accountId: accountId || null,
          firstDueDate: firstDueDate || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      setPersonName("");
      setAmount("");
      setInstallments("1");
      setFirstDueDate("");
      onSaved?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-5 shadow-xl">
        <div className="flex items-center gap-2">
          <HandCoins className="size-5 text-emerald-600 dark:text-emerald-400" />
          <p className="font-semibold">Préstamo entre personas</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDirection("lent")}
            className={`flex-1 rounded-lg px-2 py-2 text-xs ${direction === "lent" ? "bg-emerald-600 text-white" : "bg-muted"}`}
          >
            Me deben
          </button>
          <button
            type="button"
            onClick={() => setDirection("borrowed")}
            className={`flex-1 rounded-lg px-2 py-2 text-xs ${direction === "borrowed" ? "bg-rose-600 text-white" : "bg-muted"}`}
          >
            Debo
          </button>
        </div>

        <input
          value={personName}
          onChange={(event) => setPersonName(event.target.value)}
          placeholder="Persona"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        />
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="numeric"
          placeholder="Monto total"
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        />

        <div className="flex gap-2">
          <input
            value={installments}
            onChange={(event) => setInstallments(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Cuotas"
            className="h-11 w-24 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <input
            type="date"
            value={firstDueDate}
            onChange={(event) => setFirstDueDate(event.target.value)}
            className="h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
          />
        </div>

        <select
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
        >
          <option value="">Cuenta (opcional)</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        {error && <p className="text-sm text-rose-500">{error}</p>}

        <Button className="w-full rounded-xl" disabled={busy} onClick={() => void save()}>
          {busy ? "Guardando…" : "Guardar préstamo"}
        </Button>
        <Button variant="ghost" className="w-full rounded-xl" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
