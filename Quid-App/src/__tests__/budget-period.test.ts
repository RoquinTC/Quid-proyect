import { describe, it, expect } from "vitest";
import {
  getBudgetPeriod,
  getPeriodStartsForMonth,
  getCurrentBudgetPeriod,
  clampDayToMonth,
  parseBudgetCycleMode,
} from "@/lib/holidays";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const monthly = (day: number, respectHolidays = false) => ({
  budgetCycleMode: "monthly",
  budgetCutoffDay: day,
  respectHolidays,
});

const semimonthly = (d1: number, d2: number, respectHolidays = false) => ({
  budgetCycleMode: "semimonthly",
  budgetCutoffDay: d1,
  budgetCutoffDay2: d2,
  respectHolidays,
});

describe("parseBudgetCycleMode", () => {
  it("normaliza valores desconocidos a monthly", () => {
    expect(parseBudgetCycleMode("semimonthly")).toBe("semimonthly");
    expect(parseBudgetCycleMode("monthly")).toBe("monthly");
    expect(parseBudgetCycleMode(null)).toBe("monthly");
    expect(parseBudgetCycleMode("basura")).toBe("monthly");
  });
});

describe("clampDayToMonth — largo del mes", () => {
  it("recorta el 31 a 28/29/30 según el mes", () => {
    expect(clampDayToMonth(2025, 1, 31)).toBe(28); // febrero 2025
    expect(clampDayToMonth(2024, 1, 31)).toBe(29); // febrero 2024 (bisiesto)
    expect(clampDayToMonth(2025, 3, 31)).toBe(30); // abril
    expect(clampDayToMonth(2025, 0, 31)).toBe(31); // enero
  });

  it("recorta el 30 en febrero", () => {
    expect(clampDayToMonth(2025, 1, 30)).toBe(28);
    expect(clampDayToMonth(2024, 1, 30)).toBe(29);
  });
});

describe("getPeriodStartsForMonth — aterrizaje del día de corte", () => {
  it("mensual: el 31 cae en el último día real de febrero", () => {
    expect(getPeriodStartsForMonth(2025, 1, monthly(31), false).map(ymd)).toEqual(["2025-02-28"]);
    expect(getPeriodStartsForMonth(2024, 1, monthly(31), false).map(ymd)).toEqual(["2024-02-29"]);
  });

  it("mensual: el 30 en abril cae el 30", () => {
    expect(getPeriodStartsForMonth(2025, 3, monthly(30), false).map(ymd)).toEqual(["2025-04-30"]);
  });

  it("quincenal: 15 y 31 en febrero deja dos cortes distintos", () => {
    // 15-feb-2025 es sábado → viernes 14. 31 → 28 (viernes).
    expect(
      getPeriodStartsForMonth(2025, 1, semimonthly(15, 31), false).map(ymd)
    ).toEqual(["2025-02-14", "2025-02-28"]);
  });

  it("quincenal: en bisiesto el 31 cae el 29", () => {
    expect(
      getPeriodStartsForMonth(2024, 1, semimonthly(15, 31), false).map(ymd)
    ).toEqual(["2024-02-15", "2024-02-29"]);
  });
});

describe("getBudgetPeriod — períodos concretos", () => {
  it("mensual con corte 10", () => {
    const p = getBudgetPeriod(monthly(10), new Date(2025, 5, 15));
    expect(ymd(p.start)).toBe("2025-06-10");
    expect(ymd(p.end)).toBe("2025-07-09");
  });

  it("quincenal 15/30 a mitad de la segunda quincena", () => {
    const p = getBudgetPeriod(semimonthly(15, 30), new Date(2025, 5, 20));
    // 15-jun-2025 es domingo → el corte se corre al viernes 13.
    expect(ymd(p.start)).toBe("2025-06-13");
    expect(ymd(p.end)).toBe("2025-06-29");
  });

  it("quincenal 15/30 en la primera quincena", () => {
    const p = getBudgetPeriod(semimonthly(15, 30), new Date(2025, 5, 10));
    expect(ymd(p.start)).toBe("2025-05-30");
    expect(ymd(p.end)).toBe("2025-06-12");
  });

  it("quincenal 15/30 en febrero (mes corto)", () => {
    const p = getBudgetPeriod(semimonthly(15, 30), new Date(2025, 1, 20));
    expect(ymd(p.start)).toBe("2025-02-14");
    expect(ymd(p.end)).toBe("2025-02-27");
  });

  it("quincenal 15/31 en bisiesto: el segundo corte cae el 29", () => {
    const p = getBudgetPeriod(semimonthly(15, 31), new Date(2024, 1, 20));
    expect(ymd(p.start)).toBe("2024-02-15");
    expect(ymd(p.end)).toBe("2024-02-28");

    const next = getBudgetPeriod(semimonthly(15, 31), new Date(2024, 2, 5));
    expect(ymd(next.start)).toBe("2024-02-29");
    expect(ymd(next.end)).toBe("2024-03-14");
  });

  it("sin configuración se comporta como mensual con corte 1", () => {
    expect(getBudgetPeriod({}, new Date(2025, 5, 15))).toEqual(
      getBudgetPeriod(monthly(1), new Date(2025, 5, 15))
    );
    expect(getBudgetPeriod(null, new Date(2025, 5, 15))).toEqual(
      getBudgetPeriod(monthly(1), new Date(2025, 5, 15))
    );
  });

  it("dos cortes iguales degeneran a mensual (no rompe)", () => {
    const ref = new Date(2025, 5, 15);
    expect(getBudgetPeriod(semimonthly(1, 1), ref)).toEqual(getBudgetPeriod(monthly(1), ref));
    expect(getBudgetPeriod(semimonthly(31, 31), new Date(2025, 1, 20))).toEqual(
      getBudgetPeriod(monthly(31), new Date(2025, 1, 20))
    );
  });
});

describe("regresión: monthly con getBudgetPeriod === getCurrentBudgetPeriod", () => {
  it("coincide siempre que la versión antigua devuelva un período válido", () => {
    const cutoffs = [1, 5, 15, 20, 28, 30, 31];
    let checked = 0;
    let legacyBroken = 0;

    for (const c of cutoffs) {
      for (let d = new Date(2024, 0, 1); d <= new Date(2025, 11, 31); d = addDays(d, 1)) {
        for (const respectHolidays of [true, false]) {
          const legacy = getCurrentBudgetPeriod(c, respectHolidays, d);
          const modern = getBudgetPeriod(
            { budgetCycleMode: "monthly", budgetCutoffDay: c, respectHolidays },
            d
          );

          // La versión nueva SIEMPRE debe contener el día de referencia.
          expect(modern.start.getTime()).toBeLessThanOrEqual(d.getTime());
          expect(modern.end.getTime()).toBeGreaterThanOrEqual(d.getTime());

          // La versión antigua tenía un caso borde: cuando el corte del mes
          // siguiente se adelanta al mes actual por festivo (p. ej. el 1 de mayo,
          // Día del Trabajo), el día anterior quedaba fuera de su propio período.
          // En esos días no se exige igualdad: la versión nueva es la correcta.
          const refInsideLegacy =
            legacy.start.getTime() <= d.getTime() && legacy.end.getTime() >= d.getTime();

          if (refInsideLegacy) {
            expect({ s: ymd(modern.start), e: ymd(modern.end) }).toEqual({
              s: ymd(legacy.start),
              e: ymd(legacy.end),
            });
            checked++;
          } else {
            legacyBroken++;
          }
        }
      }
    }

    // Sanity: se comparó una muestra grande y el caso borde existe de verdad.
    expect(checked).toBeGreaterThan(4000);
    expect(legacyBroken).toBeGreaterThan(0);
  });

  it("corrige el caso borde: el 30-abr-2024 ya pertenece al período que empieza ese día", () => {
    const ref = new Date(2024, 3, 30);
    const modern = getBudgetPeriod(monthly(1, true), ref);
    const legacy = getCurrentBudgetPeriod(1, true, ref);

    // El 1 de mayo de 2024 es festivo, así que el corte de mayo se adelanta al
    // 30 de abril. Ese día YA es el inicio de un período nuevo.
    expect(ymd(modern.start)).toBe("2024-04-30");
    expect(modern.start.getTime()).toBeLessThanOrEqual(ref.getTime());
    expect(modern.end.getTime()).toBeGreaterThanOrEqual(ref.getTime());

    // La versión antigua devolvía un período que no contenía el día de consulta.
    expect(legacy.end.getTime()).toBeLessThan(ref.getTime());
  });
});

describe("invariante: los períodos son contiguos y sin huecos", () => {
  const configs: Array<[string, ReturnType<typeof monthly> | ReturnType<typeof semimonthly>]> = [
    ["mensual 1", monthly(1)],
    ["mensual 15", monthly(15)],
    ["mensual 30", monthly(30)],
    ["mensual 31", monthly(31)],
    ["quincenal 1/16", semimonthly(1, 16)],
    ["quincenal 15/30", semimonthly(15, 30)],
    ["quincenal 15/31", semimonthly(15, 31)],
    ["quincenal 10/25", semimonthly(10, 25)],
  ];

  it.each(configs)("%s: cada día pertenece a exactamente un período", (_label, cfg) => {
    let prev: { start: Date; end: Date } | null = null;
    // 2024 es bisiesto: el recorrido cubre 29-feb y los meses de 30 y 31.
    for (let d = new Date(2024, 0, 1); d <= new Date(2025, 11, 31); d = addDays(d, 1)) {
      const p = getBudgetPeriod(cfg, d);

      // El día de referencia cae dentro del período.
      expect(p.start.getTime()).toBeLessThanOrEqual(d.getTime());
      expect(p.end.getTime()).toBeGreaterThanOrEqual(d.getTime());

      // Sin solapes ni huecos: el nuevo período empieza justo al día siguiente
      // del final del anterior.
      if (prev && p.start.getTime() !== prev.start.getTime()) {
        expect(p.start.getTime()).toBe(addDays(prev.end, 1).getTime());
      }

      prev = p;
    }
  });
});

describe("festivos: el corte se mueve al día hábil anterior", () => {
  it("el 1 de enero (festivo) pasa al 31 de diciembre del año anterior", () => {
    const withHolidays = getBudgetPeriod(
      { budgetCycleMode: "monthly", budgetCutoffDay: 1, respectHolidays: true },
      new Date(2025, 0, 15)
    );
    const withoutHolidays = getBudgetPeriod(
      { budgetCycleMode: "monthly", budgetCutoffDay: 1, respectHolidays: false },
      new Date(2025, 0, 15)
    );
    // Con festivos el corte de enero vive el 31-dic-2024.
    expect(ymd(withHolidays.start)).toBe("2024-12-31");
    // Sin festivos, enero 1 es miércoles y se queda.
    expect(ymd(withoutHolidays.start)).toBe("2025-01-01");
  });
});
