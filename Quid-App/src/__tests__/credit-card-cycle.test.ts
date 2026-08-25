import { describe, expect, it } from "vitest";
import { getCreditCardNextPaymentDate } from "@/lib/credit-card-cycle";

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

describe("getCreditCardNextPaymentDate", () => {
  it("keeps purchases before cutoff in the current cycle when payment is after cutoff", () => {
    const paymentDate = getCreditCardNextPaymentDate({
      purchaseDate: new Date(2026, 5, 2, 12),
      cutoffDate: 3,
      paymentDate: 23,
    });

    expect(ymd(paymentDate)).toBe("2026-06-23");
  });

  it("moves purchases on or after cutoff to the next cycle when payment is after cutoff", () => {
    const paymentDate = getCreditCardNextPaymentDate({
      purchaseDate: new Date(2026, 5, 4, 12),
      cutoffDate: 3,
      paymentDate: 23,
    });

    expect(ymd(paymentDate)).toBe("2026-07-23");
  });

  it("schedules payment in the next month when payment day is before cutoff", () => {
    const beforeCutoff = getCreditCardNextPaymentDate({
      purchaseDate: new Date(2026, 3, 19, 12),
      cutoffDate: 20,
      paymentDate: 4,
    });
    const afterCutoff = getCreditCardNextPaymentDate({
      purchaseDate: new Date(2026, 3, 20, 12),
      cutoffDate: 20,
      paymentDate: 4,
    });

    expect(ymd(beforeCutoff)).toBe("2026-05-04");
    expect(ymd(afterCutoff)).toBe("2026-06-04");
  });

  it("clamps payment day to the last day of short months", () => {
    const paymentDate = getCreditCardNextPaymentDate({
      purchaseDate: new Date(2026, 0, 31, 12),
      cutoffDate: 30,
      paymentDate: 31,
    });

    expect(ymd(paymentDate)).toBe("2026-02-28");
  });
});
