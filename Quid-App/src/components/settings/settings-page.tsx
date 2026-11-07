"use client";

import { useState, useEffect, useCallback, useRef, Fragment, type ReactNode } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import {
  APP_SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/lib/modules/registry";
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

// El tab activo sale del registro: "menu" o cualquier sección declarada allí.
type SettingsTab = "menu" | SettingsSectionId;

// ─── Menú de ajustes ───────────────────────────────────────────────
// Las tarjetas viven en `lib/modules/registry.ts`; aquí solo se decide el
// orden de los grupos. Agregar una sección es agregar una entrada.

const SETTINGS_GROUPS = ["general", "modulos", "sistema"] as const;
type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

const GROUP_LABEL: Record<SettingsGroup, string> = {
  general: "GENERAL",
  modulos: "MÓDULOS",
  sistema: "SISTEMA",
};

export function SettingsPage() {
  const { setActiveModule } = useAppStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("menu");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [accentColor, setAccentColor] = useState<AccentColor>("emerald");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>("1.0.20");

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
      .then((data) => setAppVersion(data.currentVersion || "1.0.20"))
      .catch(() => setAppVersion("1.0.20"));
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

  const activeSection =
    activeTab === "menu"
      ? null
      : APP_SETTINGS_SECTIONS.find((section) => section.id === activeTab) ?? null;

  // Se captura antes del JSX: dentro de los callbacks `settings` ya no se estrecha.
  const isAdmin = settings.isAdmin === true;

  // Una vista por sección. El tipo `Record<SettingsSectionId, …>` obliga a que
  // toda sección nueva del registro tenga su pantalla: si falta, no compila.
  const sectionViews: Record<SettingsSectionId, ReactNode> = {
    general: (
      <GeneralSettings
        settings={settings}
        updateSetting={updateSetting}
        saving={saving}
        accentColor={accentColor}
        setAccentColor={setAccentColor}
        appVersion={appVersion}
        setResetResult={setResetResult}
      />
    ),
    finance: (
      <FinanceSettings
        settings={settings}
        updateSetting={updateSetting}
        fetchSettings={fetchSettings}
        setResetResult={setResetResult}
      />
    ),
    aura: (
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
    ),
    transport: <TransportSettings setResetResult={setResetResult} />,
    health: <HealthSettings setResetResult={setResetResult} />,
    pantry: <PantrySettings setResetResult={setResetResult} />,
    admin: (
      <Card className="border-0 shadow-sm rounded-xl p-4">
        <AdminPanel />
      </Card>
    ),
  };

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
            {activeSection ? activeSection.label : "Ajustes"}
          </h1>
          <p className="text-xs text-gray-400 truncate">
            {activeSection
              ? activeSection.hint
              : "Gestiona las opciones globales y módulos de Quid"}
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
          {SETTINGS_GROUPS.map((group) => {
            // Solo se pinta lo que el usuario puede ver: Admin depende de la sesión.
            const sections = APP_SETTINGS_SECTIONS.filter(
              (section) => section.group === group && (!section.adminOnly || isAdmin)
            );
            if (sections.length === 0) return null;

            return (
              <Fragment key={group}>
                <p className="col-span-full text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1 first:mt-0">
                  {GROUP_LABEL[group]}
                </p>
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <Card
                      key={section.id}
                      className={`border border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/30 rounded-2xl shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200 overflow-hidden cursor-pointer ${section.hover} ${section.wide ? "sm:col-span-2" : ""}`}
                      onClick={() => setActiveTab(section.id)}
                    >
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3.5">
                          <div className={`size-11 rounded-xl ${section.gradient} text-white flex items-center justify-center shadow-md ${section.glow} shrink-0`}>
                            <Icon className="size-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{section.label}</p>
                            <p className="text-[11px] text-gray-400 leading-snug">{section.hint}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {section.id === "aura" && (
                            <Badge
                              className={
                                auraLinked
                                  ? "bg-emerald-100 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 text-[10px] font-semibold border-0"
                                  : "bg-amber-100 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 text-[10px] font-semibold border-0"
                              }
                            >
                              {auraLinked ? "Vinculado" : "Pendiente"}
                            </Badge>
                          )}
                          {section.adminOnly && (
                            <Badge className="bg-slate-100 hover:bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-semibold border-0">
                              Admin
                            </Badge>
                          )}
                          <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      )}

      {/* ===== VISTAS ===== */}
      {activeSection && sectionViews[activeSection.id]}

      <ShareInvite open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}