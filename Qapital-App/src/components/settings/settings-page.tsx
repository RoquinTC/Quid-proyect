"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DaySelect } from "@/components/ui/day-select";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Settings,
  Sun,
  Moon,
  Monitor,
  Calendar,
  Landmark,
  Bell,
  RefreshCw,
  Info,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Globe,
  Car,
  Trash2,
  Wallet,
  Database,
  UserX,
} from "lucide-react";
import { AccountManager } from "@/components/finance/account-manager";
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
import { motion } from "framer-motion";
import { signOut } from "next-auth/react";

interface UserSettings {
  id: string;
  userId: string;
  theme: string;
  budgetCutoffDay: number;
  respectHolidays: boolean;
  countryCode: string;
  notificationsEnabled: boolean;
  lastBudgetReset: string | null;
  currentPeriod: {
    start: string;
    end: string;
  };
  needsBudgetReset: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SettingsPage() {
  const { setActiveModule } = useAppStore();
  const { setTheme: applyTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showResetFinanceDialog, setShowResetFinanceDialog] = useState(false);
  const [showResetTransportDialog, setShowResetTransportDialog] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [resettingTransport, setResettingTransport] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<UserSettings>("/api/settings");
      setSettings(data);
    } catch (err) {
      console.error("Error fetching settings:", err);
      setError(err instanceof Error ? err.message : "Error al cargar la configuración");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = async (key: string, value: unknown) => {
    if (!settings) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const updated = await apiFetch<UserSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ [key]: value }),
      });
      setSettings(updated);

      // Apply theme change immediately
      if (key === "theme" && typeof value === "string") {
        applyTheme(value);
      }

      setSaveMessage("Guardado");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (error) {
      console.error("Error updating setting:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleResetBudgets = async () => {
    setResetting(true);
    setResetResult(null);
    try {
      const result = await apiFetch<{ message: string; reset: boolean; count: number }>("/api/settings/reset-budgets", {
        method: "POST",
      });
      if (result.reset) {
        setResetResult(`Se reiniciaron ${result.count} presupuesto(s)`);
        fetchSettings(); // Refresh
      } else {
        setResetResult(result.message);
      }
      setTimeout(() => setResetResult(null), 4000);
    } catch (error) {
      console.error("Error resetting budgets:", error);
      setResetResult("Error al reiniciar presupuestos");
    } finally {
      setResetting(false);
    }
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
      // Sign out and redirect to login
      await signOut({ redirect: false });
      window.location.href = window.location.origin + "/";
    } catch (error) {
      console.error("Error deleting account:", error);
      setResetResult("Error al eliminar la cuenta");
      setDeletingAccount(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-4 space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl shrink-0"
            onClick={() => setActiveModule("dashboard")}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Ajustes</h1>
            <p className="text-xs text-gray-400">Configura tu experiencia en Qapital</p>
          </div>
        </div>

        {/* Error state */}
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-6 text-center space-y-4">
            <div className="size-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="size-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                No se pudo cargar la configuración
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {error || "Ocurrió un error inesperado"}
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3">
                Si es la primera vez que accedes, ejecuta <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">npx prisma db push</code> en la terminal para crear las tablas necesarias.
              </p>
            </div>
            <Button
              variant="outline"
              className="rounded-xl gap-2"
              onClick={fetchSettings}
            >
              <RefreshCw className="size-4" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-24"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl shrink-0"
          onClick={() => setActiveModule("dashboard")}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Ajustes</h1>
          <p className="text-xs text-gray-400">Configura tu experiencia en Qapital</p>
        </div>
        {saving && (
          <Loader2 className="size-4 animate-spin text-emerald-500 ml-auto" />
        )}
        {saveMessage && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            {saveMessage}
          </span>
        )}
      </motion.div>

      {/* ===== GENERAL SETTINGS ===== */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 mb-2">
          <Globe className="size-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">General</h2>
        </div>
      </motion.div>

      {/* Theme */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  {settings.theme === "light" ? (
                    <Sun className="size-4 text-violet-600 dark:text-violet-400" />
                  ) : settings.theme === "dark" ? (
                    <Moon className="size-4 text-violet-600 dark:text-violet-400" />
                  ) : (
                    <Monitor className="size-4 text-violet-600 dark:text-violet-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Tema</p>
                  <p className="text-[11px] text-gray-400">Apariencia de la aplicación</p>
                </div>
              </div>
              <Select
                value={settings.theme}
                onValueChange={(val) => updateSetting("theme", val)}
              >
                <SelectTrigger className="w-28 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Claro</SelectItem>
                  <SelectItem value="dark">Oscuro</SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Notifications */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Bell className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Notificaciones</p>
                  <p className="text-[11px] text-gray-400">Recibir alertas y recordatorios</p>
                </div>
              </div>
              <Switch
                checked={settings.notificationsEnabled}
                onCheckedChange={(val) => updateSetting("notificationsEnabled", val)}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== FINANCE SETTINGS ===== */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 mb-2 mt-4">
          <Landmark className="size-4 text-teal-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Finanzas</h2>
        </div>
      </motion.div>

      {/* Budget Cutoff Day */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Calendar className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Día de corte del presupuesto</p>
                <p className="text-[11px] text-gray-400">El día que inicia tu ciclo financiero mensual</p>
              </div>
            </div>

            {/* Cutoff day selector */}
            <div className="flex items-center gap-3 px-1">
              <Label className="text-xs text-gray-500 shrink-0">Día</Label>
              <DaySelect
                value={settings.budgetCutoffDay}
                onValueChange={(d) => updateSetting("budgetCutoffDay", d)}
                placeholder="Día"
                className="w-24 rounded-xl h-9"
              />
              <span className="text-[11px] text-gray-400">de cada mes</span>
            </div>

            {/* Current period info */}
            <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3">
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mb-1">
                Período actual
              </p>
              <p className="text-xs text-gray-700 dark:text-gray-300">
                {formatDateShort(settings.currentPeriod.start)} — {formatDateShort(settings.currentPeriod.end)}
              </p>
              {settings.budgetCutoffDay !== 1 && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Ejemplo: Si tu día de corte es el {settings.budgetCutoffDay}, el período va del {settings.budgetCutoffDay} de un mes al {settings.budgetCutoffDay - 1} del siguiente
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Respect Holidays */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                  <Info className="size-4 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Considerar días festivos</p>
                  <p className="text-[11px] text-gray-400">
                    Si el día de corte cae en festivo o fin de semana, se mueve al día hábil anterior
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.respectHolidays}
                onCheckedChange={(val) => updateSetting("respectHolidays", val)}
              />
            </div>
            {settings.respectHolidays && (
              <div className="mt-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3">
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Se consideran los festivos de Colombia. Si el día {settings.budgetCutoffDay} cae en sábado, domingo o festivo, el corte real será el día hábil anterior.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Reset Budgets */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <RefreshCw className="size-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Reiniciar presupuestos</p>
                <p className="text-[11px] text-gray-400">
                  Poner en $0 lo gastado de todos los presupuestos
                </p>
              </div>
            </div>

            {settings.needsBudgetReset && (
              <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Tus presupuestos necesitan reiniciarse para el período actual. Esto se hace automáticamente pero también puedes hacerlo manualmente.
                </p>
              </div>
            )}

            <Button
              variant="outline"
              className="w-full rounded-xl text-xs gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/10"
              onClick={handleResetBudgets}
              disabled={resetting}
            >
              {resetting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Reiniciar Ahora
            </Button>

            {resetResult && (
              <p className="text-xs text-center text-emerald-600 dark:text-emerald-400">
                {resetResult}
              </p>
            )}

            {settings.lastBudgetReset && (
              <p className="text-[10px] text-center text-gray-400">
                Último reinicio: {formatDateShort(settings.lastBudgetReset)}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== ACCOUNT MANAGEMENT ===== */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 mb-2 mt-4">
          <Database className="size-4 text-teal-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Gestión de Cuentas</h2>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-9 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <Landmark className="size-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Cuentas registradas</p>
                <p className="text-[11px] text-gray-400">Ver, editar y eliminar cuentas. Incluye cuentas que no aparecen en el dashboard.</p>
              </div>
            </div>
            <AccountManager />
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== DATA MANAGEMENT ===== */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-2 mb-2 mt-4">
          <Trash2 className="size-4 text-red-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Gestión de Datos</h2>
        </div>
      </motion.div>

      {/* Reset All Finance Data */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Wallet className="size-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Eliminar datos financieros</p>
                <p className="text-[11px] text-gray-400">
                  Borra todas las cuentas, transacciones, presupuestos, deudas y ahorros
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-xl text-xs gap-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/10"
              onClick={() => setShowResetFinanceDialog(true)}
            >
              <Trash2 className="size-3.5" />
              Eliminar Todo
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Reset Transport Data */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Car className="size-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Eliminar datos de transporte</p>
                <p className="text-[11px] text-gray-400">
                  Borra todos los vehículos, registros de combustible y mantenimiento
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-xl text-xs gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/10"
              onClick={() => setShowResetTransportDialog(true)}
            >
              <Trash2 className="size-3.5" />
              Eliminar Datos de Transporte
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Delete Account */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl border border-red-200 dark:border-red-900/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <UserX className="size-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Eliminar cuenta</p>
                <p className="text-[11px] text-gray-400">
                  Borra permanentemente tu usuario y todos los datos de todos los módulos
                </p>
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-3">
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Al eliminar tu cuenta se borrarán todos tus datos sin excepción: finanzas, transporte, salud, despensa y configuración. Esta acción no se puede deshacer.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-xl text-xs gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/10"
              onClick={() => setShowDeleteAccountDialog(true)}
            >
              <UserX className="size-3.5" />
              Eliminar Mi Cuenta
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Global reset result */}
      {resetResult && (
        <motion.div variants={itemVariants}>
          <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3 text-center">
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{resetResult}</p>
          </div>
        </motion.div>
      )}

      {/* Reset Finance Dialog */}
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
            <AlertDialogAction
              className="rounded-xl bg-red-500 hover:bg-red-600"
              onClick={handleResetAllFinanceData}
              disabled={resettingAll}
            >
              {resettingAll ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Eliminar Todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Transport Dialog */}
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
            <AlertDialogAction
              className="rounded-xl bg-red-500 hover:bg-red-600"
              onClick={handleResetTransportData}
              disabled={resettingTransport}
            >
              {resettingTransport ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteAccountDialog} onOpenChange={setShowDeleteAccountDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="flex items-center justify-center size-12 rounded-2xl bg-red-100 dark:bg-red-900/30 mx-auto mb-3">
              <UserX className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <AlertDialogTitle className="text-center">¿Eliminar tu cuenta?</AlertDialogTitle>
            <AlertDialogDescription className="text-center space-y-2">
              <span className="block">Esta acción eliminará <strong>permanentemente</strong> tu cuenta y <strong>todos</strong> tus datos: cuentas, transacciones, presupuestos, deudas, ahorros, vehículos, medicamentos, despensa y configuración.</span>
              <span className="block text-red-600 dark:text-red-400 font-medium">No se puede deshacer. Perderás acceso a toda tu información.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="rounded-xl" disabled={deletingAccount}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={handleDeleteAccount}
              disabled={deletingAccount}
            >
              {deletingAccount ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Sí, eliminar mi cuenta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* App Info */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-sm rounded-xl bg-gray-50 dark:bg-gray-800/30">
          <CardContent className="p-4 text-center">
            <div className="inline-flex items-center justify-center size-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm mb-2">
              <span className="text-xs font-bold text-white">Q</span>
            </div>
            <p className="text-xs font-semibold text-gray-900 dark:text-white">Qapital</p>
            <p className="text-[10px] text-gray-400">v1.0.0</p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
