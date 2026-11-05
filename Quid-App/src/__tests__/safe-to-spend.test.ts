import { describe, it, expect } from "vitest";
import { computeSafeToSpend, daysBetweenInclusive } from "@/lib/finance/safe-to-spend";

const TODAY = new Date(2025, 5, 1); // 1 de junio
const PERIOD_START = new Date(2025, 5, 1);
const PERIOD_END = new Date(2025, 5, 30); // 30 de junio

const pago = (
  daysFromToday: number,
  overrides: Partial<{ amount: number; type: string; status: string }> = {}
) => {
  const d = new Date(2025, 5, 1 + daysFromToday);
  return {
    amount: overrides.amount ?? 10000,
    type: overrides.type ?? "expense",
    status: overrides.status ?? "pending",
    scheduledDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}T05:00:00.000Z`,
  };
};

const base = {
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  today: TODAY,
};

describe("daysBetweenInclusive", () => {
  it("cuenta ambos extremos", () => {
    expect(daysBetweenInclusive(new Date(2025, 5, 1), new Date(2025, 5, 30))).toBe(30);
    expect(daysBetweenInclusive(new Date(2025, 5, 30), new Date(2025, 5, 30))).toBe(1);
  });

  it("nunca devuelve menos de 1", () => {
    expect(daysBetweenInclusive(new Date(2025, 5, 30), new Date(2025, 5, 1))).toBe(1);
  });

  it("atraviesa cambios de mes y año", () => {
    expect(daysBetweenInclusive(new Date(2025, 11, 31), new Date(2026, 0, 1))).toBe(2);
  });
});

describe("computeSafeToSpend", () => {
  it("calcula el disponible por día", () => {
    // Presupuesto 300.000, gastado 100.000 → quedan 200.000
    // Comprometido 50.000 → disponible 150.000 en 30 días → 5.000/día
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 300000, spent: 100000 }],
      pendingPayments: [pago(10, { amount: 50000 })],
    });

    expect(r.hasBudget).toBe(true);
    expect(r.remaining).toBe(200000);
    expect(r.committed).toBe(50000);
    expect(r.available).toBe(150000);
    expect(r.daysLeft).toBe(30);
    expect(r.safePerDay).toBe(5000);
    expect(r.overBudget).toBe(false);
  });

  it("sin presupuesto no inventa un número", () => {
    const r = computeSafeToSpend({ ...base, budgets: [], pendingPayments: [] });
    expect(r.hasBudget).toBe(false);
    expect(r.safePerDay).toBeNull();
    expect(r.periodBudget).toBe(0);
  });

  it("ignora presupuestos en cero", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 0, spent: 5000 }],
      pendingPayments: [],
    });
    expect(r.hasBudget).toBe(false);
    expect(r.safePerDay).toBeNull();
  });

  it("devuelve negativo cuando ya está excedido, sin ocultarlo en 0", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 100000, spent: 90000 }],
      pendingPayments: [pago(2, { amount: 50000 })],
    });
    expect(r.available).toBe(-40000);
    expect(r.safePerDay).toBeLessThan(0);
    expect(r.overBudget).toBe(true);
  });

  it("cuenta los vencidos como comprometidos", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 300000, spent: 0 }],
      pendingPayments: [pago(-5, { amount: 30000 })],
    });
    expect(r.committed).toBe(30000);
  });

  it("NO suma ingresos pendientes", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 100000, spent: 0 }],
      pendingPayments: [pago(5, { amount: 900000, type: "income" })],
    });
    expect(r.committed).toBe(0);
    expect(r.available).toBe(100000);
  });

  it("las transferencias sí comprometen", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 100000, spent: 0 }],
      pendingPayments: [pago(3, { amount: 25000, type: "transfer" })],
    });
    expect(r.committed).toBe(25000);
  });

  it("ignora pagos fuera del período", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 100000, spent: 0 }],
      pendingPayments: [pago(45, { amount: 99999 })],
    });
    expect(r.committed).toBe(0);
  });

  it("ignora pagos ya confirmados o cancelados", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 100000, spent: 0 }],
      pendingPayments: [
        pago(2, { amount: 10000, status: "confirmed" }),
        pago(2, { amount: 20000, status: "cancelled" }),
      ],
    });
    expect(r.committed).toBe(0);
  });

  it("el último día del período reparte todo el disponible en ese día", () => {
    const r = computeSafeToSpend({
      ...base,
      today: new Date(2025, 5, 30),
      budgets: [{ amount: 60000, spent: 10000 }],
      pendingPayments: [],
    });
    expect(r.daysLeft).toBe(1);
    expect(r.safePerDay).toBe(50000);
  });

  it("suma varios presupuestos y sus gastos", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [
        { amount: 100000, spent: 20000 },
        { amount: 50000, spent: 5000 },
      ],
      pendingPayments: [],
    });
    expect(r.periodBudget).toBe(150000);
    expect(r.spent).toBe(25000);
    expect(r.remaining).toBe(125000);
    expect(r.safePerDay).toBeCloseTo(125000 / 30, 2);
  });

  it("acepta montos como string (Decimal serializado)", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: "300000", spent: "100000" }],
      pendingPayments: [{ amount: "50000", type: "expense", status: "pending", scheduledDate: "2025-06-10T05:00:00.000Z" }],
    });
    expect(r.remaining).toBe(200000);
    expect(r.committed).toBe(50000);
  });

  it("redondea a 2 decimales", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 100000, spent: 0 }],
      pendingPayments: [],
    });
    // 100000 / 30 = 3333.333...
    expect(r.safePerDay).toBe(3333.33);
  });

  it("un presupuesto sin gasto usa el total", () => {
    const r = computeSafeToSpend({
      ...base,
      budgets: [{ amount: 90000, spent: 0 }],
      pendingPayments: [],
    });
    expect(r.remaining).toBe(90000);
    expect(r.safePerDay).toBe(3000);
  });
});
