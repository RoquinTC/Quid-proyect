/**
 * Transport Prediction Engine
 *
 * Pure functions that turn vehicle state into a forecast: what is coming up,
 * when, and how much we trust that estimate.
 *
 * Two sources of truth exist for an upcoming event:
 *   - an explicit date (documents, date-based reminders, nextDueDate)
 *   - a distance target in km (km-based reminders, nextDueKm)
 *
 * The hard case is the second one: a km target says nothing about *when*.
 * This module closes that gap by projecting the target onto the calendar using
 * the vehicle's learned distance rate (km/day, derived from fuel-log history in
 * `fuel-level.ts`). When the rate is unknown the module refuses to invent a
 * date and reports low/no confidence instead.
 *
 * Design notes:
 *   - No DB, no React, no side effects: safe to reuse anywhere and to test.
 *   - Thresholds follow the ones already used by the transport UI (warningKm
 *     defaults to 500, warningDays to 7) so both stay consistent.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type UpcomingKind = "reminder" | "maintenance" | "document";

/** How much the estimate can be trusted. */
export type PredictionConfidence = "high" | "medium" | "low" | "none";

/** Normalized urgency, from worst to best. */
export type UpcomingSeverity = "danger" | "warning" | "soon" | "ok";

export interface UpcomingItem {
  id: string;
  kind: UpcomingKind;
  title: string;
  subtitle: string | null;
  /** Target odometer, when the event is distance-based. */
  dueKm: number | null;
  /** Km left before the target. Negative means the target was passed. */
  kmRemaining: number | null;
  /** Explicit calendar target, when one exists. */
  dueDate: string | null;
  /** Days left until the explicit date. Negative means overdue. */
  daysRemaining: number | null;
  /** Calendar date projected from the distance target. Null when unknown. */
  projectedDate: string | null;
  /** Days left until the projected date. */
  projectedDays: number | null;
  confidence: PredictionConfidence;
  severity: UpcomingSeverity;
  /** 0 = just happened, 1 = at the limit. Null when it cannot be computed. */
  progress: number | null;
  /** Which input drove the verdict. */
  source: "date" | "km" | "both";
  /** Best available days-left value (explicit date wins over projection). */
  effectiveDays: number | null;
}

export interface KmProjection {
  estimatedDate: string | null;
  daysRemaining: number | null;
  confidence: PredictionConfidence;
  kmPerDay: number;
}

export interface ReminderLike {
  id: string;
  title: string;
  dueDate?: string | Date | null;
  dueKm?: number | null;
  warningDays?: number | null;
  warningKm?: number | null;
  isActive?: boolean;
  completedAt?: string | Date | null;
}

export interface MaintenanceLike {
  id: string;
  type?: string | null;
  description?: string | null;
  nextDueDate?: string | Date | null;
  nextDueKm?: number | null;
  reminderEnabled?: boolean;
}

export interface DocumentLike {
  id: string;
  type: string;
  documentNumber?: string | null;
  expiryDate: string | Date;
  reminderDays?: number | null;
  reminderEnabled?: boolean;
}

export interface BuildUpcomingInput {
  currentKm: number;
  /** Learned distance rate. 0 or missing means "not enough history". */
  avgKmPerDay?: number | null;
  /** True while the app is still gathering history for the rate. */
  isLearning?: boolean;
  reminders?: ReminderLike[] | null;
  maintenanceRecords?: MaintenanceLike[] | null;
  documents?: DocumentLike[] | null;
  /** Label resolver for maintenance types (keeps this module UI-agnostic). */
  maintenanceLabel?: (record: MaintenanceLike) => string;
  documentLabel?: (doc: DocumentLike) => string;
  today?: Date;
}

// ─── Constants ───────────────────────────────────────────────────────

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const DEFAULT_WARNING_KM = 500;
export const DEFAULT_WARNING_DAYS = 7;

/** "Soon" horizon, in days, when nothing more precise applies. */
export const SOON_HORIZON_DAYS = 30;

/** Two weeks of history is the floor for trusting a km/day rate. */
const MIN_DAYS_FOR_HIGH_CONFIDENCE = 14;
const MIN_DAYS_FOR_MEDIUM_CONFIDENCE = 7;

// ─── Date helpers ────────────────────────────────────────────────────

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole days between two instants, counted from midnight to midnight. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// ─── Confidence ──────────────────────────────────────────────────────

/**
 * How much to trust a km/day rate.
 *
 * The rate itself comes from the fuel-level module, which only learns after a
 * few days of history. A very small rate (a car that barely moves) produces
 * absurd projections ("next service in 4 years"), so it is degraded rather than
 * presented as fact.
 */
export function confidenceFor(
  avgKmPerDay: number | null | undefined,
  options: { isLearning?: boolean; historyDays?: number | null } = {}
): PredictionConfidence {
  const rate = Number(avgKmPerDay ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return "none";
  // Under 3 km/day the model is technically valid but practically meaningless.
  if (rate < 3) return "low";
  if (options.isLearning) return "low";

  const historyDays = options.historyDays;
  if (typeof historyDays === "number" && historyDays > 0) {
    if (historyDays < MIN_DAYS_FOR_MEDIUM_CONFIDENCE) return "low";
    if (historyDays < MIN_DAYS_FOR_HIGH_CONFIDENCE) return "medium";
    return "high";
  }
  // Without a history length we cannot claim the top tier.
  return "medium";
}

// ─── Core projection ─────────────────────────────────────────────────

/**
 * Project a distance target onto the calendar.
 *
 *   estimatedDate = today + (dueKm - currentKm) / avgKmPerDay
 *
 * Returns a null date when the target is already reached or the rate is
 * unknown: an overdue km target has no meaningful future date, and guessing one
 * would be worse than saying nothing.
 */
export function estimateKmDueDate(params: {
  currentKm: number;
  dueKm: number | null | undefined;
  avgKmPerDay?: number | null;
  isLearning?: boolean;
  historyDays?: number | null;
  today?: Date;
}): KmProjection {
  const today = params.today ?? new Date();
  const rate = Number(params.avgKmPerDay ?? 0);
  const confidence = confidenceFor(rate, {
    isLearning: params.isLearning,
    historyDays: params.historyDays,
  });

  const dueKm = params.dueKm;
  if (dueKm == null || !Number.isFinite(Number(dueKm))) {
    return { estimatedDate: null, daysRemaining: null, confidence: "none", kmPerDay: rate };
  }

  const kmRemaining = Number(dueKm) - params.currentKm;
  if (!Number.isFinite(kmRemaining) || kmRemaining <= 0) {
    return { estimatedDate: null, daysRemaining: null, confidence, kmPerDay: rate };
  }

  if (!Number.isFinite(rate) || rate <= 0) {
    return { estimatedDate: null, daysRemaining: null, confidence: "none", kmPerDay: 0 };
  }

  const rawDays = kmRemaining / rate;
  if (!Number.isFinite(rawDays)) {
    return { estimatedDate: null, daysRemaining: null, confidence: "none", kmPerDay: rate };
  }

  // At least one day: "tomorrow" reads better than "today" for a future target.
  const days = Math.max(1, Math.round(rawDays));
  return {
    estimatedDate: addDays(today, days).toISOString(),
    daysRemaining: days,
    confidence,
    kmPerDay: rate,
  };
}

// ─── Severity ────────────────────────────────────────────────────────

/**
 * Normalize urgency on the two axes.
 *
 * `danger` means the limit was passed, `warning` means inside the user's own
 * warning window, `soon` means inside the wider horizon, `ok` means there is
 * room. A projection may raise urgency to `soon` at most: a km/day estimate is
 * not precise enough to justify a hard alert.
 */
export function severityFor(params: {
  kmRemaining: number | null;
  daysRemaining: number | null;
  projectedDays: number | null;
  warningKm?: number | null;
  warningDays?: number | null;
}): UpcomingSeverity {
  const warningKm = params.warningKm ?? DEFAULT_WARNING_KM;
  const warningDays = params.warningDays ?? DEFAULT_WARNING_DAYS;

  const km = params.kmRemaining;
  const days = params.daysRemaining;

  if ((km != null && km <= 0) || (days != null && days <= 0)) return "danger";
  if ((km != null && km <= warningKm) || (days != null && days <= warningDays)) return "warning";

  const projected = params.projectedDays;
  const soonByProjection = projected != null && projected <= SOON_HORIZON_DAYS;
  const soonByKm = km != null && km <= warningKm * 3;
  const soonByDays = days != null && days <= warningDays * 3;
  if (soonByProjection || soonByKm || soonByDays) return "soon";

  return "ok";
}

// ─── Builders ────────────────────────────────────────────────────────

function progressFor(kmRemaining: number | null, warningKm: number): number | null {
  if (kmRemaining == null) return null;
  if (kmRemaining <= 0) return 1;
  const window = Math.max(warningKm * 3, 1);
  return Math.max(0, Math.min(1, 1 - kmRemaining / window));
}

function humanizeKm(km: number): string {
  return Math.round(km).toLocaleString("es-CO");
}

/** Short, user-facing description of the distance side of an item. */
export function describeKm(kmRemaining: number | null): string | null {
  if (kmRemaining == null) return null;
  if (kmRemaining <= 0) return `límite superado por ${humanizeKm(Math.abs(kmRemaining))} km`;
  return `faltan ${humanizeKm(kmRemaining)} km`;
}

/** Short, user-facing description of the date side of an item. */
export function describeDays(days: number | null): string | null {
  if (days == null) return null;
  if (days < 0) return `vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  return `en ${days} días`;
}

/**
 * Projected date, stated with the honesty the confidence level allows.
 * A low-confidence projection is rounded to "~" and to weeks/months.
 */
export function describeProjection(
  days: number | null,
  confidence: PredictionConfidence
): string | null {
  if (days == null) return null;
  if (confidence === "none") return null;
  const prefix = confidence === "high" ? "" : "~";
  if (days <= 30) return `${prefix}${days} día${days === 1 ? "" : "s"}`;
  if (days <= 90) return `${prefix}${Math.round(days / 7)} semanas`;
  return `${prefix}${Math.round(days / 30)} meses`;
}

/**
 * Build the unified, severity-sorted list of what is coming up for a vehicle.
 *
 * Unlike the legacy alert helper (which only surfaces items inside the 7-day
 * window and takes the top few), this returns everything with a known target,
 * including far-future maintenance, so the dashboard can show a real forecast.
 */
export function buildUpcoming(input: BuildUpcomingInput): UpcomingItem[] {
  const today = input.today ?? new Date();
  const currentKm = Number(input.currentKm ?? 0);
  const rate = Number(input.avgKmPerDay ?? 0);
  const items: UpcomingItem[] = [];

  const project = (dueKm: number | null | undefined) =>
    estimateKmDueDate({
      currentKm,
      dueKm,
      avgKmPerDay: rate,
      isLearning: input.isLearning,
      today,
    });

  // ── Reminders ──
  for (const reminder of input.reminders ?? []) {
    if (!reminder) continue;
    if (reminder.isActive === false) continue;
    if (reminder.completedAt) continue;

    const dueDate = toDate(reminder.dueDate);
    const dueKm = reminder.dueKm != null ? Number(reminder.dueKm) : null;
    if (!dueDate && (dueKm == null || !Number.isFinite(dueKm))) continue;

    const warningKm = reminder.warningKm ?? DEFAULT_WARNING_KM;
    const warningDays = reminder.warningDays ?? DEFAULT_WARNING_DAYS;
    const kmRemaining = dueKm != null ? dueKm - currentKm : null;
    const daysRemaining = dueDate ? daysBetween(today, dueDate) : null;
    const projection = project(dueKm);

    items.push({
      id: `reminder-${reminder.id}`,
      kind: "reminder",
      title: reminder.title,
      subtitle: reminder.title ? "Recordatorio" : null,
      dueKm,
      kmRemaining,
      dueDate: dueDate ? dueDate.toISOString() : null,
      daysRemaining,
      projectedDate: projection.estimatedDate,
      projectedDays: projection.daysRemaining,
      confidence: projection.confidence,
      severity: severityFor({ kmRemaining, daysRemaining, projectedDays: projection.daysRemaining, warningKm, warningDays }),
      progress: progressFor(kmRemaining, warningKm),
      source: dueDate && dueKm != null ? "both" : dueDate ? "date" : "km",
      effectiveDays: daysRemaining ?? projection.daysRemaining,
    });
  }

  // ── Maintenance ──
  for (const record of input.maintenanceRecords ?? []) {
    if (!record) continue;
    if (record.reminderEnabled === false) continue;

    const dueDate = toDate(record.nextDueDate);
    const dueKm = record.nextDueKm != null ? Number(record.nextDueKm) : null;
    if (!dueDate && (dueKm == null || !Number.isFinite(dueKm))) continue;

    const kmRemaining = dueKm != null ? dueKm - currentKm : null;
    const daysRemaining = dueDate ? daysBetween(today, dueDate) : null;
    const projection = project(dueKm);
    const label = input.maintenanceLabel?.(record) ?? record.description ?? "Mantenimiento";

    items.push({
      id: `maintenance-${record.id}`,
      kind: "maintenance",
      title: label,
      subtitle: record.description && record.description !== label ? record.description : "Mantenimiento",
      dueKm,
      kmRemaining,
      dueDate: dueDate ? dueDate.toISOString() : null,
      daysRemaining,
      projectedDate: projection.estimatedDate,
      projectedDays: projection.daysRemaining,
      confidence: projection.confidence,
      severity: severityFor({ kmRemaining, daysRemaining, projectedDays: projection.daysRemaining }),
      progress: progressFor(kmRemaining, DEFAULT_WARNING_KM),
      source: dueDate && dueKm != null ? "both" : dueDate ? "date" : "km",
      effectiveDays: daysRemaining ?? projection.daysRemaining,
    });
  }

  // ── Documents ──
  for (const doc of input.documents ?? []) {
    if (!doc) continue;
    if (doc.reminderEnabled === false) continue;
    const expiry = toDate(doc.expiryDate);
    if (!expiry) continue;

    const warningDays = doc.reminderDays ?? 30;
    const daysRemaining = daysBetween(today, expiry);
    const label = input.documentLabel?.(doc) ?? doc.type;

    items.push({
      id: `document-${doc.id}`,
      kind: "document",
      title: label,
      subtitle: doc.documentNumber ? `N.º ${doc.documentNumber}` : "Documento",
      dueKm: null,
      kmRemaining: null,
      dueDate: expiry.toISOString(),
      daysRemaining,
      projectedDate: null,
      projectedDays: null,
      confidence: "high",
      severity: severityFor({ kmRemaining: null, daysRemaining, projectedDays: null, warningDays }),
      progress: null,
      source: "date",
      effectiveDays: daysRemaining,
    });
  }

  // Worst first. Ordering has three tiers because "no horizon" means two very
  // different things: a passed limit (most urgent of all) and an item whose
  // distance we cannot yet translate into days (least knowable).
  //   1. anything already in danger, most overdue first
  //   2. items with a known horizon, nearest first
  //   3. items with no horizon, nearest by distance
  return items.sort((a, b) => {
    const aDanger = a.severity === "danger" ? 0 : 1;
    const bDanger = b.severity === "danger" ? 0 : 1;
    if (aDanger !== bDanger) return aDanger - bDanger;

    const aDays = a.effectiveDays;
    const bDays = b.effectiveDays;
    if (aDays != null && bDays != null) return aDays - bDays;
    if (aDays != null) return -1;
    if (bDays != null) return 1;

    const aKm = a.kmRemaining ?? Number.POSITIVE_INFINITY;
    const bKm = b.kmRemaining ?? Number.POSITIVE_INFINITY;
    return aKm - bKm;
  });
}

/** Count of items that need attention now. Used for badges. */
export function countActionable(items: UpcomingItem[]): number {
  return items.filter((item) => item.severity === "danger" || item.severity === "warning").length;
}

/**
 * Relative label for a past event, the way a timeline reads it.
 * Drivvo puts this on the "time" line of every history row; an absolute date is
 * already visible elsewhere, so relative time is what makes a feed scannable.
 */
export function describeRelativeDay(value: string | Date, today: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "";
  const days = -daysBetween(today, date); // positive once the date is in the past
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  if (days < 30) return `hace ${Math.round(days / 7)} sem`;
  if (days < 365) return `hace ${Math.round(days / 30)} meses`;
  return `hace ${Math.round(days / 365)} años`;
}
