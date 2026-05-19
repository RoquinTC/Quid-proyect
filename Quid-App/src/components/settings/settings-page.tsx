"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
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
  Upload,
  FileSpreadsheet,
  Link,
  Lock,
  ChevronDown,
  ArrowRightLeft,
  Target,
  CreditCard,
  PiggyBank,
  Landmark as BankIcon,
  Download,
  Tags,
  ShieldCheck,
  BellRing,
  Smartphone,
  Send,
  MessageSquare,
  Share2,
} from "lucide-react";
import { AccountManager } from "@/components/finance/account-manager";
import { CategoriesManager } from "@/components/finance/categories-manager";
import { BackupManager } from "@/components/settings/backup-manager";
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
import type { UserSettings } from "@/lib/types";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { ShareInvite } from "@/components/pwa/share-invite";

type AppSettings = UserSettings & {
  userId: string;
  currentPeriod: {
    start: string;
    end: string;
  };
  needsBudgetReset: boolean;
  telegramId?: string | null;
};

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

// Section header component for accordion triggers
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
        <Badge variant="secondary" className="text-[10px] ml-auto mr-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {badge}
        </Badge>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { setActiveModule } = useAppStore();
  const { setTheme: applyTheme } = useTheme();
  const push = usePushNotifications();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentBuildId, setCurrentBuildId] = useState<string>('...');

  // Fetch current build ID
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setCurrentBuildId(data.buildId))
      .catch(() => setCurrentBuildId('Error'));
  }, []);
  const mountedRef = useRef(true);
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

  // Share state
  const [shareOpen, setShareOpen] = useState(false);

  // Aura AI state
  const [auraPairingCode, setAuraPairingCode] = useState("");
  const [linkingAura, setLinkingAura] = useState(false);
  const [auraLinked, setAuraLinked] = useState(false);


  // Import state (legacy CSV)
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    result?: { total: number; created: number; skipped: number; errors: string[] };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transaction import state (xlsx)
  const [importingTransactions, setImportingTransactions] = useState(false);
  const [transactionImportResult, setTransactionImportResult] = useState<{
    success: boolean;
    result?: { total: number; created: number; skipped: number; errors: string[] };
  } | null>(null);
  const transactionFileRef = useRef<HTMLInputElement>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AppSettings>("/api/settings");
      if (mountedRef.current) setSettings(data);
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

  useEffect(() => {
    if (settings && (settings as any).telegramId) {
      setAuraLinked(true);
    } else {
      setAuraLinked(false);
    }
  }, [settings]);

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
        fetchSettings();
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
      await performLogout();
    } catch (error) {
      console.error("Error deleting account:", error);
      setResetResult("Error al eliminar la cuenta");
      setDeletingAccount(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        setImportResult({ success: false });
        setImporting(false);
        return;
      }

      // Parse CSV: header + data rows
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const values = line.split(",").map((v) => v.trim());
        const row: Record<string, string> = {};
        header.forEach((h, i) => {
          row[h] = values[i] || "";
        });
        return {
          modulo: row["modulo"] || row["módulo"] || "",
          campo1: row["campo1"] || row["nombre"] || "",
          campo2: row["campo2"] || row["tipo"] || "",
          campo3: row["campo3"] || row["monto"] || row["saldo"] || "",
          campo4: row["campo4"] || row["categoría"] || row["categoria"] || "",
          campo5: row["campo5"] || row["tasa"] || "",
          campo6: row["campo6"] || row["banco"] || "",
          campo7: row["campo7"] || "",
          campo8: row["campo8"] || "",
        };
      });

      const result = await apiFetch<{
        success: boolean;
        result: { total: number; created: number; skipped: number; errors: string[] };
      }>("/api/settings/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });

      setImportResult(result);
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({ success: false });
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadTemplate = async (type: string) => {
    setDownloadingTemplate(type);
    try {
      const response = await fetch(`/api/settings/import/template?type=${type}`);
      if (!response.ok) throw new Error("Error al descargar plantilla");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quid-plantilla-${type}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download template error:", error);
    } finally {
      setDownloadingTemplate(null);
    }
  };

  const handleTransactionImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingTransactions(true);
    setTransactionImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/settings/import/transactions", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setTransactionImportResult(data);
    } catch (error) {
      console.error("Transaction import error:", error);
      setTransactionImportResult({ success: false });
    } finally {
      setImportingTransactions(false);
      if (transactionFileRef.current) transactionFileRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
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
    <div className="p-4 space-y-3 pb-safe">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => setActiveModule("dashboard")}>
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Ajustes</h1>
          <p className="text-xs text-gray-400">Configura tu experiencia en Quid</p>
        </div>
        {saving && <Loader2 className="size-4 animate-spin text-emerald-500 ml-auto" />}
        {saveMessage && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            {saveMessage}
          </span>
        )}
      </div>

      {/* Global result message */}
      {resetResult && (
        <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3 text-center">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{resetResult}</p>
        </div>
      )}

      {/* ===== ACCORDION SECTIONS ===== */}
      <Accordion type="multiple" defaultValue={["general", "finanzas"]} className="space-y-2">

        {/* ── GENERAL ── */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="general" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Globe} iconColor="text-emerald-600" iconBg="bg-emerald-100 dark:bg-emerald-900/30" title="General" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              {/* Theme */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        {settings.theme === "light" ? <Sun className="size-3.5 text-violet-600 dark:text-violet-400" /> : settings.theme === "dark" ? <Moon className="size-3.5 text-violet-600 dark:text-violet-400" /> : <Monitor className="size-3.5 text-violet-600 dark:text-violet-400" />}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Tema</p>
                        <p className="text-[10px] text-gray-400">Apariencia de la aplicación</p>
                      </div>
                    </div>
                    <Select value={settings.theme} onValueChange={(val) => updateSetting("theme", val)}>
                      <SelectTrigger className="w-24 rounded-xl text-xs h-8">
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

              {/* Notifications */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Bell className="size-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Notificaciones en la app</p>
                        <p className="text-[10px] text-gray-400">Recibir alertas y recordatorios dentro de Quid</p>
                      </div>
                    </div>
                    <Switch checked={settings.notificationsEnabled} onCheckedChange={(val) => updateSetting("notificationsEnabled", val)} />
                  </div>
                </CardContent>
              </Card>

              {/* Push Notifications */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <Smartphone className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Notificaciones push</p>
                        <p className="text-[10px] text-gray-400">Recibir alertas en tu celular aunque la app esté cerrada</p>
                      </div>
                    </div>
                    {push.isSupported ? (
                      push.isSubscribed ? (
                        <Badge variant="secondary" className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0 gap-1">
                          <BellRing className="size-3" />
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                          Inactivo
                        </Badge>
                      )
                    ) : (
                      <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                        No disponible
                      </Badge>
                    )}
                  </div>

                  {push.isSupported && (
                    <>
                      {/* Permission status */}
                      {push.permission === 'denied' && (
                        <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-2.5">
                          <p className="text-[10px] text-red-600 dark:text-red-400">
                            Las notificaciones están bloqueadas. Ve a la configuración de tu navegador y permite notificaciones para este sitio.
                          </p>
                        </div>
                      )}

                      {push.permission === 'default' && !push.isSubscribed && (
                        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-2.5">
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Activa las notificaciones push para recibir alertas de cuentas compartidas, pagos recurrentes y más directamente en tu celular.
                          </p>
                        </div>
                      )}

                      {/* Subscribe/Unsubscribe button */}
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

                      {/* Info about what you'll receive */}
                      {push.isSubscribed && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-2.5 space-y-1">
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Recibirás notificaciones de:</p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md">Cuentas compartidas</span>
                            <span className="text-[9px] bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md">Pagos recurrentes</span>
                            <span className="text-[9px] bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-md">Invitaciones</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {!push.isSupported && (
                    <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-2.5">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        Las notificaciones push requieren instalar la app como PWA y usar un navegador compatible (Chrome, Edge, Firefox). Safari en iOS tiene soporte limitado.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Share / Invite */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <button
                    onClick={() => setShareOpen(true)}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Share2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Invitar a Quid</p>
                      <p className="text-[10px] text-gray-400">Comparte la app con amigos y familiares</p>
                    </div>
                    <ChevronDown className="size-3.5 text-gray-300 dark:text-gray-600 -rotate-90" />
                  </button>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ── AURA AI ── */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="aura" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Send} iconColor="text-blue-500" iconBg="bg-blue-50 dark:bg-blue-900/20" title="Aura AI - Telegram" badge={auraLinked ? "Vinculado" : "Pendiente"} />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-blue-100 dark:border-blue-900/30 shadow-none rounded-xl bg-blue-50/30 dark:bg-blue-900/5">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-2xl bg-blue-500 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                      <Send className="size-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">Conecta con Aura</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Habla con tu asistente financiera por Telegram, consulta saldos y registra gastos con lenguaje natural.</p>
                    </div>
                  </div>

                  {!auraLinked ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="pairing-code" className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Código de vinculación</Label>
                        <div className="relative">
                          <input
                            id="pairing-code"
                            type="text"
                            placeholder="Ej: NLMR3J"
                            value={auraPairingCode}
                            onChange={(e) => setAuraPairingCode(e.target.value.toUpperCase())}
                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all uppercase"
                            maxLength={6}
                          />
                        </div>
                      </div>
                      <Button 
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-6 shadow-md shadow-blue-500/10 gap-2"
                        disabled={linkingAura || auraPairingCode.length < 4}
                        onClick={async () => {
                          setLinkingAura(true);
                          try {
                            const res = await fetch("/api/aura/link", {
                              method: "POST",
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ code: auraPairingCode })
                            });
                            
                            const data = await res.json();
                            
                            if (res.ok && data.success) {
                              setAuraLinked(true);
                              setResetResult("¡Aura vinculada con éxito! 🌸");
                            } else {
                              throw new Error(data.error || "Error al vincular");
                            }
                          } catch (err: any) {
                            setError(err.message || "Código inválido o expirado");
                          } finally {
                            setLinkingAura(false);
                          }
                        }}
                      >
                        {linkingAura ? <Loader2 className="size-4 animate-spin" /> : <Link className="size-4" />}
                        Vincular con Telegram
                      </Button>
                      <p className="text-[10px] text-center text-gray-400">¿No tienes un código? Escríbele /start a tu bot de Telegram</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                        <div className="size-8 rounded-full bg-emerald-500 flex items-center justify-center">
                          <CheckCircle2 className="size-4 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">¡Ya eres amigo de Aura!</p>
                          <p className="text-[10px] text-emerald-600/70 dark:text-emerald-500/70">Puedes escribirle por Telegram en cualquier momento.</p>
                        </div>
                      </div>
                      
                      <Button 
                        variant="outline"
                        className="w-full bg-[#0088cc] hover:bg-[#0077b5] text-white border-0 rounded-xl py-6 shadow-md gap-2"
                        onClick={() => window.open('https://t.me/Aura_RQC_Bot', '_blank')}
                      >
                        <MessageSquare className="size-4" />
                        Ir al Chat con Aura
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ── SEGURIDAD ── */}
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

        {/* ── FINANZAS ── */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="finanzas" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Landmark} iconColor="text-teal-600" iconBg="bg-teal-100 dark:bg-teal-900/30" title="Finanzas" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              {/* Budget Cutoff Day */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Calendar className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Día de corte del presupuesto</p>
                      <p className="text-[10px] text-gray-400">El día que inicia tu ciclo financiero mensual</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-1">
                    <Label className="text-xs text-gray-500 shrink-0">Día</Label>
                    <DaySelect value={settings.budgetCutoffDay} onValueChange={(d) => updateSetting("budgetCutoffDay", d)} placeholder="Día" className="w-24 rounded-xl h-9" />
                    <span className="text-[11px] text-gray-400">de cada mes</span>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-2.5">
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mb-0.5">Período actual</p>
                    <p className="text-[11px] text-gray-700 dark:text-gray-300">
                      {settings.currentPeriod
                        ? `${formatDateShort(settings.currentPeriod.start)} — ${formatDateShort(settings.currentPeriod.end)}`
                        : "Sin período configurado"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Respect Holidays */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                        <Info className="size-3.5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Considerar días festivos</p>
                        <p className="text-[10px] text-gray-400">Mover corte a día hábil anterior</p>
                      </div>
                    </div>
                    <Switch checked={settings.respectHolidays} onCheckedChange={(val) => updateSetting("respectHolidays", val)} />
                  </div>
                </CardContent>
              </Card>

              {/* Reset Budgets */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <RefreshCw className="size-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Reiniciar presupuestos</p>
                      <p className="text-[10px] text-gray-400">Poner en $0 lo gastado</p>
                    </div>
                  </div>
                  {settings.needsBudgetReset && (
                    <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-2 flex items-start gap-2">
                      <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-600 dark:text-amber-400">Tus presupuestos necesitan reiniciarse para el período actual.</p>
                    </div>
                  )}
                  <Button variant="outline" className="w-full rounded-xl text-xs gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/10 h-8" onClick={handleResetBudgets} disabled={resetting}>
                    {resetting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Reiniciar Ahora
                  </Button>
                  {settings.lastBudgetReset && (
                    <p className="text-[10px] text-center text-gray-400">Último reinicio: {formatDateShort(settings.lastBudgetReset)}</p>
                  )}
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ── GESTIÓN DE CUENTAS ── */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="cuentas" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Database} iconColor="text-teal-600" iconBg="bg-teal-100 dark:bg-teal-900/30" title="Gestión de Cuentas" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="size-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <Landmark className="size-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Cuentas registradas</p>
                      <p className="text-[10px] text-gray-400">Ver, editar y eliminar cuentas</p>
                    </div>
                  </div>
                  <AccountManager />
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ── PRESUPUESTO - CATEGORÍAS ── */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="categorias" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Tags} iconColor="text-violet-600" iconBg="bg-violet-100 dark:bg-violet-900/30" title="Presupuesto - Categorías" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                      <Tags className="size-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Categorías y subcategorías</p>
                      <p className="text-[10px] text-gray-400">Editar nombres o eliminar categorías de presupuesto</p>
                    </div>
                  </div>
                  <CategoriesManager />
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ── CARGUE DE DATOS ── */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="cargue" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Upload} iconColor="text-indigo-600" iconBg="bg-indigo-100 dark:bg-indigo-900/30" title="Cargue de Datos" badge="Nuevo" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">

              {/* ── 1. MOVIMIENTOS FINANCIEROS (FUNCIONAL) ── */}
              <Card className="border border-emerald-200 dark:border-emerald-800/40 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <ArrowRightLeft className="size-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">Movimientos Financieros</p>
                      <p className="text-[10px] text-gray-400">Ingresos, gastos y transferencias</p>
                    </div>
                    <Badge variant="secondary" className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">
                      Principal
                    </Badge>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-2.5 space-y-1.5">
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      La plantilla tiene 3 hojas:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md">Ingresos</span>
                      <span className="text-[9px] bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-md">Gastos</span>
                      <span className="text-[9px] bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md">Transferencias</span>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Cada hoja corresponde a los campos reales: fecha, descripción, monto, categoría, subcategoría, cuenta y subcuenta.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl text-xs gap-1.5 border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 h-8"
                      onClick={() => handleDownloadTemplate("movimientos")}
                      disabled={downloadingTemplate === "movimientos"}
                    >
                      {downloadingTemplate === "movimientos" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                      Descargar Plantilla
                    </Button>
                    <Button
                      className="flex-1 rounded-xl text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                      onClick={() => transactionFileRef.current?.click()}
                      disabled={importingTransactions}
                    >
                      {importingTransactions ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                      Cargar Excel
                    </Button>
                  </div>
                  <input
                    ref={transactionFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleTransactionImport}
                  />
                  {transactionImportResult && (
                    <div className={`rounded-xl p-2.5 ${transactionImportResult.success ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-red-50 dark:bg-red-900/10"}`}>
                      {transactionImportResult.result ? (
                        <div className="text-[10px] space-y-1">
                          <p className={transactionImportResult.success ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                            {transactionImportResult.result.created} de {transactionImportResult.result.total} movimientos importados
                          </p>
                          {transactionImportResult.result.skipped > 0 && (
                            <p className="text-amber-600 dark:text-amber-400">{transactionImportResult.result.skipped} omitidos</p>
                          )}
                          {transactionImportResult.result.errors.length > 0 && (
                            <div className="text-red-500 space-y-0.5">
                              {transactionImportResult.result.errors.slice(0, 3).map((err, i) => (
                                <p key={i}>{err}</p>
                              ))}
                              {transactionImportResult.result.errors.length > 3 && (
                                <p>...y {transactionImportResult.result.errors.length - 3} errores más</p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-red-600 dark:text-red-400">Error al procesar el archivo. Verifica que sea un Excel (.xlsx) con el formato correcto.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── 2. PRESUPUESTOS (PRÓXIMAMENTE) ── */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl opacity-60">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Target className="size-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Presupuestos</p>
                      <p className="text-[10px] text-gray-400">Carga categorías y montos asignados por periodo</p>
                    </div>
                    <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                      Próximamente
                    </Badge>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-2">
                    <p className="text-[10px] text-gray-400">
                      Columnas: categoría, subcategoría, tipo (ingreso/gasto), monto, periodo
                    </p>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl text-xs h-8 opacity-50 cursor-not-allowed" disabled>
                    <Lock className="size-3.5 mr-2" />
                    No disponible aún
                  </Button>
                </CardContent>
              </Card>

              {/* ── 3. DEUDAS (PRÓXIMAMENTE) ── */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl opacity-60">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <CreditCard className="size-3.5 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Deudas</p>
                      <p className="text-[10px] text-gray-400">Tarjetas de crédito, préstamos y otras deudas</p>
                    </div>
                    <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                      Próximamente
                    </Badge>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-2">
                    <p className="text-[10px] text-gray-400">
                      Columnas: nombre, tipo, monto total, saldo, tasa de interés, banco, día de corte, día de pago
                    </p>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl text-xs h-8 opacity-50 cursor-not-allowed" disabled>
                    <Lock className="size-3.5 mr-2" />
                    No disponible aún
                  </Button>
                </CardContent>
              </Card>

              {/* ── 4. METAS DE AHORRO (PRÓXIMAMENTE) ── */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl opacity-60">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                      <PiggyBank className="size-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Metas de Ahorro</p>
                      <p className="text-[10px] text-gray-400">Objetivos de ahorro con frecuencia y fecha meta</p>
                    </div>
                    <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                      Próximamente
                    </Badge>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-2">
                    <p className="text-[10px] text-gray-400">
                      Columnas: nombre, monto objetivo, monto actual, tipo, fecha meta, frecuencia
                    </p>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl text-xs h-8 opacity-50 cursor-not-allowed" disabled>
                    <Lock className="size-3.5 mr-2" />
                    No disponible aún
                  </Button>
                </CardContent>
              </Card>

              {/* ── 5. CDT (PRÓXIMAMENTE) ── */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl opacity-60">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <BankIcon className="size-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">CDT</p>
                      <p className="text-[10px] text-gray-400">Certificados de Depósito a Término</p>
                    </div>
                    <Badge variant="secondary" className="text-[9px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0">
                      Próximamente
                    </Badge>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-2">
                    <p className="text-[10px] text-gray-400">
                      Columnas: banco, monto, tasa efectiva anual, plazo en días, fechas, cuenta de rendimientos
                    </p>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl text-xs h-8 opacity-50 cursor-not-allowed" disabled>
                    <Lock className="size-3.5 mr-2" />
                    No disponible aún
                  </Button>
                </CardContent>
              </Card>

            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ── RESPALDO Y RECUPERACIÓN ── */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="respaldo" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={ShieldCheck} iconColor="text-amber-600" iconBg="bg-amber-100 dark:bg-amber-900/30" title="Respaldo y Recuperación" badge="Nuevo" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <BackupManager />
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* ── GESTIÓN DE DATOS ── */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="datos" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Trash2} iconColor="text-red-500" iconBg="bg-red-100 dark:bg-red-900/30" title="Gestión de Datos" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              {/* Reset Finance Data */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <Wallet className="size-3.5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Eliminar datos financieros</p>
                      <p className="text-[10px] text-gray-400">Borra cuentas, transacciones, presupuestos, deudas y ahorros</p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl text-xs gap-2 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 h-8" onClick={() => setShowResetFinanceDialog(true)}>
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
                      <p className="text-[10px] text-gray-400">Borra vehículos, combustible y mantenimiento</p>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl text-xs gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 h-8" onClick={() => setShowResetTransportDialog(true)}>
                    <Trash2 className="size-3.5" />
                    Eliminar Datos de Transporte
                  </Button>
                </CardContent>
              </Card>

              {/* Delete Account */}
              <Card className="border border-red-200 dark:border-red-900/30 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <UserX className="size-3.5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-red-700 dark:text-red-400">Eliminar cuenta</p>
                      <p className="text-[10px] text-gray-400">Borra tu usuario y todos los datos de todos los módulos</p>
                    </div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-2">
                    <p className="text-[10px] text-red-600 dark:text-red-400">
                      Al eliminar tu cuenta se borrarán todos tus datos sin excepción. Esta acción no se puede deshacer.
                    </p>
                  </div>
                  <Button variant="outline" className="w-full rounded-xl text-xs gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 h-8" onClick={() => setShowDeleteAccountDialog(true)}>
                    <UserX className="size-3.5" />
                    Eliminar Mi Cuenta
                  </Button>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>
      </Accordion>

      {/* ===== DIALOGS ===== */}

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
            <AlertDialogAction className="rounded-xl bg-red-500 hover:bg-red-600" onClick={handleResetAllFinanceData} disabled={resettingAll}>
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
            <AlertDialogAction className="rounded-xl bg-red-500 hover:bg-red-600" onClick={handleResetTransportData} disabled={resettingTransport}>
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
            <AlertDialogAction className="rounded-xl bg-red-600 hover:bg-red-700" onClick={handleDeleteAccount} disabled={deletingAccount}>
              {deletingAccount ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Sí, eliminar mi cuenta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* App Info */}
      <Card className="border-0 shadow-sm rounded-xl bg-gray-50 dark:bg-gray-800/30">
        <CardContent className="p-3 text-center">
          <div className="inline-flex items-center justify-center size-7 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-sm mb-1.5">
            <span className="text-[10px] font-bold text-white">Q</span>
          </div>
          <p className="text-[11px] font-semibold text-gray-900 dark:text-white">Quid</p>
          <div className="flex flex-col gap-0.5">
            <p className="text-[9px] text-gray-400">v1.1.0</p>
            <div className="flex items-center justify-center gap-1.5 opacity-60">
              <div className="size-1 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[8px] font-mono text-gray-500">Build: {currentBuildId}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <ShareInvite open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
