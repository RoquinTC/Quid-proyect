import { describe, it, expect, vi } from "vitest";
import {
  recurringDateKey,
  isCancelledDate,
  getCancelledDateKeys,
} from "@/lib/recurring/regeneration";

describe("recurringDateKey", () => {
  it("formatea una fecha local como YYYY-MM-DD", () => {
    expect(recurringDateKey(new Date(2025, 5, 15))).toBe("2025-06-15");
    expect(recurringDateKey(new Date(2025, 0, 1))).toBe("2025-01-01");
  });

  it("acepta strings ISO y usa la fecha local", () => {
    expect(recurringDateKey("2025-06-15T05:00:00.000Z")).toBe("2025-06-15");
  });

  it("ignora la hora: mismo día, misma clave", () => {
    const a = recurringDateKey(new Date(2025, 5, 15, 0, 0, 1));
    const b = recurringDateKey(new Date(2025, 5, 15, 23, 59, 59));
    expect(a).toBe(b);
  });

  it("devuelve vacío con basura", () => {
    expect(recurringDateKey("no-es-fecha")).toBe("");
  });
});

describe("isCancelledDate", () => {
  const keys = new Set(["2025-06-15", "2025-07-01"]);

  it("detecta una fecha cancelada aunque cambie la hora", () => {
    expect(isCancelledDate(keys, new Date(2025, 5, 15, 9, 30))).toBe(true);
    expect(isCancelledDate(keys, "2025-06-15T12:00:00.000Z")).toBe(true);
  });

  it("no marca fechas distintas", () => {
    expect(isCancelledDate(keys, new Date(2025, 5, 16))).toBe(false);
  });

  it("conjunto vacío nunca coincide", () => {
    expect(isCancelledDate(new Set(), new Date(2025, 5, 15))).toBe(false);
  });
});

describe("getCancelledDateKeys", () => {
  it("consulta solo las canceladas del ámbito y devuelve sus días", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { scheduledDate: new Date(2025, 5, 15) },
      { scheduledDate: new Date(2025, 6, 1) },
      { scheduledDate: new Date(2025, 6, 1) }, // duplicado
    ]);
    const client = { recurringPayment: { findMany } };

    const keys = await getCancelledDateKeys(client, { payrollGroupId: "g1" });

    expect(findMany).toHaveBeenCalledWith({
      where: { payrollGroupId: "g1", status: "cancelled" },
      select: { scheduledDate: true },
    });
    expect([...keys].sort()).toEqual(["2025-06-15", "2025-07-01"]);
  });

  it("descarta filas con fecha inválida sin romper", async () => {
    const client = {
      recurringPayment: {
        findMany: vi.fn().mockResolvedValue([
          { scheduledDate: new Date(2025, 5, 15) },
          { scheduledDate: "basura" },
        ]),
      },
    };

    const keys = await getCancelledDateKeys(client, { savingsGoalId: "s1" });
    expect([...keys]).toEqual(["2025-06-15"]);
  });

  it("sin canceladas devuelve conjunto vacío", async () => {
    const client = { recurringPayment: { findMany: vi.fn().mockResolvedValue([]) } };
    const keys = await getCancelledDateKeys(client, { payrollGroupId: "g1" });
    expect(keys.size).toBe(0);
  });
});
