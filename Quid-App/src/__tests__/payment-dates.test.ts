import { describe, it, expect } from "vitest";
import {
  splitUpcomingPayments,
  daysUntilDate,
  dueLabel,
  PERIOD_LIMITS,
} from "@/lib/finance/payment-dates";

/** Referencia fija: 15 de junio de 2025 a las 18:00 (hora local). */
const REF = new Date(2025, 5, 15, 18, 0, 0);

const pago = (
  id: string,
  daysFromRef: number,
  overrides: Partial<{ status: string; amount: number; type: string }> = {}
) => {
  const d = new Date(REF.getFullYear(), REF.getMonth(), REF.getDate() + daysFromRef);
  const scheduledDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}T05:00:00.000Z`;
  return {
    id,
    status: overrides.status ?? "pending",
    scheduledDate,
    amount: overrides.amount ?? 10000,
    type: overrides.type ?? "expense",
  };
};

describe("daysUntilDate", () => {
  it("cuenta días ignorando la hora", () => {
    expect(daysUntilDate(pago("a", 0).scheduledDate, REF)).toBe(0);
    expect(daysUntilDate(pago("a", 1).scheduledDate, REF)).toBe(1);
    expect(daysUntilDate(pago("a", -3).scheduledDate, REF)).toBe(-3);
  });

  it("no se desfasa por la hora del ISO", () => {
    // 05:00Z del día siguiente seguiría siendo "mañana", no "hoy".
    expect(daysUntilDate("2025-06-16T05:00:00.000Z", REF)).toBe(1);
  });

  it("devuelve NaN con basura", () => {
    expect(Number.isNaN(daysUntilDate("", REF))).toBe(true);
    expect(Number.isNaN(daysUntilDate("no-es-fecha", REF))).toBe(true);
  });
});

describe("dueLabel", () => {
  it("etiqueta vencido, hoy y mañana", () => {
    expect(dueLabel(-2)).toBe("Vencido hace 2d");
    expect(dueLabel(0)).toBe("Hoy");
    expect(dueLabel(1)).toBe("Mañana");
    expect(dueLabel(5)).toBe("En 5d");
  });
});

describe("splitUpcomingPayments", () => {
  const pagos = [
    pago("vencido-5", -5),
    pago("vencido-1", -1, { amount: 20000 }),
    pago("hoy", 0, { amount: 5000 }),
    pago("manana", 1),
    pago("semana", 5),
    pago("mes", 20),
    pago("lejos", 45),
    pago("confirmado", -2, { status: "confirmed" }),
    pago("ingreso-hoy", 0, { type: "income", amount: 300000 }),
  ];

  it("los vencidos están SIEMPRE completos, sin importar el período", () => {
    const r = splitUpcomingPayments(pagos, "today", REF);
    expect(r.overdue.map((p) => p.id)).toEqual(["vencido-5", "vencido-1"]);
  });

  it("ordena los vencidos del más antiguo al más reciente", () => {
    const r = splitUpcomingPayments(pagos, "month", REF);
    expect(r.overdue[0].id).toBe("vencido-5");
    expect(r.overdue[1].id).toBe("vencido-1");
  });

  it("ignora confirmados", () => {
    const r = splitUpcomingPayments(pagos, "month", REF);
    const ids = [...r.overdue, ...r.upcoming].map((p) => p.id);
    expect(ids).not.toContain("confirmado");
  });

  it("'Hoy' trae solo lo de hoy", () => {
    const r = splitUpcomingPayments(pagos, "today", REF);
    expect(r.upcoming.map((p) => p.id)).toEqual(["hoy", "ingreso-hoy"]);
  });

  it("las ventanas son acumulativas", () => {
    expect(splitUpcomingPayments(pagos, "tomorrow", REF).upcoming.map((p) => p.id)).toEqual([
      "hoy",
      "ingreso-hoy",
      "manana",
    ]);
    expect(splitUpcomingPayments(pagos, "week", REF).upcoming.map((p) => p.id)).toEqual([
      "hoy",
      "ingreso-hoy",
      "manana",
      "semana",
    ]);
    expect(splitUpcomingPayments(pagos, "month", REF).upcoming.map((p) => p.id)).toEqual([
      "hoy",
      "ingreso-hoy",
      "manana",
      "semana",
      "mes",
    ]);
  });

  it("excluye lo que queda fuera de la ventana", () => {
    for (const period of Object.keys(PERIOD_LIMITS) as Array<keyof typeof PERIOD_LIMITS>) {
      const r = splitUpcomingPayments(pagos, period, REF);
      expect(r.upcoming.map((p) => p.id)).not.toContain("lejos");
    }
  });

  it("separa totales de lo que sale y lo que entra", () => {
    const r = splitUpcomingPayments(pagos, "month", REF);
    // Vencidos: 10000 + 20000, ambos gasto.
    expect(r.overdueTotals).toEqual({ out: 30000, income: 0, count: 2 });
    // Próximos: gastos 5000+10000+10000+10000, ingreso 300000.
    expect(r.upcomingTotals).toEqual({ out: 35000, income: 300000, count: 5 });
  });

  it("las transferencias cuentan como dinero que sale", () => {
    const r = splitUpcomingPayments(
      [pago("tr", 0, { type: "transfer", amount: 7000 })],
      "today",
      REF
    );
    expect(r.upcomingTotals).toEqual({ out: 7000, income: 0, count: 1 });
  });

  it("lista vacía no rompe", () => {
    const r = splitUpcomingPayments([], "month", REF);
    expect(r.overdue).toEqual([]);
    expect(r.upcoming).toEqual([]);
    expect(r.overdueTotals).toEqual({ out: 0, income: 0, count: 0 });
    expect(r.upcomingTotals).toEqual({ out: 0, income: 0, count: 0 });
  });

  it("el día de corte del período es inclusivo", () => {
    // día 7 con ventana de 7 debe entrar; día 8 no.
    const r7 = splitUpcomingPayments([pago("borde", 7)], "week", REF);
    expect(r7.upcoming.map((p) => p.id)).toEqual(["borde"]);
    const r8 = splitUpcomingPayments([pago("borde", 8)], "week", REF);
    expect(r8.upcoming).toEqual([]);
  });
});
