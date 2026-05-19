"use client";

import { useMemo, useState } from "react";
import { formatCurrency, parseLocalDate } from "@/lib/api";
import {
  Utensils,
  Car,
  Home,
  Heart,
  Gamepad2,
  GraduationCap,
  Shirt,
  Receipt,
  CreditCard,
  PiggyBank,
  Briefcase,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Tag,
  Wallet,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Transaction } from "@/lib/types";

const categoryIcons: Record<string, typeof DollarSign> = {
  Alimentación: Utensils,
  Transporte: Car,
  Vivienda: Home,
  Salud: Heart,
  Entretenimiento: Gamepad2,
  Educación: GraduationCap,
  Ropa: Shirt,
  Servicios: Receipt,
  Deudas: CreditCard,
  Ahorros: PiggyBank,
  Salario: Briefcase,
  Freelance: Briefcase,
  Inversiones: DollarSign,
  Ventas: DollarSign,
};

const CATEGORY_COLORS: Record<string, string> = {
  Vivienda: "#10B981",
  Alimentación: "#F59E0B",
  Supermercado: "#F59E0B",
  Transporte: "#3B82F6",
  Entretenimiento: "#8B5CF6",
  Ahorros: "#8B5CF6",
  Suscripciones: "#EC4899",
  Salud: "#EF4444",
  Inversiones: "#06B6D4",
  Educación: "#14B8A6",
  Deudas: "#EF4444",
  Ropa: "#F97316",
  Servicios: "#6366F1",
  Salario: "#10B981",
  Freelance: "#06B6D4",
  Ventas: "#D946EF",
  Otros: "#6B7280",
};

interface CategoryBreakdownProps {
  transactions: Transaction[];
}

interface SubCategoryGroup {
  name: string;
  amount: number;
  count: number;
}

interface CategoryGroup {
  name: string;
  amount: number;
  count: number;
  color: string;
  icon: typeof DollarSign;
  subcategories: SubCategoryGroup[];
}

export function CategoryBreakdown({ transactions }: CategoryBreakdownProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { categoryGroups, totalExpenses, totalIncome } = useMemo(() => {
    const expenseMap = new Map<string, Map<string, { amount: number; count: number }>>();
    let totalExp = 0;
    let totalInc = 0;

    for (const tx of transactions) {
      const cat = tx.category || "Sin categoría";
      const sub = tx.subCategory || "";

      if (tx.type === "expense") {
        totalExp += tx.amount;
      } else if (tx.type === "income") {
        totalInc += tx.amount;
      }

      // Only group expenses in this view
      if (tx.type !== "expense") continue;

      if (!expenseMap.has(cat)) {
        expenseMap.set(cat, new Map());
      }
      const subMap = expenseMap.get(cat)!;

      const existing = subMap.get(sub) || { amount: 0, count: 0 };
      subMap.set(sub, {
        amount: existing.amount + tx.amount,
        count: existing.count + 1,
      });
    }

    const groups: CategoryGroup[] = Array.from(expenseMap.entries())
      .map(([cat, subMap]) => {
        let totalAmount = 0;
        let totalCount = 0;
        const subcategories: SubCategoryGroup[] = [];

        for (const [sub, data] of subMap.entries()) {
          totalAmount += data.amount;
          totalCount += data.count;
          if (sub) {
            subcategories.push({ name: sub, amount: data.amount, count: data.count });
          }
        }

        return {
          name: cat,
          amount: totalAmount,
          count: totalCount,
          color: CATEGORY_COLORS[cat] || "#6B7280",
          icon: categoryIcons[cat] || Tag,
          subcategories: subcategories.sort((a, b) => b.amount - a.amount),
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return { categoryGroups: groups, totalExpenses: totalExp, totalIncome: totalInc };
  }, [transactions]);

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8">
        <Wallet className="size-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Sin transacciones para desglosar</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Ingresos</p>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
            +{formatCurrency(totalIncome)}
          </p>
        </div>
        <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-3">
          <p className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">Gastos</p>
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            -{formatCurrency(totalExpenses)}
          </p>
        </div>
      </div>

      {/* Category Groups */}
      <div className="space-y-1.5">
        {categoryGroups.map((cat) => {
          const isExpanded = expandedCategories.has(cat.name);
          const CatIcon = cat.icon;
          const percentage = totalExpenses > 0 ? Math.round((cat.amount / totalExpenses) * 100) : 0;

          return (
            <motion.div
              key={cat.name}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-700/50"
            >
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(cat.name)}
                className="w-full flex items-center gap-2.5 p-3 text-left"
              >
                <div
                  className="size-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${cat.color}15` }}
                >
                  <CatIcon className="size-4" style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {cat.name}
                    </span>
                    <span className="text-sm font-bold ml-2 shrink-0" style={{ color: cat.color }}>
                      -{formatCurrency(cat.amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{percentage}%</span>
                    <span className="text-[10px] text-gray-300 shrink-0">·</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{cat.count} tx</span>
                  </div>
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0"
                >
                  <ChevronDown className="size-4 text-gray-300" />
                </motion.div>
              </button>

              {/* Subcategories */}
              <AnimatePresence>
                {isExpanded && cat.subcategories.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-gray-100 dark:border-gray-700/50 px-3 pb-2">
                      {cat.subcategories.map((sub) => {
                        const subPercentage = cat.amount > 0 ? Math.round((sub.amount / cat.amount) * 100) : 0;
                        return (
                          <div
                            key={sub.name}
                            className="flex items-center justify-between py-2 border-t border-gray-50 dark:border-gray-800/50"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Tag className="size-3 text-gray-400 shrink-0" />
                              <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                {sub.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-[10px] text-gray-400">{subPercentage}%</span>
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                -{formatCurrency(sub.amount)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Total */}
      <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Total Gastos
        </span>
        <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
          -{formatCurrency(totalExpenses)}
        </span>
      </div>
    </div>
  );
}
