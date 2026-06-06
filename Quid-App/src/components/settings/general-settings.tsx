"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  Loader2,
  AlertTriangle,
  Globe,
  Car,
  Trash2,
  Wallet,
  UserX,
  Lock,
  ChevronDown,
  ShieldCheck,
  BellRing,
  Smartphone,
  Palette,
  Check,
  Trophy,
  Sparkles,
} from "lucide-react";
import { BackupManager } from "@/components/settings/backup-manager";
import { AchievementsView } from "@/components/settings/achievements-view";
import { SecuritySettings } from "@/components/security/security-settings";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { performLogout } from "@/lib/logout";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import {
  ACCENT_OPTIONS,
  applyAccent,
  readStoredAccent,
  storeAccent,
  type AccentColor,
} from "@/lib/personalization";
import {
  readStoredTheme,
  storeTheme,
  applyTheme as applyThemeConfig,
  getRecommendedThemeModeForPalette,
  type ThemeConfig,
  type ThemeFinish,
  type ThemePalette,
} from "@/lib/theme-engine";
import type { UserSettings } from "@/lib/types";

type GeneralSettingsProps = {
  settings: UserSettings & { userId: string; isAdmin?: boolean };
  updateSetting: (key: string, value: unknown) => Promise<void>;
  saving: boolean;
  accentColor: AccentColor;
  setAccentColor: (accent: AccentColor) => void;
  appVersion: string;
  setResetResult: (msg: string | null) => void;
};

function SectionHeader({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  badge,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3 w-full">
      <div className={`size-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`size-4 ${iconColor}`} />
      </div>
      <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
      {badge && (
        <Badge variant="secondary" className="text-xs ml-auto mr-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {badge}
        </Badge>
      )}
    </div>
  );
}

export function GeneralSettings({
  settings,
  updateSetting,
  saving,
  accentColor,
  setAccentColor,
  appVersion,
  setResetResult,
}: GeneralSettingsProps) {
  const { setTheme: applyTheme } = useTheme();
  const push = usePushNotifications();
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(() => readStoredTheme());

  // Dialog states
  const [showResetFinanceDialog, setShowResetFinanceDialog] = useState(false);
  const [showResetTransportDialog, setShowResetTransportDialog] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);

  // Loading states
  const [resettingAll, setResettingAll] = useState(false);
  const [resettingTransport, setResettingTransport] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const updateAccentColor = (accent: AccentColor) => {
    setAccentColor(accent);
    storeAccent(accent);
    applyAccent(accent);
    setResetResult("Color de acento actualizado");
    setTimeout(() => setResetResult(null), 2000);
  };

  const updateVisualTheme = async (palette: ThemePalette) => {
    const recommendedMode = getRecommendedThemeModeForPalette(palette);
    const newConfig = { ...themeConfig, palette };

    setThemeConfig(newConfig);
    storeTheme(newConfig);
    applyThemeConfig(newConfig);
    applyTheme(recommendedMode);
    await updateSetting("theme", recommendedMode);

    setResetResult(
      recommendedMode === "oled"
        ? "Tema visual aplicado en modo OLED"
        : "Tema visual aplicado en modo claro"
    );
    setTimeout(() => setResetResult(null), 2000);
  };

  const handleResetAllFinanceData = async () => {
    setResettingAll(true);
    try {
      await apiFetch("/api/settings/reset-all-data", { method: "POST" });
      setResetResult("Todos los datos financieros eliminados");
      setShowResetFinanceDialog(false);
      setTimeout(() => setResetResult(null), 4000);
    } catch (error) {
      console.error("Error resetting all data:", error);
      setResetResult("Error al eliminar los datos");
    } finally {
      setResettingAll(false);
    }
  };

  const handleResetTransportData = async () => {
    setResettingTransport(true);
    try {
      await apiFetch("/api/settings/reset-transport", { method: "POST" });
      setResetResult("Datos de transporte eliminados");
      setShowResetTransportDialog(false);
      setTimeout(() => setResetResult(null), 4000);
    } catch (error) {
      console.error("Error resetting transport data:", error);
      setResetResult("Error al eliminar datos de transporte");
    } finally {
      setResettingTransport(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await apiFetch("/api/settings/delete-account", { method: "POST" });
      setShowDeleteAccountDialog(false);
      await performLogout();
    } catch (error) {
      console.error("Error deleting account:", error);
      setResetResult("Error al eliminar la cuenta");
      setDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={[]} className="space-y-2">
        {/* Personalización */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="personalizacion" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Palette} iconColor="text-emerald-600" iconBg="bg-emerald-100 dark:bg-emerald-900/30" title="Personalización" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              {/* Tema */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        {settings.theme === "light" ? (
                          <Sun className="size-3.5 text-violet-600 dark:text-violet-400" />
                        ) : settings.theme === "dark" || settings.theme === "oled" ? (
                          <Moon className="size-3.5 text-violet-600 dark:text-violet-400" />
                        ) : (
                          <Monitor className="size-3.5 text-violet-600 dark:text-violet-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Tema</p>
                        <p className="text-xs text-gray-400">Apariencia de la aplicación</p>
                      </div>
                    </div>
                    <Select
                      value={settings.theme}
                      onValueChange={(val) => {
                        applyTheme(val);
                        updateSetting("theme", val);
                      }}
                    >
                      <SelectTrigger className="w-24 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Claro</SelectItem>
                        <SelectItem value="dark">Oscuro</SelectItem>
                        <SelectItem value="oled">OLED</SelectItem>
                        <SelectItem value="system">Sistema</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Tema visual */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <Palette className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Tema visual</p>
                        <p className="text-xs text-gray-400">Ambiente completo de la app</p>
                      </div>
                    </div>
                    <Select
                      value={themeConfig.palette}
                      onValueChange={(val: ThemePalette) => {
                        void updateVisualTheme(val);
                      }}
                    >
                      <SelectTrigger className="w-32 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Quid</SelectItem>
                        <SelectItem value="dracula">Drácula nocturno</SelectItem>
                        <SelectItem value="cyberpunk">Punk neón OLED</SelectItem>
                        <SelectItem value="romantic">Romántico</SelectItem>
                        <SelectItem value="ocean">Océano</SelectItem>
                        <SelectItem value="forest">Bosque</SelectItem>
                        <SelectItem value="sunset">Atardecer</SelectItem>
                        <SelectItem value="aurora">Aurora</SelectItem>
                        <SelectItem value="zen">Zen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Acabado del Tema */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                        <Sparkles className="size-3.5 text-pink-600 dark:text-pink-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Estilo de Acabado</p>
                        <p className="text-xs text-gray-400">Materiales y profundidad visual</p>
                      </div>
                    </div>
                    <Select
                      value={themeConfig.finish}
                      onValueChange={(val: ThemeFinish) => {
                        const newConfig = { ...themeConfig, finish: val };
                        setThemeConfig(newConfig);
                        storeTheme(newConfig);
                        applyThemeConfig(newConfig);
                        setResetResult("Estilo de acabado actualizado");
                        setTimeout(() => setResetResult(null), 2000);
                      }}
                    >
                      <SelectTrigger className="w-32 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Mate</SelectItem>
                        <SelectItem value="glass">Cristal</SelectItem>
                        <SelectItem value="neon">Neón</SelectItem>
                        <SelectItem value="soft3d">3D suave</SelectItem>
                        <SelectItem value="liquid">Líquido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Color de acento */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <Palette className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Color de acento</p>
                        <p className="text-xs text-gray-400">Detalles principales de la interfaz</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5 max-w-40">
                      {ACCENT_OPTIONS.map((option) => {
                        const selected = accentColor === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => updateAccentColor(option.id)}
                            title={option.label}
                            aria-label={`Usar color ${option.label}`}
                            aria-pressed={selected}
                            className={`relative size-8 rounded-lg border transition-all ${
                              selected
                                ? "border-gray-900 ring-2 ring-primary ring-offset-2 ring-offset-white dark:border-white dark:ring-offset-gray-900"
                                : "border-gray-200 hover:scale-105 dark:border-gray-700"
                            }`}
                            style={{ backgroundColor: option.swatch }}
                          >
                            {selected && (
                              <Check className="absolute inset-0 m-auto size-4 text-white drop-shadow" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notificaciones de la app */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Bell className="size-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Alertas en la app</p>
                        <p className="text-xs text-gray-400">Recibir alertas dentro de Quid</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.notificationsEnabled}
                      onCheckedChange={(val) => updateSetting("notificationsEnabled", val)}
                    />
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Notificaciones Push */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="push" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Smartphone} iconColor="text-blue-500" iconBg="bg-blue-50 dark:bg-blue-900/20" title="Notificaciones Push" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <Smartphone className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Estado de Suscripción</p>
                        <p className="text-xs text-gray-400">Mensajes en segundo plano</p>
                      </div>
                    </div>
                    {push.isSupported ? (
                      push.isSubscribed ? (
                        <Badge variant="secondary" className="text-[11px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0 gap-1">
                          <BellRing className="size-3" />
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[11px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                          Inactivo
                        </Badge>
                      )
                    ) : (
                      <Badge variant="secondary" className="text-[11px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                        No disponible
                      </Badge>
                    )}
                  </div>

                  {push.isSupported && (
                    <>
                      {push.permission === 'denied' && (
                        <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-2.5">
                          <p className="text-xs text-red-600 dark:text-red-400">
                            Las notificaciones están bloqueadas en tu navegador. Por favor permitelas en los ajustes del sitio.
                          </p>
                        </div>
                      )}

                      {push.permission === 'default' && !push.isSubscribed && (
                        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-2.5">
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Activa las alertas del sistema para recibir avisos de tus finanzas y salud directamente en tu móvil.
                          </p>
                        </div>
                      )}

                      {!push.isSubscribed && push.permission !== 'denied' ? (
                        <Button
                          className="w-full rounded-xl text-xs gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                          onClick={() => push.subscribe()}
                          disabled={push.isLoading}
                        >
                          {push.isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />}
                          Activar notificaciones push
                        </Button>
                      ) : push.isSubscribed ? (
                        <Button
                          variant="outline"
                          className="w-full rounded-xl text-xs gap-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 h-8"
                          onClick={() => push.unsubscribe()}
                          disabled={push.isLoading}
                        >
                          {push.isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
                          Desactivar notificaciones push
                        </Button>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Seguridad */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="seguridad" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Lock} iconColor="text-emerald-600" iconBg="bg-emerald-100 dark:bg-emerald-900/30" title="Seguridad" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <SecuritySettings />
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Respaldo y Recuperación */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="respaldo" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={ShieldCheck} iconColor="text-amber-600" iconBg="bg-amber-100 dark:bg-amber-900/30" title="Respaldo y Recuperación" badge="Seguro" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <BackupManager />
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Logros */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="logros" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Trophy} iconColor="text-emerald-600" iconBg="bg-emerald-100 dark:bg-emerald-900/30" title="Logros y Descubrimiento" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <AchievementsView />
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Destructivos / Gestión de Datos */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="datos" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50 text-red-500">
              <SectionHeader icon={Trash2} iconColor="text-red-500" iconBg="bg-red-100 dark:bg-red-900/30" title="Gestión de Datos y Eliminación" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              {/* Reset Finance Data */}
              <Card className="border border-red-100 dark:border-red-900/30 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <Wallet className="size-3.5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Eliminar datos financieros</p>
                      <p className="text-xs text-gray-400">Borra cuentas, transacciones y presupuestos</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl text-xs gap-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 h-8"
                    onClick={() => setShowResetFinanceDialog(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Eliminar Todo
                  </Button>
                </CardContent>
              </Card>

              {/* Reset Transport Data */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Car className="size-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Eliminar datos de transporte</p>
                      <p className="text-xs text-gray-400">Borra vehículos, recargas y mantenimientos</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl text-xs gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 h-8"
                    onClick={() => setShowResetTransportDialog(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Eliminar Datos de Transporte
                  </Button>
                </CardContent>
              </Card>

              {/* Delete Account */}
              <Card className="border border-red-200 dark:border-red-900/30 shadow-none rounded-xl bg-red-50/10">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <UserX className="size-3.5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-red-700 dark:text-red-400">Eliminar cuenta definitivamente</p>
                      <p className="text-xs text-gray-400">Borra tu usuario y todo registro de Quid</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl text-xs gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 h-8"
                    onClick={() => setShowDeleteAccountDialog(true)}
                  >
                    <UserX className="size-3.5" />
                    Eliminar Mi Cuenta
                  </Button>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>
      </Accordion>

      {/* App Info Footer */}
      <Card className="border-0 shadow-sm rounded-xl bg-gray-50 dark:bg-gray-800/30">
        <CardContent className="p-3 text-center">
          <div className="inline-flex items-center justify-center size-7 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm mb-1.5">
            <span className="text-xs font-bold text-white">Q</span>
          </div>
          <p className="text-[11px] font-semibold text-gray-900 dark:text-white">Quid</p>
          <div className="flex flex-col gap-0.5">
            <p className="text-[11px] text-gray-400">Versión {appVersion}</p>
            <div className="flex items-center justify-center gap-1.5 opacity-70">
              <div className="size-1 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] text-gray-500">Canal beta Android/PWA</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== DIALOGS ===== */}
      <AlertDialog open={showResetFinanceDialog} onOpenChange={setShowResetFinanceDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todos los datos financieros?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente todas tus cuentas, transacciones, presupuestos, deudas, ahorros y pagos recurrentes. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-red-500 hover:bg-red-600" onClick={handleResetAllFinanceData} disabled={resettingAll}>
              {resettingAll ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Eliminar Todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetTransportDialog} onOpenChange={setShowResetTransportDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar datos de transporte?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente todos los vehículos, registros de combustible y mantenimiento. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-red-500 hover:bg-red-600" onClick={handleResetTransportData} disabled={resettingTransport}>
              {resettingTransport ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAccountDialog} onOpenChange={setShowDeleteAccountDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="flex items-center justify-center size-12 rounded-2xl bg-red-100 dark:bg-red-900/30 mx-auto mb-3">
              <UserX className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <AlertDialogTitle className="text-center">¿Eliminar tu cuenta?</AlertDialogTitle>
            <AlertDialogDescription className="text-center space-y-2">
              <span className="block">Esta acción eliminará <strong>permanentemente</strong> tu cuenta y <strong>todos</strong> tus datos.</span>
              <span className="block text-red-600 dark:text-red-400 font-medium">No se puede deshacer. Perderás acceso a toda tu información.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="rounded-xl" disabled={deletingAccount}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-red-600 hover:bg-red-700" onClick={handleDeleteAccount} disabled={deletingAccount}>
              {deletingAccount ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Sí, eliminar mi cuenta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
