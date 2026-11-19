import { describe, expect, it } from "vitest";
import { computePlanProgress } from "@/lib/finance/plan-progress";

const start = new Date(2026, 0, 15); // 15 ene 2026
const now = new Date(2026, 5, 15); // 15 jun 2026 → 5 meses

const base = {
  startedAt: start,
  now,
  monthlyContribution: 500_000,
  annualRatePercent: 0,
  initialAmount: 0,
  targetAmount: 20_000_000,
  targetDate: new Date(2027, 0, 15),
};

describe("seguimiento del plan", () => {
  it("calcula lo esperado solo con aportes cuando la tasa es cero", () => {
    const result = computePlanProgress({ ...base, actualAmount: 2_500_000 });
    expect(result.monthsElapsed).toBe(5);
    expect(result.expectedAmount).toBe(2_500_000);
    expect(result.status).toBe("on_track");
  });

  it("marca adelanto cuando hay más de lo previsto", () => {
    const result = computePlanProgress({ ...base, actualAmount: 3_500_000 });
    expect(result.status).toBe("ahead");
    expect(result.gap).toBeGreaterThan(0);
  });

  it("marca atraso y sugiere el aporte necesario", () => {
    const result = computePlanProgress({ ...base, actualAmount: 1_000_000 });
    expect(result.status).toBe("behind");
    expect(result.gap).toBeLessThan(0);
    expect(result.requiredMonthlyNow).toBeGreaterThan(0);
    expect(result.message).toContain("por detrás");
  });

  it("sin dato real no inventa estado", () => {
    const result = computePlanProgress({ ...base, actualAmount: null });
    expect(result.status).toBe("unknown");
    expect(result.actualAmount).toBeNull();
  });

  it("la tasa aumenta lo esperado", () => {
    const sinTasa = computePlanProgress({ ...base, actualAmount: 0 });
    const conTasa = computePlanProgress({ ...base, annualRatePercent: 12, actualAmount: 0 });
    expect(conTasa.expectedAmount).toBeGreaterThan(sinTasa.expectedAmount);
  });

  it("sin fecha objetivo no calcula aporte requerido", () => {
    const result = computePlanProgress({ ...base, targetDate: null, actualAmount: 100_000 });
    expect(result.requiredMonthlyNow).toBeNull();
  });
});
