"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Download,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  FileJson,
  Info,
  Cloud,
  CloudUpload,
  Clock,
  Server,
} from "lucide-react";

interface ValidationSection {
  name: string;
  count: number;
  label: string;
}

interface ValidationResult {
  valid: boolean;
  metadata: {
    magic: string;
    version: number;
    exportDate: string;
    userEmail: string;
    userName: string;
    currency: string;
  };
  totalRecords: number;
  sections: ValidationSection[];
  issues: string[];
  warnings: string[];
}

interface ServerBackupInfo {
  hasBackup: boolean;
  id?: string;
  version?: number;
  recordCount?: number;
  createdAt?: string;
}

export function BackupManager() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    error?: string;
    stats?: Record<string, number>;
  } | null>(null);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [pendingBackupRaw, setPendingBackupRaw] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Server backup state
  const [serverBackupInfo, setServerBackupInfo] = useState<ServerBackupInfo | null>(null);
  const [savingToServer, setSavingToServer] = useState(false);
  const [serverSaveResult, setServerSaveResult] = useState<string | null>(null);
  const [restoringFromServer, setRestoringFromServer] = useState(false);
  const [serverRestoreResult, setServerRestoreResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [showServerRestoreDialog, setShowServerRestoreDialog] = useState(false);

  // Fetch server backup info
  const fetchServerBackupInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/backup/server-latest");
      if (res.ok) {
        const data = await res.json();
        setServerBackupInfo(data);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchServerBackupInfo();
  }, [fetchServerBackupInfo]);

  const handleExport = async () => {
    setExporting(true);
    setExportResult(null);
    try {
      const response = await fetch("/api/backup/export");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Error al exportar");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `quid-backup-${new Date().toISOString().split("T")[0]}.json`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) {
          filename = match[1].replace(/['"]/g, "");
        }
      }
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setExportResult("Respaldo descargado exitosamente");
      setTimeout(() => setExportResult(null), 4000);
    } catch (error) {
      console.error("Export error:", error);
      setExportResult(
        error instanceof Error ? error.message : "Error al exportar el respaldo"
      );
      setTimeout(() => setExportResult(null), 5000);
    } finally {
      setExporting(false);
    }
  };

  const handleSaveToServer = async () => {
    setSavingToServer(true);
    setServerSaveResult(null);
    try {
      const res = await fetch("/api/backup/server-save", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setServerSaveResult(`Respaldo guardado en servidor (${data.recordCount} registros)`);
        fetchServerBackupInfo();
      } else {
        setServerSaveResult(data.error || "Error al guardar en servidor");
      }
    } catch (error) {
      setServerSaveResult("Error de conexión al guardar en servidor");
    } finally {
      setSavingToServer(false);
      setTimeout(() => setServerSaveResult(null), 5000);
    }
  };

  const handleRestoreFromServer = async () => {
    setShowServerRestoreDialog(false);
    setRestoringFromServer(true);
    setServerRestoreResult(null);
    try {
      const res = await fetch("/api/backup/server-restore", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setServerRestoreResult({ success: true, message: "Respaldo restaurado exitosamente" });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setServerRestoreResult({ success: false, message: data.error || "Error al restaurar" });
      }
    } catch (error) {
      setServerRestoreResult({ success: false, message: "Error de conexión al restaurar" });
    } finally {
      setRestoringFromServer(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidating(true);
    setValidation(null);
    setImportResult(null);

    try {
      const text = await file.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setImportResult({
          success: false,
          error: "No se pudo leer el archivo. Verifica que sea un JSON válido.",
        });
        setTimeout(() => setImportResult(null), 5000);
        return;
      }

      if (data.magic !== "quid-backup") {
        setImportResult({
          success: false,
          error: "Este archivo no es un respaldo válido de Quid",
        });
        setTimeout(() => setImportResult(null), 5000);
        return;
      }

      const response = await fetch("/api/backup/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });

      const validationResult = await response.json();
      setValidation(validationResult);
      setPendingBackupRaw(text);

      if (validationResult.valid) {
        setShowImportDialog(true);
      }
    } catch (error) {
      console.error("Validation error:", error);
      setImportResult({
        success: false,
        error: "Error al validar el archivo de respaldo",
      });
      setTimeout(() => setImportResult(null), 5000);
    } finally {
      setValidating(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!pendingBackupRaw) return;
    setShowImportDialog(false);
    setImporting(true);
    setImportResult(null);

    try {
      const response = await fetch("/api/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pendingBackupRaw,
      });

      const data = await response.json();

      if (data.success) {
        setImportResult({ success: true, stats: data.stats });
      } else {
        setImportResult({ success: false, error: data.error });
      }
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({
        success: false,
        error: "Error de conexión al importar el respaldo",
      });
    } finally {
      setImporting(false);
      setPendingBackupRaw(null);
      setValidation(null);
    }
  };

  const cancelImport = () => {
    setShowImportDialog(false);
    setPendingBackupRaw(null);
    setValidation(null);
  };

  const formatBackupDate = (isoDate: string) => {
    try {
      return new Date(isoDate).toLocaleDateString("es-CO", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Bogota",
      });
    } catch {
      return isoDate;
    }
  };

  const isTodayBackup = serverBackupInfo?.createdAt
    ? new Date(serverBackupInfo.createdAt).toLocaleDateString("sv-SE", { timeZone: "America/Bogota" }) ===
      new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" })
    : false;

  return (
    <Card className="border border-amber-200 dark:border-amber-800/40 shadow-none rounded-xl">
      <CardContent className="p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <ShieldCheck className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-900 dark:text-white">
              Respaldo y Recuperación
            </p>
            <p className="text-[10px] text-gray-400">
              Exporta, restaura o guarda en el servidor
            </p>
          </div>
          <Badge variant="secondary" className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
            Nuevo
          </Badge>
        </div>

        {/* Server backup status indicator */}
        {serverBackupInfo?.hasBackup && (
          <div className={`rounded-xl p-2.5 flex items-center gap-2 ${isTodayBackup ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-blue-50 dark:bg-blue-900/10"}`}>
            {isTodayBackup ? (
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Clock className="size-3.5 text-blue-500 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-medium ${isTodayBackup ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"}`}>
                {isTodayBackup ? "Backup del día de hoy" : "Último backup del servidor"}
              </p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400 truncate">
                {formatBackupDate(serverBackupInfo.createdAt!)} · {serverBackupInfo.recordCount} registros
              </p>
            </div>
            <Server className="size-3 text-gray-400 shrink-0" />
          </div>
        )}

        {!serverBackupInfo?.hasBackup && (
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-2.5 flex items-center gap-2">
            <Cloud className="size-3.5 text-amber-500 shrink-0" />
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              No hay respaldo en el servidor. Guarda uno para proteger tus datos.
            </p>
          </div>
        )}

        {/* Info box */}
        <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-2.5 space-y-1.5">
          <div className="flex items-start gap-1.5">
            <Info className="size-3 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-blue-600 dark:text-blue-400">
              El respaldo en servidor se guarda dentro del volumen Docker, así persiste aunque cambies de dispositivo.
              Se crea automáticamente al primer inicio del día.
            </p>
          </div>
        </div>

        {/* Action buttons - Server backup */}
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Servidor
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1 rounded-xl text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white h-8"
              onClick={handleSaveToServer}
              disabled={savingToServer || exporting || importing || validating}
            >
              {savingToServer ? <Loader2 className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
              Guardar en Servidor
            </Button>
            {serverBackupInfo?.hasBackup && (
              <Button
                variant="outline"
                className="flex-1 rounded-xl text-xs gap-1.5 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 h-8"
                onClick={() => setShowServerRestoreDialog(true)}
                disabled={restoringFromServer || exporting || importing || validating}
              >
                {restoringFromServer ? <Loader2 className="size-3.5 animate-spin" /> : <Cloud className="size-3.5" />}
                Restaurar del Servidor
              </Button>
            )}
          </div>
        </div>

        {/* Action buttons - File */}
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Archivo local
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl text-xs gap-1.5 border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 h-8"
              onClick={handleExport}
              disabled={exporting || importing || validating}
            >
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Descargar
            </Button>
            <Button
              variant="outline"
              className="flex-1 rounded-xl text-xs gap-1.5 border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 h-8"
              onClick={() => fileInputRef.current?.click()}
              disabled={exporting || importing || validating}
            >
              {validating ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {validating ? "Validando..." : "Importar Archivo"}
            </Button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Server save result */}
        {serverSaveResult && (
          <div className={`rounded-xl p-2.5 flex items-center gap-2 ${
            serverSaveResult.includes("Error") ? "bg-red-50 dark:bg-red-900/10" : "bg-emerald-50 dark:bg-emerald-900/10"
          }`}>
            {serverSaveResult.includes("Error") ? (
              <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
            ) : (
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
            )}
            <p className={`text-[10px] ${serverSaveResult.includes("Error") ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {serverSaveResult}
            </p>
          </div>
        )}

        {/* Server restore result */}
        {serverRestoreResult && (
          <div className={`rounded-xl p-2.5 flex items-center gap-2 ${
            serverRestoreResult.success ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-red-50 dark:bg-red-900/10"
          }`}>
            {serverRestoreResult.success ? (
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="size-3.5 text-red-500 shrink-0" />
            )}
            <p className={`text-[10px] ${serverRestoreResult.success ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {serverRestoreResult.message}
              {serverRestoreResult.success && " · Recargando..."}
            </p>
          </div>
        )}

        {/* Restoring from server progress */}
        {restoringFromServer && (
          <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-2.5 flex items-center gap-2">
            <Loader2 className="size-3.5 text-blue-500 animate-spin shrink-0" />
            <p className="text-[10px] text-blue-600 dark:text-blue-400">
              Restaurando desde el servidor... Esto puede tardar unos segundos.
            </p>
          </div>
        )}

        {/* Export result */}
        {exportResult && (
          <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-2.5 flex items-center gap-2">
            <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
              {exportResult}
            </p>
          </div>
        )}

        {/* Validation result */}
        {validation && !showImportDialog && (
          <div
            className={`rounded-xl p-3 space-y-2 ${
              validation.valid
                ? "bg-emerald-50 dark:bg-emerald-900/10"
                : "bg-red-50 dark:bg-red-900/10"
            }`}
          >
            <div className="flex items-center gap-2">
              {validation.valid ? (
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 text-red-500 shrink-0" />
              )}
              <p className={`text-xs font-medium ${validation.valid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {validation.valid ? "Respaldo válido" : "Respaldo con errores"}
              </p>
            </div>

            <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-2 text-[10px] space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Usuario:</span>
                <span className="font-medium text-gray-900 dark:text-white">{validation.metadata.userName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email:</span>
                <span className="font-medium text-gray-900 dark:text-white">{validation.metadata.userEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Fecha:</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatBackupDate(validation.metadata.exportDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total registros:</span>
                <span className="font-medium text-gray-900 dark:text-white">{validation.totalRecords}</span>
              </div>
            </div>

            {validation.sections.length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-gray-600 dark:text-gray-400 pl-1">
                {validation.sections.map((s) => (
                  <span key={s.name}>{s.count} {s.label.toLowerCase()}</span>
                ))}
              </div>
            )}

            {validation.issues.length > 0 && (
              <div className="space-y-1">
                {validation.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="size-3 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-600 dark:text-red-400">{issue}</p>
                  </div>
                ))}
              </div>
            )}

            {validation.warnings.length > 0 && (
              <div className="space-y-1">
                {validation.warnings.map((warning, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <Info className="size-3 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">{warning}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div
            className={`rounded-xl p-2.5 ${
              importResult.success
                ? "bg-emerald-50 dark:bg-emerald-900/10"
                : "bg-red-50 dark:bg-red-900/10"
            }`}
          >
            {importResult.success ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Respaldo restaurado exitosamente
                  </p>
                </div>
                {importResult.stats && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-emerald-600/70 dark:text-emerald-400/70 pl-5">
                    {importResult.stats.accounts > 0 && <span>{importResult.stats.accounts} cuentas</span>}
                    {importResult.stats.transactions > 0 && <span>{importResult.stats.transactions} transacciones</span>}
                    {importResult.stats.budgets > 0 && <span>{importResult.stats.budgets} presupuestos</span>}
                    {importResult.stats.debts > 0 && <span>{importResult.stats.debts} deudas</span>}
                    {importResult.stats.savingsGoals > 0 && <span>{importResult.stats.savingsGoals} metas de ahorro</span>}
                    {importResult.stats.cdts > 0 && <span>{importResult.stats.cdts} CDTs</span>}
                    {importResult.stats.vehicles > 0 && <span>{importResult.stats.vehicles} vehículos</span>}
                    {importResult.stats.installments > 0 && <span>{importResult.stats.installments} cuotas</span>}
                    {importResult.stats.recurringPayments > 0 && <span>{importResult.stats.recurringPayments} pagos recurrentes</span>}
                    {importResult.stats.categories > 0 && <span>{importResult.stats.categories} categorías</span>}
                  </div>
                )}
                <p className="text-[9px] text-amber-600 dark:text-amber-400 pl-5">
                  Recarga la página para ver los datos actualizados.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-red-600 dark:text-red-400">
                  {importResult.error || "Error al importar el respaldo"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Importing progress */}
        {importing && (
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-2.5 flex items-center gap-2">
            <Loader2 className="size-3.5 text-amber-500 animate-spin shrink-0" />
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Restaurando respaldo... Esto puede tardar unos segundos.
            </p>
          </div>
        )}
      </CardContent>

      {/* File import Confirmation Dialog */}
      <AlertDialog open={showImportDialog} onOpenChange={(open) => !open && cancelImport()}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <FileJson className="size-5 text-amber-500" />
              Confirmar Restauración
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Estás a punto de restaurar un respaldo. <strong>Esto eliminará todos los datos actuales</strong> y los reemplazará con los del archivo.
                </p>

                {validation && (
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        Respaldo validado — {validation.totalRecords} registros
                      </span>
                    </div>
                    <div className="text-[10px] space-y-1 text-gray-700 dark:text-gray-300">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Usuario:</span>
                        <span className="font-medium">{validation.metadata.userName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Email:</span>
                        <span className="font-medium">{validation.metadata.userEmail}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Fecha:</span>
                        <span className="font-medium">{formatBackupDate(validation.metadata.exportDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Versión:</span>
                        <Badge variant="secondary" className="text-[9px]">v{validation.metadata.version}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {validation.sections.slice(0, 6).map((s) => (
                        <span key={s.name} className="text-[8px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                          {s.count} {s.label.toLowerCase()}
                        </span>
                      ))}
                      {validation.sections.length > 6 && (
                        <span className="text-[8px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                          +{validation.sections.length - 6} más
                        </span>
                      )}
                    </div>
                    {validation.warnings.length > 0 && (
                      <div className="space-y-0.5 pt-1">
                        {validation.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1">
                            <Info className="size-2.5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[9px] text-amber-600 dark:text-amber-400">{w}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-2.5 flex items-start gap-2">
                  <AlertTriangle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    Esta acción no se puede deshacer. Asegúrate de tener un respaldo de tus datos actuales si los necesitas.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmImport}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
            >
              Restaurar Respaldo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Server restore Confirmation Dialog */}
      <AlertDialog open={showServerRestoreDialog} onOpenChange={setShowServerRestoreDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <Server className="size-5 text-blue-500" />
              Restaurar del Servidor
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Se restaurará el último respaldo guardado en el servidor. <strong>Esto eliminará todos los datos actuales</strong>.
                </p>

                {serverBackupInfo?.hasBackup && (
                  <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3 space-y-1.5">
                    <div className="text-[10px] space-y-1 text-gray-700 dark:text-gray-300">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Fecha:</span>
                        <span className="font-medium">{formatBackupDate(serverBackupInfo.createdAt!)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Registros:</span>
                        <span className="font-medium">{serverBackupInfo.recordCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Versión:</span>
                        <Badge variant="secondary" className="text-[9px]">v{serverBackupInfo.version}</Badge>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-2.5 flex items-start gap-2">
                  <AlertTriangle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    Esta acción no se puede deshacer. Los datos actuales serán reemplazados.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreFromServer}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
            >
              Restaurar del Servidor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
