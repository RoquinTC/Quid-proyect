"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Droplet, GlassWater, Plus, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { cn } from "@/lib/utils";
import { useHydrationStore } from "@/lib/stores/use-hydration-store";

interface HydrationProfile {
  weight: number;
  height: number;
  activity: "sedentary" | "moderate" | "active";
  climate: "cold" | "temperate" | "hot";
}

const GLASS_SIZE_ML = 250;

export function WaterWidget() {
  const { dailyGoalMl, getTodayTotal, addWater, setDailyGoal } = useHydrationStore();
  const [currentMl, setCurrentMl] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lastAddedAt, setLastAddedAt] = useState(0);
  const [profile, setProfile] = useState<HydrationProfile>({
    weight: 70,
    height: 170,
    activity: "moderate",
    climate: "temperate",
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("quid-hydration-profile");
      if (saved) setProfile(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    setCurrentMl(getTodayTotal());
    const interval = setInterval(() => setCurrentMl(getTodayTotal()), 30000);
    return () => clearInterval(interval);
  }, [getTodayTotal, dailyGoalMl]);

  const percentage = Math.min(Math.round((currentMl / dailyGoalMl) * 100), 100);
  const remainingMl = Math.max(dailyGoalMl - currentMl, 0);
  const glassCount = Math.max(1, Math.ceil(dailyGoalMl / GLASS_SIZE_ML));
  const completedGlasses = Math.min(glassCount, Math.floor(currentMl / GLASS_SIZE_ML));
  const partialGlass = Math.min(1, Math.max(0, (currentMl - completedGlasses * GLASS_SIZE_ML) / GLASS_SIZE_ML));
  const isGoalReached = currentMl >= dailyGoalMl;

  const glassSlots = useMemo(() => Array.from({ length: Math.min(glassCount, 16) }), [glassCount]);

  const handleAddWater = (amount: number) => {
    addWater(amount);
    setCurrentMl(getTodayTotal() + amount);
    setLastAddedAt(Date.now());
  };

  const calculateIntelligentGoal = () => {
    let goal = profile.weight * 35;
    if (profile.activity === "moderate") goal += 400;
    if (profile.activity === "active") goal += 800;
    if (profile.climate === "temperate") goal += 250;
    if (profile.climate === "hot") goal += 500;
    goal = Math.max(1000, Math.min(8000, Math.round(goal / 100) * 100));

    setDailyGoal(goal);
    setIsSettingsOpen(false);
    try {
      localStorage.setItem("quid-hydration-profile", JSON.stringify(profile));
    } catch {}
  };

  return (
    <Card className="quid-theme-widget relative min-h-[390px] overflow-hidden rounded-[1.75rem] border-0 p-0 text-card-foreground">
      <CardContent className="relative z-10 p-5">
        <div className="pointer-events-none absolute -right-12 -top-10 size-44 rounded-full bg-sky-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-8 size-40 rounded-full bg-cyan-400/20 blur-3xl" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/75 backdrop-blur">
              <Droplet className="size-3.5 text-sky-400" />
              Hidratación
            </div>
            <h3 className="mt-3 text-xl font-black tracking-tight text-foreground">
              Tu jarra de agua
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isGoalReached ? "Meta cumplida. Tu cuerpo lo nota." : `${remainingMl} ml pendientes para hoy`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-2xl bg-white/10 text-foreground hover:bg-white/20"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_120px] items-center gap-4">
          <div className="relative mx-auto h-52 w-32">
            <div className="absolute inset-x-3 top-0 h-7 rounded-t-[2rem] border border-white/30 bg-white/18 backdrop-blur" />
            <div className="absolute inset-x-0 top-5 bottom-0 overflow-hidden rounded-b-[2.4rem] rounded-t-2xl border border-white/30 bg-white/14 shadow-[inset_0_1px_18px_rgba(255,255,255,0.18)] backdrop-blur-xl">
              <motion.div
                key={lastAddedAt}
                className="absolute inset-x-0 bottom-0 overflow-hidden bg-gradient-to-t from-sky-600 via-cyan-400 to-sky-200"
                initial={{ height: `${Math.max(0, percentage - 8)}%` }}
                animate={{ height: `${percentage}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 14 }}
              >
                <div className="absolute -top-3 left-[-35%] h-8 w-[170%] rounded-[50%] bg-white/45 blur-[1px]" />
                <motion.div
                  className="absolute -top-2 left-[-50%] h-7 w-[200%] rounded-[50%] bg-cyan-100/45"
                  animate={{ x: ["0%", "14%", "0%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
              </motion.div>
              <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(255,255,255,.45),transparent_32%,transparent_70%,rgba(255,255,255,.18))]" />
              <div className="absolute inset-x-5 top-5 bottom-6 rounded-full border-l border-white/25" />
            </div>
            <motion.div
              key={`spark-${lastAddedAt}`}
              initial={{ opacity: 0, y: 20, scale: 0.6 }}
              animate={{ opacity: lastAddedAt ? [0, 1, 0] : 0, y: lastAddedAt ? [20, -70, -112] : 20, scale: [0.6, 1, 0.8] }}
              transition={{ duration: 1.2 }}
              className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-sky-100 px-2 py-1 text-[10px] font-black text-sky-700 shadow-lg"
            >
              +agua
            </motion.div>
          </div>

          <div className="space-y-3">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-3 text-center backdrop-blur">
              <p className="text-3xl font-black leading-none text-foreground">{percentage}%</p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                {currentMl} / {dailyGoalMl} ml
              </p>
            </div>
            <Button
              className="h-12 w-full rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 font-black text-white shadow-lg shadow-sky-500/20"
              onClick={() => handleAddWater(GLASS_SIZE_ML)}
            >
              <Plus className="size-4" />
              Vaso
            </Button>
            <Button
              variant="outline"
              className="h-10 w-full rounded-2xl border-white/20 bg-white/10 text-xs font-bold"
              onClick={() => handleAddWater(500)}
            >
              Botella 500 ml
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{glassCount} vasitos sugeridos</span>
            <span>{GLASS_SIZE_ML} ml c/u</span>
          </div>
          <div className="grid grid-cols-8 gap-2">
            {glassSlots.map((_, index) => {
              const filled = index < completedGlasses;
              const partial = index === completedGlasses && partialGlass > 0 && !filled;
              return (
                <div
                  key={index}
                  className={cn(
                    "relative h-10 overflow-hidden rounded-b-xl rounded-t-md border border-white/25 bg-white/10 shadow-inner",
                    filled && "border-sky-300/70"
                  )}
                  title={`Vaso ${index + 1}`}
                >
                  <motion.div
                    className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sky-500 to-cyan-300"
                    animate={{ height: filled ? "100%" : partial ? `${Math.round(partialGlass * 100)}%` : "0%" }}
                    transition={{ type: "spring", stiffness: 80, damping: 16 }}
                  />
                  <GlassWater className="absolute inset-0 m-auto size-4 text-white/75" />
                </div>
              );
            })}
          </div>
          {glassCount > 16 && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Mostrando 16 de {glassCount}; la jarra lleva el progreso completo.
            </p>
          )}
        </div>
      </CardContent>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-sky-500" />
              Configurar hidratación
            </DialogTitle>
            <DialogDescription>
              Quid calcula una meta diaria base con peso, actividad y clima.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="weight">Peso (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  value={profile.weight}
                  onChange={(event) => setProfile({ ...profile, weight: Number(event.target.value) })}
                  min={20}
                  max={300}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Estatura (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  value={profile.height}
                  onChange={(event) => setProfile({ ...profile, height: Number(event.target.value) })}
                  min={50}
                  max={250}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Actividad física</Label>
              <Select
                value={profile.activity}
                onValueChange={(value: HydrationProfile["activity"]) => setProfile({ ...profile, activity: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sedentary">Sedentario</SelectItem>
                  <SelectItem value="moderate">Moderado</SelectItem>
                  <SelectItem value="active">Muy activo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Clima</Label>
              <Select
                value={profile.climate}
                onValueChange={(value: HydrationProfile["climate"]) => setProfile({ ...profile, climate: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cold">Frío</SelectItem>
                  <SelectItem value="temperate">Templado</SelectItem>
                  <SelectItem value="hot">Caluroso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={calculateIntelligentGoal}
              className="h-11 w-full rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 font-black text-white"
            >
              Calcular y guardar meta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
