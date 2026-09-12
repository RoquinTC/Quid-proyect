import { describe, expect, it } from "vitest";
import {
  getEffectiveInstallmentCapital,
  getNextInstallmentCapital,
  getRemainingCapital,
} from "@/lib/installment-payment";

describe("installment payment calculations", () => {
  it("charges only the remaining capital after a partial abono", () => {
    const installment = { totalAmount: 100_000, totalInstallments: 1, installmentAmount: 60_000, remainingBalance: 60_000 };
    expect(getRemainingCapital(installment)).toBe(60_000);
    expect(getEffectiveInstallmentCapital(installment)).toBe(60_000);
  });

  it("keeps the normal installment while a multi-installment purchase still has capital", () => {
    const installment = { totalAmount: 600_000, totalInstallments: 6, installmentAmount: 100_000, remainingBalance: 350_000 };
    expect(getEffectiveInstallmentCapital(installment)).toBe(100_000);
    expect(getNextInstallmentCapital(installment, 250_000)).toBe(100_000);
  });

  it("limits the final multi-installment payment to the capital actually remaining", () => {
    const installment = { totalAmount: 600_000, totalInstallments: 6, installmentAmount: 100_000, remainingBalance: 50_000 };
    expect(getEffectiveInstallmentCapital(installment)).toBe(50_000);
    expect(getNextInstallmentCapital(installment, 50_000)).toBe(50_000);
  });

  it("restores the standard installment after reversing a final partial abono", () => {
    const adjustedInstallment = { totalAmount: 600_000, totalInstallments: 6, installmentAmount: 50_000, remainingBalance: 600_000 };
    expect(getNextInstallmentCapital(adjustedInstallment, 600_000)).toBe(100_000);
  });
});
