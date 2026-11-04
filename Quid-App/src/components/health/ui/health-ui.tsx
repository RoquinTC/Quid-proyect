"use client";

/**
 * Compatibilidad del sistema visual de Salud.
 *
 * La implementación ahora es compartida (`@/components/layout/module-kit`) para
 * que Salud, Finanzas, Despensa y Transporte usen las mismas tarjetas. Este
 * archivo solo mantiene los nombres con prefijo `Health*` que ya usan las
 * vistas de Salud, para no tener que renombrarlas todas de golpe.
 */

export {
  ModuleCard as HealthCard,
  ModuleSectionHeader as SectionHeader,
  ModuleIcon as HealthIcon,
  ModuleStat as StatChip,
  ModuleEmpty as EmptyState,
  ModuleProgress as ProgressBar,
  ModuleTile as ActionTile,
  type ModuleTone as HealthTone,
} from "@/components/layout/module-kit";
