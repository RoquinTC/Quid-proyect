"use client";

/**
 * Kit compartido de módulos.
 *
 * Nació en Salud y se generaliza aquí para que Finanzas, Despensa y Transporte
 * hablen el mismo idioma visual: encabezado con contexto, tres o cuatro
 * pestañas primarias y el resto en la hoja "Más".
 *
 * Principios (los mismos del rediseño de Salud):
 *  - un color por módulo, con el rosa/rojo reservado para lo urgente;
 *  - encabezado que dice en qué sección estás, sin repetir el nombre del módulo;
 *  - divulgación progresiva: lo diario visible, lo administrativo detrás de "Más";
 *  - componentes con nombre propio para que las vistas internas migren sin
 *    inventar estilos.
 */

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type ModuleTone = "emerald" | "sky" | "violet" | "amber" | "rose";

const TONE_SURFACE: Record<ModuleTone, string> = {
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400",
};

const TONE_BORDER: Record<ModuleTone, string> = {
  emerald: "border-emerald-100 dark:border-emerald-900/50",
  sky: "border-sky-100 dark:border-sky-900/50",
  violet: "border-violet-100 dark:border-violet-900/50",
  amber: "border-amber-100 dark:border-amber-900/50",
  rose: "border-rose-100 dark:border-rose-900/50",
};

const TONE_ACCENT: Record<ModuleTone, string> = {
  emerald: "bg-emerald-600 shadow-emerald-600/20",
  sky: "bg-sky-600 shadow-sky-600/20",
  violet: "bg-violet-600 shadow-violet-600/20",
  amber: "bg-amber-600 shadow-amber-600/20",
  rose: "bg-rose-600 shadow-rose-600/20",
};

const TONE_ICON_BG: Record<ModuleTone, string> = {
  emerald: "from-emerald-500 to-teal-500 shadow-emerald-500/25",
  sky: "from-sky-500 to-cyan-500 shadow-sky-500/25",
  violet: "from-violet-500 to-purple-500 shadow-violet-500/25",
  amber: "from-amber-500 to-orange-500 shadow-amber-500/25",
  rose: "from-rose-500 to-pink-500 shadow-rose-500/25",
};

/** Icono en cápsula: la firma visual de las tarjetas. */
export function ModuleIcon({
  icon: Icon,
  tone = "emerald",
  size = "md",
}: {
  icon: LucideIcon;
  tone?: ModuleTone;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-7 rounded-lg" : "size-9 rounded-xl";
  const glyph = size === "sm" ? "size-3.5" : "size-4";
  return (
    <div className={`flex ${box} shrink-0 items-center justify-center ${TONE_SURFACE[tone]}`}>
      <Icon className={glyph} />
    </div>
  );
}

/** Tarjeta base de un módulo. */
export function ModuleCard({
  children,
  tone,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  tone?: ModuleTone;
  className?: string;
  as?: "div" | "section";
}) {
  const Wrapper = as;
  return (
    <Wrapper
      className={`rounded-2xl border bg-white shadow-sm dark:bg-gray-900 ${
        tone ? TONE_BORDER[tone] : "border-gray-100 dark:border-gray-800"
      } ${className}`}
    >
      {children}
    </Wrapper>
  );
}

/** Encabezado de sección dentro de una tarjeta. */
export function ModuleSectionHeader({
  icon,
  title,
  hint,
  tone = "emerald",
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  tone?: ModuleTone;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <ModuleIcon icon={icon} tone={tone} size="sm" />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
          {hint && <p className="truncate text-[11px] text-gray-500">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Dato compacto. */
export function ModuleStat({
  label,
  value,
  tone = "emerald",
}: {
  label: string;
  value: string | number;
  tone?: ModuleTone;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 ${TONE_SURFACE[tone]}`}>
      <span className="text-sm font-black leading-none">{value}</span>
      <span className="text-[10px] font-medium leading-tight opacity-80">{label}</span>
    </div>
  );
}

/** Estado vacío que explica qué hacer. */
export function ModuleEmpty({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-gray-50 px-4 py-5 text-center dark:bg-gray-900/60">
      <div className="flex size-9 items-center justify-center rounded-xl bg-white text-gray-400 dark:bg-gray-800">
        <Icon className="size-4" />
      </div>
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{title}</p>
      {hint && <p className="max-w-[26ch] text-[11px] leading-snug text-gray-400">{hint}</p>}
      {action}
    </div>
  );
}

/** Barra de progreso 0–1. */
export function ModuleProgress({ ratio, tone = "emerald" }: { ratio: number; tone?: ModuleTone }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const fill =
    tone === "rose"
      ? "bg-rose-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "sky"
          ? "bg-sky-500"
          : tone === "violet"
            ? "bg-violet-500"
            : "bg-emerald-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
      <div className={`h-full rounded-full ${fill} transition-all`} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}

/** Tarjeta de acceso a una sección. */
export function ModuleTile({
  icon,
  label,
  meta,
  tone = "emerald",
  alert,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  meta: string;
  tone?: ModuleTone;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <ModuleCard className="h-full transition hover:shadow-md">
        <div className="flex items-center gap-2.5 p-3">
          <ModuleIcon icon={icon} tone={alert ? "amber" : tone} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-gray-900 dark:text-white">{label}</p>
            <p className="truncate text-[11px] text-gray-500">{meta}</p>
          </div>
          {alert && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />}
        </div>
      </ModuleCard>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Encabezado + pestañas
// ─────────────────────────────────────────────────────────────

export interface ModuleTab<TId extends string> {
  id: TId;
  label: string;
  icon: LucideIcon;
  /** Si es false, la pestaña vive en la hoja "Más". */
  primary?: boolean;
  /** Descripción corta: se usa en el encabezado y en la hoja "Más". */
  hint?: string;
}

/**
 * Encabezado con contexto + pestañas primarias + hoja "Más".
 *
 * Si todas las pestañas son primarias, "Más" no aparece.
 */
export function ModuleTabs<TId extends string>({
  title,
  icon,
  tone = "emerald",
  tabs,
  activeId,
  onSelect,
  layoutId,
  action,
}: {
  title: string;
  icon: LucideIcon;
  tone?: ModuleTone;
  tabs: ModuleTab<TId>[];
  activeId: TId;
  onSelect: (id: TId) => void;
  /** Id único de la animación de la píldora activa. */
  layoutId: string;
  action?: ReactNode;
}) {
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const primary = tabs.filter((tab) => tab.primary !== false);
  const secondary = tabs.filter((tab) => tab.primary === false);
  const isSecondaryActive = secondary.some((tab) => tab.id === activeId);
  const HeroIcon = icon;
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-30 bg-white/95 px-4 pb-2 pt-3 backdrop-blur dark:bg-gray-900/95">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm ${TONE_ICON_BG[tone]}`}
            >
              <HeroIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-black leading-tight text-gray-900 dark:text-white">
                {title}
              </h1>
              <p className="truncate text-[11px] text-gray-500">{activeTab?.hint ?? ""}</p>
            </div>
          </div>
          {action}
        </div>

        <div className="mt-2.5 flex items-center gap-1">
          <div className="flex flex-1 items-center gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-gray-800">
            {primary.map((tab) => {
              const isActive = activeId === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  className="relative flex flex-1 items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-semibold"
                >
                  {isActive && (
                    <motion.div
                      layoutId={layoutId}
                      className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-gray-700"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon
                    className={`relative z-10 size-3.5 ${isActive ? "text-gray-900 dark:text-white" : "text-gray-400"}`}
                  />
                  <span
                    className={`relative z-10 truncate ${
                      isActive ? "text-gray-900 dark:text-white" : "text-gray-500"
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {secondary.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={`flex shrink-0 items-center gap-1 rounded-2xl px-2.5 py-2 text-xs font-semibold transition-colors ${
                isSecondaryActive
                  ? `${TONE_ACCENT[tone]} text-white`
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              }`}
              aria-label={`Más secciones de ${title}`}
            >
              <span className="max-w-[7rem] truncate">
                {isSecondaryActive ? activeTab?.label : "Más"}
              </span>
              <ChevronDown className="size-3.5 shrink-0" />
            </button>
          )}
        </div>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-base">Más de {title}</SheetTitle>
            <SheetDescription className="text-xs">Elige una sección.</SheetDescription>
          </SheetHeader>

          <div className="mt-1 grid grid-cols-1 gap-1.5">
            {secondary.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onSelect(tab.id);
                    setMoreOpen(false);
                  }}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isActive ? `${TONE_SURFACE[tone]}` : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-gray-900 dark:text-white">
                      {tab.label}
                    </p>
                    {tab.hint && <p className="truncate text-[11px] text-gray-500">{tab.hint}</p>}
                  </div>
                  {isActive && <span className="size-1.5 rounded-full bg-emerald-500" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Envuelve un encabezado y su contenido con el mismo esqueleto en todos los módulos. */
export function ModuleShell({
  header,
  children,
  onTouchStart,
  onTouchEnd,
}: {
  header: ReactNode;
  children: ReactNode;
  onTouchStart?: (event: React.TouchEvent) => void;
  onTouchEnd?: (event: React.TouchEvent) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex-1 overflow-y-auto" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {children}
      </div>
    </div>
  );
}
