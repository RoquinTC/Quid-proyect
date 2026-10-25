import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLASS_ML,
  MAX_GOAL_ML,
  MIN_GOAL_ML,
  bodyMassIndex,
  computeHydrationPlan,
  glassesProgress,
  type HydrationProfile,
} from "@/lib/health/hydration-plan";

const base: HydrationProfile = {
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

describe("cálculo de la meta de agua", () => {
  it("usa 35 ml/kg, descuenta alimentos y suma actividad y clima", () => {
    const plan = computeHydrationPlan(base);
    // 70 × 35 = 2450 − 500 + 300 + 200 = 2450
    expect(plan.baseMl).toBe(2450);
    expect(plan.goalMl).toBe(2450);
    expect(plan.glasses).toBe(10); // 2450 / 250
  });

  it("una persona sedentaria en clima frío necesita menos", () => {
    const plan = computeHydrationPlan({
      ...base,
      activity: "sedentary",
      climate: "cold",
    });
    // 2450 − 500 = 1950
    expect(plan.goalMl).toBe(1950);
    expect(plan.glasses).toBe(8);
  });

  it("más peso ⇒ más agua", () => {
    const ligero = computeHydrationPlan({ ...base, weightKg: 55 });
    const pesado = computeHydrationPlan({ ...base, weightKg: 95 });
    expect(pesado.goalMl).toBeGreaterThan(ligero.goalMl);
  });

  it("con IMC ≥ 30 usa peso de referencia en vez del real", () => {
    // 120 kg / 1,70 m ⇒ IMC 41,5
    const plan = computeHydrationPlan({ ...base, weightKg: 120 });
    expect(plan.usedAdjustedWeight).toBe(true);
    expect(plan.referenceWeightKg).toBeCloseTo(63.6, 1); // 22 × 1,70²
    // Sin la corrección pediría 4.200 ml; con ella se queda razonable
    expect(plan.goalMl).toBeLessThan(2600);
  });

  it("respeta una meta fijada a mano", () => {
    const plan = computeHydrationPlan({ ...base, manualGoalMl: 3000 });
    expect(plan.isManual).toBe(true);
    expect(plan.goalMl).toBe(3000);
    expect(plan.glasses).toBe(12);
  });

  it("nunca baja del mínimo ni pasa del máximo", () => {
    const minimo = computeHydrationPlan({
      ...base,
      weightKg: 30,
      activity: "sedentary",
      climate: "cold",
    });
    expect(minimo.goalMl).toBeGreaterThanOrEqual(MIN_GOAL_ML);

    const maximo = computeHydrationPlan({ ...base, weightKg: 250, activity: "active", climate: "hot" });
    expect(maximo.goalMl).toBeLessThanOrEqual(MAX_GOAL_ML);
  });

  it("cambiar el tamaño del vaso cambia el número de vasos, no la meta", () => {
    const vaso250 = computeHydrationPlan({ ...base, glassMl: 250 });
    const vaso500 = computeHydrationPlan({ ...base, glassMl: 500 });
    expect(vaso500.goalMl).toBe(vaso250.goalMl);
    expect(vaso500.glasses).toBeLessThan(vaso250.glasses);
  });

  it("explica el cálculo al usuario", () => {
    const plan = computeHydrationPlan(base);
    expect(plan.explanation.join(" ")).toMatch(/35 ml por kilo/);
    expect(plan.explanation.join(" ")).toMatch(/alimentos/);
  });

  it("BMI calculado correctamente", () => {
    expect(bodyMassIndex(70, 170)).toBeCloseTo(24.2, 1);
    expect(bodyMassIndex(0, 170)).toBe(0);
  });
});

describe("progreso en vasos", () => {
  const plan = { glassMl: 250, glasses: 10 };

  it("cuenta vasos completos", () => {
    expect(glassesProgress(750, plan)).toEqual({ completed: 3, partial: 0, total: 10 });
  });

  it("calcula la fracción del vaso en curso", () => {
    const progress = glassesProgress(875, plan);
    expect(progress.completed).toBe(3);
    expect(progress.partial).toBeCloseTo(0.5, 2);
  });

  it("no pasa del total", () => {
    const progress = glassesProgress(3000, plan);
    expect(progress.completed).toBe(10);
  });
});
