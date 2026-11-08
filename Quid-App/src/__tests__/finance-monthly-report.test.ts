import { describe, it, expect } from "vitest";
import {
  buildMonthlyReport,
  buildNarrative,
  kpiChangeLabel,
  monthLabel,
  monthShort,
  type MonthlyReportInput,
} from "@/lib/finance/monthly-report";

function input(overrides: Partial<MonthlyReportInput> = {}): MonthlyReportInput {
  return {
    month: "2026-11",
    previousMonth: "2026-10",
    current: { income: 3_000_000, expense: 1_500_000 },
    previous: { income: 2_500_000, expense: 1_800_000 },
    expenseCategories: [
      { category: "Vivienda", amount: 900_000, previous: 900_000 },
      { category: "Comida", amount: 600_000, previous: 300_000 },
    ],
    incomeCategories: [{ category: "Nómina", amount: 3_000_000, previous: 2_500_000 }],
    budgets: [
      { type: "expense", category: "Vivienda", amount: 1_000_000 },
      { type: "expense", category: "Comida", amount: 500_000 },
      { type: "income", category: "Nómina", amount: 3_200_000 },
    ],
    evolution: [
      { month: "2026-06", income: 2_000_000, expense: 1_600_000 },
      { month: "2026-07", income: 2_200_000, expense: 1_700_000 },
      { month: "2026-08", income: 2_400_000, expense: 1_800_000 },
      { month: "2026-09", income: 2_300_000, expense: 1_900_000 },
      { month: "2026-10", income: 2_500_000, expense: 1_800_000 },
      { month: "2026-11", income: 3_000_000, expense: 1_500_000 },
    ],
    insights: [],
    ...overrides,
  };
}

describe("F-09 · reporte mensual", () => {
  it("nombra el mes en español", () => {
    expect(monthLabel("2026-11")).toBe("noviembre de 2026");
    expect(monthShort("2026-01")).toBe("ene");
  });

  it("calcula KPIs con su cambio frente al mes anterior", () => {
    const report = buildMonthlyReport(input());

    expect(report.kpis.income.value).toBe(3_000_000);
    expect(report.kpis.income.delta).toBe(500_000);
    expect(Math.round(report.kpis.income.deltaPercent!)).toBe(20);

    expect(report.kpis.expense.value).toBe(1_500_000);
    expect(report.kpis.expense.delta).toBe(-300_000);

    expect(report.kpis.balance.value).toBe(1_500_000);
    expect(report.kpis.balance.delta).toBe(800_000);

    // (3.0-1.5)/3.0 = 50 %; el anterior fue (2.5-1.8)/2.5 = 28 % → +22 puntos.
    expect(Math.round(report.kpis.savingRate.value)).toBe(50);
    expect(Math.round(report.kpis.savingRate.delta!)).toBe(22);
  });

  it("sin mes anterior no inventa variaciones", () => {
    const report = buildMonthlyReport(
      input({
        previous: { income: 0, expense: 0 },
        expenseCategories: [{ category: "Comida", amount: 600_000, previous: 0 }],
        incomeCategories: [{ category: "Nómina", amount: 3_000_000, previous: 0 }],
      })
    );

    expect(report.kpis.income.delta).toBeNull();
    expect(report.kpis.expense.deltaPercent).toBeNull();
    expect(report.kpis.savingRate.delta).toBeNull();
  });

  it("reparte la distribución y la ordena de mayor a menor", () => {
    const report = buildMonthlyReport(input());
    expect(report.distribution[0].category).toBe("Vivienda");
    expect(Math.round(report.distribution[0].share)).toBe(60);
    expect(Math.round(report.distribution[1].share)).toBe(40);
  });

  it("marca en rojo el presupuesto pasado y deja sin % lo que no tiene meta", () => {
    const report = buildMonthlyReport(
      input({
        expenseCategories: [
          { category: "Comida", amount: 600_000, previous: 300_000 },
          { category: "Mascotas", amount: 120_000, previous: 0 },
        ],
      })
    );

    const comida = report.expenses.find((row) => row.category === "Comida")!;
    expect(Math.round(comida.progress!)).toBe(120);
    expect(comida.target).toBe(500_000);

    const mascotas = report.expenses.find((row) => row.category === "Mascotas")!;
    expect(mascotas.target).toBe(0);
    expect(mascotas.progress).toBeNull();
  });

  it("incluye metas de ingreso aunque todavía no hayan entrado", () => {
    const report = buildMonthlyReport(
      input({
        incomeCategories: [],
        budgets: [{ type: "income", category: "Arriendo", amount: 800_000 }],
      })
    );
    const row = report.incomes.find((entry) => entry.category === "Arriendo")!;
    expect(row.target).toBe(800_000);
    expect(row.actual).toBe(0);
    expect(row.progress).toBe(0);
  });

  it("narra balance, categoría principal y cambio de gasto", () => {
    const text = buildNarrative(input());
    expect(text).toContain("balance a favor");
    expect(text).toContain("Vivienda");
    expect(text).toContain("60 %");
    // Los gastos bajaron de 1.8M a 1.5M = -16,7 %.
    expect(text).toContain("redujiste tus gastos");
  });

  it("dice claramente cuando el mes no tuvo movimientos", () => {
    const text = buildNarrative(
      input({
        current: { income: 0, expense: 0 },
        previous: { income: 0, expense: 0 },
        expenseCategories: [],
        incomeCategories: [],
      })
    );
    expect(text).toBe("En noviembre de 2026 no se registraron movimientos.");
  });

  it("etiqueta el cambio de un KPI sin romper con el mes anterior en cero", () => {
    expect(kpiChangeLabel({ value: 0, delta: 100, deltaPercent: null }, "oct")).toContain("vs. oct");
    expect(kpiChangeLabel({ value: 0, delta: null, deltaPercent: null }, "oct")).toBe("sin mes anterior");
  });
});
