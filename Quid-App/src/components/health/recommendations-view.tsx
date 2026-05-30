"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Pill,
  Clock,
  AlertTriangle,
  Info,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Activity,
  Heart,
  Droplet,
  Coffee,
  Moon,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Medication } from "@/lib/types";

interface HealthSummaryRes {
  summary: string;
  source?: "ollama" | "local";
  model?: string | null;
  generatedAt?: string;
  cached?: boolean;
}

interface StoredHealthSummaryRes {
  report: HealthSummaryRes | null;
}

export function RecommendationsView() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<string>("");
  const [summaryMeta, setSummaryMeta] = useState<Omit<HealthSummaryRes, "summary"> | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingDeepSummary, setLoadingDeepSummary] = useState(false);
  const [subView, setSubView] = useState<"routine" | "ai-report">("routine");
  const [takenStatus, setTakenStatus] = useState<Record<string, boolean>>({});

  const fetchMedications = useCallback(async () => {
    try {
      const data = await apiFetch<Medication[]>("/api/medications");
      setMedications(data);

      // Cargar checkboxes guardados del día
      const todayStr = new Date().toDateString();
      const saved = localStorage.getItem(`taken-meds-${todayStr}`);
      if (saved) {
        setTakenStatus(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Error fetching medications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  const applySummary = (data: HealthSummaryRes) => {
    setSummary(data.summary);
    setSummaryMeta({
      source: data.source,
      model: data.model,
      generatedAt: data.generatedAt,
      cached: data.cached,
    });
  };

  const generateLocalSummary = async () => {
    setLoadingSummary(true);
    setSummaryError("");
    try {
      const data = await apiFetch<HealthSummaryRes>("/api/ai/health-summary", {
        method: "POST",
        body: JSON.stringify({ mode: "local" }),
      });
      applySummary(data);
    } catch (err) {
      console.error("Error generating clinical summary:", err);
      setSummary("");
      setSummaryMeta(null);
      setSummaryError(err instanceof Error ? err.message : "Ocurrió un error al generar tu informe clínico. Inténtalo de nuevo.");
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadStoredOrLocalSummary = async () => {
    setLoadingSummary(true);
    setSummaryError("");
    try {
      const stored = await apiFetch<StoredHealthSummaryRes>("/api/ai/health-summary");
      if (stored.report) {
        applySummary(stored.report);
        return;
      }
      await generateLocalSummary();
    } catch {
      await generateLocalSummary();
    } finally {
      setLoadingSummary(false);
    }
  };

  const generateDeepSummary = async () => {
    setLoadingDeepSummary(true);
    setSummaryError("");
    try {
      const data = await apiFetch<HealthSummaryRes>("/api/ai/health-summary", {
        method: "POST",
        body: JSON.stringify({ mode: "deep" }),
      });
      applySummary(data);
    } catch (err) {
      console.error("Error generating deep clinical summary:", err);
      setSummaryError(err instanceof Error ? err.message : "Aura no pudo completar el análisis profundo. Conservamos tu último resumen disponible.");
    } finally {
      setLoadingDeepSummary(false);
    }
  };

  useEffect(() => {
    if (subView === "ai-report" && !summary && medications.length > 0) {
      loadStoredOrLocalSummary();
    }
  }, [subView, summary, medications.length]);

  const handleToggleTaken = (id: string) => {
    const todayStr = new Date().toDateString();
    const updated = {
      ...takenStatus,
      [id]: !takenStatus[id],
    };
    setTakenStatus(updated);
    localStorage.setItem(`taken-meds-${todayStr}`, JSON.stringify(updated));
  };

  const activeMedications = medications.filter((m) => m.isActive);

  // Agrupamiento inteligente por momento del día
  const getRoutineCategory = (med: Medication) => {
    const h = med.howToTake;
    if (h === "morning" || h === "en_ayunas" || h === "without_food" || h === "before_meals") return "morning";
    if (h === "night" || h === "before_sleep") return "night";
    if (h === "with_food" || h === "after_meals" || h === "with_first_bite") return "meals";
    return "flexible";
  };

  const morningMeds = activeMedications.filter((m) => getRoutineCategory(m) === "morning");
  const nightMeds = activeMedications.filter((m) => getRoutineCategory(m) === "night");
  const mealMeds = activeMedications.filter((m) => getRoutineCategory(m) === "meals");
  const flexibleMeds = activeMedications.filter((m) => getRoutineCategory(m) === "flexible");

  const getHowToTakeLabel = (val?: string | null) => {
    if (!val) return "Tomar según dosis sugerida";
    switch (val) {
      case "en_ayunas":
        return "Tomar estrictamente en ayunas (30-60 min antes de desayunar)";
      case "before_meals":
        return "Tomar antes de las comidas";
      case "with_food":
        return "Tomar con alimentos / durante la comida";
      case "after_meals":
        return "Tomar después de las comidas";
      case "with_first_bite":
        return "Tomar con el primer bocado de comida";
      case "morning":
        return "Tomar por la mañana";
      case "afternoon":
        return "Tomar por la tarde";
      case "night":
        return "Tomar por la noche al acostarse";
      case "as_needed":
        return "Tomar según necesidad o dolor";
      case "custom":
        return "Tomar según indicación personalizada";
      case "without_food":
        return "Tomar en ayunas (Sin alimentos)";
      default:
        return val;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-32 rounded-3xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-64 rounded-3xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  if (activeMedications.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-center space-y-4 h-[60vh]">
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400 rounded-full">
          <Heart className="size-10 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            No hay medicamentos registrados
          </h3>
          <p className="text-sm text-gray-500 max-w-xs">
            Registra tus medicamentos activos en la pestaña principal para recibir recomendaciones y alertas inteligentes de Aura.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 pb-safe max-w-3xl mx-auto">
      {/* ─── Premium Glassmorphic Welcome Banner ─── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden p-5 rounded-3xl border border-rose-500/10 dark:border-rose-500/5 bg-gradient-to-r from-rose-500/5 via-amber-500/5 to-emerald-500/5 shadow-sm"
      >
        <div className="relative z-10 flex gap-4 items-start">
          <div className="p-3 bg-gradient-to-tr from-rose-500 to-amber-500 rounded-2xl text-white shadow-md shadow-rose-500/10">
            <Sparkles className="size-5" />
          </div>
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-rose-500 tracking-wider uppercase">
                Asistente Aura
              </span>
              <Badge className="bg-emerald-100 text-emerald-800 border-none dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] py-0 px-2">
                Activo
              </Badge>
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Tus Recomendaciones Médicas
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Aura ha consolidado tus **{activeMedications.length} tratamientos activos**. Revisa tus pautas diarias y pases de dosificación seguros.
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── Tabs Switcher ─── */}
      <div className="flex p-1 bg-gray-100 dark:bg-gray-800/80 rounded-2xl">
        <button
          onClick={() => setSubView("routine")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
            subView === "routine"
              ? "bg-white dark:bg-gray-700 text-rose-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Clock className="size-3.5" />
          Rutina de Hoy
        </button>
        <button
          onClick={() => setSubView("ai-report")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
            subView === "ai-report"
              ? "bg-white dark:bg-gray-700 text-rose-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Sparkles className="size-3.5" />
          Informe con IA
        </button>
      </div>

      {/* ─── VIEW 1: Routine / Timeline ─── */}
      <AnimatePresence mode="wait">
        {subView === "routine" && (
          <motion.div
            key="routine-view"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.15 }}
            className="space-y-5"
          >
            {/* Timeline Sections */}
            <div className="space-y-4 relative pl-3 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-200 dark:before:bg-gray-800">
              
              {/* MORNING TIMELINE */}
              {morningMeds.length > 0 && (
                <div className="relative pl-6 space-y-2">
                  <div className="absolute left-[-2px] top-1.5 p-1 bg-amber-500 rounded-full text-white shadow-sm ring-4 ring-white dark:ring-gray-900">
                    <Coffee className="size-3" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Mañana (Al Levantar / Ayunas)
                    </h3>
                    <p className="text-[10px] text-gray-500">
                      Ideal en las primeras horas para mejor asimilación.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {morningMeds.map((med) => (
                      <RoutineCard
                        key={med.id}
                        med={med}
                        isTaken={!!takenStatus[med.id]}
                        onToggle={() => handleToggleTaken(med.id)}
                        badgeColor="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
                        howToTakeLabel={getHowToTakeLabel(med.howToTake)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* MEALS TIMELINE */}
              {mealMeds.length > 0 && (
                <div className="relative pl-6 space-y-2">
                  <div className="absolute left-[-2px] top-1.5 p-1 bg-emerald-500 rounded-full text-white shadow-sm ring-4 ring-white dark:ring-gray-900">
                    <Activity className="size-3" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Con Comidas Principales
                    </h3>
                    <p className="text-[10px] text-gray-500">
                      Esencial para proteger tu estómago y evitar acidez.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {mealMeds.map((med) => (
                      <RoutineCard
                        key={med.id}
                        med={med}
                        isTaken={!!takenStatus[med.id]}
                        onToggle={() => handleToggleTaken(med.id)}
                        badgeColor="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                        howToTakeLabel={getHowToTakeLabel(med.howToTake)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* NIGHT TIMELINE */}
              {nightMeds.length > 0 && (
                <div className="relative pl-6 space-y-2">
                  <div className="absolute left-[-2px] top-1.5 p-1 bg-indigo-500 rounded-full text-white shadow-sm ring-4 ring-white dark:ring-gray-900">
                    <Moon className="size-3" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Noche / Antes de Dormir
                    </h3>
                    <p className="text-[10px] text-gray-500">
                      Medicamentos que benefician el reposo o regulan ciclos.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {nightMeds.map((med) => (
                      <RoutineCard
                        key={med.id}
                        med={med}
                        isTaken={!!takenStatus[med.id]}
                        onToggle={() => handleToggleTaken(med.id)}
                        badgeColor="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400"
                        howToTakeLabel={getHowToTakeLabel(med.howToTake)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* FLEXIBLE TIMELINE */}
              {flexibleMeds.length > 0 && (
                <div className="relative pl-6 space-y-2">
                  <div className="absolute left-[-2px] top-1.5 p-1 bg-gray-500 rounded-full text-white shadow-sm ring-4 ring-white dark:ring-gray-900">
                    <Pill className="size-3" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                      Horario Flexible o Según Necesidad
                    </h3>
                    <p className="text-[10px] text-gray-500">
                      Sigue las indicaciones de intervalo de horas de tu médico.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {flexibleMeds.map((med) => (
                      <RoutineCard
                        key={med.id}
                        med={med}
                        isTaken={!!takenStatus[med.id]}
                        onToggle={() => handleToggleTaken(med.id)}
                        badgeColor="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
                        howToTakeLabel={getHowToTakeLabel(med.howToTake)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Smart Interaction Warning Panel */}
            <Card className="rounded-3xl border-amber-500/20 dark:border-amber-500/10 bg-amber-50/50 dark:bg-amber-950/10 overflow-hidden shadow-none">
              <CardContent className="p-4 flex gap-3.5 items-start">
                <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                    Pautas Importantes de Interacción
                  </h4>
                  <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1 list-disc pl-4 leading-relaxed">
                    <li>**Agua siempre:** Se aconseja tomar todos los comprimidos con un vaso de agua completo. Evita zumos cítricos o café, ya que pueden inhibir o acelerar la absorción.</li>
                    <li>**Intervalos de Ayunas:** Si tomas medicamentos de tiroides o protectores de estómago en ayunas, espera al menos 30 minutos antes de consumir tu primera comida o café.</li>
                    <li>**Lácteos:** Algunos antibióticos interactúan con el calcio reduciendo su efectividad. Consulta la pestaña de detalles de cada pastilla si tienes dudas.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── VIEW 2: AI Consolidated Clinical Report ─── */}
        {subView === "ai-report" && (
          <motion.div
            key="ai-report-view"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Resumen Clínico con Aura
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={generateDeepSummary}
                disabled={loadingSummary || loadingDeepSummary}
                className="h-8 px-2 text-rose-500 text-[11px] rounded-lg"
              >
                <Sparkles className="size-3 mr-1" />
                {loadingDeepSummary ? "Aura está pensando..." : "Preparar análisis profundo"}
              </Button>
            </div>

            {loadingDeepSummary && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
                <span className="font-semibold">Aura está preparando una guía más detallada.</span>
                <span className="block opacity-80">Puede tardar entre 30 y 90 segundos. Puedes seguir consultando el resumen visible mientras termina.</span>
              </div>
            )}

            {summaryMeta && (
              <div className={`rounded-2xl border p-3 text-xs ${
                summaryMeta.source === "ollama"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300"
              }`}>
                {summaryMeta.source === "ollama"
                  ? `Análisis profundo guardado por Aura${summaryMeta.model ? ` (${summaryMeta.model})` : ""}${summaryMeta.cached ? ". Recuperado de tu último informe." : "."}`
                  : "Resumen inmediato generado con los datos actuales de QUID."}
                {summaryMeta.generatedAt && (
                  <span className="block opacity-80">
                    Generado: {new Date(summaryMeta.generatedAt).toLocaleString("es-CO")}
                  </span>
                )}
              </div>
            )}

            <Card className="rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden bg-white dark:bg-gray-900">
              <CardContent className="p-5 space-y-4">
                {loadingSummary ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
                    <Activity className="size-8 text-rose-500 animate-spin" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-900 dark:text-white">
                        Analizando combinaciones médicas...
                      </p>
                      <p className="text-[10px] text-gray-400 max-w-xs">
                        Aura está cruzando la frecuencia de tus medicamentos y sus pautas para estructurar tu guía.
                      </p>
                    </div>
                  </div>
                ) : summary ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed space-y-3">
                    {/* Rendered Markdown with basic formatting */}
                    {summary.split("\n\n").map((para, pIdx) => {
                      if (para.startsWith("###")) {
                        return (
                          <h4 key={pIdx} className="text-xs font-bold text-gray-900 dark:text-white pt-2 border-b border-gray-100 dark:border-gray-800 pb-1">
                            {para.replace("###", "").trim()}
                          </h4>
                        );
                      }
                      if (para.startsWith("•") || para.startsWith("-")) {
                        return (
                          <ul key={pIdx} className="space-y-1.5 pl-4 list-disc text-gray-600 dark:text-gray-300">
                            {para.split("\n").map((li, lIdx) => {
                              const cleanLi = li.replace(/^[•-]\s*/, "").trim();
                              return (
                                <li key={lIdx} dangerouslySetInnerHTML={{ __html: formatBold(cleanLi) }} />
                              );
                            })}
                          </ul>
                        );
                      }
                      return (
                        <p
                          key={pIdx}
                          className="text-gray-600 dark:text-gray-300"
                          dangerouslySetInnerHTML={{ __html: formatBold(para) }}
                        />
                      );
                    })}
                  </div>
                ) : summaryError ? (
                  <div className="py-8 text-center space-y-2 text-red-500">
                    <AlertCircle className="size-8 mx-auto" />
                    <p className="text-xs">{summaryError}</p>
                    <Button
                      size="sm"
                      onClick={generateLocalSummary}
                      className="mt-2 rounded-xl bg-rose-600 text-white"
                    >
                      Reintentar
                    </Button>
                  </div>
                ) : (
                  <div className="py-8 text-center space-y-2 text-gray-400">
                    <Info className="size-8 mx-auto" />
                    <p className="text-xs">Toca “Preparar análisis profundo” para consultar Aura.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2 text-[10px] text-gray-400 dark:text-gray-500 leading-normal p-2 rounded-xl bg-gray-50 dark:bg-gray-800/40">
              <AlertCircle className="size-3.5 text-gray-400 shrink-0 mt-0.5" />
              <span>
                **Nota:** La información recopilada por la Inteligencia Artificial de Aura es de naturaleza puramente informativa y no sustituye la supervisión o receta de un médico matriculado.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper para dar formato simple a las negritas en markdown (**texto**)
function formatBold(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-white">$1</strong>');
}

interface RoutineCardProps {
  med: Medication;
  isTaken: boolean;
  onToggle: () => void;
  badgeColor: string;
  howToTakeLabel: string;
}

function RoutineCard({ med, isTaken, onToggle, badgeColor, howToTakeLabel }: RoutineCardProps) {
  return (
    <div
      onClick={onToggle}
      className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
        isTaken
          ? "bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-500/20 opacity-80"
          : "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-rose-500/10 hover:bg-rose-50/5"
      }`}
    >
      <div className="shrink-0 flex items-center justify-center">
        {isTaken ? (
          <div className="size-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm shadow-emerald-500/20">
            <CheckCircle2 className="size-4" />
          </div>
        ) : (
          <div className="size-6 rounded-full border border-gray-300 dark:border-gray-700 flex items-center justify-center transition-colors hover:border-rose-500">
            <div className="size-3 rounded-full bg-transparent" />
          </div>
        )}
      </div>

      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs font-bold text-gray-900 dark:text-white ${isTaken ? "line-through text-gray-400" : ""}`}>
            {med.name}
          </span>
          <span className="text-[10px] text-gray-400">
            ({med.dosage})
          </span>
        </div>
        <p className="text-[10px] text-gray-400 leading-relaxed">
          {howToTakeLabel} • Tratamiento de: {med.disease || "Bienestar general"}
        </p>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1">
        <Badge className={`text-[9px] font-semibold py-0.5 px-2 border-none rounded-md uppercase tracking-wider ${badgeColor}`}>
          {med.frequency === "daily" ? "Diario" :
           med.frequency === "twice_daily" ? "Dos al día" :
           med.frequency === "three_times_daily" ? "Tres al día" :
           med.frequency === "weekly" ? "Semanal" : "Por necesidad"}
        </Badge>
        {med.reminderTimes && (
          <span className="text-[9px] text-gray-400 flex items-center gap-0.5">
            <Clock className="size-2.5" />
            {JSON.parse(med.reminderTimes).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
