import { describe, expect, it } from "vitest";
import {
  awakeMinutes,
  averageIntervalMinutes,
  computeReminderSlots,
  formatInterval,
  formatMinutes,
  parseTimeToMinutes,
  upcomingReminderTimes,
} from "@/lib/health/hydration-schedule";

const window_ = { wakeTime: "06:00", sleepTime: "22:00" };

describe("ventana despierta", () => {
  it("calcula las horas despiertas", () => {
    expect(awakeMinutes(window_)).toBe(960);
  });

  it("soporta cruzar la medianoche", () => {
    expect(awakeMinutes({ wakeTime: "08:00", sleepTime: "00:30" })).toBe(990);
  });

  it("parsea y formatea horas", () => {
    expect(parseTimeToMinutes("06:30")).toBe(390);
    expect(parseTimeToMinutes("basura")).toBe(0);
    expect(formatMinutes(390)).toBe("06:30");
    expect(formatMinutes(1470)).toBe("00:30");
  });
});

describe("reparto equitativo de recordatorios", () => {
  it("reparte 10 avisos cada 96 min entre 06:00 y 22:00", () => {
    const slots = computeReminderSlots(window_, 10);
    expect(slots).toHaveLength(10);
    expect(averageIntervalMinutes(window_, 10)).toBe(96);
    // Centrados: el primero cae a las 06:48, no a las 06:00
    expect(slots[0].label).toBe("06:48");
    // El último queda antes de dormir
    expect(slots[9].label).toBe("21:12");
  });

  it("los avisos están igualmente espaciados", () => {
    const slots = computeReminderSlots(window_, 8);
    const gaps = slots.slice(1).map((slot, index) => slot.minutes - slots[index].minutes);
    const first = gaps[0];
    for (const gap of gaps) expect(Math.abs(gap - first)).toBeLessThanOrEqual(1);
  });

  it("un solo aviso cae a mitad de la ventana", () => {
    const slots = computeReminderSlots(window_, 1);
    expect(slots).toHaveLength(1);
    expect(slots[0].label).toBe("14:00");
  });

  it("más vasos ⇒ más avisos y menos intervalo", () => {
    expect(computeReminderSlots(window_, 6)).toHaveLength(6);
    expect(averageIntervalMinutes(window_, 6)).toBe(160);
    expect(averageIntervalMinutes(window_, 12)).toBe(80);
  });

  it("funciona con ventanas cortas (madrugador)", () => {
    const madrugador = { wakeTime: "05:00", sleepTime: "13:00" };
    const slots = computeReminderSlots(madrugador, 4);
    expect(slots).toHaveLength(4);
    expect(slots[0].minutes).toBeGreaterThan(300);
    expect(slots[3].minutes).toBeLessThan(780);
  });

  it("en modo exacto el primero cae al despertar y el último al acostarse", () => {
    const slots = computeReminderSlots(window_, 13, "edges");
    expect(slots).toHaveLength(13);
    expect(slots[0].label).toBe("06:00");
    expect(slots[12].label).toBe("22:00");
    // 960 / 12 = 80 min
    expect(averageIntervalMinutes(window_, 13, "edges")).toBe(80);
  });

  it("el modo centrado deja margen en los extremos", () => {
    const slots = computeReminderSlots(window_, 13, "centered");
    expect(slots[0].label).toBe("06:37"); // 960/13 = 73,8 min ⇒ 37 min después
    expect(slots[12].label).toBe("21:23");
  });

  it("formatea intervalos legibles", () => {
    expect(formatInterval(96)).toBe("cada 1 h 36 min");
    expect(formatInterval(45)).toBe("cada 45 min");
    expect(formatInterval(120)).toBe("cada 2 h");
  });
});

describe("programación de los próximos días", () => {
  const now = new Date(2026, 9, 25, 9, 0, 0); // 25/10/2026 09:00 local

  it("descarta los avisos de hoy que ya pasaron", () => {
    const times = upcomingReminderTimes(window_, 10, { now, days: 1 });
    // A las 09:00, los de 06:48 y 08:24 ya pasaron ⇒ quedan 8
    expect(times).toHaveLength(8);
    expect(times[0].at.getHours()).toBeGreaterThanOrEqual(9);
  });

  it("programa varios días", () => {
    const unDia = upcomingReminderTimes(window_, 10, { now, days: 1 });
    const tresDias = upcomingReminderTimes(window_, 10, { now, days: 3 });
    expect(tresDias.length).toBeGreaterThan(unDia.length);
    expect(tresDias.length).toBe(unDia.length + 20);
  });

  it("todos los avisos son futuros", () => {
    const times = upcomingReminderTimes(window_, 8, { now, days: 2 });
    for (const item of times) {
      expect(item.at.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
