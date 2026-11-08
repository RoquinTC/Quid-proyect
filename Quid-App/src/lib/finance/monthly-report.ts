/**
 * F-09 · Reporte mensual compartible.
 *
 * Arma el contenido del reporte a partir de cifras ya agregadas: KPIs con su
 * cambio frente al mes anterior, evolución de 6 meses, distribución por
 * categoría, tablas de gasto (con presupuesto) e ingreso (con meta), y la
 * narrativa en lenguaje natural.
 *
 * Reglas puras: la base de datos y los gráficos viven fuera. Aquí solo se
 * decide qué dice el reporte y con qué números.
 */

import type { Insight } from "@/lib/finance/insights";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function money(value: number): string {
  return COP.format(Math.round(value));
}

/** "noviembre de 2026" */
export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return monthKey;
  return `${MONTHS_ES[month - 1]} de ${year}`;
}

/** "nov" para ejes y tablas. */
export function monthShort(monthKey: string): string {
  const [, month] = monthKey.split("-").map(Number);
  if (!month || month < 1 || month > 12) return monthKey;
  return MONTHS_ES[month - 1].slice(0, 3);
}

export type KpiValue = {
  value: number;
  /** Variación absoluta contra el mes anterior (null si no hay base). */
  delta: number | null;
  /** Variación porcentual (null si el mes anterior era 0 o no hay base). */
  deltaPercent: number | null;
};

export type ReportRow = {
  category: string;
  /** Presupuesto o meta; 0 significa "sin presupuesto". */
  target: number;
  /** Ejecutado o recibido. */
  actual: number;
  /** 0–100+; null cuando no hay meta contra la cual medir. */
  progress: number | null;
  /** Mismo concepto en el mes anterior, para comparar. */
  previous: number;
};

export type ReportCategoryShare = {
  category: string;
  amount: number;
  /** 0–100 */
  share: number;
};

export type ReportEvolutionPoint = {
  month: string;
  label: string;
  income: number;
  expense: number;
};

export type MonthlyReport = {
  month: string;
  label: string;
  /** Ingresos, gastos, balance y tasa de ahorro del mes. */
  kpis: {
    income: KpiValue;
    expense: KpiValue;
    balance: KpiValue;
    savingRate: KpiValue;
  };
  evolution: ReportEvolutionPoint[];
  distribution: ReportCategoryShare[];
  expenses: ReportRow[];
  incomes: ReportRow[];
  insights: Insight[];
  /** Párrafo que acompaña al reporte. */
  narrative: string;
  /** Frase corta para el pie ("sin datos" cuando no hubo movimientos). */
  footnote: string;
};

export type MonthlyReportInput = {
  month: string;
  previousMonth: string;
  current: { income: number; expense: number };
  previous: { income: number; expense: number };
  /** Categorías de gasto del mes con su monto y su equivalente anterior. */
  expenseCategories: Array<{ category: string; amount: number; previous: number }>;
  /** Categorías de ingreso del mes. */
  incomeCategories: Array<{ category: string; amount: number; previous: number }>;
  budgets: Array<{ type: string; category: string; amount: number }>;
  evolution: Array<{ month: string; income: number; expense: number }>;
  insights: Insight[];
};

function kpi(value: number, previous: number | null): KpiValue {
  if (previous === null) return { value, delta: null, deltaPercent: null };
  const delta = value - previous;
  return {
    value,
    delta,
    deltaPercent: previous === 0 ? null : (delta / Math.abs(previous)) * 100,
  };
}

function savingRate(income: number, expense: number): number {
  if (income <= 0) return 0;
  return ((income - expense) / income) * 100;
}

function signedPercent(value: number): string {
  const rounded = Math.abs(value) < 0.5 ? 0 : Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

/**
 * Narrativa: tres frases que resumen el mes sin adjetivos de marketing.
 * Si no hubo ingresos ni gastos, lo dice en una sola.
 */
export function buildNarrative(input: MonthlyReportInput): string {
  const { current, previous, expenseCategories } = input;
  const balance = current.income - current.expense;

  if (current.income === 0 && current.expense === 0) {
    return `En ${monthLabel(input.month)} no se registraron movimientos.`;
  }

  const parts: string[] = [];

  if (balance > 0) {
    parts.push(`Cerraste ${monthLabel(input.month)} con un balance a favor de ${money(balance)}.`);
  } else if (balance < 0) {
    parts.push(`Cerraste ${monthLabel(input.month)} con un balance en contra de ${money(Math.abs(balance))}.`);
  } else {
    parts.push(`Cerraste ${monthLabel(input.month)} sin diferencia entre lo que entró y lo que salió.`);
  }

  const top = [...expenseCategories].sort((a, b) => b.amount - a.amount)[0];
  if (top && current.expense > 0) {
    const share = Math.round((top.amount / current.expense) * 100);
    parts.push(`Tu principal categoría de gasto fue ${top.category} (${share} %).`);
  }

  if (previous.expense > 0) {
    const change = ((current.expense - previous.expense) / previous.expense) * 100;
    if (Math.abs(change) < 0.5) {
      parts.push("Gastaste prácticamente lo mismo que el mes anterior.");
    } else if (change < 0) {
      parts.push(`Comparado con ${monthLabel(input.previousMonth)}, redujiste tus gastos en ${Math.abs(change).toFixed(1)} %.`);
    } else {
      parts.push(`Comparado con ${monthLabel(input.previousMonth)}, aumentaste tus gastos en ${change.toFixed(1)} %.`);
    }
  }

  if (previous.income > 0) {
    const change = ((current.income - previous.income) / previous.income) * 100;
    if (Math.abs(change) >= 5) {
      parts.push(
        change > 0
          ? `Tus ingresos subieron ${Math.abs(Math.round(change))} %.`
          : `Tus ingresos bajaron ${Math.abs(Math.round(change))} %.`
      );
    }
  }

  return parts.join(" ");
}

export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const { current, previous } = input;

  const hasPrevious = previous.income !== 0 || previous.expense !== 0;
  const balance = current.income - current.expense;
  const previousBalance = previous.income - previous.expense;

  const expenseTotal = input.expenseCategories.reduce((sum, entry) => sum + entry.amount, 0);

  const distribution: ReportCategoryShare[] = [...input.expenseCategories]
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((entry) => ({
      category: entry.category,
      amount: entry.amount,
      share: expenseTotal > 0 ? (entry.amount / expenseTotal) * 100 : 0,
    }));

  const budgetFor = (type: string, category: string) =>
    input.budgets.find(
      (budget) => budget.type === type && budget.category.toLowerCase() === category.toLowerCase()
    )?.amount ?? 0;

  const expenses: ReportRow[] = input.expenseCategories
    .map((entry) => {
      const target = budgetFor("expense", entry.category);
      return {
        category: entry.category,
        target,
        actual: entry.amount,
        progress: target > 0 ? (entry.amount / target) * 100 : null,
        previous: entry.previous,
      };
    })
    .sort((a, b) => b.actual - a.actual);

  // Ingresos: la meta sale del presupuesto de ingreso; lo recibido, de las
  // transacciones (el campo `spent` del presupuesto puede quedar desfasado).
  const incomeCategories = new Map(input.incomeCategories.map((entry) => [entry.category, entry]));
  for (const budget of input.budgets) {
    if (budget.type !== "income") continue;
    if (!incomeCategories.has(budget.category)) {
      incomeCategories.set(budget.category, { category: budget.category, amount: 0, previous: 0 });
    }
  }

  const incomes: ReportRow[] = Array.from(incomeCategories.values())
    .map((entry) => {
      const target = budgetFor("income", entry.category);
      return {
        category: entry.category,
        target,
        actual: entry.amount,
        progress: target > 0 ? (entry.amount / target) * 100 : null,
        previous: entry.previous,
      };
    })
    .sort((a, b) => b.actual - a.actual);

  const currentRate = savingRate(current.income, current.expense);
  const previousRate = hasPrevious ? savingRate(previous.income, previous.expense) : null;

  const footnote =
    current.income === 0 && current.expense === 0
      ? "Sin movimientos registrados en el mes."
      : `Ingresos ${money(current.income)} · Gastos ${money(current.expense)} · Balance ${money(balance)}`;

  return {
    month: input.month,
    label: monthLabel(input.month),
    kpis: {
      income: kpi(current.income, hasPrevious ? previous.income : null),
      expense: kpi(current.expense, hasPrevious ? previous.expense : null),
      balance: kpi(balance, hasPrevious ? previousBalance : null),
      savingRate: {
        value: currentRate,
        delta: previousRate === null ? null : currentRate - previousRate,
        deltaPercent: null,
      },
    },
    evolution: input.evolution.map((point) => ({
      ...point,
      label: monthShort(point.month),
    })),
    distribution,
    expenses,
    incomes,
    insights: input.insights,
    narrative: buildNarrative(input),
    footnote,
  };
}

/** Frase corta del cambio de un KPI ("+12 % vs. octubre"). */
export function kpiChangeLabel(value: KpiValue, previousLabel: string): string {
  if (value.delta === null) return "sin mes anterior";
  if (value.deltaPercent === null) {
    return value.delta === 0 ? `igual que ${previousLabel}` : `${money(Math.abs(value.delta))} vs. ${previousLabel}`;
  }
  return `${signedPercent(value.deltaPercent)} % vs. ${previousLabel}`;
}
