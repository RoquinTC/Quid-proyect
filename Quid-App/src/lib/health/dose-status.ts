/**
 * Estados de una toma y sus transiciones.
 *
 * La decisión de diseño más importante del módulo: **`skipped` no es `missed`**.
 *
 *   - `skipped`  → el usuario dijo explícitamente "no la tomo"   (decisión)
 *   - `missed`   → nadie hizo nada y venció el día lógico        (fallo del recordatorio)
 *
 * Sin esa distinción las dos cosas se ven igual en el historial y no se sabe si
 * hay que educar al paciente o arreglar las notificaciones. MyTherapy lo modela
 * con `STATUS_SKIPPED` / `STATUS_AUTOMATICALLY_SKIPPED`.
 *
 * Se usan strings (no `enum` de Prisma) porque el proyecto mantiene tres
 * esquemas —incluido SQLite— y la convención existente es `String` + comentario
 * con los valores admitidos (ver `Medication.frequency` o `MedicalAppointment.status`).
 */

export const DOSE_STATUSES = [
  "pending", // generada, aún no vencida ni actuada
  "taken", // confirmada por el usuario
  "skipped", // el usuario decidió no tomarla
  "missed", // venció sin acción (cierre automático)
  "snoozed", // pospuesta; sigue pendiente
  "dismissed", // descartada sin decisión explícita
] as const;

export type DoseStatus = (typeof DOSE_STATUSES)[number];

export const DOSE_SOURCES = ["scheduled", "prn", "external"] as const;
export type DoseSource = (typeof DOSE_SOURCES)[number];

/** Estados que ya no admiten acción del usuario. */
const TERMINAL: ReadonlySet<DoseStatus> = new Set<DoseStatus>([
  "taken",
  "skipped",
  "missed",
  "dismissed",
]);

/** Estados que cuentan para el denominador de adherencia. */
const EVALUABLE: ReadonlySet<DoseStatus> = new Set<DoseStatus>([
  "taken",
  "skipped",
  "missed",
  "dismissed",
]);

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status as DoseStatus);
}

export function isEvaluable(status: string): boolean {
  return EVALUABLE.has(status as DoseStatus);
}

export function isActionable(status: string): boolean {
  return status === "pending" || status === "snoozed";
}

/**
 * Transiciones permitidas.
 *
 * `taken → pending` existe solo para corregir un error desde el historial; la
 * capa de API limita esa corrección a una ventana de tiempo (ver `dose-actions`).
 */
const TRANSITIONS: Record<DoseStatus, DoseStatus[]> = {
  pending: ["taken", "skipped", "missed", "snoozed", "dismissed"],
  snoozed: ["taken", "skipped", "missed", "snoozed", "dismissed"],
  taken: ["pending"],
  skipped: ["pending"],
  missed: ["pending", "taken"],
  dismissed: ["pending"],
};

export function canTransition(from: string, to: DoseStatus): boolean {
  const allowed = TRANSITIONS[from as DoseStatus];
  return Boolean(allowed?.includes(to));
}

/** Etiquetas para UI (español, es-CO). */
export const DOSE_STATUS_LABELS: Record<DoseStatus, string> = {
  pending: "Pendiente",
  taken: "Tomada",
  skipped: "Omitida",
  missed: "No registrada",
  snoozed: "Pospuesta",
  dismissed: "Descartada",
};

/** Acciones que puede disparar una notificación. */
export const REMINDER_ACTIONS = ["take", "skip", "snooze"] as const;
export type ReminderAction = (typeof REMINDER_ACTIONS)[number];

/** Minutos de snooze permitidos (una sola unidad: minutos). */
export const SNOOZE_PRESETS = [5, 10, 15] as const;
export const DEFAULT_SNOOZE_MINUTES = 5;
/** Tope de snoozes por toma: evita "posponer para siempre". */
export const MAX_SNOOZES_PER_DOSE = 3;

export function parseSnoozeMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SNOOZE_MINUTES;
  return SNOOZE_PRESETS.includes(n as (typeof SNOOZE_PRESETS)[number])
    ? n
    : DEFAULT_SNOOZE_MINUTES;
}
