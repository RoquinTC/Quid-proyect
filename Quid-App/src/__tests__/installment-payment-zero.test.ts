import { describe, expect, it } from "vitest";
import { getEffectiveInstallmentCapital } from "@/lib/installment-payment";

/**
 * Caso real: una cuota se pagó, se reversó el pago y quedó con
 * `remainingBalance = 0` pero con su valor de cuota. El botón de pagar no
 * hacía nada porque el capital efectivo daba 0.
 */
describe("capital efectivo con pendiente en cero", () => {
  it("usa el valor de la cuota cuando el pendiente quedó en 0", () => {
    expect(
      getEffectiveInstallmentCapital({
        totalAmount: 5_970_000,
        totalInstallments: 30,
        installmentAmount: 174_786.34,
        remainingBalance: 0,
      })
    ).toBeCloseTo(174_786.34, 2);
  });

  it("sigue respetando el pendiente cuando es menor que la cuota", () => {
    expect(
      getEffectiveInstallmentCapital({
        totalAmount: 1_000_000,
        totalInstallments: 10,
        installmentAmount: 100_000,
        remainingBalance: 35_000,
      })
    ).toBe(35_000);
  });

  it("no inventa capital si no hay cuota definida", () => {
    expect(
      getEffectiveInstallmentCapital({
        totalAmount: 0,
        totalInstallments: 0,
        installmentAmount: 0,
        remainingBalance: 0,
      })
    ).toBe(0);
  });
});
