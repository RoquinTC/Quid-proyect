/**
 * Cálculo de la meta diaria de agua.
 *
 * Referencia usada: ~35 ml por kilo de peso corporal al día es la regla clínica
 * habitual para adultos (rango 30–40 ml/kg). Dos correcciones importantes:
 *
 *  1. **Los alimentos aportan agua.** Entre un 20 % y 30 % de los líquidos del
 *     día vienen de la comida, así que pedirle a alguien que *beba* 35 ml/kg es
 *     sobreestimar. Aquí se descuenta una porción fija de alimentos.
 *  2. **El peso en obesidad engaña.** Con IMC ≥ 30 el peso real sobreestima la
 *     necesidad; se usa un peso de referencia (IMC 22) en su lugar.
 *
 * La altura no determina el agua por sí sola: entra en el cálculo del IMC, que
 * es lo que permite detectar el caso anterior. Esa es la razón de pedirla.
 *
 * La app no es un dispositivo médico: el resultado es una meta razonable, no una
 * prescripción, y siempre se puede ajustar a mano.
 */

export type HydrationActivity = "sedentary" | "moderate" | "active";
export type HydrationClimate = "cold" | "temperate" | "hot";

export interface HydrationProfile {
  weightKg: number;
  heightCm: number;
  activity: HydrationActivity;
  climate: HydrationClimate;
  /** Tamaño del vaso en ml (200–400). */
  glassMl: number;
  /** Si el usuario fija la meta a mano, se respeta y no se recalcula. */
  manualGoalMl?: number | null;
  /** Ventana despierta: los recordatorios se reparten aquí dentro. */
  wakeTime: string;
  sleepTime: string;
  remindersEnabled: boolean;
  /**
   * centered = el primer aviso cae después de despertar y el último antes de
   * dormir (cómodo). edges = el primero cae exactamente al despertar y el
   * último al acostarse.
   */
  reminderAlignment: "centered" | "edges";
}

export interface HydrationPlan {
  goalMl: number;
  glassMl: number;
  glasses: number;
  baseMl: number;
  foodCreditMl: number;
  activityExtraMl: number;
  climateExtraMl: number;
  bmi: number;
  /** Peso usado en la fórmula (puede ser el de referencia si el IMC es alto). */
  referenceWeightKg: number;
  usedAdjustedWeight: boolean;
  isManual: boolean;
  explanation: string[];
}

export const ML_PER_KG = 35;
export const FOOD_CREDIT_ML = 500;
export const DEFAULT_GLASS_ML = 250;
export const MIN_GOAL_ML = 1200;
export const MAX_GOAL_ML = 4500;

const ACTIVITY_EXTRA: Record<HydrationActivity, number> = {
  sedentary: 0,
  moderate: 300,
  active: 600,
};

const CLIMATE_EXTRA: Record<HydrationClimate, number> = {
  cold: 0,
  temperate: 200,
  hot: 400,
};

export const DEFAULT_HYDRATION_PROFILE: HydrationProfile = {
  weightKg: 70,
  heightCm: 170,
  activity: "moderate",
  climate: "temperate",
  glassMl: DEFAULT_GLASS_ML,
  manualGoalMl: null,
  wakeTime: "06:00",
  sleepTime: "22:00",
  remindersEnabled: true,
  reminderAlignment: "centered",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Redondea a 50 ml para que la meta sea una cifra "usable". */
function roundTo50(value: number): number {
  return Math.round(value / 50) * 50;
}

export function bodyMassIndex(weightKg: number, heightCm: number): number {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || heightCm <= 0) return 0;
  const meters = heightCm / 100;
  return weightKg / (meters * meters);
}

/**
 * Calcula la meta diaria y el número de vasos.
 *
 * `manualGoalMl` tiene prioridad: si el usuario ya ajustó la meta, el cálculo
 * solo informa, no la sobrescribe.
 */
export function computeHydrationPlan(profile: HydrationProfile): HydrationPlan {
  const weightKg = clamp(Number(profile.weightKg) || 70, 30, 250);
  const heightCm = clamp(Number(profile.heightCm) || 170, 120, 230);
  const glassMl = clamp(Number(profile.glassMl) || DEFAULT_GLASS_ML, 150, 500);

  const bmi = bodyMassIndex(weightKg, heightCm);
  // Con IMC alto se usa el peso correspondiente a IMC 22 (peso de referencia).
  const referenceWeightKg =
    bmi >= 30 ? Math.round(22 * (heightCm / 100) ** 2 * 10) / 10 : weightKg;
  const usedAdjustedWeight = bmi >= 30;

  const baseMl = referenceWeightKg * ML_PER_KG;
  const activityExtraMl = ACTIVITY_EXTRA[profile.activity] ?? 0;
  const climateExtraMl = CLIMATE_EXTRA[profile.climate] ?? 0;

  const isManual = Number.isFinite(Number(profile.manualGoalMl)) && Number(profile.manualGoalMl) > 0;

  const computedGoalMl = clamp(
    roundTo50(baseMl - FOOD_CREDIT_ML + activityExtraMl + climateExtraMl),
    MIN_GOAL_ML,
    MAX_GOAL_ML,
  );

  const goalMl = isManual
    ? clamp(roundTo50(Number(profile.manualGoalMl)), 500, 8000)
    : computedGoalMl;

  const glasses = Math.max(1, Math.round(goalMl / glassMl));

  const explanation: string[] = [];
  explanation.push(
    usedAdjustedWeight
      ? `Peso de referencia ${referenceWeightKg} kg (IMC ${bmi.toFixed(1)} ≥ 30, se usa el peso para IMC 22 en vez del real).`
      : `Peso ${referenceWeightKg} kg (IMC ${bmi.toFixed(1)}).`,
  );
  explanation.push(`${ML_PER_KG} ml por kilo = ${Math.round(baseMl)} ml.`);
  explanation.push(`−${FOOD_CREDIT_ML} ml que aportan los alimentos.`);
  if (activityExtraMl > 0) explanation.push(`+${activityExtraMl} ml por actividad física.`);
  if (climateExtraMl > 0) explanation.push(`+${climateExtraMl} ml por clima cálido.`);
  if (isManual) explanation.push(`Meta fijada a mano en ${goalMl} ml.`);

  return {
    goalMl,
    glassMl,
    glasses,
    baseMl: Math.round(baseMl),
    foodCreditMl: FOOD_CREDIT_ML,
    activityExtraMl,
    climateExtraMl,
    bmi: Math.round(bmi * 10) / 10,
    referenceWeightKg,
    usedAdjustedWeight,
    isManual,
    explanation,
  };
}

/** Vasos completos y fracción del vaso en curso. */
export function glassesProgress(
  currentMl: number,
  plan: Pick<HydrationPlan, "glassMl" | "glasses">,
): { completed: number; partial: number; total: number } {
  const total = plan.glasses;
  const completed = Math.min(total, Math.floor(currentMl / plan.glassMl));
  const remaining = currentMl - completed * plan.glassMl;
  return {
    completed,
    partial: Math.max(0, Math.min(1, remaining / plan.glassMl)),
    total,
  };
}
