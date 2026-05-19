"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogStickyFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { apiFetch, formatCurrency, calculateCDTInterest, getCDTBreakdown, getCurrentCDTInterest, getDaysBetween, calculateCDTReteFuente, getColombiaTodayString, toColombiaDateString } from "@/lib/api";
import { Loader2, TrendingUp, Landmark, Link2, Banknote } from "lucide-react";
import type { SubAccount, CDTGoal, CDTAccount, CDT } from "@/lib/types";

const colorOptions = [
  "#14B8A6", "#0D9488", "#10B981", "#22C55E",
  "#059669", "#0891B2", "#0EA5E9", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#64748B",
];

const termPresets = [
  { value: 30, label: "30 días" },
  { value: 60, label: "60 días" },
  { value: 90, label: "90 días" },
  { value: 180, label: "180 días" },
  { value: 360, label: "360 días" },
];

interface CDTFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  editCDT?: (CDT & { goal?: CDTGoal | null; account?: CDTAccount | null }) | null;
}

export function CDTForm({ open, onOpenChange, onSuccess, editCDT }: CDTFormProps) {
  const isEditing = !!editCDT;

  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [finalizeAmount, setFinalizeAmount] = useState("");
  const [finalizeAccountId, setFinalizeAccountId] = useState("");
  const [finalizeSubAccountId, setFinalizeSubAccountId] = useState("");
  const [finalizeDate, setFinalizeDate] = useState("");
  const [bank, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const [effectiveRate, setEffectiveRate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [termDays, setTermDays] = useState(0);
  const [goalId, setGoalId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState("#14B8A6");

  const [accounts, setAccounts] = useState<CDTAccount[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<CDTGoal[]>([]);

  // Load accounts and savings goals for dropdowns
  useEffect(() => {
    if (open) {
      apiFetch<CDTAccount[]>("/api/accounts")
        .then(setAccounts)
        .catch(console.error);

      apiFetch<CDTGoal[]>("/api/savings")
        .then(setSavingsGoals)
        .catch(console.error);
    }
  }, [open]);

  // Populate form when editing
  useEffect(() => {
    if (editCDT) {
      setBank(editCDT.bank);
      // Defensive Number() — editCDT.amount may be a Decimal string from the API
      setAmount(String(Number(editCDT.amount)));
      setEffectiveRate(String(Number(editCDT.effectiveRate)));
      setStartDate(editCDT.startDate ? editCDT.startDate.split("T")[0] : "");
      setEndDate(editCDT.endDate ? editCDT.endDate.split("T")[0] : "");
      setTermDays(editCDT.termDays);
      setGoalId(editCDT.goalId || "");
      setAccountId(editCDT.accountId || "");
      setNotes(editCDT.notes || "");
      setColor(editCDT.color || "#14B8A6");
    } else {
      resetForm();
    }
  }, [editCDT, open]);

  // Auto-calculate termDays when dates change
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diff > 0) {
        setTermDays(diff);
      }
    }
  }, [startDate, endDate]);

  // Preview: estimated interest at maturity (compound, correct for EA rate)
  const maturityBreakdown = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    const rate = parseFloat(effectiveRate) || 0;
    if (amt <= 0 || rate <= 0 || termDays <= 0) {
      return { grossInterest: 0, retefuente: 0, netInterest: 0, netTotal: 0 };
    }
    return getCDTBreakdown(amt, rate, termDays);
  }, [amount, effectiveRate, termDays]);

  // Current interest earned (compound, for preview while editing)
  const currentInterestEarned = useMemo(() => {
    const amt = parseFloat(amount) || 0;
    const rate = parseFloat(effectiveRate) || 0;
    if (amt <= 0 || rate <= 0 || !startDate) return 0;
    return getCurrentCDTInterest(amt, rate, startDate);
  }, [amount, effectiveRate, startDate]);

  const handleTermPreset = (days: number) => {
    if (!startDate) return;
    const start = new Date(startDate + "T12:00:00");
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    setEndDate(toColombiaDateString(end));
    setTermDays(days);
  };

  const handleSubmit = async () => {
    if (!bank || !amount || !effectiveRate || !startDate || !endDate) return;
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        bank,
        amount: parseFloat(amount),
        effectiveRate: parseFloat(effectiveRate),
        startDate,
        endDate,
        termDays,
        goalId: goalId || null,
        accountId: accountId || null,
        notes: notes || null,
        color,
      };

      if (isEditing && editCDT) {
        // Recalculate interestEarned on save
        payload.interestEarned = maturityBreakdown.grossInterest;
        await apiFetch(`/api/cdts/${editCDT.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/cdts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving CDT:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFinalize = () => {
    if (!editCDT) return;
    // Pre-fill with maturity breakdown net total
    setFinalizeAmount(String(Math.round(maturityBreakdown.netTotal)));
    setFinalizeAccountId(editCDT.accountId || "");
    setFinalizeSubAccountId("");
    setFinalizeDate(getColombiaTodayString());
    setShowFinalizeDialog(true);
  };

  const handleFinalize = async () => {
    if (!editCDT || !finalizeAccountId || !finalizeAmount) return;
    setWithdrawLoading(true);
    try {
      const withdrawalAmount = parseFloat(finalizeAmount);
      await apiFetch(`/api/cdts/${editCDT.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({
          withdrawnAmount: withdrawalAmount,
          withdrawnDate: finalizeDate,
          destinationAccountId: finalizeAccountId,
          destinationSubAccountId: finalizeSubAccountId || null,
        }),
      });
      onSuccess?.();
      onOpenChange(false);
      setShowFinalizeDialog(false);
      resetForm();
    } catch (error) {
      console.error("Error finalizing CDT:", error);
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleWithdraw = handleOpenFinalize;

  const handleDelete = async () => {
    if (!editCDT) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/cdts/${editCDT.id}`, {
        method: "DELETE",
      });
      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error deleting CDT:", error);
    } finally {
      setDeleteLoading(false);
    }
  };

  const resetForm = () => {
    setBank("");
    setAmount("");
    setEffectiveRate("");
    setStartDate("");
    setEndDate("");
    setTermDays(0);
    setGoalId("");
    setAccountId("");
    setNotes("");
    setColor("#14B8A6");
  };

  const showWithdrawButton = isEditing && (editCDT?.status === "matured" || editCDT?.status === "active");

  // Get the selected finalize account's subaccounts
  const finalizeAccount = accounts.find(a => a.id === finalizeAccountId);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl" scrollable>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>
            {isEditing ? "Editar CDT" : "Nuevo CDT"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Bank Name */}
          <div className="space-y-2">
            <Label>Banco</Label>
            <Input
              placeholder="Ej: Bancolombia"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>Monto Invertido</Label>
            <CurrencyInput value={amount} onChange={setAmount} showPrefix placeholder="0" className="rounded-xl" />
          </div>

          {/* Effective Rate */}
          <div className="space-y-2">
            <Label>Tasa Efectiva Anual (%EA)</Label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={effectiveRate}
                onChange={(e) => setEffectiveRate(e.target.value)}
                className="pr-8 rounded-xl"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                %
              </span>
            </div>
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label>Fecha de Apertura</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label>Fecha de Vencimiento</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Term Presets */}
          {startDate && (
            <div className="space-y-2">
              <Label>Plazo</Label>
              <div className="flex flex-wrap gap-2">
                {termPresets.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => handleTermPreset(p.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      termDays === p.value
                        ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 ring-1 ring-teal-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {termDays > 0 && (
                <p className="text-[10px] text-gray-400">
                  Plazo calculado: {termDays} días
                </p>
              )}
            </div>
          )}

          {/* Interest Preview */}
          {maturityBreakdown.grossInterest > 0 && (
            <Card className="border-0 shadow-sm rounded-xl bg-teal-50 dark:bg-teal-900/20">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingUp className="size-4 text-teal-600 dark:text-teal-400" />
                  <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                    Estimación al Vencimiento
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      Rendimientos
                    </span>
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                      +{formatCurrency(maturityBreakdown.grossInterest)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      Retefuente (4%)
                    </span>
                    <span className="text-xs font-bold text-red-500">
                      -{formatCurrency(maturityBreakdown.retefuente)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-teal-200/50 dark:border-teal-700/30">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      Recibirás al vencer
                    </span>
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      {formatCurrency(maturityBreakdown.netTotal)}
                    </span>
                  </div>
                </div>
                {isEditing && currentInterestEarned > 0 && (
                  <div className="mt-2 pt-2 border-t border-teal-200/50 dark:border-teal-700/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        Ganancia actual
                      </span>
                      <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400">
                        +{formatCurrency(currentInterestEarned)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Payout Account */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Banknote className="size-3.5" />
              Cuenta de Rendimientos (opcional)
            </Label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Sin cuenta asignada</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} — {formatCurrency(acc.balance)}
                </option>
              ))}
            </select>
          </div>

          {/* Link to Savings Goal */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Link2 className="size-3.5" />
              Vincular a Meta de Ahorro (opcional)
            </Label>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Sin vincular</option>
              {savingsGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  🎯 {goal.name} — {formatCurrency(goal.targetAmount)}
                </option>
              ))}
            </select>
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`size-8 rounded-full transition-transform ${
                    color === c ? "scale-125 ring-2 ring-offset-2 ring-gray-400" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              placeholder="Notas sobre este CDT..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl"
              rows={2}
            />
          </div>

          {/* Finalize/Withdraw Button */}
          {showWithdrawButton && (
            <Button
              onClick={handleOpenFinalize}
              disabled={withdrawLoading}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white"
            >
              {withdrawLoading ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Banknote className="size-4 mr-2" />
              )}
              Finalizar CDT
            </Button>
          )}
        </DialogBody>

        <DialogStickyFooter className="space-y-2">
          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !bank || !amount || !effectiveRate || !startDate || !endDate}
            className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-teal-500"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Landmark className="size-4 mr-2" />
            )}
            {isEditing ? "Guardar Cambios" : "Crear CDT"}
          </Button>

          {/* Delete Button (only when editing) */}
          {isEditing && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={deleteLoading}
              className="w-full rounded-xl text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
            >
              {deleteLoading ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : null}
              Eliminar CDT
            </Button>
          )}
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>

    {/* Finalize CDT Dialog */}
    <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
      <DialogContent className="sm:max-w-md rounded-2xl" scrollable>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Finalizar CDT — {editCDT?.bank}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Maturity Breakdown */}
          <Card className="border-0 shadow-sm rounded-xl bg-teal-50 dark:bg-teal-900/20">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="size-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                  Desglose al Vencimiento
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">Valor invertido</span>
                  <span className="text-xs font-bold text-gray-900 dark:text-white">{formatCurrency(editCDT?.amount ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">Rendimientos</span>
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400">+{formatCurrency(maturityBreakdown.grossInterest)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">Retefuente (4%)</span>
                  <span className="text-xs font-bold text-red-500">-{formatCurrency(maturityBreakdown.retefuente)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-teal-200/50 dark:border-teal-700/30">
                  <span className="text-[10px] text-gray-500 font-medium">Total esperado</span>
                  <span className="text-xs font-bold text-gray-900 dark:text-white">{formatCurrency(maturityBreakdown.netTotal)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actual Received Amount (editable) */}
          <div className="space-y-2">
            <Label>Valor recibido real</Label>
            <CurrencyInput value={finalizeAmount} onChange={setFinalizeAmount} showPrefix placeholder="0" className="rounded-xl" />
            <p className="text-[10px] text-gray-400">Edita si el valor real difiere del esperado</p>
          </div>

          {/* Date of withdrawal */}
          <div className="space-y-2">
            <Label>Fecha de retiro</Label>
            <Input
              type="date"
              value={finalizeDate}
              onChange={(e) => setFinalizeDate(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Destination Account */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Banknote className="size-3.5" />
              Cuenta destino
            </Label>
            <select
              value={finalizeAccountId}
              onChange={(e) => {
                setFinalizeAccountId(e.target.value);
                setFinalizeSubAccountId("");
              }}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Selecciona una cuenta</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} — {formatCurrency(acc.balance)}
                </option>
              ))}
            </select>
          </div>

          {/* Destination SubAccount (optional) */}
          {finalizeAccount && finalizeAccount.subAccounts && finalizeAccount.subAccounts.length > 0 && (
            <div className="space-y-2">
              <Label>Subcuenta destino (opcional)</Label>
              <select
                value={finalizeSubAccountId}
                onChange={(e) => setFinalizeSubAccountId(e.target.value)}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Cuenta principal</option>
                {finalizeAccount.subAccounts.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    🐷 {sub.name} — {formatCurrency(sub.balance)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Warning about goal update */}
          {editCDT?.goalId && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Este CDT está vinculado a la meta &quot;{editCDT.goal?.name}&quot;. Al finalizar, se actualizará el valor provisional de la meta y se registrará el aporte real a la cuenta destino.
              </p>
            </div>
          )}
        </DialogBody>

        <DialogStickyFooter>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setShowFinalizeDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white"
              onClick={handleFinalize}
              disabled={withdrawLoading || !finalizeAccountId || !finalizeAmount}
            >
              {withdrawLoading ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Banknote className="size-4 mr-2" />
              )}
              Finalizar CDT
            </Button>
          </div>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
