"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PiggyBank,
  Gauge,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Insight, InsightTone } from "@/lib/finance/insights";

type InsightsResponse = {
  period: { label: string; start: string; end: string; today: string };
  totals: {
    income: number;
    expense: number;
    previousIncome: number;
    previousExpense: number;
  };
  insights: Insight[];
};

const ICONS: Record<Insight["kind"], LucideIcon> = {
  "saving-rate": PiggyBank,
  pace: Gauge,
  "category-up": TrendingUp,
  "category-down": TrendingDown,
  budgets: Wallet,
  "largest-expense": Receipt,
};

const TONES: Record<InsightTone, { ring: string; bg: string; text: string }> = {
  good: {
    ring: "border-emerald-100 dark:border-emerald-900/40",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    ring: "border-amber-100 dark:border-amber-900/40",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-600 dark:text-amber-400",
  },
  bad: {
    ring: "border-rose-100 dark:border-rose-900/40",
    bg: "bg-rose-100 dark:bg-rose-900/30",
    text: "text-rose-600 dark:text-rose-400",
  },
  neutral: {
    ring: "border-slate-100 dark:border-slate-800",
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-300",
  },
};

/**
 * F-10 · Hallazgos del período.
 *
 * Cada tarjeta dice qué cambió y lleva a donde se puede hacer algo. Los textos
 * los arma `lib/finance/insights.ts`; aquí solo se pintan.
 */
export function InsightsPanel() {
  const { setFinanceSubView } = useAppStore();
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<InsightsResponse>("/api/finance/insights")
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardContent className="p-4">
          <div className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const insights = data?.insights ?? [];
  if (insights.length === 0) return null;

  const visible = showAll ? insights : insights.slice(0, 4);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-emerald-500" />
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Hallazgos
          </p>
        </div>
        {data?.period?.label && (
          <span className="text-[11px] text-gray-400 truncate">{data.period.label}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        {visible.map((insight) => {
          const Icon = ICONS[insight.kind] ?? Sparkles;
          const tone = TONES[insight.tone] ?? TONES.neutral;

          return (
            <Card key={insight.id} className={`${tone.ring} shadow-sm rounded-2xl`}>
              <CardContent className="p-3.5 flex items-start gap-3">
                <div className={`size-9 rounded-xl ${tone.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`size-4 ${tone.text}`} />
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-snug">
                      {insight.title}
                    </p>
                    {insight.metric && (
                      <span className={`text-sm font-black shrink-0 ${tone.text}`}>
                        {insight.metric}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                    {insight.body}
                  </p>

                  {insight.action && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 -ml-2 px-2 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                      onClick={() => {
                        if (insight.action?.subview) setFinanceSubView(insight.action.subview);
                      }}
                    >
                      {insight.action.label}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {insights.length > 4 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="w-full rounded-xl py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/60"
        >
          {showAll ? "Ver menos" : `Ver los ${insights.length} hallazgos`}
        </button>
      )}
    </div>
  );
}
