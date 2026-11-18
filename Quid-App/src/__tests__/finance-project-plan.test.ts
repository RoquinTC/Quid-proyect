import { describe, expect, it } from "vitest";
import {
  futureValue,
  monthsToReach,
  projectAll,
  projectScenario,
  requiredMonthlyContribution,
} from "@/lib/finance/project-plan";

describe("plan de proyecto · matemática", () => {
  it("sin interés, el aporte necesario es lo que falta entre meses", () => {
    expect(requiredMonthlyContribution(12_000_000, 0, 24, 0)).toBe(500_000);
  });

  it("con interés hace falta aportar menos", () => {
    const sinInteres = requiredMonthlyContribution(12_000_000, 0, 24, 0);
    const conInteres = requiredMonthlyContribution(12_000_000, 0, 24, 11);
    expect(conInteres).toBeLessThan(sinInteres);
  });

  it("si el saldo actual ya alcanza, no pide aportes", () => {
    expect(requiredMonthlyContribution(1_000_000, 2_000_000, 12, 8)).toBe(0);
  });

  it("cuenta los meses para llegar al objetivo", () => {
    const months = monthsToReach(10_000_000, 0, 500_000, 0);
    expect(months).toBe(20);
  });

  it("con interés llega antes que sin interés", () => {
    const sinInteres = monthsToReach(10_000_000, 0, 500_000, 0);
    const conInteres = monthsToReach(10_000_000, 0, 500_000, 11);
    expect(conInteres).toBeLessThan(sinInteres!);
  });

  it("valor futuro con aportes y rendimiento", () => {
    const value = futureValue(0, 1_000_000, 12, 12);
    expect(value).toBeGreaterThan(12_000_000);
    expect(value).toBeLessThan(13_000_000);
  });

  it("un CDT al 11% proyecta más que ahorrar al 0%", () => {
    const plan = { targetAmount: 50_000_000, currentAmount: 5_000_000, monthlyContribution: 800_000, targetDate: "2031-01-01" };
    const [cdt, ahorro] = [
      projectScenario({ name: "CDT 11%", kind: "cdt", annualRatePercent: 11 }, plan),
      projectScenario({ name: "Cuenta", kind: "savings", annualRatePercent: 0 }, plan),
    ];
    expect(cdt.projectedAmount).toBeGreaterThan(ahorro.projectedAmount);
    expect(cdt.annualRatePercent).toBe(11);
  });

  it("con volatilidad devuelve un rango, no una cifra sola", () => {
    const projection = projectScenario(
      { name: "ETF", kind: "etf", annualRatePercent: 8, volatilityPercent: 15 },
      { targetAmount: 30_000_000, currentAmount: 0, monthlyContribution: 500_000, targetDate: "2030-01-01" }
    );
    expect(projection.lowAmount).toBeLessThan(projection.projectedAmount);
    expect(projection.highAmount).toBeGreaterThan(projection.projectedAmount);
  });

  it("ordena los escenarios del mejor al peor proyectado", () => {
    const plan = { targetAmount: 30_000_000, currentAmount: 0, monthlyContribution: 500_000, targetDate: "2030-01-01" };
    const results = projectAll(
      [
        { name: "Cuenta", kind: "savings", annualRatePercent: 0 },
        { name: "CDT", kind: "cdt", annualRatePercent: 11 },
        { name: "ETF", kind: "etf", annualRatePercent: 8 },
      ],
      plan
    );
    expect(results[0].name).toBe("CDT");
    expect(results[2].name).toBe("Cuenta");
  });

  it("una tasa absurda no rompe la proyección", () => {
    const projection = projectScenario(
      { name: "X", kind: "mixed", annualRatePercent: 500 },
      { targetAmount: 1_000_000, currentAmount: 0, monthlyContribution: 100_000, targetDate: "2030-01-01" }
    );
    expect(Number.isFinite(projection.projectedAmount)).toBe(true);
  });
});
