/**
 * Odometer validation.
 *
 * A single mistyped odometer reading corrupts every downstream number: the
 * tank-to-tank cycles, the efficiency average, the autonomy estimate and the
 * maintenance forecast all order themselves by odometer. Drivvo guards this with
 * a two-sided rule; this module implements it for Quid.
 *
 * The rule:
 *   - a reading may not go BELOW any reading dated earlier
 *   - a reading may not go ABOVE any reading dated later
 * which together keep the odometer monotonic with respect to time.
 *
 * Two details that are easy to get wrong and are handled explicitly here:
 *
 *  1. EDITING AN OLD RECORD is legitimate even though its odometer is lower than
 *     today's. The "not below the current odometer" check therefore only applies
 *     when creating a new record, never when editing one.
 *  2. Comparaisons are date-aware, not just "against the maximum". Inserting a
 *     past fill-up between two existing ones is valid at a lower odometer than
 *     the latest, as long as it sits between its neighbours.
 *
 * Pure module: no DB, no React.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type OdometerStatus = "ok" | "warning" | "error";

export type OdometerCode =
  | "ok"
  | "invalid"
  | "below_current"
  | "below_earlier_reading"
  | "above_later_reading"
  | "duplicate"
  | "suspicious_jump";

export interface OdometerValidationResult {
  status: OdometerStatus;
  code: OdometerCode;
  message: string;
  /** True when saving must be blocked rather than merely discouraged. */
  blocking: boolean;
}

export interface OdometerReading {
  id?: string | null;
  km: number;
  date?: string | Date | null;
}

export interface OdometerValidationInput {
  /** The value the user is entering. */
  km: number | string | null | undefined;
  /** Date of the record being created or edited. */
  date?: string | Date | null;
  /**
   * Highest odometer already known for the vehicle (its `currentKm`).
   * Only enforced when creating.
   */
  currentKm?: number | null;
  /** Other readings of the same vehicle, used for the ordering rule. */
  history?: OdometerReading[] | null;
  /** Set when editing, so the record does not compare against itself. */
  editingId?: string | null;
  /** Creating vs editing changes whether `currentKm` is enforced. */
  mode?: "create" | "edit";
  /** Overrides the jump factor, mostly for tests. */
  jumpFactor?: number;
}

/** A reading this far above the highest known one is probably a typo. */
export const SUSPICIOUS_JUMP_FACTOR = 5;

// ─── Helpers ─────────────────────────────────────────────────────────

function toTime(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function formatKm(km: number): string {
  return Math.round(km).toLocaleString("es-CO");
}

/** Highest odometer among the given readings, ignoring unusable ones. */
export function highestKnownKm(readings: OdometerReading[] | null | undefined): number {
  let max = 0;
  for (const reading of readings ?? []) {
    const km = Number(reading?.km ?? 0);
    if (Number.isFinite(km) && km > max) max = km;
  }
  return max;
}

const OK: OdometerValidationResult = {
  status: "ok",
  code: "ok",
  message: "",
  blocking: false,
};

// ─── Validator ───────────────────────────────────────────────────────

export function validateOdometer(input: OdometerValidationInput): OdometerValidationResult {
  const raw = input.km;

  // An empty field means "not filled in", never "zero kilometres". Without this,
  // Number("") === 0 would silently accept a blank input as a valid reading.
  if (typeof raw === "string" && raw.trim() === "") {
    return {
      status: "error",
      code: "invalid",
      message: "Ingresá el kilometraje.",
      blocking: true,
    };
  }

  const km = Number(raw ?? Number.NaN);

  if (!Number.isFinite(km) || km < 0) {
    return {
      status: "error",
      code: "invalid",
      message: "Ingresá un kilometraje válido.",
      blocking: true,
    };
  }

  const mode = input.mode ?? "create";
  const currentKm = Number(input.currentKm ?? 0);
  const targetTime = toTime(input.date);
  const others = (input.history ?? []).filter(
    (reading) => reading && (!input.editingId || reading.id !== input.editingId)
  );

  // A reading dated after the one being entered makes this a historical
  // insertion. In that case the date-aware ordering rule below is the correct
  // guard, and comparing against today's odometer would wrongly reject a
  // legitimate back-filled record.
  const latestKnownTime = others.reduce<number | null>((latest, reading) => {
    const time = toTime(reading.date);
    if (time == null) return latest;
    return latest == null || time > latest ? time : latest;
  }, null);
  const isAppending = targetTime == null || latestKnownTime == null || targetTime >= latestKnownTime;

  // 1. Never below what the vehicle already shows — but only when appending, so
  //    that filling in an older record stays possible.
  if (mode === "create" && isAppending && Number.isFinite(currentKm) && currentKm > 0 && km < currentKm) {
    return {
      status: "error",
      code: "below_current",
      message: `El odómetro no puede ser menor al último registrado (${formatKm(currentKm)} km).`,
      blocking: true,
    };
  }

  // 2. Date-aware ordering against the rest of the history.
  if (targetTime != null) {
    let highestEarlier: OdometerReading | null = null;
    let lowestLater: OdometerReading | null = null;

    for (const reading of others) {
      const time = toTime(reading.date);
      if (time == null) continue;
      if (time < targetTime) {
        if (!highestEarlier || reading.km > highestEarlier.km) highestEarlier = reading;
      } else if (time > targetTime) {
        if (!lowestLater || reading.km < lowestLater.km) lowestLater = reading;
      }
    }

    if (highestEarlier && km < highestEarlier.km) {
      return {
        status: "error",
        code: "below_earlier_reading",
        message: `Hay un registro del ${formatKm(highestEarlier.km)} km anterior a esta fecha; el odómetro no puede bajar.`,
        blocking: true,
      };
    }

    if (lowestLater && km > lowestLater.km) {
      return {
        status: "error",
        code: "above_later_reading",
        message: `Hay un registro posterior de ${formatKm(lowestLater.km)} km; el odómetro no puede superarlo antes de esa fecha.`,
        blocking: true,
      };
    }

    // 3. Exact duplicate on the same day is almost always a double entry.
    const duplicate = others.some((reading) => {
      const time = toTime(reading.date);
      return time != null && time === targetTime && Number(reading.km) === km;
    });
    if (duplicate) {
      return {
        status: "error",
        code: "duplicate",
        message: `Ya existe un registro de ${formatKm(km)} km en esa fecha.`,
        blocking: true,
      };
    }
  }

  // 4. A wild jump is far more likely a typo than a real trip.
  const highest = Math.max(highestKnownKm(others), Number.isFinite(currentKm) ? currentKm : 0);
  const factor = input.jumpFactor ?? SUSPICIOUS_JUMP_FACTOR;
  if (highest > 0 && km > highest * factor) {
    return {
      status: "warning",
      code: "suspicious_jump",
      message: `Salto muy grande: ${formatKm(km)} km contra ${formatKm(highest)} km conocidos. Verificá que no sobre un dígito.`,
      blocking: false,
    };
  }

  return OK;
}
