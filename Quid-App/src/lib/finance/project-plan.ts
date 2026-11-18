/**
 * F-52 · Planes de proyecto (casa, carro, estudios…).
 *
 * Regla de oro: **no prometemos rendimientos**. El plan muestra escenarios con
 * supuestos visibles y editables, y un rango (no una cifra única) cuando el
 * instrumento tiene volatilidad.
 *
 * Todo es mensual: aporte al final de cada mes, tasa nominal anual dividida por
 * 12 (es como liquidan los CDT en Colombia), interés compuesto.
 */

export type ScenarioKind = "savings" | "cdt" | "etf" | "stocks" | "mixed";

export interface ScenarioInput {
  name: string;
  kind: ScenarioKind;
  /** Tasa anual en porcentaje (ej. 11 para un CDT al 11% EA). */
  annualRatePercent: number;
  /** Volatilidad anual en porcentaje; 0 = renta fija. */
  volatilityPercent?: number;
  /** De dónde salió la tasa: banco, emisor, supuesto propio… */
  source?: string;
}

export interface PlanInput {
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  /** Fecha objetivo (ISO). Opcional: si falta, se calcula el plazo. */
  targetDate?: string | null;
}

export interface ScenarioProjection {
  name: string;
  kind: ScenarioKind;
  annualRatePercent: number;
  /** Valor alcanzado en la fecha objetivo (o al completar el objetivo). */
  projectedAmount: number;
  /** Rango cuando hay volatilidad (percentiles 10 y 90 aproximados). */
  lowAmount: number;
  highAmount: number;
  /** Meses necesarios para llegar al objetivo con este instrumento. */
  monthsToGoal: number | null;
  /** Lo que falta (o sobra) en la fecha objetivo. */
  gap: number;
  /** Aporte mensual necesario para llegar justo al objetivo. */
  requiredMonthly: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

function monthsBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  );
}

/** Aporte mensual necesario para llegar a `target` en `months` meses. */
export function requiredMonthlyContribution(
  target: number,
  current: number,
  months: number,
  annualRatePercent: number
): number {
  if (months <= 0) return Math.max(0, target - current);
  const monthlyRate = annualRatePercent / 100 / 12;
  const growth = Math.pow(1 + monthlyRate, months);
  const remaining = target - current * growth;
  if (remaining <= 0) return 0;
  if (monthlyRate === 0) return round(remaining / months);
  return round((remaining * monthlyRate) / (growth - 1));
}

/** Cuántos meses hacen falta aportando `monthly`. */
export function monthsToReach(
  target: number,
  current: number,
  monthly: number,
  annualRatePercent: number
): number | null {
  const monthlyRate = annualRatePercent / 100 / 12;
  let balance = current;
  if (balance >= target) return 0;
  if (monthly <= 0 && monthlyRate <= 0) return null;

  for (let month = 1; month <= 1200; month += 1) {
    balance = balance * (1 + monthlyRate) + monthly;
    if (balance >= target) return month;
  }
  return null;
}

/** Valor futuro tras `months` meses aportando `monthly`. */
export function futureValue(
  current: number,
  monthly: number,
  months: number,
  annualRatePercent: number
): number {
  const monthlyRate = annualRatePercent / 100 / 12;
  if (months <= 0) return round(current);
  const growth = Math.pow(1 + monthlyRate, months);
  const fromContributions = monthlyRate === 0 ? monthly * months : monthly * ((growth - 1) / monthlyRate);
  return round(current * growth + fromContributions);
}

/**
 * Proyección de un escenario a la fecha objetivo. Con volatilidad se muestra
 * un rango: no es una predicción, es la dispersión esperable.
 */
export function projectScenario(
  scenario: ScenarioInput,
  plan: PlanInput,
  today = new Date()
): ScenarioProjection {
  const targetDate = plan.targetDate ? new Date(plan.targetDate) : null;
  const months = targetDate && !Number.isNaN(targetDate.getTime())
    ? monthsBetween(today, targetDate)
    : 0;

  const effectiveMonths = months > 0 ? months : monthsToReach(
    plan.targetAmount,
    plan.currentAmount,
    plan.monthlyContribution,
    scenario.annualRatePercent
  ) ?? 0;

  const projected = futureValue(
    plan.currentAmount,
    plan.monthlyContribution,
    effectiveMonths,
    scenario.annualRatePercent
  );

  const volatility = scenario.volatilityPercent ?? 0;
  // Dispersión aproximada: volatilidad anual escalada a la raíz del plazo.
  const spread = volatility > 0 ? (volatility / 100) * Math.sqrt(effectiveMonths / 12) : 0;
  const low = round(projected * (1 - spread));
  const high = round(projected * (1 + spread));

  return {
    name: scenario.name,
    kind: scenario.kind,
    annualRatePercent: scenario.annualRatePercent,
    projectedAmount: projected,
    lowAmount: Math.max(0, low),
    highAmount: high,
    monthsToGoal: monthsToReach(
      plan.targetAmount,
      plan.currentAmount,
      plan.monthlyContribution,
      scenario.annualRatePercent
    ),
    gap: round(projected - plan.targetAmount),
    requiredMonthly: requiredMonthlyContribution(
      plan.targetAmount,
      plan.currentAmount,
      effectiveMonths || 1,
      scenario.annualRatePercent
    ),
  };
}

export function projectAll(
  scenarios: ScenarioInput[],
  plan: PlanInput,
  today = new Date()
): ScenarioProjection[] {
  return scenarios
    .map((scenario) => projectScenario(scenario, plan, today))
    .sort((a, b) => b.projectedAmount - a.projectedAmount);
}
