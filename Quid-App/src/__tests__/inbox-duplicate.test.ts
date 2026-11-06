import { describe, it, expect } from "vitest";
import { findDuplicate, MATCH_WINDOW_DAYS } from "@/lib/inbox/duplicate";

const REF = new Date(2026, 10, 17); // 17 nov 2026

function tx(overrides: Partial<{ id: string; amount: number; date: string; type: string; description: string }> = {}) {
  return {
    id: "t1",
    amount: 100000,
    date: "2026-11-17T12:00:00.000Z",
    type: "transfer",
    description: "Retiro",
    ...overrides,
  };
}

describe("findDuplicate", () => {
  it("detecta el mismo monto el mismo día y tipo", () => {
    const match = findDuplicate(
      { parsedAmount: 100000, parsedType: "transfer", parsedDate: "2026-11-17" },
      [tx()],
      REF
    );
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe("high");
    expect(match!.daysApart).toBe(0);
  });

  it("detecta hasta 3 días después (el banco publica con retraso)", () => {
    const match = findDuplicate(
      { parsedAmount: 100000, parsedType: "expense", parsedDate: "2026-11-15" },
      [tx({ type: "expense", date: "2026-11-17T12:00:00.000Z" })],
      REF
    );
    expect(match).not.toBeNull();
    expect(match!.daysApart).toBe(2);
    expect(match!.confidence).toBe("medium");
  });

  it("no marca nada fuera de la ventana", () => {
    const match = findDuplicate(
      { parsedAmount: 100000, parsedType: "expense", parsedDate: "2026-11-01" },
      [tx({ type: "expense", date: "2026-11-17T12:00:00.000Z" })],
      REF
    );
    expect(match).toBeNull();
  });

  it("no marca montos distintos", () => {
    const match = findDuplicate(
      { parsedAmount: 100000, parsedType: "expense", parsedDate: "2026-11-17" },
      [tx({ amount: 99999, type: "expense" })],
      REF
    );
    expect(match).toBeNull();
  });

  it("avisa con confianza media si el tipo no coincide (gasto vs transferencia)", () => {
    const match = findDuplicate(
      { parsedAmount: 100000, parsedType: "expense", parsedDate: "2026-11-17" },
      [tx({ type: "transfer" })],
      REF
    );
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe("medium");
  });

  it("ante varios candidatos prefiere el mismo día", () => {
    const match = findDuplicate(
      { parsedAmount: 50000, parsedType: "expense", parsedDate: "2026-11-17" },
      [
        tx({ id: "lejos", amount: 50000, type: "expense", date: "2026-11-14T12:00:00.000Z" }),
        tx({ id: "cerca", amount: 50000, type: "expense", date: "2026-11-17T09:00:00.000Z" }),
      ],
      REF
    );
    expect(match!.id).toBe("cerca");
    expect(match!.confidence).toBe("high");
  });

  it("no inventa duplicado si la captura no tiene monto", () => {
    expect(
      findDuplicate({ parsedAmount: null, parsedType: "expense", parsedDate: null }, [tx()], REF)
    ).toBeNull();
  });

  it("la ventana es de 3 días", () => {
    expect(MATCH_WINDOW_DAYS).toBe(3);
  });

  it("no lanza con listas vacías ni fechas inválidas", () => {
    expect(findDuplicate({ parsedAmount: 10, parsedType: "expense", parsedDate: null }, [], REF)).toBeNull();
    expect(
      findDuplicate(
        { parsedAmount: 10, parsedType: "expense", parsedDate: "no-es-fecha" },
        [tx({ amount: 10, date: "no-es-fecha" })],
        REF
      )
    ).toBeNull();
  });
});
