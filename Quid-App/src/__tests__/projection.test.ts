import { describe, it, expect } from "vitest";
import { buildProjection, toDateKey, fromDateKey } from "@/lib/finance/projection";

describe("fechas sin corrimiento", () => {
  it("toDateKey no corre el día por zona horaria", () => {
    expect(toDateKey(new Date(2026, 10, 15))).toBe("2026-11-15");
  });

  it("fromDateKey devuelve el mismo día", () => {
    expect(toDateKey(fromDateKey("2026-11-15"))).toBe("2026-11-15");
  });
});

describe("buildProjection", () => {
  const today = new Date(2026, 10, 10); // 10 nov 2026

  it("sin movimientos el saldo no cambia", () => {
    const r = buildProjection(1000000, [], today, 5);
    expect(r.days).toHaveLength(5);
    expect(r.days.every((d) => d.balance === 1000000)).toBe(true);
    expect(r.daysInRed).toBe(0);
  });

  it("resta los gastos programados en su día", () => {
    const r = buildProjection(
      1000000,
      [{ date: "2026-11-12", amount: 300000, type: "expense", description: "Arriendo" }],
      today,
      5
    );
    expect(r.days[1].balance).toBe(1000000); // 11 nov
    expect(r.days[2].balance).toBe(700000);  // 12 nov
    expect(r.days[4].balance).toBe(700000);  // 14 nov
    expect(r.totalOut).toBe(300000);
  });

  it("suma los ingresos", () => {
    const r = buildProjection(
      100000,
      [{ date: "2026-11-11", amount: 900000, type: "income", description: "Sueldo" }],
      today,
      3
    );
    expect(r.days[1].balance).toBe(1000000);
    expect(r.totalIn).toBe(900000);
  });

  it("encuentra el punto más bajo, que no es el del final", () => {
    const r = buildProjection(
      500000,
      [
        { date: "2026-11-12", amount: 600000, type: "expense", description: "Tarjeta" },
        { date: "2026-11-20", amount: 900000, type: "income", description: "Sueldo" },
      ],
      today,
      15
    );
    expect(r.lowest?.date).toBe("2026-11-12");
    expect(r.lowest?.balance).toBe(-100000);
    expect(r.endBalance).toBe(800000);
    expect(r.daysInRed).toBe(8); // del 12 al 19
  });

  it("las transferencias restan como un gasto", () => {
    const r = buildProjection(
      100000,
      [{ date: "2026-11-10", amount: 40000, type: "transfer", description: "Retiro" }],
      today,
      2
    );
    expect(r.days[0].balance).toBe(60000);
  });

  it("ignora movimientos anteriores a hoy", () => {
    const r = buildProjection(
      100000,
      [{ date: "2026-11-01", amount: 50000, type: "expense", description: "Viejo" }],
      today,
      2
    );
    expect(r.days[0].balance).toBe(100000);
  });

  it("agrupa varios movimientos del mismo día", () => {
    const r = buildProjection(
      1000000,
      [
        { date: "2026-11-11", amount: 200000, type: "expense", description: "A" },
        { date: "2026-11-11", amount: 300000, type: "expense", description: "B" },
      ],
      today,
      3
    );
    expect(r.days[1].balance).toBe(500000);
    expect(r.days[1].events).toHaveLength(2);
  });

  it("redondea a centavos", () => {
    const r = buildProjection(0.1, [{ date: "2026-11-10", amount: 0.2, type: "income", description: "x" }], today, 1);
    expect(r.days[0].balance).toBe(0.3);
  });

  it("no lanza con cero días ni cifras raras", () => {
    expect(() => buildProjection(0, [], today, 0)).not.toThrow();
    expect(buildProjection(0, [], today, 0).days.length).toBe(1);
  });
});
