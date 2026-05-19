"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { AlertTriangle, Clock, CreditCard, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import type { Budget, RecurringPayment } from "@/lib/types";

interface Alert {
  id: string;
  type: "overdue" | "budget_limit" | "yield_ready";
  message: string;
  action: () => void;
}

export function SmartAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const { setFinanceSubView } = useAppStore();

  const fetchAlerts = useCallback(async () => {
    try {
      const [budgets, recurring] = await Promise.allSettled([
        apiFetch<Budget[]>("/api/budgets"),
        apiFetch<RecurringPayment[]>("/api/recurring"),
      ]);

      const newAlerts: Alert[] = [];

      // 1. Overdue recurring payments
      if (recurring.status === "fulfilled") {
        const now = new Date();
        const overdue = recurring.value.filter(
          (r) =>
            r.status === "pending" &&
            new Date(r.scheduledDate) <= now
        );
        if (overdue.length > 0) {
          newAlerts.push({
            id: "overdue-recurring",
            type: "overdue",
            message: `${overdue.length} pago${overdue.length > 1 ? "s" : ""} recurrente${overdue.length > 1 ? "s" : ""} vencido${overdue.length > 1 ? "s" : ""} · ${formatCurrency(overdue.reduce((s, r) => s + r.amount, 0))}`,
            action: () => setFinanceSubView("recurring"),
          });
        }
      }

      // 2. Budget near limit (>=90%)
      if (budgets.status === "fulfilled") {
        const nearLimit = budgets.value.filter(
          (b) =>
            b.type === "expense" &&
            b.amount > 0 &&
            b.spent / b.amount >= 0.9
        );
        if (nearLimit.length > 0) {
          const names = nearLimit
            .slice(0, 2)
            .map((b) => b.category)
            .join(", ");
          newAlerts.push({
            id: "budget-limit",
            type: "budget_limit",
            message: `Presupuesto al límite: ${names}${nearLimit.length > 2 ? ` +${nearLimit.length - 2} más` : ""}`,
            action: () => setFinanceSubView("budgets"),
          });
        }
      }

      // 3. Yield ready to confirm (near month end)
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      if (now.getDate() >= lastDay - 1) {
        newAlerts.push({
          id: "yield-ready",
          type: "yield_ready",
          message: "Rendimientos listos para confirmar · Fin de mes",
          action: () => {}, // Stay on accounts page, yields are visible
        });
      }

      setAlerts(newAlerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    } finally {
      setLoading(false);
    }
  }, [setFinanceSubView]);

  useEffect(() => {
    let cancelled = false;
    fetchAlerts().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchAlerts]);

  if (loading || alerts.length === 0) return null;

  const iconMap = {
    overdue: Clock,
    budget_limit: AlertTriangle,
    yield_ready: TrendingUp,
  };

  const colorMap = {
    overdue: {
      bg: "bg-rose-50 dark:bg-rose-900/20",
      border: "border-rose-200 dark:border-rose-800",
      icon: "text-rose-500",
      text: "text-rose-700 dark:text-rose-300",
    },
    budget_limit: {
      bg: "bg-amber-50 dark:bg-amber-900/20",
      border: "border-amber-200 dark:border-amber-800",
      icon: "text-amber-500",
      text: "text-amber-700 dark:text-amber-300",
    },
    yield_ready: {
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
      border: "border-emerald-200 dark:border-emerald-800",
      icon: "text-emerald-500",
      text: "text-emerald-700 dark:text-emerald-300",
    },
  };

  return (
    <div className="space-y-1.5">
      {alerts.map((alert, i) => {
        const Icon = iconMap[alert.type];
        const colors = colorMap[alert.type];
        return (
          <motion.button
            key={alert.id}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={alert.action}
            className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border ${colors.bg} ${colors.border} transition-shadow hover:shadow-sm`}
          >
            <Icon className={`size-4 ${colors.icon} shrink-0`} />
            <span className={`text-[11px] font-medium ${colors.text} text-left flex-1`}>
              {alert.message}
            </span>
            {alert.type !== "yield_ready" && (
              <CreditCard className="size-3 text-gray-300 dark:text-gray-600 shrink-0" />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
