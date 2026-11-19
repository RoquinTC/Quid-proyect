/**
 * F-58 · Seguimiento de un plan de proyecto.
 *
 * La proyección dice "a dónde llegarías"; esto dice **cómo vas**. Compara lo
 * que deberías tener hoy (según el aporte y la tasa supuesta) contra lo que de
 * verdad hay apartado, y traduce la diferencia a una decisión.
 *
 * Regla: si no hay dato real, no se inventa. `status` queda en `unknown`.
 */

export interface PlanProgressInput {
  /** Cuándo arrancó el plan. */
  startedAt: Date;
  /** Aporte mensual previsto. */
  monthlyContribution: number;
  /** Tasa anual del escenario elegido (porcentaje). */
  annualRatePercent: number;
  /** Monto con el que arrancó (lo que ya estaba apartado). */
  initialAmount: number;
  /** Lo que hay apartado hoy, si se conoce. `null` = sin dato. */
  actualAmount: number | null;
  /** Objetivo del plan. */
  targetAmount: number;
  /** Fecha objetivo, si existe. */
  targetDate?: Date | null;
  /** Hoy (inyectable para pruebas). */
  now?: Date;
}

export type PlanStatus = "ahead" | "on_track" | "behind" | "unknown";

export interface PlanProgress {
  monthsElapsed: number;
  /** Lo que deberías tener hoy con el aporte y la tasa supuesta. */
  expectedAmount: number;
  actualAmount: number | null;
  /** actual − esperado. Negativo = vas por detrás. */
  gap: number;
  status: PlanStatus;
  /** Aporte mensual necesario para llegar a la fecha objetivo desde hoy. */
  requiredMonthlyNow: number | null;
  /** Mensaje corto, sin promesas. */
  message: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, months);
}

function futureValue(
  initial: number,
  monthly: number,
  months: number,
  annualRatePercent: number
): number {
  const rate = annualRatePercent / 100 / 12;
  if (months <= 0) return round2(initial);
  const growth = Math.pow(1 + rate, months);
  const contributions = rate === 0 ? monthly * months : monthly * ((growth - 1) / rate);
  return round2(initial * growth + contributions);
}

/** Margen de tolerancia: ±5% se considera "en camino". */
const TOLERANCE = 0.05;

export function computePlanProgress(input: PlanProgressInput): PlanProgress {
  const now = input.now ?? new Date();
  const monthsElapsed = monthsBetween(input.startedAt, now);

  const expectedAmount = futureValue(
    Math.max(0, input.initialAmount),
    Math.max(0, input.monthlyContribution),
    monthsElapsed,
    input.annualRatePercent
  );

  const monthsRemaining = input.targetDate ? monthsBetween(now, input.targetDate) : null;
  const remainingTarget = Math.max(0, input.targetAmount - (input.actualAmount ?? 0));
  const requiredMonthlyNow =
    monthsRemaining && monthsRemaining > 0
      ? round2(remainingTarget / monthsRemaining)
      : null;

  if (input.actualAmount === null || !Number.isFinite(input.actualAmount)) {
    return {
      monthsElapsed,
      expectedAmount,
      actualAmount: null,
      gap: 0,
      status: "unknown",
      requiredMonthlyNow,
      message: "Aún no sé cuánto llevas apartado: actualiza el plan o crea la meta para seguirlo.",
    };
  }

  const gap = round2(input.actualAmount - expectedAmount);
  const tolerance = Math.max(1, expectedAmount * TOLERANCE);

  if (gap >= tolerance) {
    return {
      monthsElapsed,
      expectedAmount,
      actualAmount: input.actualAmount,
      gap,
      status: "ahead",
      requiredMonthlyNow,
      message: `Vas ${Math.round(gap).toLocaleString("es-CO")} por delante de lo previsto.`,
    };
  }

  if (gap <= -tolerance) {
    return {
      monthsElapsed,
      expectedAmount,
      actualAmount: input.actualAmount,
      gap,
      status: "behind",
      requiredMonthlyNow,
      message:
        `Vas ${Math.round(Math.abs(gap)).toLocaleString("es-CO")} por detrás de lo previsto.` +
        (requiredMonthlyNow ? ` Para llegar a tiempo necesitas aportar ${Math.round(requiredMonthlyNow).toLocaleString("es-CO")} al mes.` : ""),
    };
  }

  return {
    monthsElapsed,
    expectedAmount,
    actualAmount: input.actualAmount,
    gap,
    status: "on_track",
    requiredMonthlyNow,
    message: "Vas en línea con lo previsto.",
  };
}
