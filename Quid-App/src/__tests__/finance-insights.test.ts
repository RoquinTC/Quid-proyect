import { describe, it, expect } from "vitest";
import { buildInsights, type InsightSnapshot } from "@/lib/finance/insights";

function snapshot(overrides: Partial<InsightSnapshot> = {}): InsightSnapshot {
  return {
    periodLabel: "1 nov – 30 nov",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    today: "2026-11-15",
    current: { income: 3_000_000, expense: 1_500_000, categories: [] },
    previous: { income: 2_800_000, expense: 2_100_000, categories: [] },
    budgets: [],
    largestExpenses: [],
    hasHistory: true,
    ...overrides,
  };
}

describe("F-10 · motor de insights", () => {
  it("calcula la tasa de ahorro y la compara con el período anterior", () => {
    const insights = buildInsights(snapshot());
    const saving = insights.find((i) => i.kind === "saving-rate")!;
    // (3.0M - 1.5M) / 3.0M = 50 %
    expect(saving.metric).toBe("50 %");
    expect(saving.tone).toBe("good");
    // El anterior ahorró (2.8-2.1)/2.8 = 25 % → mejoró 25 puntos.
    expect(saving.body).toContain("mejoraste");
  });

  it("marca la tasa negativa como gastar más de lo que entra", () => {
    const insights = buildInsights(
      snapshot({ current: { income: 1_000_000, expense: 1_400_000, categories: [] } })
    );
    const saving = insights.find((i) => i.kind === "saving-rate")!;
    expect(saving.tone).toBe("bad");
    expect(saving.metric).toBe("-40 %");
    expect(saving.body).toContain("más de lo que entra");
  });

  it("avisa cuando al ritmo actual el período cierra en rojo", () => {
    const insights = buildInsights(
      snapshot({
        current: { income: 2_000_000, expense: 1_500_000, categories: [] },
        previous: { income: 0, expense: 0, categories: [] },
        hasHistory: false,
      })
    );
    const pace = insights.find((i) => i.kind === "pace")!;
    expect(pace.tone).toBe("warn");
    // 1.5M en 15 de 30 días → 3.0M proyectados, 1.0M por encima del ingreso.
    expect(pace.body).toContain("3.000.000");
  });

  it("no opina del ritmo en los primeros días del período", () => {
    const insights = buildInsights(
      snapshot({ today: "2026-11-02", current: { income: 1_000_000, expense: 400_000, categories: [] } })
    );
    expect(insights.some((i) => i.kind === "pace")).toBe(false);
  });

  it("señala la categoría que más subió y la que más bajó", () => {
    const insights = buildInsights(
      snapshot({
        current: {
          income: 3_000_000,
          expense: 1_500_000,
          categories: [
            { category: "Vestuario", amount: 445_000 },
            { category: "Regalos", amount: 40_000 },
          ],
        },
        previous: {
          income: 2_800_000,
          expense: 2_100_000,
          categories: [
            { category: "Vestuario", amount: 100_000 },
            { category: "Regalos", amount: 500_000 },
          ],
        },
      })
    );
    const up = insights.find((i) => i.kind === "category-up")!;
    const down = insights.find((i) => i.kind === "category-down")!;

    expect(up.title).toContain("Vestuario");
    expect(up.metric).toBe("+345 %");
    expect(down.title).toContain("Regalos");
    expect(down.metric).toBe("-92 %");
    expect(down.tone).toBe("good");
  });

  it("ignora subidas por debajo del ruido o sin período anterior", () => {
    const small = buildInsights(
      snapshot({
        current: { income: 3_000_000, expense: 1_500_000, categories: [{ category: "Café", amount: 20_000 }] },
        previous: { income: 2_800_000, expense: 2_100_000, categories: [{ category: "Café", amount: 18_000 }] },
      })
    );
    expect(small.some((i) => i.kind === "category-up")).toBe(false);

    const firstPeriod = buildInsights(snapshot({ hasHistory: false }));
    expect(firstPeriod.some((i) => i.kind === "category-up")).toBe(false);
    expect(firstPeriod.some((i) => i.kind === "category-down")).toBe(false);
  });

  it("resume la salud de los presupuestos y las categorías sin presupuesto", () => {
    const insights = buildInsights(
      snapshot({
        budgets: [
          { type: "expense", category: "Comida", amount: 500_000, spent: 400_000 },
          { type: "expense", category: "Transporte", amount: 300_000, spent: 350_000 },
        ],
        current: {
          income: 3_000_000,
          expense: 1_500_000,
          categories: [
            { category: "Comida", amount: 400_000 },
            { category: "Transporte", amount: 350_000 },
            { category: "Mascotas", amount: 120_000 },
          ],
        },
      })
    );
    const budgets = insights.find((i) => i.kind === "budgets")!;
    expect(budgets.title).toContain("1 presupuesto");
    expect(budgets.metric).toBe("1/2");
    expect(budgets.body).toContain("sin presupuesto");
  });

  it("destaca el gasto individual más grande", () => {
    const insights = buildInsights(
      snapshot({
        largestExpenses: [
          { amount: 2_000_000, category: "Vivienda", description: "Arrendador", date: "2026-11-05" },
          { amount: 90_000, category: "Comida", description: "Mercado", date: "2026-11-06" },
        ],
      })
    );
    const largest = insights.find((i) => i.kind === "largest-expense")!;
    // Intl usa espacio duro entre símbolo y cifra; se compara el número.
    expect(largest.metric).toContain("$");
    expect(largest.metric).toContain("2.000.000");
    expect(largest.body).toContain("Arrendador");
  });

  it("ordena por peso y no repite tipos", () => {
    const insights = buildInsights(snapshot());
    const kinds = insights.map((i) => i.kind);
    expect(new Set(kinds).size).toBe(kinds.length);

    const weights = insights.map((i) => i.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });
});
