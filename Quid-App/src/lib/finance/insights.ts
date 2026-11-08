/**
 * F-10 · Motor de insights.
 *
 * Convierte el período en frases accionables: qué cambió, cuánto pesa y qué
 * hacer. Reglas puras, sin base de datos ni React, para poder probarlas: aquí
 * un error se ve bonito pero está mal.
 *
 * El motor NO calcula cifras nuevas: recibe el período ya agregado (el mismo
 * que alimenta la pestaña Análisis) y solo decide qué merece contarse.
 */

export type InsightTone = "good" | "warn" | "bad" | "neutral";

export type InsightAction = {
  label: string;
  /** Sub-vista de Finanzas a la que lleva el botón. */
  subview?: "overview" | "analysis" | "budgets" | "transactions" | "recurring" | "accounts";
};

export type Insight = {
  /** Estable y único: sirve para deduplicar entre pantallas y avisos. */
  id: string;
  kind:
    | "saving-rate"
    | "pace"
    | "category-up"
    | "category-down"
    | "budgets"
    | "largest-expense";
  tone: InsightTone;
  title: string;
  body: string;
  /** Cifra grande que resume el hallazgo ("+345 %", "$2,0 M"). */
  metric?: string;
  action?: InsightAction;
  /** Mayor = más arriba. */
  weight: number;
};

export type InsightCategory = { category: string; amount: number };

export type InsightBudget = {
  type: string;
  category: string;
  amount: number;
  spent: number;
};

export type InsightExpense = {
  amount: number;
  category: string | null;
  description?: string | null;
  date: string;
};

export type InsightSnapshot = {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  today: string;
  current: { income: number; expense: number; categories: InsightCategory[] };
  previous: { income: number; expense: number; categories: InsightCategory[] };
  budgets: InsightBudget[];
  largestExpenses: InsightExpense[];
  /** El período anterior tiene datos comparables. */
  hasHistory: boolean;
};

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function money(value: number): string {
  return COP.format(Math.round(value));
}

function percent(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}

/** Un cambio por debajo de esto es ruido, no una noticia. */
const MIN_CATEGORY_DELTA = 20_000;
const MIN_LARGEST_EXPENSE = 50_000;

function categoryMap(categories: InsightCategory[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of categories) {
    const key = entry.category || "Sin categoría";
    map.set(key, (map.get(key) ?? 0) + entry.amount);
  }
  return map;
}

function daysBetweenKeys(fromKey: string, toKey: string): number {
  const toMs = Date.parse(`${toKey}T00:00:00Z`);
  const fromMs = Date.parse(`${fromKey}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** 1 · Tasa de ahorro del período, con el cambio frente al anterior. */
function savingRateInsight(snapshot: InsightSnapshot): Insight | null {
  const { income, expense } = snapshot.current;
  if (income <= 0) return null;

  const rate = ((income - expense) / income) * 100;
  const previousRate =
    snapshot.hasHistory && snapshot.previous.income > 0
      ? ((snapshot.previous.income - snapshot.previous.expense) / snapshot.previous.income) * 100
      : null;

  const delta = previousRate === null ? null : rate - previousRate;
  const tone: InsightTone = rate >= 20 ? "good" : rate >= 0 ? "warn" : "bad";

  const verdict =
    rate >= 20
      ? "Vas bien: guardaste una quinta parte o más de lo que entró"
      : rate >= 0
        ? "Apenas queda algo: el ahorro es menor al 20 %"
        : "Estás gastando más de lo que entra";

  const comparison =
    delta === null
      ? ""
      : ` Comparado con el período anterior, ${delta >= 0 ? "mejoraste" : "bajaste"} ${Math.abs(Math.round(delta))} puntos.`;

  return {
    id: "saving-rate",
    kind: "saving-rate",
    tone,
    weight: 90,
    title: "Tasa de ahorro",
    body: `${verdict}.${comparison}`,
    metric: `${Math.round(rate)} %`,
    action: { label: "Ver análisis", subview: "analysis" },
  };
}

/** 2 · Ritmo de gasto: cómo cerraría el período si sigue así. */
function paceInsight(snapshot: InsightSnapshot): Insight | null {
  const { expense, income } = snapshot.current;
  if (expense <= 0) return null;

  const elapsed = Math.min(
    Math.max(daysBetweenKeys(snapshot.periodStart, snapshot.today) + 1, 1),
    Math.max(daysBetweenKeys(snapshot.periodStart, snapshot.periodEnd) + 1, 1)
  );
  const total = Math.max(daysBetweenKeys(snapshot.periodStart, snapshot.periodEnd) + 1, 1);
  if (elapsed < 3 || elapsed >= total) return null;

  const projected = (expense / elapsed) * total;
  const projectedDelta = income > 0 ? projected - income : null;

  if (projectedDelta !== null && projectedDelta > 0) {
    return {
      id: "pace",
      kind: "pace",
      tone: "warn",
      weight: 85,
      title: "Al ritmo actual, el período cierra en rojo",
      body: `Llevas ${money(expense)} en ${elapsed} de ${total} días. Si sigues así, cerrarías en ${money(projected)}: ${money(projectedDelta)} por encima de lo que entra.`,
      metric: money(projected),
      action: { label: "Ver proyección", subview: "analysis" },
    };
  }

  return {
    id: "pace",
    kind: "pace",
    tone: "good",
    weight: 55,
    title: "Ritmo de gasto bajo control",
    body: `Llevas ${money(expense)} en ${elapsed} de ${total} días; al ritmo actual cerrarías en ${money(projected)}.`,
    metric: money(projected),
    action: { label: "Ver proyección", subview: "analysis" },
  };
}

/** 3 · La categoría que más subió frente al período anterior. */
function categoryUpInsight(snapshot: InsightSnapshot): Insight | null {
  if (!snapshot.hasHistory) return null;

  const current = categoryMap(snapshot.current.categories);
  const previous = categoryMap(snapshot.previous.categories);

  let best: { category: string; delta: number; pct: number } | null = null;
  for (const [category, amount] of current) {
    const before = previous.get(category) ?? 0;
    if (before <= 0) continue;
    const delta = amount - before;
    if (delta < MIN_CATEGORY_DELTA) continue;
    const pct = (delta / before) * 100;
    if (!best || delta > best.delta) best = { category, delta, pct };
  }
  if (!best) return null;

  return {
    id: "category-up",
    kind: "category-up",
    tone: "warn",
    weight: 70,
    title: `Lo que más subió: ${best.category}`,
    body: `Pasó de ${money(previous.get(best.category) ?? 0)} a ${money(current.get(best.category) ?? 0)}: ${money(best.delta)} más que en el período anterior.`,
    metric: percent(best.pct),
    action: { label: "Ver movimientos", subview: "transactions" },
  };
}

/** 4 · La categoría que más bajó (el mérito también se cuenta). */
function categoryDownInsight(snapshot: InsightSnapshot): Insight | null {
  if (!snapshot.hasHistory) return null;

  const current = categoryMap(snapshot.current.categories);
  const previous = categoryMap(snapshot.previous.categories);

  let best: { category: string; delta: number; pct: number } | null = null;
  for (const [category, before] of previous) {
    if (before <= 0) continue;
    const amount = current.get(category) ?? 0;
    const delta = amount - before;
    if (-delta < MIN_CATEGORY_DELTA) continue;
    const pct = (delta / before) * 100;
    if (!best || delta < best.delta) best = { category, delta, pct };
  }
  if (!best) return null;

  return {
    id: "category-down",
    kind: "category-down",
    tone: "good",
    weight: 40,
    title: `Lo que más bajó: ${best.category}`,
    body: `Pasó de ${money(previous.get(best.category) ?? 0)} a ${money(current.get(best.category) ?? 0)}: ${money(-best.delta)} menos que en el período anterior.`,
    metric: percent(best.pct),
    action: { label: "Ver movimientos", subview: "transactions" },
  };
}

/** 5 · Salud de los presupuestos del período. */
function budgetsInsight(snapshot: InsightSnapshot): Insight | null {
  const expenseBudgets = snapshot.budgets.filter((budget) => budget.type !== "income");
  if (expenseBudgets.length === 0) return null;

  const onTrack = expenseBudgets.filter((budget) => budget.spent <= budget.amount).length;
  const over = expenseBudgets.length - onTrack;
  const budgeted = new Set(expenseBudgets.map((budget) => (budget.category || "Sin categoría").toLowerCase()));

  const spentCategories = Array.from(categoryMap(snapshot.current.categories).keys());
  const withoutBudget = spentCategories.filter(
    (category) => !budgeted.has(category.toLowerCase())
  ).length;

  const tone: InsightTone = over === 0 ? "good" : over <= Math.max(1, Math.floor(expenseBudgets.length / 3)) ? "warn" : "bad";

  return {
    id: "budgets",
    kind: "budgets",
    tone,
    weight: 60,
    title: over === 0 ? "Todos los presupuestos van bien" : `${over} presupuesto${over === 1 ? "" : "s"} pasado${over === 1 ? "" : "s"}`,
    body: `${onTrack} de ${expenseBudgets.length} dentro del límite${withoutBudget > 0 ? ` · ${withoutBudget} categoría${withoutBudget === 1 ? "" : "s"} con gasto y sin presupuesto` : ""}.`,
    metric: `${onTrack}/${expenseBudgets.length}`,
    action: { label: "Ver presupuestos", subview: "budgets" },
  };
}

/** 6 · El gasto individual más grande del período. */
function largestExpenseInsight(snapshot: InsightSnapshot): Insight | null {
  const largest = snapshot.largestExpenses
    .filter((expense) => expense.amount >= MIN_LARGEST_EXPENSE)
    .sort((a, b) => b.amount - a.amount)[0];
  if (!largest) return null;

  const label = largest.description?.trim() || largest.category || "Movimiento";
  return {
    id: "largest-expense",
    kind: "largest-expense",
    tone: "neutral",
    weight: 50,
    title: "El gasto más grande",
    body: `${label}${largest.category && largest.description ? ` · ${largest.category}` : ""}, el ${largest.date}.`,
    metric: money(largest.amount),
    action: { label: "Ver movimientos", subview: "transactions" },
  };
}

/**
 * Devuelve los hallazgos ordenados por peso. Nunca repite `kind`: si una regla
 * no aplica (sin historial, sin presupuestos, período recién empezado) se omite.
 */
export function buildInsights(snapshot: InsightSnapshot): Insight[] {
  const candidates = [
    savingRateInsight(snapshot),
    paceInsight(snapshot),
    categoryUpInsight(snapshot),
    budgetsInsight(snapshot),
    largestExpenseInsight(snapshot),
    categoryDownInsight(snapshot),
  ].filter((insight): insight is Insight => insight !== null);

  const seen = new Set<string>();
  return candidates
    .filter((insight) => {
      if (seen.has(insight.kind)) return false;
      seen.add(insight.kind);
      return true;
    })
    .sort((a, b) => b.weight - a.weight);
}
