import { describe, expect, it } from "vitest";
import { computeNetWorth } from "@/lib/finance/net-worth";

describe("patrimonio neto", () => {
  it("resta deudas de cuentas, ahorros y CDT", () => {
    const result = computeNetWorth({
      accounts: [{ name: "Cuenta", balance: 1_000_000 }],
      savings: [{ name: "Viaje", amount: 500_000 }],
      cdts: [{ name: "CDT Banco", amount: 2_000_000 }],
      debts: [{ name: "Tarjeta", balance: 800_000 }],
    });

    expect(result.assets).toBe(3_500_000);
    expect(result.liabilities).toBe(800_000);
    expect(result.net).toBe(2_700_000);
  });

  it("ignora saldos negativos o inválidos como activos", () => {
    const result = computeNetWorth({
      accounts: [{ name: "Sobregiro", balance: -200_000 }],
      savings: [],
      cdts: [],
      debts: [],
    });

    expect(result.assets).toBe(0);
    expect(result.net).toBe(0);
  });

  it("cuenta una deuda mayor que los activos como patrimonio negativo", () => {
    const result = computeNetWorth({
      accounts: [{ name: "Cuenta", balance: 100_000 }],
      savings: [],
      cdts: [],
      debts: [{ name: "Préstamo", balance: 400_000 }],
    });

    expect(result.net).toBe(-300_000);
  });

  it("ordena los rubros de mayor a menor", () => {
    const result = computeNetWorth({
      accounts: [
        { name: "A", balance: 10 },
        { name: "B", balance: 90 },
      ],
      savings: [],
      cdts: [],
      debts: [],
    });

    expect(result.entries[0].label).toBe("B");
    expect(result.entries[0].kind).toBe("asset");
  });

  it("sin datos el patrimonio es cero, no NaN", () => {
    const result = computeNetWorth({ accounts: [], savings: [], cdts: [], debts: [] });
    expect(result.assets).toBe(0);
    expect(result.liabilities).toBe(0);
    expect(result.net).toBe(0);
    expect(result.entries).toHaveLength(0);
  });
});
