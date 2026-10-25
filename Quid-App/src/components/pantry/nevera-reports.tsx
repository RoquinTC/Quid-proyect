"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Loader2, TrendingUp, TrendingDown, Store, PieChart, Info } from "lucide-react";
import { motion } from "framer-motion";

/**
 * **Reportes** (Fase 9).
 *
 * Tres reportes derivados de datos que el flujo ya escribe, sin módulo nuevo:
 *   1. Variación de precio por producto.
 *   2. Gasto por categoría.
 *   3. Comparación entre tiendas.
 *
 * Se muestran dentro de Historial con un segmento, porque la navegación del
 * módulo son 5 pestañas fijas y así se respeta esa decisión.
 */

interface PriceVariation {
  itemId: string;
  name: string;
  unit: string;
  changePct: number;
  priceUnit: string;
  first: number;
  last: number;
  min: number;
  max: number;
  purchases: number;
}

interface CategorySpend {
  category: string;
  total: number;
  purchases: number;
}

interface StoreComparison {
  itemId: string;
  name: string;
  unit: string;
  priceUnit: string;
  cheapestStore: string;
  spreadPct: number;
  stores: { store: string; avgPrice: number; minPrice: number; visits: number }[];
}

interface ReportsData {
  days: number;
  totalSpent: number;
  priceVariation: PriceVariation[];
  spendingByCategory: CategorySpend[];
  storeComparison: StoreComparison[];
  limitations: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  vegetables: "Verduras",
  fruits: "Frutas",
  meat: "Carnes",
  dairy: "Lácteos",
  grains: "Granos",
  beverages: "Bebidas",
  condiments: "Condimentos",
  frozen: "Congelados",
  bakery: "Panadería",
  snacks: "Snacks",
  other: "Otros",
  otros: "Otros",
};

function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

export function NeveraReports() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(90);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<ReportsData>(`/api/pantry/reports?days=${days}`);
      setData(res);
    } catch (e) {
      console.error("Error fetching reports:", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  if (loading) {
    return (
      <div className="space-y-2 p-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <p className="p-4 text-center text-[12px] text-gray-500">
        No se pudieron cargar los reportes.
      </p>
    );
  }

  const maxCategory = Math.max(...data.spendingByCategory.map((c) => c.total), 1);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5">
      {/* Rango */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {[30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                days === d
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800"
              }`}
            >
              {d === 365 ? "1 año" : `${d} días`}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-gray-400">
          Gasto: <strong className="text-gray-700 dark:text-gray-200">{formatCurrency(data.totalSpent)}</strong>
        </span>
      </div>

      {/* 1. Gasto por categoría */}
      <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
        <div className="mb-2 flex items-center gap-1.5">
          <PieChart className="size-3.5 text-amber-500" />
          <h3 className="text-[12.5px] font-semibold text-gray-900 dark:text-white">
            Gasto por categoría
          </h3>
        </div>
        {data.spendingByCategory.length === 0 ? (
          <p className="text-[11px] text-gray-400">
            Todavía no hay compras confirmadas en este periodo.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.spendingByCategory.map((c) => (
              <li key={c.category}>
                <div className="mb-0.5 flex items-baseline justify-between text-[11.5px]">
                  <span className="text-gray-600 dark:text-gray-300">{categoryLabel(c.category)}</span>
                  <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                    {formatCurrency(c.total)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(c.total / maxCategory) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. Variación de precio */}
      <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
        <div className="mb-2 flex items-center gap-1.5">
          <TrendingUp className="size-3.5 text-cyan-500" />
          <h3 className="text-[12.5px] font-semibold text-gray-900 dark:text-white">
            Variación de precio
          </h3>
        </div>
        {data.priceVariation.length === 0 ? (
          <p className="text-[11px] text-gray-400">
            Necesitas al menos dos compras del mismo producto para ver cómo cambió.
          </p>
        ) : (
          <ul className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {data.priceVariation.map((p) => {
              const up = p.changePct > 0;
              const flat = Math.abs(p.changePct) < 0.5;
              return (
                <li key={p.itemId} className="flex items-center gap-2 py-1.5">
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                      flat
                        ? "bg-gray-100 text-gray-400 dark:bg-gray-700"
                        : up
                          ? "bg-red-50 text-red-500 dark:bg-red-950/40"
                          : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"
                    }`}
                  >
                    {flat ? (
                      <span className="text-[9px]">=</span>
                    ) : up ? (
                      <TrendingUp className="size-2.5" />
                    ) : (
                      <TrendingDown className="size-2.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-gray-700 dark:text-gray-300">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[10.5px] tabular-nums text-gray-400">
                    {formatCurrency(p.first)} → {formatCurrency(p.last)}/{p.priceUnit}
                  </span>
                  <span
                    className={`w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums ${
                      flat ? "text-gray-400" : up ? "text-red-500" : "text-emerald-600"
                    }`}
                  >
                    {up ? "+" : ""}
                    {p.changePct}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. Comparación entre tiendas */}
      <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
        <div className="mb-2 flex items-center gap-1.5">
          <Store className="size-3.5 text-violet-500" />
          <h3 className="text-[12.5px] font-semibold text-gray-900 dark:text-white">
            Comparación entre tiendas
          </h3>
        </div>
        {data.storeComparison.length === 0 ? (
          <p className="text-[11px] text-gray-400">
            Necesitas el mismo producto comprado en dos tiendas distintas.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.storeComparison.map((c) => (
              <li key={c.itemId}>
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-[12px] font-medium text-gray-800 dark:text-gray-200">
                    {c.name}
                  </span>
                  <span className="shrink-0 text-[10.5px] text-violet-600">
                    {c.spreadPct > 0 ? `ahorras ${c.spreadPct}% en ${c.cheapestStore}` : "mismo precio"}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {c.stores.map((s, i) => (
                    <span
                      key={s.store}
                      className={`rounded-full px-2 py-0.5 text-[10px] tabular-nums ${
                        i === 0
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {s.store} · {formatCurrency(s.avgPrice)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-1 px-1 text-[9.5px] leading-tight text-gray-400">
        <Info className="mt-0.5 size-2.5 shrink-0" />
        {data.limitations[0]}
      </p>
    </motion.div>
  );
}
