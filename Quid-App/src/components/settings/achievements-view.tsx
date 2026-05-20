"use client";

import { useAchievements } from "@/hooks/use-achievements";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Wallet,
  Car,
  Heart,
  ShoppingCart,
  Trophy,
  CheckCircle2,
  Circle,
  Sparkles,
  Loader2,
} from "lucide-react";

const MODULE_CONFIG = {
  finance: {
    label: "Finanzas",
    icon: Wallet,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-100 dark:bg-teal-900/30",
    progressColor: "bg-teal-500",
    barColor: "[&>div]:bg-teal-500",
  },
  transport: {
    label: "Transporte",
    icon: Car,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/30",
    progressColor: "bg-blue-500",
    barColor: "[&>div]:bg-blue-500",
  },
  health: {
    label: "Salud",
    icon: Heart,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-100 dark:bg-rose-900/30",
    progressColor: "bg-rose-500",
    barColor: "[&>div]:bg-rose-500",
  },
  pantry: {
    label: "Despensa",
    icon: ShoppingCart,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    progressColor: "bg-amber-500",
    barColor: "[&>div]:bg-amber-500",
  },
} as const;

export function AchievementsView() {
  const { modules, overall, loading } = useAchievements();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall progress */}
      <Card className="border-0 shadow-none bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Trophy className="size-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                Progreso de Exploración
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {overall.discovered} de {overall.total} funciones descubiertas
              </p>
            </div>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {overall.percentage}%
            </span>
          </div>
          <Progress value={overall.percentage} className="h-2 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-teal-500" />
        </CardContent>
      </Card>

      {/* Module breakdown */}
      <div className="space-y-2">
        {Object.entries(MODULE_CONFIG).map(([moduleKey, config]) => {
          const moduleData = modules[moduleKey];
          if (!moduleData) return null;

          const Icon = config.icon;
          const isComplete = moduleData.percentage === 100;

          return (
            <Card
              key={moduleKey}
              className={`border-0 shadow-sm rounded-xl overflow-hidden transition-all ${
                isComplete
                  ? "ring-1 ring-emerald-200 dark:ring-emerald-800/50"
                  : ""
              }`}
            >
              <CardContent className="p-3 space-y-2.5">
                {/* Module header */}
                <div className="flex items-center gap-2.5">
                  <div
                    className={`size-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}
                  >
                    <Icon className={`size-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">
                        {config.label}
                      </p>
                      {isComplete && (
                        <Badge className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 h-4 px-1.5 gap-0.5">
                          <Sparkles className="size-2.5" />
                          Experto
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {moduleData.discovered}/{moduleData.total} descubiertos
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      isComplete
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-gray-400"
                    }`}
                  >
                    {moduleData.percentage}%
                  </span>
                </div>

                {/* Progress bar */}
                <Progress
                  value={moduleData.percentage}
                  className={`h-1.5 ${config.barColor}`}
                />

                {/* Feature list */}
                <div className="space-y-1.5 pt-1">
                  {moduleData.features.map((feat) => (
                    <div
                      key={feat.feature}
                      className="flex items-center gap-2 px-1"
                    >
                      {feat.discovered ? (
                        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="size-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                      )}
                      <span
                        className={`text-[11px] ${
                          feat.discovered
                            ? "text-gray-700 dark:text-gray-300 font-medium"
                            : "text-gray-400 dark:text-gray-500"
                        }`}
                      >
                        {feat.label}
                      </span>
                      {feat.discovered && feat.discoveredAt && (
                        <span className="text-[9px] text-gray-300 dark:text-gray-600 ml-auto">
                          {new Date(feat.discoveredAt).toLocaleDateString(
                            "es-CO",
                            { day: "numeric", month: "short" }
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
