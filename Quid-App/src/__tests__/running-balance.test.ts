import { describe, it, expect } from "vitest";
import { computeRunningBalances, transactionDelta } from "@/lib/finance/running-balance";

describe("transactionDelta", () => {
  it("aplica la convención de signos de Quid", () => {
    expect(transactionDelta("income", 200)).toBe(200);
    expect(transactionDelta("expense", 200)).toBe(-200);
    expect(transactionDelta("transfer", 200)).toBe(-200);
    expect(transactionDelta("otro", 200)).toBe(0);
  });
});

describe("computeRunningBalances", () => {
  it("reconstruye el saldo hacia atrás desde el saldo actual", () => {
    // Secuencia real: 900 → (gasto 100) → 800 → (ingreso 200) → 1000
    const txs = [
      { id: "t2", type: "income", amount: 200, accountId: "a1" }, // más nuevo
      { id: "t1", type: "expense", amount: 100, accountId: "a1" },
    ];
    const accounts = [{ id: "a1", balance: 1000 }];

    const map = computeRunningBalances(txs, accounts);

    expect(map.get("t2")).toBe(1000); // después del ingreso
    expect(map.get("t1")).toBe(800); // después del gasto
  });

  it("maneja bolsillos (sub-cuentas) por separado de la cuenta", () => {
    const txs = [
      { id: "t2", type: "income", amount: 50, subAccountId: "s1", accountId: "a1" },
      { id: "t1", type: "expense", amount: 30, accountId: "a1" },
    ];
    const accounts = [
      { id: "a1", balance: 500, subAccounts: [{ id: "s1", balance: 150 }] },
    ];

    const map = computeRunningBalances(txs, accounts);

    expect(map.get("t2")).toBe(150); // bolsillo
    expect(map.get("t1")).toBe(500); // cuenta
  });

  it("trata la transferencia saliente como resta", () => {
    // La cuenta de origen tenía 1300 y envió 300 → queda en 1000.
    const txs = [{ id: "tr", type: "transfer", amount: 300, accountId: "a1" }];
    const accounts = [{ id: "a1", balance: 1000 }];

    const map = computeRunningBalances(txs, accounts);
    expect(map.get("tr")).toBe(1000);
  });

  it("respeta cuentas distintas en la misma lista", () => {
    const txs = [
      { id: "x", type: "expense", amount: 10, accountId: "a1" },
      { id: "y", type: "expense", amount: 20, accountId: "a2" },
    ];
    const accounts = [
      { id: "a1", balance: 100 },
      { id: "a2", balance: 200 },
    ];

    const map = computeRunningBalances(txs, accounts);
    expect(map.get("x")).toBe(100);
    expect(map.get("y")).toBe(200);
  });

  it("omite movimientos de cuentas desconocidas en vez de inventar saldos", () => {
    const txs = [{ id: "z", type: "expense", amount: 10, accountId: "desconocida" }];
    const map = computeRunningBalances(txs, [{ id: "a1", balance: 100 }]);
    expect(map.has("z")).toBe(false);
  });

  it("acepta montos serializados como string (Decimal de Prisma)", () => {
    const txs = [{ id: "t", type: "expense", amount: "250.50", accountId: "a1" }];
    const map = computeRunningBalances(txs, [{ id: "a1", balance: "1000" }]);
    expect(map.get("t")).toBe(1000);
  });
});
