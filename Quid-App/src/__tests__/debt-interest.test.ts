import { describe, expect, it } from "vitest";
import { interestForPeriod, periodicRateFromAnnual } from "@/lib/debts/interest";

/**
 * Contra el extracto real del Banco de Bogotá (Libre Destino):
 * saldo a corte 5.469.280,41 · tasa 17,98% EA · interés del período 81.453,92
 * para una cuota con 33 días.
 */
describe("interés de una cuota desde la tasa anual del banco", () => {
  it("usa la tasa mensual que cobra el banco (anual / 12)", () => {
    const monthly = periodicRateFromAnnual(17.98, 30);
    expect(monthly).toBeCloseTo(0.0149833, 6);
  });

  it("calcula un interés parecido al del banco (33 días)", () => {
    const interest = interestForPeriod(5_469_280.41, 17.98, 33);
    expect(interest).toBeGreaterThan(80_000);
    expect(interest).toBeLessThan(83_500);
  });

  it("no trata la tasa anual como si fuera mensual", () => {
    // El error anterior: 17,98% del saldo completo.
    const wrong = 5_469_280.41 * 0.1798;
    const right = interestForPeriod(5_469_280.41, 17.98, 30);
    expect(right).toBeLessThan(wrong / 10);
  });

  it("sin tasa o sin saldo no inventa interés", () => {
    expect(interestForPeriod(1_000_000, 0)).toBe(0);
    expect(interestForPeriod(0, 17.98)).toBe(0);
  });
});
