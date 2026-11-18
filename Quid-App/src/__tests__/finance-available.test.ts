import { describe, expect, it } from "vitest";
import { balanceBreakdown } from "@/lib/finance/available";

describe("disponible versus apartado", () => {
  it("separa lo apartado del disponible", () => {
    const result = balanceBreakdown([
      { balance: 1_000_000 },
      { balance: 3_000_000, excludeFromAvailable: true },
    ]);
    expect(result.total).toBe(4_000_000);
    expect(result.available).toBe(1_000_000);
    expect(result.apartado).toBe(3_000_000);
  });

  it("cuenta las subcuentas con su propia marca", () => {
    const result = balanceBreakdown([
      {
        balance: 500_000,
        subAccounts: [
          { balance: 200_000 },
          { balance: 800_000, excludeFromAvailable: true },
        ],
      },
    ]);
    expect(result.total).toBe(1_500_000);
    expect(result.available).toBe(700_000);
    expect(result.apartado).toBe(800_000);
  });

  it("si la cuenta principal está apartada, sus subcuentas sí pueden contar", () => {
    const result = balanceBreakdown([
      { balance: 2_000_000, excludeFromAvailable: true, subAccounts: [{ balance: 100_000 }] },
    ]);
    expect(result.available).toBe(100_000);
    expect(result.apartado).toBe(2_000_000);
  });

  it("acepta decimales como texto y no rompe con nulos", () => {
    const result = balanceBreakdown([
      { balance: "1000.50" },
      { balance: "abc" as unknown as string },
    ]);
    expect(result.total).toBe(1000.5);
  });

  it("sin cuentas todo es cero", () => {
    const result = balanceBreakdown([]);
    expect(result).toEqual({ total: 0, available: 0, apartado: 0 });
  });
});
