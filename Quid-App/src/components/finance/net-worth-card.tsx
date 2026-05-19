"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface HistoryData {
  currentNetWorth: number;
  previousNetWorth: number;
}

export function NetWorthCard() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const result = await apiFetch<HistoryData>("/api/finance/history");
      setData(result);
    } catch (error) {
      console.error("Error fetching net worth:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchData().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchData]);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm rounded-2xl animate-pulse">
        <CardContent className="p-4">
          <div className="h-[60px] bg-gray-100 dark:bg-gray-800 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { currentNetWorth, previousNetWorth } = data;
  const difference = currentNetWorth - previousNetWorth;
  const percentageChange =
    previousNetWorth !== 0
      ? Math.round((difference / Math.abs(previousNetWorth)) * 100)
      : 0;
  const isPositive = difference > 0;
  const isNeutral = difference === 0;

  return (
    <Card className="border-0 shadow-sm rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
              <Wallet className="size-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Patrimonio Neto
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {formatCurrency(currentNetWorth)}
              </p>
            </div>
          </div>
          <div className="text-right">
            {!isNeutral && (
              <div
                className={`flex items-center gap-0.5 ${
                  isPositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {isPositive ? (
                  <ArrowUpRight className="size-3.5" />
                ) : (
                  <ArrowDownRight className="size-3.5" />
                )}
                <span className="text-xs font-bold">
                  {isPositive ? "+" : ""}
                  {formatCurrency(difference)}
                </span>
              </div>
            )}
            {isNeutral && (
              <div className="flex items-center gap-0.5 text-gray-400">
                <Minus className="size-3.5" />
                <span className="text-xs font-bold">Sin cambio</span>
              </div>
            )}
            <p className="text-[9px] text-gray-400">
              vs periodo anterior · {isPositive ? "+" : ""}{percentageChange}%
            </p>
          </div>
        </div>
        <p className="text-[9px] text-gray-400 mt-1.5">
          Balance total menos deudas activas
        </p>
      </CardContent>
    </Card>
  );
}
