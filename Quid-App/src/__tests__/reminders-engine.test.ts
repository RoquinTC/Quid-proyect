import { describe, it, expect } from "vitest";
import {
  addDaysToKey,
  bandFor,
  colombiaTodayKey,
  dateKeyOf,
  daysBetweenKeys,
  dueTextEs,
  formatKeyEs,
  mostUrgentBand,
  paymentBandFor,
} from "@/lib/reminders/engine";

/**
 * El bug que estas pruebas cierran: un pago programado para el 10 se anunciaba
 * como "pendiente hoy" el día 9. Todo el cálculo de días se hace ahora por
 * clave de calendario, nunca restando milisegundos contra "ahora".
 */
describe("fechas de calendario", () => {
  it("conserva el día cuando la fecha se guardó a medianoche UTC", () => {
    expect(dateKeyOf("2026-11-10T00:00:00.000Z")).toBe("2026-11-10");
  });

  it("conserva el día cuando se guardó a medianoche de Colombia (05:00Z)", () => {
    expect(dateKeyOf(new Date("2026-11-10T05:00:00.000Z"))).toBe("2026-11-10");
  });

  it("un pago del 10 no es 'hoy' el 9", () => {
    expect(daysBetweenKeys("2026-11-09", "2026-11-10")).toBe(1);
    expect(daysBetweenKeys("2026-11-10", "2026-11-10")).toBe(0);
    expect(daysBetweenKeys("2026-11-11", "2026-11-10")).toBe(-1);
  });

  it("suma y resta días sin arrastrar zona horaria", () => {
    expect(addDaysToKey("2026-11-10", -1)).toBe("2026-11-09");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("hoy en Colombia no depende de la zona del servidor", () => {
    // 02:00Z del 10 son las 21:00 del 9 en Bogotá.
    expect(colombiaTodayKey(new Date("2026-11-10T02:00:00.000Z"))).toBe("2026-11-09");
    // 06:00Z del 10 son la 01:00 del 10 en Bogotá.
    expect(colombiaTodayKey(new Date("2026-11-10T06:00:00.000Z"))).toBe("2026-11-10");
  });
});

describe("tramos de aviso", () => {
  it("elige el tramo más ajustado, no el primero", () => {
    expect(bandFor(25, [30, 7, 1, 0])).toBe(30);
    expect(bandFor(6, [30, 7, 1, 0])).toBe(7);
    expect(bandFor(0, [30, 7, 1, 0])).toBe(0);
    expect(bandFor(-3, [30, 7, 1, 0])).toBe("overdue");
    expect(bandFor(45, [30, 7, 1, 0])).toBeNull();
  });

  it("kilometraje: 800 km avisa una vez, no todos los días", () => {
    expect(bandFor(800, [1000, 300, 50, 0])).toBe(1000);
    expect(bandFor(250, [1000, 300, 50, 0])).toBe(300);
    expect(bandFor(-10, [1000, 300, 50, 0])).toBe("overdue");
  });

  it("entre fecha y kilometraje gana el aviso más urgente", () => {
    expect(mostUrgentBand([1000, 300])).toBe(300);
    expect(mostUrgentBand([30, null])).toBe(30);
    expect(mostUrgentBand([null, null])).toBeNull();
  });

  it("pagos: avisa a 3 días, el día, y después semanal", () => {
    expect(paymentBandFor(3)).toBe("upcoming");
    expect(paymentBandFor(2)).toBeNull();
    expect(paymentBandFor(0)).toBe("due");
    expect(paymentBandFor(-1)).toBe("overdue");
    expect(paymentBandFor(-2)).toBeNull();
    expect(paymentBandFor(-8)).toBe("overdue");
  });
});

describe("textos del aviso", () => {
  it("la fecha que muestra el aviso es la del vencimiento", () => {
    expect(formatKeyEs("2026-11-10")).toContain("10");
    expect(dueTextEs(0, "2026-11-10")).toContain("hoy");
    expect(dueTextEs(0, "2026-11-10")).toContain("10");
    expect(dueTextEs(1, "2026-11-11")).toContain("mañana");
    expect(dueTextEs(-3, "2026-11-07")).toContain("venció");
  });
});
