"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
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
import { Upload, Loader2, CheckCircle2, AlertTriangle, FileJson, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  sections: { name: string; count: number; label: string }[];
  issues: string[];
  warnings: string[];
}

/**
 * Auto-restore prompt that appears when:
 * 1. User has a previous backup in localStorage
 * 2. User's DB is empty (no data)
 *
 * This component handles the full flow: detect → prompt → file select → validate → import
 */
export function BackupRestorePrompt() {
  const [showPrompt, setShowPrompt] = useState(true);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [pendingBackupRaw, setPendingBackupRaw] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    error?: string;
    stats?: Record<string, number>;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // User dismissed the prompt
  if (dismissed || !showPrompt) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidating(true);
    setImportResult(null);

    try {
      const text = await file.text();

      // Quick client-side check
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setImportResult({
          success: false,
          error: "No se pudo leer el archivo. Verifica que sea un JSON válido.",
        });
        return;
      }

      if (data.magic !== "quid-backup") {
        setImportResult({
          success: false,
          error: "Este archivo no es un respaldo válido de Quid",
        });
        return;
      }

      // Server validation
      const response = await fetch("/api/backup/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });

      const validationResult = await response.json();
      setValidation(validationResult);
      setPendingBackupRaw(text);

      if (validationResult.valid) {
        setShowConfirmDialog(true);
      }
    } catch (error) {
      console.error("Validation error:", error);
      setImportResult({
        success: false,
        error: "Error al validar el archivo de respaldo",
      });
    } finally {
      setValidating(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!pendingBackupRaw) return;
    setShowConfirmDialog(false);
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
        // Clear backup metadata since data has been restored
        try {
          localStorage.removeItem("quid-last-backup");
        } catch { /* non-critical */ }
        // Reload after successful import
        setTimeout(() => window.location.reload(), 2000);
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

  const dismiss = () => {
    // Remember dismissal for this session
    try {
      sessionStorage.setItem("quid-restore-dismissed", "true");
    } catch { /* non-critical */ }
    setDismissed(true);
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

  return (
    <>
      {/* Overlay prompt */}
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white relative">
            <button
              onClick={dismiss}
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/20 transition-colors"
            >
              <X className="size-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-white/20 flex items-center justify-center">
                <FileJson className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Restaurar Respaldo</h3>
                <p className="text-[10px] text-white/80">Detectamos que no tienes datos</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Parece que tu cuenta está vacía. Si tienes un respaldo previo, puedes restaurar todos tus datos aquí.
            </p>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                className="flex-1 rounded-xl text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white h-9"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing || validating}
              >
                {validating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {validating ? "Validando..." : "Seleccionar Respaldo"}
              </Button>
              <Button
                variant="outline"
                className="rounded-xl text-xs h-9"
                onClick={dismiss}
                disabled={importing}
              >
                Comenzar de cero
              </Button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Validation result */}
            {validation && !showConfirmDialog && (
              <div
                className={`rounded-xl p-2.5 space-y-1.5 ${
                  validation.valid
                    ? "bg-emerald-50 dark:bg-emerald-900/10"
                    : "bg-red-50 dark:bg-red-900/10"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {validation.valid ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="size-3.5 text-red-500" />
                  )}
                  <span
                    className={`text-[10px] font-medium ${
                      validation.valid
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {validation.valid
                      ? `Respaldo válido — ${validation.totalRecords} registros`
                      : "Respaldo con errores"}
                  </span>
                </div>
                {validation.issues.length > 0 && (
                  <div className="space-y-0.5">
                    {validation.issues.map((issue, i) => (
                      <p key={i} className="text-[9px] text-red-600 dark:text-red-400">
                        {issue}
                      </p>
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
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        ¡Respaldo restaurado exitosamente!
                      </p>
                      <p className="text-[9px] text-emerald-600/70 dark:text-emerald-400/70">
                        Recargando página...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-600 dark:text-red-400">
                      {importResult.error || "Error al importar"}
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
                  Restaurando respaldo...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={(open) => !open && (setShowConfirmDialog(false), setPendingBackupRaw(null), setValidation(null))}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <FileJson className="size-5 text-amber-500" />
              Confirmar Restauración
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Se restaurará el respaldo con <strong>{validation?.totalRecords} registros</strong>.
                  Esto reemplazará cualquier dato existente.
                </p>

                {validation && (
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3 space-y-1.5">
                    <div className="text-[10px] space-y-1 text-gray-700 dark:text-gray-300">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Usuario:</span>
                        <span className="font-medium">{validation.metadata.userName}</span>
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
                    </div>
                  </div>
                )}

                <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-2.5 flex items-start gap-2">
                  <AlertTriangle className="size-3.5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    Esta acción no se puede deshacer.
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
    </>
  );
}
