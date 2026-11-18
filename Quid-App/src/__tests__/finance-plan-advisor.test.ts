import { describe, expect, it } from "vitest";
import { advisePlan } from "@/lib/finance/plan-advisor";

const base = {
  monthlyIncome: 5_000_000,
  monthlyExpenses: 3_000_000,
  monthlyDebtPayments: 500_000,
  emergencyFund: 12_000_000,
};

describe("consejero del plan", () => {
  it("con colchón completo propone la mitad de lo libre", () => {
    const result = advisePlan(base);
    expect(result.surplus).toBe(1_500_000);
    expect(result.suggestedMonthly).toBe(750_000);
    expect(result.verdict).toBe("start");
  });

  it("sin excedente no propone aportar", () => {
    const result = advisePlan({
      ...base,
      monthlyExpenses: 4_700_000,
      monthlyDebtPayments: 400_000,
    });
    expect(result.surplus).toBeLessThanOrEqual(0);
    expect(result.suggestedMonthly).toBe(0);
    expect(result.verdict).toBe("not_yet");
  });

  it("con deuda alta prioriza pagar deuda y baja la propuesta", () => {
    const result = advisePlan({
      ...base,
      monthlyExpenses: 2_000_000,
      monthlyDebtPayments: 2_000_000,
      emergencyFund: 20_000_000,
    });
    expect(result.debtLoad).toBeGreaterThan(30);
    expect(result.verdict).toBe("pay_debt_first");
    expect(result.suggestedMonthly).toBeLessThan(500_000);
  });

  it("sin colchón reparte entre plan y emergencia", () => {
    const result = advisePlan({ ...base, emergencyFund: 0 });
    expect(result.verdict).toBe("build_emergency_first");
    expect(result.emergencyGap).toBeGreaterThan(0);
    expect(result.suggestedMonthly).toBeGreaterThan(0);
    expect(result.suggestedMonthly).toBeLessThan(result.surplus);
  });

  it("sin ingresos no inventa un aporte", () => {
    const result = advisePlan({ ...base, monthlyIncome: 0 });
    expect(result.suggestedMonthly).toBe(0);
    expect(result.verdict).toBe("not_yet");
  });

  it("nunca propone más de lo que sobra", () => {
    const result = advisePlan({ ...base, emergencyFund: 0 });
    expect(result.suggestedMonthly).toBeLessThanOrEqual(result.surplus);
  });

  it("calcula el colchón sobre los gastos, no sobre el ingreso", () => {
    const result = advisePlan(base);
    expect(result.emergencyTarget).toBe(9_000_000);
  });
});
