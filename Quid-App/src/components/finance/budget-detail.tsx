"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Receipt,
  Lightbulb,
  Loader2,
  CreditCard,
} from "lucide-react";
import type { Budget } from "@/lib/types";

// ── Movement type (same as budgets-view) ──
interface BudgetMovement {
  id: string;
  source: "transaction" | "installment";
  type: string;
  amount: number;
  description: string;
  category: string | null;
  subCategory: string | null;
  date: string;
  accountName?: string | null;
  accountId?: string | null;
  debtId?: string | null;
  debtName?: string | null;
  debtColor?: string | null;
  isPaid?: boolean | null;
  currentInstallment?: number | null;
  totalInstallments?: number | null;
}

interface BudgetDetailProps {
  budgetId?: string;
  onBack?: () => void;
}

export function BudgetDetail({ budgetId, onBack }: BudgetDetailProps) {
  const [movements, setMovements] = useState<BudgetMovement[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBudgetDetail = useCallback(async () => {
    if (!budgetId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch budget details
      const budgets = await apiFetch<Budget[]>("/api/budgets");
      const foundBudget = budgets.find((b) => b.id === budgetId);
      setBudget(foundBudget || null);

      if (!foundBudget) {
        setLoading(false);
        return;
      }

      // Fetch movements using the movements API (includes CC installments)
      const params = new URLSearchParams({
        category: foundBudget.category,
        type: foundBudget.type,
      });
      if (foundBudget.subCategory) {
        params.set("subCategory", foundBudget.subCategory);
      }

      const data = await apiFetch<{
        movements: BudgetMovement[];
        total: number;
        totalAmount: number;
      }>(`/api/budgets/movements?${params.toString()}`);

      setMovements(data.movements || []);
    } catch (error) {
      console.error("Error fetching budget detail:", error);
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    let cancelled = false;
    fetchBudgetDetail().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [fetchBudgetDetail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="p-4 space-y-4 pb-24">
        <Card className="border-0 shadow-sm rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="size-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Consejos para tu presupuesto
              </span>
            </div>
            <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <li>• Registra todos tus gastos diarios</li>
              <li>• Revisa tu presupuesto cada semana</li>
              <li>• Usa la regla 50/30/20 para distribuir ingresos</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  const percentage =
    budget.amount > 0
      ? Math.min((budget.spent / budget.amount) * 100, 100)
      : 0;
  const isOverBudget = budget.amount > 0 && budget.spent > budget.amount;
  const remaining = budget.amount - budget.spent;

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Back button */}
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="size-4" />
          Volver
        </Button>
      )}

      {/* Budget summary card */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">{budget.category}</h3>
              {budget.subCategory && (
                <p className="text-xs text-gray-500">{budget.subCategory}</p>
              )}
            </div>
            <Badge
              variant={isOverBudget ? "destructive" : "secondary"}
              className="text-[10px]"
            >
              {budget.type === "income" ? "Ingreso" : "Gasto"}
            </Badge>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">
                {formatCurrency(budget.spent)} de {formatCurrency(budget.amount)}
              </span>
              <span
                className={
                  isOverBudget ? "text-red-500 font-medium" : "text-gray-500"
                }
              >
                {percentage.toFixed(0)}%
              </span>
            </div>
            <Progress value={percentage} className="h-2" />
          </div>

          {budget.amount > 0 && (
            <p
              className={`text-xs font-medium ${
                remaining >= 0 ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {remaining >= 0
                ? `Disponible: ${formatCurrency(remaining)}`
                : `Sobrepasado: ${formatCurrency(Math.abs(remaining))}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Movements list (transactions + CC installments) */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
          Movimientos del periodo
        </h4>

        {movements.length === 0 ? (
          <Card className="border-0 shadow-sm rounded-2xl">
            <CardContent className="p-4 text-center">
              <Receipt className="size-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">
                No hay movimientos en este periodo
              </p>
            </CardContent>
          </Card>
        ) : (
          movements.map((movement) => {
            const isIncome = movement.type === "income";
            const isInstallment = movement.source === "installment";

            return (
              <Card
                key={`${movement.source}-${movement.id}`}
                className="border-0 shadow-sm rounded-2xl"
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`size-8 rounded-full flex items-center justify-center shrink-0 ${
                        isInstallment
                          ? "bg-violet-100 dark:bg-violet-900/30"
                          : isIncome
                          ? "bg-emerald-100 dark:bg-emerald-900/30"
                          : "bg-rose-100 dark:bg-rose-900/30"
                      }`}
                    >
                      {isInstallment ? (
                        <CreditCard className="size-4 text-violet-600 dark:text-violet-400" />
                      ) : isIncome ? (
                        <TrendingUp className="size-4 text-emerald-600" />
                      ) : (
                        <TrendingDown className="size-4 text-rose-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {movement.description}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(movement.date).toLocaleDateString("es-CO", {
                          day: "numeric",
                          month: "short",
                        })}
                        {isInstallment && movement.debtName && (
                          <span
                            style={{
                              color: movement.debtColor || "#8B5CF6",
                            }}
                          >
                            {" "}
                            · {movement.debtName}
                          </span>
                        )}
                        {isInstallment &&
                          movement.totalInstallments &&
                          movement.totalInstallments > 1 && (
                            <span>
                              {" "}
                              · Cuota {movement.currentInstallment}/
                              {movement.totalInstallments}
                            </span>
                          )}
                        {!isInstallment && movement.accountName && (
                          <span> · {movement.accountName}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`text-sm font-semibold ${
                        isIncome
                          ? "text-emerald-600"
                          : "text-rose-500"
                      }`}
                    >
                      {isIncome ? "+" : "-"}
                      {formatCurrency(movement.amount)}
                    </span>
                    {isInstallment && (
                      <p className="text-[8px] text-violet-500">
                        TC {movement.isPaid ? "✓" : "pend."}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Tips card */}
      <Card className="border-0 shadow-sm rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="size-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Consejos para tu presupuesto
            </span>
          </div>
          <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
            <li>• Registra todos tus gastos diarios</li>
            <li>• Revisa tu presupuesto cada semana</li>
            <li>• Usa la regla 50/30/20 para distribuir ingresos</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
