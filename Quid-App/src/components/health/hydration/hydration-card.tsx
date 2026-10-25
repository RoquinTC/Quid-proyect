"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Droplet, Minus, Plus, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useHydrationStore } from "@/lib/stores/use-hydration-store";
import { syncHydrationReminders } from "@/lib/native/hydration-reminders";
import { averageIntervalMinutes, computeReminderSlots, formatInterval } from "@/lib/health/hydration-schedule";
import {
  DEFAULT_HYDRATION_PROFILE,
  computeHydrationPlan,
  glassesProgress,
  type HydrationActivity,
  type HydrationClimate,
  type HydrationProfile,
} from "@/lib/health/hydration-plan";

const PROFILE_KEY = "quid-hydration-plan";

/** Anillo de progreso del día. */
function GoalRing({ ratio, size = 92 }: { ratio: number; size?: number }) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));
  const offset = circumference * (1 - clamped);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-sky-100 dark:stroke-sky-950"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="url(#waterGradient)"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ type: "spring", stiffness: 60, damping: 16 }}
        />
        <defs>
          <linearGradient id="waterGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Tarjeta de hidratación.
 *
 * La meta NO es un número fijo: se calcula con peso, altura, actividad y clima
 * (`computeHydrationPlan`), y se traduce a **vasos** porque es la unidad con la
 * que la gente bebe. El usuario puede fijar la meta a mano y el cálculo pasa a
 * segundo plano.
 */
export function HydrationCard() {
  const { dailyGoalMl, logs, addWater, removeLog, setDailyGoal } = useHydrationStore();
  const [profile, setProfile] = useState<HydrationProfile>(DEFAULT_HYDRATION_PROFILE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<HydrationProfile>(DEFAULT_HYDRATION_PROFILE);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<HydrationProfile>;
        setProfile((current) => ({ ...current, ...parsed }));
      }
    } catch {
      // Perfil por defecto.
    }
  }, []);

  const plan = useMemo(() => computeHydrationPlan(profile), [profile]);

  // La meta calculada manda sobre el store para que el resto de la app
  // (widget del dashboard) use el mismo número.
  useEffect(() => {
    if (!plan.isManual && dailyGoalMl !== plan.goalMl) {
      setDailyGoal(plan.goalMl);
    }
  }, [plan.goalMl, plan.isManual, dailyGoalMl, setDailyGoal]);

  const today = startOfDay(new Date());
  const todayLogs = useMemo(
    () => logs.filter((log) => log.timestamp >= today).sort((a, b) => a.timestamp - b.timestamp),
    [logs, today],
  );
  const currentMl = useMemo(
    () => todayLogs.reduce((total, log) => total + log.amountMl, 0),
    [todayLogs],
  );

  // Reprograma los recordatorios cuando cambia el plan o el progreso.
  // Se espera un momento para no reprogramar en cada sorbo.
  useEffect(() => {
    const timer = setTimeout(() => {
      void syncHydrationReminders({ snapshot: { profile, currentMl, goalMl: plan.goalMl } });
    }, 900);
    return () => clearTimeout(timer);
  }, [profile, plan.goalMl, currentMl]);

  const progress = glassesProgress(currentMl, plan);
  const ratio = plan.goalMl > 0 ? currentMl / plan.goalMl : 0;
  const goalReached = currentMl >= plan.goalMl;
  const lastLog = todayLogs.at(-1);
  const remainingGlasses = Math.max(0, plan.glasses - progress.completed);

  const week = useMemo(() => {
    const labels = ["D", "L", "M", "M", "J", "V", "S"];
    return Array.from({ length: 7 }, (_, index) => {
      const offset = 6 - index;
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const from = startOfDay(date);
      const to = from + 86_400_000;
      const ml = logs
        .filter((log) => log.timestamp >= from && log.timestamp < to)
        .reduce((total, log) => total + log.amountMl, 0);
      return { label: labels[date.getDay()], ml, isToday: offset === 0 };
    });
  }, [logs]);

  const maxWeekMl = Math.max(plan.goalMl, ...week.map((day) => day.ml), 1);

  const alignment = profile.reminderAlignment ?? "centered";
  const slots = computeReminderSlots(profile, plan.glasses, alignment);
  const firstSlot = slots[0]?.label ?? "—";
  const lastSlot = slots[slots.length - 1]?.label ?? "—";
  const interval = averageIntervalMinutes(profile, plan.glasses, alignment);


  const openSettings = () => {
    setDraft(profile);
    setSettingsOpen(true);
  };

  const saveProfile = () => {
    const next: HydrationProfile = {
      ...draft,
      weightKg: Math.max(30, Math.min(250, Number(draft.weightKg) || 70)),
      heightCm: Math.max(120, Math.min(230, Number(draft.heightCm) || 170)),
      glassMl: Math.max(150, Math.min(500, Number(draft.glassMl) || 250)),
    };
    setProfile(next);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {
      // Sin almacenamiento: se mantiene en memoria.
    }
    setSettingsOpen(false);
  };

  const resetToCalculated = () => {
    const next = { ...profile, manualGoalMl: null };
    setProfile(next);
    setDraft(next);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {
      // Ignorar.
    }
  };

  return (
    <Card className="border border-gray-100 shadow-sm rounded-2xl dark:border-gray-800 overflow-hidden">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-950/30">
              <Droplet className="size-4 text-sky-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Agua</h3>
              <p className="text-[11px] text-gray-500">
                {goalReached
                  ? "Meta cumplida"
                  : `${remainingGlasses} vaso${remainingGlasses !== 1 ? "s" : ""} más para hoy`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openSettings}
            className="flex size-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            aria-label="Ajustar cálculo de agua"
          >
            <Settings2 className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <GoalRing ratio={ratio} />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-black leading-none text-gray-900 dark:text-white">
                {Math.round(Math.min(ratio, 1) * 100)}%
              </span>
              <span className="text-[9px] font-medium uppercase tracking-wide text-gray-400">
                del día
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black leading-none text-gray-900 dark:text-white">
              {progress.completed}
              <span className="text-sm font-bold text-gray-400"> / {plan.glasses}</span>
              <span className="ml-1 text-xs font-medium text-gray-400">vasos</span>
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {currentMl.toLocaleString("es-CO")} de {plan.goalMl.toLocaleString("es-CO")} ml ·{" "}
              {plan.glassMl} ml por vaso
            </p>

            <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-1.5">
              <Button
                className="h-9 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 text-xs font-bold text-white shadow-sm shadow-sky-500/20"
                onClick={() => addWater(plan.glassMl)}
              >
                <Plus className="mr-1 size-3.5" />
                Un vaso
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-xl px-2.5 text-xs font-bold"
                onClick={() => addWater(plan.glassMl * 2)}
              >
                +2
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-xl px-2 text-gray-500"
                onClick={() => lastLog && removeLog(lastLog.id)}
                disabled={!lastLog}
                aria-label="Deshacer último vaso"
              >
                <Minus className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Vasos del día: la unidad real con la que se bebe */}
        <div className="mt-3 flex flex-wrap gap-1">
          {Array.from({ length: Math.min(plan.glasses, 16) }, (_, index) => {
            const filled = index < progress.completed;
            const isNext = index === progress.completed && progress.partial > 0;
            return (
              <motion.div
                key={index}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.015 }}
                className={`h-5 w-3.5 rounded-b-sm rounded-t-[2px] border-b-2 ${
                  filled
                    ? "border-sky-600 bg-sky-400 dark:border-sky-400 dark:bg-sky-500"
                    : isNext
                      ? "border-sky-300 bg-sky-200/60 dark:border-sky-800 dark:bg-sky-900/60"
                      : "border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
                }`}
                title={`Vaso ${index + 1}`}
              />
            );
          })}
          {plan.glasses > 16 && (
            <span className="ml-1 self-center text-[10px] text-gray-400">
              +{plan.glasses - 16}
            </span>
          )}
        </div>

        {/* Recordatorios: repartidos entre despertar y dormir */}
        <button
          type="button"
          onClick={openSettings}
          className="mt-3 flex w-full items-center gap-1.5 rounded-lg py-1 text-left text-[11px] text-gray-500 transition-colors hover:text-sky-600 dark:hover:text-sky-400"
        >
          <Bell className="size-3 shrink-0 text-sky-500" />
          {profile.remindersEnabled === false ? (
            <span>Recordatorios desactivados · toca para activarlos</span>
          ) : (
            <>
              <span>
                {plan.glasses} avisos de {firstSlot} a {lastSlot}
              </span>
              <span className="text-gray-400">· {formatInterval(interval)}</span>
            </>
          )}
          <Settings2 className="ml-auto size-3 shrink-0 text-gray-300" />
        </button>

        {/* Últimos 7 días: el hábito, no solo el día suelto */}
        <div className="mt-3 flex items-end justify-between gap-1.5">
          {week.map((day, index) => (
            <div key={`${day.label}-${index}`} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-8 w-full items-end justify-center">
                <div
                  className={`w-full rounded-md transition-all ${
                    day.ml >= plan.goalMl
                      ? "bg-gradient-to-t from-sky-500 to-cyan-400"
                      : day.isToday
                        ? "bg-sky-300 dark:bg-sky-700"
                        : "bg-sky-100 dark:bg-sky-950"
                  }`}
                  style={{ height: `${Math.max(6, (day.ml / maxWeekMl) * 100)}%` }}
                  title={`${day.ml} ml`}
                />
              </div>
              <span
                className={`text-[9px] font-semibold ${
                  day.isToday ? "text-sky-600 dark:text-sky-400" : "text-gray-400"
                }`}
              >
                {day.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent scrollable className="max-w-sm rounded-2xl">
          <DialogHeader className="border-b border-gray-100 p-4 pb-3 dark:border-gray-800">
            <DialogTitle className="text-base">¿Cuánta agua necesitas?</DialogTitle>
            <DialogDescription className="text-xs">
              La meta se calcula con tu peso, talla, actividad y clima.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Peso (kg)</Label>
                <Input
                  type="number"
                  min={30}
                  max={250}
                  value={draft.weightKg}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, weightKg: Number(event.target.value) }))
                  }
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Talla (cm)</Label>
                <Input
                  type="number"
                  min={120}
                  max={230}
                  value={draft.heightCm}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, heightCm: Number(event.target.value) }))
                  }
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Actividad</Label>
                <Select
                  value={draft.activity}
                  onValueChange={(value) =>
                    setDraft((prev) => ({ ...prev, activity: value as HydrationActivity }))
                  }
                >
                  <SelectTrigger className="rounded-xl text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sedentary">Poco activa</SelectItem>
                    <SelectItem value="moderate">Moderada</SelectItem>
                    <SelectItem value="active">Muy activa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Clima</Label>
                <Select
                  value={draft.climate}
                  onValueChange={(value) =>
                    setDraft((prev) => ({ ...prev, climate: value as HydrationClimate }))
                  }
                >
                  <SelectTrigger className="rounded-xl text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cold">Frío</SelectItem>
                    <SelectItem value="temperate">Templado</SelectItem>
                    <SelectItem value="hot">Cálido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tamaño del vaso (ml)</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {[200, 250, 300, 350].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, glassMl: size }))}
                    className={`rounded-xl border py-2 text-xs font-bold transition-colors ${
                      Number(draft.glassMl) === size
                        ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                        : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Recordatorios */}
            <div className="space-y-2 rounded-xl border border-gray-100 p-2.5 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-900 dark:text-white">Recordarme tomar agua</p>
                  <p className="text-[11px] text-gray-400">
                    {computeHydrationPlan(draft).glasses} avisos repartidos en el día
                  </p>
                </div>
                <Switch
                  checked={draft.remindersEnabled !== false}
                  onCheckedChange={(checked) =>
                    setDraft((prev) => ({ ...prev, remindersEnabled: checked }))
                  }
                />
              </div>

              {draft.remindersEnabled !== false && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Me despierto</Label>
                      <Input
                        type="time"
                        value={draft.wakeTime}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, wakeTime: event.target.value }))
                        }
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Me acuesto</Label>
                      <Input
                        type="time"
                        value={draft.sleepTime}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, sleepTime: event.target.value }))
                        }
                        className="rounded-xl"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-sky-700 dark:text-sky-300">
                    De{" "}
                    {computeReminderSlots(draft, computeHydrationPlan(draft).glasses, draft.reminderAlignment ?? "centered")[0]?.label}{" "}
                    a{" "}
                    {(() => {
                      const ds = computeReminderSlots(
                        draft,
                        computeHydrationPlan(draft).glasses,
                        draft.reminderAlignment ?? "centered",
                      );
                      return ds[ds.length - 1]?.label;
                    })()}{" "}
                    {formatInterval(
                      averageIntervalMinutes(
                        draft,
                        computeHydrationPlan(draft).glasses,
                        draft.reminderAlignment ?? "centered",
                      ),
                    )}
                  </p>

                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { value: "centered", label: "Centrado", hint: "con margen" },
                        { value: "edges", label: "Exacto", hint: "al despertar" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, reminderAlignment: option.value }))
                        }
                        className={`rounded-xl border py-1.5 text-[11px] font-semibold transition-colors ${
                          (draft.reminderAlignment ?? "centered") === option.value
                            ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                            : "border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {option.label}
                        <span className="ml-1 font-normal opacity-70">{option.hint}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Resultado del cálculo, transparente */}
            <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-950/30">
              <p className="text-sm font-bold text-sky-900 dark:text-sky-200">
                {computeHydrationPlan(draft).goalMl.toLocaleString("es-CO")} ml ≈{" "}
                {computeHydrationPlan(draft).glasses} vasos
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {computeHydrationPlan(draft).explanation.map((line) => (
                  <li key={line} className="text-[11px] leading-snug text-sky-800/80 dark:text-sky-300/80">
                    · {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">O fija la meta a mano (ml)</Label>
              <div className="flex gap-1.5">
                <Input
                  type="number"
                  min={500}
                  max={8000}
                  step={100}
                  placeholder="Ej. 2500"
                  value={draft.manualGoalMl ?? ""}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      manualGoalMl: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                  className="rounded-xl"
                />
                {profile.manualGoalMl ? (
                  <Button variant="outline" className="rounded-xl" onClick={resetToCalculated}>
                    <RotateCcw className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-gray-100 p-4 dark:border-gray-800">
            <Button
              variant="outline"
              className="rounded-xl text-xs"
              onClick={() => setSettingsOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="rounded-xl bg-sky-600 text-xs text-white hover:bg-sky-700"
              onClick={saveProfile}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
