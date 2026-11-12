import { describe, expect, it } from "vitest";
import {
  DEBT_TYPES,
  DEBT_TYPE_OPTIONS,
  debtTypeOf,
  isInstallmentDebt,
  isRevolvingDebt,
} from "@/lib/debts/debt-types";

describe("catálogo de tipos de deuda", () => {
  it("cada tipo tiene identidad y descripción, sin repetidos", () => {
    const ids = DEBT_TYPES.map((type) => type.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const type of DEBT_TYPES) {
      expect(type.label.length).toBeGreaterThan(3);
      expect(type.shortLabel.length).toBeGreaterThan(2);
      expect(type.description.length).toBeGreaterThan(10);
    }
  });

  it("las tarjetas son rotativas y tienen corte", () => {
    for (const id of ["credit_card", "store_card"]) {
      const type = debtTypeOf(id);
      expect(type.behavior).toBe("revolving");
      expect(type.hasCutoff).toBe(true);
      expect(type.paymentCountsAsExpense).toBe(false);
      expect(isRevolvingDebt(id)).toBe(true);
      expect(isInstallmentDebt(id)).toBe(false);
    }
  });

  it("los préstamos se pagan en cuotas y su pago es gasto", () => {
    for (const id of [
      "personal_loan",
      "auto_loan",
      "mortgage",
      "student_loan",
      "informal_loan",
      "loan",
    ]) {
      const type = debtTypeOf(id);
      expect(type.behavior).toBe("installment");
      expect(type.hasTerm).toBe(true);
      expect(type.paymentCountsAsExpense).toBe(true);
      expect(isInstallmentDebt(id)).toBe(true);
      expect(isRevolvingDebt(id)).toBe(false);
    }
  });

  it("el alias histórico `loan` mantiene el comportamiento de préstamo", () => {
    expect(debtTypeOf("loan").id).toBe("personal_loan");
  });

  it("«otra deuda» es un saldo abierto, sin cuotas ni corte", () => {
    const type = debtTypeOf("other");
    expect(type.behavior).toBe("open_balance");
    expect(type.hasTerm).toBe(false);
    expect(type.hasCutoff).toBe(false);
    expect(type.paymentCountsAsExpense).toBe(false);
    expect(isInstallmentDebt("other")).toBe(false);
  });

  it("un tipo desconocido cae en saldo abierto en vez de romper", () => {
    expect(debtTypeOf("cripto").behavior).toBe("open_balance");
    expect(debtTypeOf(null).behavior).toBe("open_balance");
    expect(debtTypeOf(undefined).behavior).toBe("open_balance");
  });

  it("las opciones del formulario salen del catálogo", () => {
    expect(DEBT_TYPE_OPTIONS).toHaveLength(DEBT_TYPES.length);
    expect(DEBT_TYPE_OPTIONS.every((option) => option.description.length > 10)).toBe(true);
  });
});
