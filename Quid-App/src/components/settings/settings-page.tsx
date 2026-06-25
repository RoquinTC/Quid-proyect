"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Car,
  Wallet,
  Send,
  Heart,
  ShoppingCart,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ShareInvite } from "@/components/pwa/share-invite";
import { readStoredAccent, type AccentColor } from "@/lib/personalization";
import type { UserSettings } from "@/lib/types";

// Modular settings components
import { GeneralSettings } from "./general-settings";
import { FinanceSettings } from "./finance-settings";
import { AuraSettings } from "./aura-settings";
import { TransportSettings } from "./transport-settings";
import { HealthSettings } from "./health-settings";
import { PantrySettings } from "./pantry-settings";
import { AdminPanel } from "@/components/settings/admin-panel";

type AppSettings = UserSettings & {
  userId: string;
  currentPeriod: {
    start: string;
    end: string;
  } | null;
  needsBudgetReset: boolean;
  telegramId?: string | null;
  isAdmin?: boolean;
};

type SettingsTab = "menu" | "general" | "finance" | "aura" | "transport" | "health" | "pantry" | "admin";

export function SettingsPage() {
  const { setActiveModule } = useAppStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("menu");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [accentColor, setAccentColor] = useState<AccentColor>("emerald");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>("1.0.11");

  const mountedRef = useRef(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<string | null>(null);

  // Share invite dialog state
  const [shareOpen, setShareOpen] = useState(false);

  // Aura link local state
  const [auraPairingCode, setAuraPairingCode] = useState("");
  const [linkingAura, setLinkingAura] = useState(false);
  const [auraLinked, setAuraLinked] = useState(false);

  // Fetch the user-facing app version from release notes.
  useEffect(() => {
    fetch("/release-notes.json?" + Date.now())
      .then((res) => res.json())
      .then((data) => setAppVersion(data.currentVersion || "1.0.11"))
      .catch(() => setAppVersion("1.0.11"));
  }, []);

  useEffect(() => {
    setAccentColor(readStoredAccent());
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AppSettings>("/api/settings");
      if (mountedRef.current) {
        setSettings(data);
        if (data.telegramId) {
          setAuraLinked(true);
        } else {
          setAuraLinked(false);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        console.error("Error fetching settings:", err);
        setError(err instanceof Error ? err.message : "Error al cargar la configuración");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchSettings();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchSettings]);

  const updateSetting = async (key: string, value: unknown) => {
    if (!settings) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await apiFetch<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ [key]: value }),
      });
      setSettings(updated);
      setSaveMessage("Guardado");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (error) {
      console.error("Error updating setting:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-4 space-y-4 pb-safe">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => setActiveModule("dashboard")}>
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Ajustes</h1>
            <p className="text-xs text-gray-400">Configura tu experiencia en Quid</p>
          </div>
        </div>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-6 text-center space-y-4">
            <div className="size-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="size-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">No se pudo cargar la configuración</p>
              <p className="text-xs text-gray-400 mt-1">{error || "Ocurrió un error inesperado"}</p>
            </div>
            <Button variant="outline" className="rounded-xl gap-2" onClick={fetchSettings}>
              <RefreshCw className="size-4" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-safe max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl shrink-0 hover:bg-gray-100 dark:hover:bg-gray-850"
          onClick={() => {
            if (activeTab === "menu") {
              setActiveModule("dashboard");
            } else {
              setActiveTab("menu");
            }
          }}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
            {activeTab === "menu" && "Ajustes"}
            {activeTab === "general" && "Ajustes Generales"}
            {activeTab === "finance" && "Ajustes de Finanzas"}
            {activeTab === "aura" && "Ajustes de Aura AI"}
            {activeTab === "transport" && "Ajustes de Transporte"}
            {activeTab === "health" && "Ajustes de Salud"}
            {activeTab === "pantry" && "Ajustes de Despensa"}
            {activeTab === "admin" && "Administración"}
          </h1>
          <p className="text-xs text-gray-400 truncate">
            {activeTab === "menu" && "Gestiona las opciones globales y módulos de Quid"}
            {activeTab === "general" && "Apariencia, color de acento, seguridad, respaldos y logros"}
            {activeTab === "finance" && "Corte presupuestal, gestión de cuentas, categorías e importación masiva"}
            {activeTab === "aura" && "Conexión a Telegram, habilidades y comportamiento del asistente"}
            {activeTab === "transport" && "Precios de combustible, alertas de mantenimiento y documentos"}
            {activeTab === "health" && "Horarios de medicinas, stock crítico de inventario y citas"}
            {activeTab === "pantry" && "Márgenes de despensa, catalogación de unidades y perfiles"}
            {activeTab === "admin" && "Panel de control del sistema de base de datos y usuarios"}
          </p>
        </div>
        {saving && <Loader2 className="size-4 animate-spin text-emerald-500 ml-auto shrink-0" />}
        {saveMessage && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto flex items-center gap-1 shrink-0">
            <CheckCircle2 className="size-3" />
            {saveMessage}
          </span>
        )}
      </div>

      {/* Global result message */}
      {resetResult && (
        <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3 text-center border border-emerald-100 dark:border-emerald-950/20">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{resetResult}</p>
        </div>
      )}

      {/* ===== MENU ROUTER ===== */}
      {activeTab === "menu" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {/* Card: General */}
          <Card
            className="border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/30 rounded-2xl shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-emerald-500/20 dark:hover:border-emerald-400/20 cursor-pointer transition-all duration-200 overflow-hidden"
            onClick={() => setActiveTab("general")}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="size-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/10 shrink-0">
                  <Globe className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Ajustes Generales</p>
                  <p className="text-[11px] text-gray-400 leading-snug">Personalización, tema, seguridad y copias</p>
                </div>
              </div>
              <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 shrink-0 ml-2" />
            </CardContent>
          </Card>

          {/* Card: Finanzas */}
          <Card
            className="border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/30 rounded-2xl shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-teal-500/20 dark:hover:border-teal-400/20 cursor-pointer transition-all duration-200 overflow-hidden"
            onClick={() => setActiveTab("finance")}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="size-11 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white flex items-center justify-center shadow-md shadow-teal-500/10 shrink-0">
                  <Wallet className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Finanzas y Presupuestos</p>
                  <p className="text-[11px] text-gray-400 leading-snug">Corte, cuentas, categorías e importador</p>
                </div>
              </div>
              <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 shrink-0 ml-2" />
            </CardContent>
          </Card>

          {/* Card: Aura AI */}
          <Card
            className="border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/30 rounded-2xl shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-blue-500/20 dark:hover:border-blue-400/20 cursor-pointer transition-all duration-200 overflow-hidden"
            onClick={() => setActiveTab("aura")}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="size-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shadow-md shadow-blue-500/10 shrink-0">
                  <Send className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Asistente Aura AI</p>
                  <p className="text-[11px] text-gray-400 leading-snug">Vinculación de Telegram y habilidades</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {auraLinked ? (
                  <Badge className="bg-emerald-100 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 text-[10px] font-semibold border-0">
                    Vinculado
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] font-semibold border-0">
                    Pendiente
                  </Badge>
                )}
                <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 shrink-0" />
              </div>
            </CardContent>
          </Card>

          {/* Card: Transporte */}
          <Card
            className="border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/30 rounded-2xl shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-violet-500/20 dark:hover:border-violet-400/20 cursor-pointer transition-all duration-200 overflow-hidden"
            onClick={() => setActiveTab("transport")}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="size-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 text-white flex items-center justify-center shadow-md shadow-violet-500/10 shrink-0">
                  <Car className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Transporte y Vehículos</p>
                  <p className="text-[11px] text-gray-400 leading-snug">Combustible, recordatorios y documentos</p>
                </div>
              </div>
              <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 shrink-0 ml-2" />
            </CardContent>
          </Card>

          {/* Card: Salud */}
          <Card
            className="border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/30 rounded-2xl shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-rose-500/20 dark:hover:border-rose-400/20 cursor-pointer transition-all duration-200 overflow-hidden"
            onClick={() => setActiveTab("health")}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="size-11 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 text-white flex items-center justify-center shadow-md shadow-rose-500/10 shrink-0">
                  <Heart className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Salud y Medicamentos</p>
                  <p className="text-[11px] text-gray-400 leading-snug">Tomas de medicinas, stock mínimo y citas</p>
                </div>
              </div>
              <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 shrink-0 ml-2" />
            </CardContent>
          </Card>

          {/* Card: Despensa */}
          <Card
            className="border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/30 rounded-2xl shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-amber-500/20 dark:hover:border-amber-400/20 cursor-pointer transition-all duration-200 overflow-hidden"
            onClick={() => setActiveTab("pantry")}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="size-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/10 shrink-0">
                  <ShoppingCart className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">Despensa y Recetas</p>
                  <p className="text-[11px] text-gray-400 leading-snug">Ideal de despensa y unidades métricas</p>
                </div>
              </div>
              <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 shrink-0 ml-2" />
            </CardContent>
          </Card>

          {/* Card: Admin (conditional) */}
          {settings.isAdmin && (
            <Card
              className="border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/30 rounded-2xl shadow-sm hover:shadow-md hover:scale-[1.01] hover:border-slate-500/20 dark:hover:border-slate-400/20 cursor-pointer transition-all duration-200 overflow-hidden sm:col-span-2"
              onClick={() => setActiveTab("admin")}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="size-11 rounded-xl bg-gradient-to-br from-slate-600 to-zinc-700 text-white flex items-center justify-center shadow-md shadow-slate-500/10 shrink-0">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Administración del Sistema</p>
                    <p className="text-[11px] text-gray-400 leading-snug">Monitoreo del servidor, usuarios y base de datos</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <Badge className="bg-slate-100 hover:bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-350 text-[10px] font-semibold border-0">
                    Admin
                  </Badge>
                  <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 shrink-0" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ===== TAB VIEWS ===== */}
      {activeTab === "general" && (
        <GeneralSettings
          settings={settings}
          updateSetting={updateSetting}
          saving={saving}
          accentColor={accentColor}
          setAccentColor={setAccentColor}
          appVersion={appVersion}
          setResetResult={setResetResult}
        />
      )}

      {activeTab === "finance" && (
        <FinanceSettings
          settings={settings}
          updateSetting={updateSetting}
          fetchSettings={fetchSettings}
          setResetResult={setResetResult}
        />
      )}

      {activeTab === "aura" && (
        <AuraSettings
          settings={settings}
          updateSetting={updateSetting}
          auraPairingCode={auraPairingCode}
          setAuraPairingCode={setAuraPairingCode}
          auraLinked={auraLinked}
          setAuraLinked={setAuraLinked}
          setResetResult={setResetResult}
          setError={setError}
        />
      )}

      {activeTab === "transport" && (
        <TransportSettings
          setResetResult={setResetResult}
        />
      )}

      {activeTab === "health" && (
        <HealthSettings
          setResetResult={setResetResult}
        />
      )}

      {activeTab === "pantry" && (
        <PantrySettings
          setResetResult={setResetResult}
        />
      )}

      {activeTab === "admin" && (
        <Card className="border-0 shadow-sm rounded-xl p-4">
          <AdminPanel />
        </Card>
      )}

      <ShareInvite open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
