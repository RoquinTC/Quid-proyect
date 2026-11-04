"use client";

/**
 * Kit de formularios.
 *
 * Los formularios de Salud se habían construido a mano uno por uno: cada uno
 * con su propio alto, sus propios avisos de colores y sus propias filas de
 * interruptor. Aquí se unifican para que agregar una cita, una orden o un
 * medicamento se sienta como la misma aplicación.
 *
 * Reglas:
 *  - el diálogo nunca se sale de la pantalla: cuerpo con scroll y acciones fijas
 *    (en un teléfono, perder el botón Guardar es el peor bug posible);
 *  - los campos van en secciones con título e icono, no en una lista infinita;
 *  - los avisos usan un tono con significado (info, atención, peligro), no un
 *    color decorativo.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { ModuleTone } from "@/components/layout/module-kit";

const NOTICE_TONES: Record<"info" | "warning" | "danger" | "success", string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200",
  danger:
    "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200",
};

/**
 * Diálogo de formulario con cuerpo desplazable y acciones siempre visibles.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  tone = "emerald",
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  tone?: ModuleTone;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const accent =
    tone === "sky"
      ? "from-sky-500 to-cyan-500 shadow-sky-500/25"
      : tone === "violet"
        ? "from-violet-500 to-purple-500 shadow-violet-500/25"
        : tone === "amber"
          ? "from-amber-500 to-orange-500 shadow-amber-500/25"
          : tone === "rose"
            ? "from-rose-500 to-pink-500 shadow-rose-500/25"
            : "from-emerald-500 to-teal-500 shadow-emerald-500/25";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        scrollable
        className={`w-[95vw] rounded-2xl sm:w-full ${wide ? "sm:max-w-lg" : "sm:max-w-md"}`}
      >
        <DialogHeader className="border-b border-gray-100 p-4 pb-3 text-left dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${accent}`}
              >
                <Icon className="size-4" />
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{title}</DialogTitle>
              {description && (
                <DialogDescription className="line-clamp-2 text-xs">{description}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>

        {footer && (
          <DialogFooter className="border-t border-gray-100 p-3 dark:border-gray-800">{footer}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Grupo de campos con título e icono. */
export function FormSection({
  title,
  hint,
  icon: Icon,
  tone = "emerald",
  children,
  collapsibleHint,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: ModuleTone;
  children: ReactNode;
  /** Texto opcional a la derecha del título (ej. "opcional"). */
  collapsibleHint?: string;
}) {
  const chip =
    tone === "sky"
      ? "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400"
      : tone === "violet"
        ? "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400"
        : tone === "amber"
          ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
          : tone === "rose"
            ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
            : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400";

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${chip}`}>
              <Icon className="size-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <h4 className="truncate text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
              {title}
            </h4>
            {hint && <p className="truncate text-[11px] text-gray-400">{hint}</p>}
          </div>
        </div>
        {collapsibleHint && (
          <span className="shrink-0 text-[10px] font-medium text-gray-400">{collapsibleHint}</span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Campo con etiqueta, ayuda y error. */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">{error}</p>
      ) : (
        hint && <p className="text-[11px] leading-snug text-gray-400">{hint}</p>
      )}
    </div>
  );
}

/** Fila de interruptor con icono y descripción. */
export function FormSwitchRow({
  icon: Icon,
  label,
  description,
  checked,
  onCheckedChange,
  tone = "emerald",
}: {
  icon?: LucideIcon;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  tone?: ModuleTone;
}) {
  const chip =
    tone === "sky"
      ? "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400"
      : tone === "violet"
        ? "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400"
        : tone === "amber"
          ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
          : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2.5 dark:border-gray-800">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${chip}`}>
            <Icon className="size-3.5" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{label}</p>
          {description && <p className="truncate text-[11px] text-gray-400">{description}</p>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/** Aviso con tono semántico. */
export function FormNotice({
  tone = "info",
  icon: Icon,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className={`flex gap-2 rounded-xl border p-2.5 text-[11px] leading-snug ${NOTICE_TONES[tone]}`}>
      {Icon && <Icon className="mt-0.5 size-3.5 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Acciones del formulario.
 *
 * `sticky` no hace falta: vive en el pie del diálogo, que ya está fijo.
 */
export function FormActions({
  onCancel,
  cancelLabel = "Cancelar",
  submitLabel,
  submitting,
  disabled,
  submitType = "submit",
  formId,
  onSubmit,
  onDelete,
}: {
  onCancel: () => void;
  cancelLabel?: string;
  submitLabel: string;
  submitting?: boolean;
  disabled?: boolean;
  submitType?: "submit" | "button";
  formId?: string;
  /** Con submitType="button", acción a ejecutar. */
  onSubmit?: () => void;
  onDelete?: ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      {onDelete}
      <button
        type="button"
        onClick={onCancel}
        className="ml-auto rounded-xl px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {cancelLabel}
      </button>
      <button
        {...(submitType === "submit"
          ? { form: formId, type: "submit" as const }
          : { type: "button" as const, onClick: onSubmit })}
        disabled={submitting || disabled}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition active:scale-95 disabled:opacity-50"
      >
        {submitting ? "Guardando…" : submitLabel}
      </button>
    </div>
  );
}
