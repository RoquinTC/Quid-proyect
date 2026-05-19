"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency, formatDate, calcPercentage } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { SavingsGoalForm } from "./savings-goal-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Trash2,
  Plus,
  Calendar,
  Link2,
  Unlink,
  PiggyBank,
  Loader2,
  Wallet,
  Landmark,
  Pencil,
  ArrowRightLeft,
} from "lucide-react";
import { motion } from "framer-motion";
import type { SubAccount, SavingsGoalAccount, SavingsContribution, CDT, SavingsGoal, Account } from "@/lib/types";

const frequencyLabels: Record<string, string> = {
  mensual: "Mensual",
  quincenal: "Quincenal",
  semanal: "Semanal",
};

export function SavingsGoalDetail() {
  const { setFinanceSubView } = useAppStore();
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [selectedLinkValue, setSelectedLinkValue] = useState("");

  const selectedGoalId =
    typeof window !== "undefined" ? sessionStorage.getItem("selectedSavingsGoalId") : null;

  const fetchData = useCallback(async () => {
    try {
      const [goalsData, accountsData] = await Promise.all([
        apiFetch<SavingsGoal[]>("/api/savings"),
        apiFetch<Account[]>("/api/accounts"),
      ]);
      const found = goalsData.find((g) => g.id === selectedGoalId);
      setGoal(found || null);
      setAccounts(accountsData || []);
    } catch (error) {
      console.error("Error fetching goal detail:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedGoalId]);

  useEffect(() => {
    let cancelled = false;
    fetchData().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchData]);

  const handleLinkAccount = async () => {
    if (!goal || !selectedLinkValue) return;
    setLinking(true);
    try {
      let accountId = "";
      let subAccountId: string | null = null;

      if (selectedLinkValue.startsWith("sub-")) {
        subAccountId = selectedLinkValue.replace("sub-", "");
        const parentAcc = accounts.find((a) =>
          a.subAccounts.some((s) => s.id === subAccountId)
        );
        if (parentAcc) {
          accountId = parentAcc.id;
        }
      } else {
        accountId = selectedLinkValue;
      }

      await apiFetch(`/api/savings/${goal.id}/accounts`, {
        method: "POST",
        body: JSON.stringify({ accountId, subAccountId }),
      });

      await fetchData();
      setShowLinkDialog(false);
      setSelectedLinkValue("");
    } catch (error) {
      console.error("Error linking account:", error);
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkAccount = async (linkId: string) => {
    if (!goal) return;
    try {
      await apiFetch(`/api/savings/${goal.id}/accounts?linkId=${linkId}`, {
        method: "DELETE",
      });
      await fetchData();
    } catch (error) {
      console.error("Error unlinking account:", error);
    }
  };

  const handleDeleteGoal = async () => {
    if (!goal) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/savings/${goal.id}`, { method: "DELETE" });
      setFinanceSubView("savings");
    } catch (error) {
      console.error("Error deleting goal:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleEditSuccess = () => {
    fetchData();
    setShowEditForm(false);
  };

  // Determine balance preview for the selected link option
  const getSelectedLinkBalance = (): { name: string; balance: number } | null => {
    if (!selectedLinkValue) return null;
    if (selectedLinkValue.startsWith("sub-")) {
      const subId = selectedLinkValue.replace("sub-", "");
      for (const acc of accounts) {
        const sub = acc.subAccounts.find((s) => s.id === subId);
        if (sub) return { name: `${sub.name}`, balance: sub.balance };
      }
      return null;
    }
    const acc = accounts.find((a) => a.id === selectedLinkValue);
    return acc ? { name: acc.name, balance: acc.balance } : null;
  };

  const selectedLinkInfo = getSelectedLinkBalance();

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        <div className="h-8 w-24 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-500">Meta no encontrada</p>
        <Button
          variant="ghost"
          onClick={() => setFinanceSubView("savings")}
          className="mt-2"
        >
          <ArrowLeft className="size-4 mr-1" />
          Volver
        </Button>
      </div>
    );
  }

  const percentage = calcPercentage(goal.currentAmount, goal.targetAmount);
  const daysRemaining = goal.deadline
    ? Math.max(
        0,
        Math.ceil(
          (new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 space-y-4 pb-safe"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFinanceSubView("savings")}
          className="rounded-xl"
        >
          <ArrowLeft className="size-4 mr-1" />
          Volver
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-xl text-purple-500 hover:text-purple-600"
            onClick={() => setShowEditForm(true)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-xl text-red-500 hover:text-red-600"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Goal Header Card */}
      <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
        <div
          className="p-5 text-white relative"
          style={{ background: `linear-gradient(135deg, ${goal.color}, ${goal.color}BB)` }}
        >
          <div className="absolute -top-8 -right-8 size-32 rounded-full bg-white/10 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="size-5 text-white/80" />
              <h2 className="text-xl font-bold">{goal.name}</h2>
            </div>
            {goal.description && (
              <p className="text-xs text-white/70 mb-3">{goal.description}</p>
            )}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-white/60">Ahorrado</p>
                <p className="text-2xl font-bold">{formatCurrency(goal.currentAmount)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/60">Meta</p>
                <p className="text-sm font-medium text-white/80">
                  {formatCurrency(goal.targetAmount)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/70 rounded-full transition-all"
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-white/60 mt-1 text-right">{percentage}%</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Info Card */}
      <Card className="border-0 shadow-md rounded-2xl">
        <CardContent className="p-4 space-y-2">
          {daysRemaining !== null && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="size-3.5" />
              <span>{daysRemaining} día{daysRemaining !== 1 ? "s" : ""} restante{daysRemaining !== 1 ? "s" : ""}</span>
            </div>
          )}
          {goal.deadline && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="size-3.5" />
              <span>Fecha límite: {formatDate(goal.deadline)}</span>
            </div>
          )}
          {goal.frequency && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <PiggyBank className="size-3.5" />
              <span>Frecuencia: {frequencyLabels[goal.frequency] || goal.frequency}</span>
            </div>
          )}
          {goal.sourceAccount && goal.destinationAccount && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <ArrowRightLeft className="size-3.5" />
              <span>
                {goal.sourceAccount.name} → {goal.destinationAccount.name}
              </span>
            </div>
          )}
          {goal.aiSuggestion && (
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl mt-2">
              <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line">
                {goal.aiSuggestion}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CDTs Linked Section */}
      {goal.cdts && goal.cdts.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            CDTs Vinculados ({goal.cdts.length})
          </h3>
          {goal.cdts.map((cdt: any) => (
            <Card key={cdt.id} className="border-0 shadow-sm rounded-xl">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${cdt.color || "#14B8A6"}20` }}
                    >
                      <Landmark className="size-4" style={{ color: cdt.color || "#14B8A6" }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {cdt.bank}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        CDT · {cdt.effectiveRate}% EA · {cdt.termDays}d
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-teal-600 dark:text-teal-400">
                      {formatCurrency(cdt.amount)}
                    </span>
                    <p className="text-[10px] text-gray-400">Valor invertido (provisional)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <Card
            className="border-0 shadow-sm rounded-xl cursor-pointer bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20"
            onClick={() => setFinanceSubView("cdts")}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0">
                  <Landmark className="size-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-teal-700 dark:text-teal-400">
                    Potencia tu meta vinculando o creando un CDT
                  </p>
                  <p className="text-[11px] text-teal-600/70 dark:text-teal-500/70 mt-0.5">
                    Invierte a plazo fijo y genera rendimientos mientras ahorras para tu objetivo
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Linked Accounts Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Cuentas Vinculadas
          </h3>
          <Button
            size="sm"
            onClick={() => setShowLinkDialog(true)}
            className="rounded-xl bg-gradient-to-r from-purple-600 to-violet-500"
          >
            <Link2 className="size-3.5 mr-1" />
            Vincular
          </Button>
        </div>

        {goal.linkedAccounts && goal.linkedAccounts.length > 0 ? (
          <div className="space-y-2">
            {goal.linkedAccounts.map((link) => (
              <Card key={link.id} className="border-0 shadow-sm rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="size-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${link.account.color}20` }}
                      >
                        <Wallet className="size-4" style={{ color: link.account.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {link.subAccount
                            ? `${link.subAccount.name}`
                            : `${link.account.name}`}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {link.subAccount
                            ? link.account.name
                            : link.account.type}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {formatCurrency(
                          link.subAccount
                            ? link.subAccount.balance
                            : link.account.balance
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-gray-400 hover:text-red-500"
                        onClick={() => handleUnlinkAccount(link.id)}
                      >
                        <Unlink className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-0 shadow-sm rounded-xl">
            <CardContent className="p-6 text-center">
              <Link2 className="size-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                No hay cuentas vinculadas
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Vincula una cuenta para que su saldo cuente hacia tu meta
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Contributions Section */}
      {goal.contributions && goal.contributions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Historial de Aportes
          </h3>
          <Card className="border-0 shadow-sm rounded-xl">
            <CardContent className="p-0 max-h-64 overflow-y-auto">
              {goal.contributions.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-4 py-3 border-b last:border-b-0"
                >
                  <div>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {c.description || "Aporte"}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {formatDate(c.date)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      c.amount >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {c.amount >= 0 ? "+" : ""}
                    {formatCurrency(c.amount)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Form */}
      <SavingsGoalForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        editingGoal={goal}
        onSuccess={handleEditSuccess}
      />

      {/* Link Account Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Vincular Cuenta</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Selecciona una cuenta o subcuenta
              </label>
              <select
                value={selectedLinkValue}
                onChange={(e) => setSelectedLinkValue(e.target.value)}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Seleccionar...</option>
                {accounts.map((acc) => (
                  <optgroup key={acc.id} label={`${acc.name} — ${formatCurrency(acc.balance)}`}>
                    <option value={acc.id}>
                      Toda la cuenta — {formatCurrency(acc.balance)}
                    </option>
                    {acc.subAccounts.map((sub) => (
                      <option key={sub.id} value={`sub-${sub.id}`}>
                        {sub.name} — {formatCurrency(sub.balance)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Preview card */}
            {selectedLinkInfo && (
              <Card className="border-0 shadow-sm rounded-xl bg-purple-50 dark:bg-purple-900/20">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-700 dark:text-purple-400">
                        {selectedLinkInfo.name}
                      </p>
                      <p className="text-[10px] text-purple-500">se sumará a la meta</p>
                    </div>
                    <span className="text-base font-bold text-purple-700 dark:text-purple-400">
                      {formatCurrency(selectedLinkInfo.balance)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button
              onClick={handleLinkAccount}
              disabled={linking || !selectedLinkValue}
              className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-violet-500"
            >
              {linking ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Link2 className="size-4 mr-2" />
              )}
              Vincular Cuenta
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la meta &quot;{goal.name}&quot; y todo su historial. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGoal}
              disabled={deleting}
              className="rounded-xl bg-red-500 hover:bg-red-600"
            >
              {deleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
