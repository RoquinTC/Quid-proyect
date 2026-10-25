import { describe, expect, it } from "vitest";
import {
  addDaysToDayString,
  daysBetweenDayStrings,
  parseTimeOfDay,
  therapyDayOf,
  therapyDayStart,
  zonedInstant,
} from "@/lib/health/therapy-day";
import {
  isMedicationDueOn,
  planOccurrences,
  timesOfDayFor,
} from "@/lib/health/dose-scheduler";

// Colombia es UTC-05 todo el año (sin horario de verano), así que las
// aserciones son estables: 04:00 local == 09:00 UTC.
const TZ = "America/Bogota";

describe("therapy day (día lógico)", () => {
  it("una toma a la 01:30 pertenece al día anterior", () => {
    // 2026-10-25 01:30 Bogotá = 06:30 UTC
    const instant = new Date("2026-10-25T06:30:00.000Z");
    expect(therapyDayOf(instant, 4, TZ)).toBe("2026-10-24");
  });

  it("el corte es a las 04:00 exactas", () => {
    // 03:59 local = 08:59 UTC → día anterior
    expect(therapyDayOf(new Date("2026-10-25T08:59:00.000Z"), 4, TZ)).toBe("2026-10-24");
    // 04:00 local = 09:00 UTC → mismo día
    expect(therapyDayOf(new Date("2026-10-25T09:00:00.000Z"), 4, TZ)).toBe("2026-10-25");
  });

  it("therapyDayStart devuelve el instante UTC de las 04:00 locales", () => {
    const start = therapyDayStart("2026-10-25", 4, TZ);
    expect(start.toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("zonedInstant respeta la zona (08:00 local = 13:00 UTC)", () => {
    expect(zonedInstant("2026-10-25", 8, 0, TZ).toISOString()).toBe("2026-10-25T13:00:00.000Z");
  });

  it("aritmética de días sin cruzar zonas", () => {
    expect(addDaysToDayString("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDayString("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetweenDayStrings("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("parsea horas válidas y rechaza inválidas", () => {
    expect(parseTimeOfDay("08:00")).toBe(480);
    expect(parseTimeOfDay("8:05")).toBe(485);
    expect(parseTimeOfDay("24:00")).toBeNull();
    expect(parseTimeOfDay("basura")).toBeNull();
  });
});

describe("recurrencia de medicamentos", () => {
  const base = {
    id: "med-1",
    frequency: "daily",
    reminderTimes: JSON.stringify(["08:00", "20:00"]),
    startDate: "2026-10-01",
    doseQuantity: 1,
    isActive: true,
  };

  it("diaria genera una ocurrencia por horario", () => {
    const plan = planOccurrences(base, {
      fromDay: "2026-10-10",
      toDay: "2026-10-11",
      timeZone: TZ,
      startHour: 4,
    });
    expect(plan).toHaveLength(4); // 2 días × 2 horarios
    expect(plan[0].scheduledAt.toISOString()).toBe("2026-10-10T13:00:00.000Z");
    expect(plan[0].scheduledDay).toBe("2026-10-10");
  });

  it("una hora antes del corte cae en el calendario del día siguiente", () => {
    const plan = planOccurrences(
      { ...base, reminderTimes: JSON.stringify(["01:00"]) },
      { fromDay: "2026-10-10", toDay: "2026-10-10", timeZone: TZ, startHour: 4 },
    );
    expect(plan).toHaveLength(1);
    // Día lógico 10, pero instante real del 11 a la 01:00 local (06:00 UTC)
    expect(plan[0].scheduledDay).toBe("2026-10-10");
    expect(plan[0].scheduledAt.toISOString()).toBe("2026-10-11T06:00:00.000Z");
  });

  it("every_n_days se ancla en startDate", () => {
    const med = {
      ...base,
      frequency: "every_n_days",
      customSchedule: JSON.stringify({ type: "interval_days", everyDays: 3 }),
    };
    expect(isMedicationDueOn(med, "2026-10-01")).toBe(true); // día ancla
    expect(isMedicationDueOn(med, "2026-10-04")).toBe(true);
    expect(isMedicationDueOn(med, "2026-10-05")).toBe(false);
  });

  it("mensual con día 31 cae al último día de febrero", () => {
    const med = {
      ...base,
      frequency: "custom",
      startDate: "2026-01-31",
      customSchedule: JSON.stringify({ type: "monthly", monthlyDay: 31 }),
      reminderTimes: JSON.stringify(["09:00"]),
    };
    expect(isMedicationDueOn(med, "2026-02-28")).toBe(true);
    expect(isMedicationDueOn(med, "2026-02-27")).toBe(false);
  });

  it("respeta el fin del tratamiento", () => {
    const med = { ...base, endDate: "2026-10-05" };
    expect(isMedicationDueOn(med, "2026-10-05")).toBe(true);
    expect(isMedicationDueOn(med, "2026-10-06")).toBe(false);
  });

  it("as_needed no genera ocurrencias programadas", () => {
    const med = { ...base, frequency: "as_needed" };
    expect(isMedicationDueOn(med, "2026-10-10")).toBe(false);
    expect(
      planOccurrences(med, { fromDay: "2026-10-10", toDay: "2026-10-12", timeZone: TZ, startHour: 4 }),
    ).toHaveLength(0);
  });

  it("un medicamento inactivo no genera nada", () => {
    expect(isMedicationDueOn({ ...base, isActive: false }, "2026-10-10")).toBe(false);
  });

  it("sin horas declaradas usa 08:00 por defecto", () => {
    expect(timesOfDayFor({ id: "x" })).toEqual(["08:00"]);
  });

  it("ordena y deduplica las horas", () => {
    expect(
      timesOfDayFor({ id: "x", reminderTimes: JSON.stringify(["20:00", "08:00", "08:00"]) }),
    ).toEqual(["08:00", "20:00"]);
  });
});

describe("overrides por fecha (excepciones del día)", () => {
  const base = {
    id: "med-1",
    frequency: "daily",
    reminderTimes: JSON.stringify(["08:00", "20:00"]),
    startDate: "2026-10-01",
    doseQuantity: 1,
    isActive: true,
  };

  it("skip_day elimina las tomas de ese día y deja el resto intacto", () => {
    const plan = planOccurrences(base, {
      fromDay: "2026-10-10",
      toDay: "2026-10-12",
      timeZone: TZ,
      startHour: 4,
      overrides: [{ day: "2026-10-11", type: "skip_day" }],
    });

    // 3 días × 2 horarios − 2 del día saltado
    expect(plan).toHaveLength(4);
    expect(plan.some((item) => item.scheduledDay === "2026-10-11")).toBe(false);
  });

  it("modify_time reemplaza las horas de ese día", () => {
    const plan = planOccurrences(base, {
      fromDay: "2026-10-10",
      toDay: "2026-10-10",
      timeZone: TZ,
      startHour: 4,
      overrides: [{ day: "2026-10-10", type: "modify_time", payload: { times: ["10:30"] } }],
    });

    expect(plan).toHaveLength(1);
    // 10:30 Bogotá = 15:30 UTC
    expect(plan[0].scheduledAt.toISOString()).toBe("2026-10-10T15:30:00.000Z");
    expect(plan[0].scheduledDay).toBe("2026-10-10");
  });

  it("modify_dose cambia la dosis planificada solo ese día", () => {
    const plan = planOccurrences(base, {
      fromDay: "2026-10-10",
      toDay: "2026-10-11",
      timeZone: TZ,
      startHour: 4,
      overrides: [{ day: "2026-10-10", type: "modify_dose", payload: { dose: 2 } }],
    });

    const day10 = plan.filter((item) => item.scheduledDay === "2026-10-10");
    const day11 = plan.filter((item) => item.scheduledDay === "2026-10-11");
    expect(day10.every((item) => item.plannedDose === 2)).toBe(true);
    expect(day11.every((item) => item.plannedDose === 1)).toBe(true);
  });

  it("los overrides no alteran la recurrencia del plan base", () => {
    // Sin overrides el día 11 genera 2 tomas; con skip en el 10 sigue generando 2.
    const withSkip = planOccurrences(base, {
      fromDay: "2026-10-11",
      toDay: "2026-10-11",
      timeZone: TZ,
      startHour: 4,
      overrides: [{ day: "2026-10-10", type: "skip_day" }],
    });
    expect(withSkip).toHaveLength(2);
  });

  it("un override de otro medicamento no afecta (el filtrado es por medicamento)", () => {
    const plan = planOccurrences(base, {
      fromDay: "2026-10-10",
      toDay: "2026-10-10",
      timeZone: TZ,
      startHour: 4,
      overrides: [],
    });
    expect(plan).toHaveLength(2);
  });
});
