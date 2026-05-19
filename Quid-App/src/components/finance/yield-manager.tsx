"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Check, Edit3, ChevronDown, ChevronUp, Undo2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface YieldItem {
  id: string | null;
  accountId: string | null;
  subAccountId: string | null;
  parentAccountId: string | null;
  accountName: string;
  balance: number;
  yieldPercentage: number;
  projectedYield: number;
  actualYield: number | null;
  isConfirmed: boolean;
  transactionId: string | null;
  isPreviousMonth?: boolean;
  previousMonth?: string; // ISO date string from API
}

interface YieldManagerProps {
  accounts: Array<{
    id: string;
    name: string;
    isHighYield: boolean;
    yieldPercentage?: number | null;
    balance: number;
  }>;
}

/**
 * Returns how many days remain until the end of the current month
 * using Colombia timezone (America/Bogota).
 * Returns 0 on the last day of the month.
 */
function getDaysUntilMonthEnd(): number {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const currentDay = now.getDate();
  return lastDayOfMonth - currentDay;
}

export function YieldManager({ accounts }: YieldManagerProps) {
  const [yields, setYields] = useState<YieldItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPendingExpanded, setIsPendingExpanded] = useState(true);
  const [isConfirmedExpanded, setIsConfirmedExpanded] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [confirmReverseId, setConfirmReverseId] = useState<string | null>(null);

  const fetchYields = useCallback(async () => {
    try {
      const data = await apiFetch<YieldItem[]>("/api/yield");
      setYields(data);
    } catch (error) {
      console.error("Error fetching yields:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchYields().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchYields]);

  const handleConfirm = async (item: YieldItem) => {
    const actualYield = editingId === (item.accountId || item.subAccountId)
      ? parseFloat(editValue) || item.projectedYield
      : item.actualYield || item.projectedYield;

    try {
      const result = await apiFetch<{
        id: string;
        updatedBalance?: number;
        updatedAccountName?: string;
      }>("/api/yield", {
        method: "POST",
        body: JSON.stringify({
          yieldRecordId: item.id,
          accountId: item.accountId,
          subAccountId: item.subAccountId,
          actualYield,
          yieldPercentage: item.yieldPercentage,
          projectedYield: item.projectedYield,
          parentAccountId: item.parentAccountId,
        }),
      });

      // Show floating notification with updated balance
      if (result.updatedAccountName && result.updatedBalance !== undefined) {
        toast.success(result.updatedAccountName, {
          description: `Nuevo saldo: ${formatCurrency(result.updatedBalance)}`,
          duration: 4000,
        });
      }

      fetchYields();
      setEditingId(null);
    } catch (error) {
      console.error("Error confirming yield:", error);
    }
  };

  const handleReverse = async (item: YieldItem) => {
    if (!item.id) return;

    try {
      setReversingId(item.id);
      await apiFetch("/api/yield/reverse", {
        method: "POST",
        body: JSON.stringify({ yieldRecordId: item.id }),
      });

      fetchYields();
      setConfirmReverseId(null);
    } catch (error) {
      console.error("Error reversing yield:", error);
    } finally {
      setReversingId(null);
    }
  };

  // Only return null if still loading or truly no data at all.
  // Even if current-month projected yields are 0, previous unconfirmed
  // or confirmed records should still be displayed.
  if (loading) return null;
  if (yields.length === 0) return null;

  const daysUntilMonthEnd = getDaysUntilMonthEnd();
  const isNearMonthEnd = daysUntilMonthEnd <= 2;

  const pendingYields = yields.filter((y) => !y.isConfirmed);
  const confirmedYields = yields.filter((y) => y.isConfirmed);
  // Separate previous month unconfirmed yields from current month pending yields
  const previousMonthPending = pendingYields.filter((y) => y.isPreviousMonth);
  const currentMonthPending = pendingYields.filter((y) => !y.isPreviousMonth);
  const totalProjected = pendingYields.reduce((sum, y) => sum + y.projectedYield, 0);
  const totalConfirmed = confirmedYields.reduce((sum, y) => sum + (y.actualYield || 0), 0);
  const confirmedCount = confirmedYields.length;

  return (
    <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 overflow-hidden">
      <CardContent className="p-0">
        {/* Collapsible Header - always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-center justify-between hover:bg-emerald-100/50 dark:hover:bg-emerald-800/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <TrendingUp className="size-4 text-white" />
            </div>
            <div className="text-left">
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Rendimientos del Mes
              </span>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {yields.length} cuenta{yields.length !== 1 ? "s" : ""} · {confirmedCount}/{yields.length} confirmado{confirmedCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(totalConfirmed || totalProjected)}
              </p>
              <p className="text-[10px] text-gray-400">
                {totalConfirmed > 0 ? "Total confirmado" : "Proyectado"}
              </p>
            </div>
            <div className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
              <ChevronDown className="size-4" />
            </div>
          </div>
        </button>

        {/* Expandable Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3">
                <div className="h-px bg-emerald-200 dark:bg-emerald-800/50" />

                {/* Previous Month Pending Section — ALWAYS visible when there are overdue yields */}
                {previousMonthPending.length > 0 && (
                  <div>
                    <button
                      onClick={() => setIsPendingExpanded(!isPendingExpanded)}
                      className="w-full flex items-center justify-between py-1.5 mb-2"
                    >
                      <div className="flex items-center gap-2">
                        {isPendingExpanded ? (
                          <ChevronUp className="size-3.5 text-red-500" />
                        ) : (
                          <ChevronDown className="size-3.5 text-red-500" />
                        )}
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                          Pendientes Anteriores
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700 h-5 px-1.5"
                        >
                          {previousMonthPending.length}
                        </Badge>
                      </div>
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">
                        {formatCurrency(previousMonthPending.reduce((s, y) => s + y.projectedYield, 0))}
                      </span>
                    </button>

                    <AnimatePresence>
                      {isPendingExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden space-y-2"
                        >
                          {previousMonthPending.map((item) => {
                            const itemKey = `prev-${item.accountId || item.subAccountId || ""}`;
                            const isEditing = editingId === itemKey;
                            const monthLabel = item.previousMonth
                              ? new Date(item.previousMonth).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
                              : 'Mes anterior';

                            return (
                              <div
                                key={itemKey}
                                className="p-3 bg-red-50/60 dark:bg-red-900/10 rounded-xl border border-red-200/50 dark:border-red-800/30"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {item.accountName}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700"
                                  >
                                    Mes anterior
                                  </Badge>
                                </div>

                                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                  <span>
                                    Balance: {formatCurrency(item.balance)} · {item.yieldPercentage}% anual
                                  </span>
                                  <span>Proyectado: {formatCurrency(item.projectedYield)}</span>
                                </div>
                                <p className="text-[10px] text-red-500 dark:text-red-400 mb-2">
                                  Pendiente de {monthLabel}
                                </p>

                                <div className="flex items-center gap-2">
                                  {isEditing ? (
                                    <>
                                      <div className="relative flex-1">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                                          $
                                        </span>
                                        <Input
                                          type="number"
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          className="pl-5 h-8 text-xs rounded-lg"
                                          placeholder={item.projectedYield.toString()}
                                        />
                                      </div>
                                      <Button
                                        size="sm"
                                        className="h-8 rounded-lg bg-emerald-500 text-xs"
                                        onClick={() => handleConfirm(item)}
                                      >
                                        <Check className="size-3" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(item.projectedYield)}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-[10px] rounded-lg"
                                        onClick={() => {
                                          setEditingId(itemKey);
                                          setEditValue(item.projectedYield.toString());
                                        }}
                                      >
                                        <Edit3 className="size-3 mr-1" />
                                        Editar
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="h-7 text-[10px] rounded-lg bg-emerald-500"
                                        onClick={() => handleConfirm(item)}
                                      >
                                        Confirmar
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Current Month Pending Section - only visible near month-end */}
                {currentMonthPending.length > 0 && (
                  <div>
                    {isNearMonthEnd ? (
                      <>
                        <button
                          onClick={() => setIsPendingExpanded(!isPendingExpanded)}
                          className="w-full flex items-center justify-between py-1.5 mb-2"
                        >
                          <div className="flex items-center gap-2">
                            {isPendingExpanded ? (
                              <ChevronUp className="size-3.5 text-amber-500" />
                            ) : (
                              <ChevronDown className="size-3.5 text-amber-500" />
                            )}
                            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                              Pendientes
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700 h-5 px-1.5"
                            >
                              {currentMonthPending.length}
                            </Badge>
                          </div>
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            {formatCurrency(currentMonthPending.reduce((s, y) => s + y.projectedYield, 0))}
                          </span>
                        </button>

                        <AnimatePresence>
                          {isPendingExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden space-y-2"
                            >
                              {currentMonthPending.map((item) => {
                                const itemKey = item.accountId || item.subAccountId || "";
                                const isEditing = editingId === itemKey;

                                return (
                                  <div
                                    key={itemKey}
                                    className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl"
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {item.accountName}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700"
                                      >
                                        Pendiente
                                      </Badge>
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                      <span>
                                        Balance: {formatCurrency(item.balance)} · {item.yieldPercentage}% anual
                                      </span>
                                      <span>Proyectado: {formatCurrency(item.projectedYield)}</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      {isEditing ? (
                                        <>
                                          <div className="relative flex-1">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                                              $
                                            </span>
                                            <Input
                                              type="number"
                                              value={editValue}
                                              onChange={(e) => setEditValue(e.target.value)}
                                              className="pl-5 h-8 text-xs rounded-lg"
                                              placeholder={item.projectedYield.toString()}
                                            />
                                          </div>
                                          <Button
                                            size="sm"
                                            className="h-8 rounded-lg bg-emerald-500 text-xs"
                                            onClick={() => handleConfirm(item)}
                                          >
                                            <Check className="size-3" />
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                                            {formatCurrency(item.projectedYield)}
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px] rounded-lg"
                                            onClick={() => {
                                              setEditingId(itemKey);
                                              setEditValue(item.projectedYield.toString());
                                            }}
                                          >
                                            <Edit3 className="size-3 mr-1" />
                                            Editar
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="h-7 text-[10px] rounded-lg bg-emerald-500"
                                            onClick={() => handleConfirm(item)}
                                          >
                                            Confirmar
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    ) : (
                      /* Not near month-end: show teaser with projected total */
                      <div className="py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-amber-500/70 dark:text-amber-400/70">
                              {currentMonthPending.length} pendiente{currentMonthPending.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            Se mostrarán {daysUntilMonthEnd === 1 ? "mañana" : `en ${daysUntilMonthEnd} días`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Confirmed Section */}
                {confirmedYields.length > 0 && (
                  <div>
                    <button
                      onClick={() => setIsConfirmedExpanded(!isConfirmedExpanded)}
                      className="w-full flex items-center justify-between py-1.5 mb-2"
                    >
                      <div className="flex items-center gap-2">
                        {isConfirmedExpanded ? (
                          <ChevronUp className="size-3.5 text-emerald-500" />
                        ) : (
                          <ChevronDown className="size-3.5 text-emerald-500" />
                        )}
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Confirmados
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700 h-5 px-1.5"
                        >
                          {confirmedYields.length}
                        </Badge>
                      </div>
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totalConfirmed)}
                      </span>
                    </button>

                    <AnimatePresence>
                      {isConfirmedExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden space-y-2"
                        >
                          {confirmedYields.map((item) => {
                            const itemKey = `confirmed-${item.id || item.accountId || item.subAccountId || ""}`;
                            const isReversing = reversingId === item.id;
                            const isConfirmingReverse = confirmReverseId === item.id;
                            const monthLabel = item.previousMonth
                              ? new Date(item.previousMonth).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
                              : null;

                            return (
                              <div
                                key={itemKey}
                                className="p-3 bg-white/60 dark:bg-gray-800/60 rounded-xl"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {item.accountName}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700"
                                  >
                                    {monthLabel ? monthLabel : "Confirmado"}
                                  </Badge>
                                </div>

                                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                                  <span>
                                    {item.yieldPercentage}% anual
                                  </span>
                                </div>

                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Check className="size-4 text-emerald-500" />
                                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                      {formatCurrency(item.actualYield || 0)}
                                    </span>
                                  </div>

                                  {isConfirmingReverse ? (
                                    <div className="flex items-center gap-1.5">
                                      <AlertTriangle className="size-3.5 text-red-500" />
                                      <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                                        ¿Revertir?
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-[10px] rounded-lg border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 px-2"
                                        onClick={() => handleReverse(item)}
                                        disabled={isReversing}
                                      >
                                        {isReversing ? "..." : "Sí"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 text-[10px] rounded-lg px-2"
                                        onClick={() => setConfirmReverseId(null)}
                                        disabled={isReversing}
                                      >
                                        No
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-[10px] rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20"
                                      onClick={() => setConfirmReverseId(item.id || null)}
                                    >
                                      <Undo2 className="size-3 mr-1" />
                                      Revertir
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
