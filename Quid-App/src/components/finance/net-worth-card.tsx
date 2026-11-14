"use client";

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, formatCurrency } from "@/lib/api";

interface NetWorthResponse {
  assets: number;
  liabilities: number;
  net: number;
  entries: Array<{ label: string; value: number; kind: "asset" | "liability" }>;
}

/** F-24 · Patrimonio neto: lo que tienes menos lo que debes. */
export function NetWorthCard() {
  const [data, setData] = useState<NetWorthResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<NetWorthResponse>("/api/finance/net-worth")
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (failed) return null;
  if (!data) {
    return (
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardContent className="p-4">
          <div className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const positive = data.net >= 0;

  return (
    <Card className="border-0 shadow-sm rounded-2xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-emerald-500" />
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Patrimonio neto
            </p>
          </div>
          <span className={`text-lg font-bold quid-money ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {formatCurrency(data.net)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-2">
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Tienes</p>
            <p className="font-semibold quid-money">{formatCurrency(data.assets)}</p>
          </div>
          <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 p-2">
            <p className="text-[11px] text-rose-700 dark:text-rose-300">Debes</p>
            <p className="font-semibold quid-money">{formatCurrency(data.liabilities)}</p>
          </div>
        </div>

        <p className="text-[11px] text-gray-400">
          Cuentas + ahorros + CDT, menos el saldo de tus deudas.
        </p>
      </CardContent>
    </Card>
  );
}
