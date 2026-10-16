import { describe, it, expect } from "vitest";
import {
  evaluateStock,
  isReplenishable,
  STOCK_STATUS_LABELS,
  EXPIRING_SOON_DAYS,
  UNUSED_AFTER_DAYS,
} from "@/lib/pantry/stock";

const NOW = new Date("2026-06-15T12:00:00.000Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

describe("evaluateStock — cantidad", () => {
  it("cantidad 0 es agotado", () => {
    const r = evaluateStock({ quantity: 0 }, NOW);
    expect(r.status).toBe("out");
    expect(r.isOut).toBe(true);
    expect(r.label).toBe("Agotado");
  });

  it("cantidad igual al mínimo es stock bajo (el umbral es inclusivo)", () => {
    const r = evaluateStock({ quantity: 2, minStock: 2 }, NOW);
    expect(r.status).toBe("low");
    expect(r.isLow).toBe(true);
  });

  it("cantidad por debajo del mínimo es stock bajo", () => {
    expect(evaluateStock({ quantity: 1, minStock: 3 }, NOW).status).toBe("low");
  });

  it("cantidad por encima del mínimo y sin objetivo está bien", () => {
    const r = evaluateStock({ quantity: 5, minStock: 2 }, NOW);
    expect(r.status).toBe("ok");
    expect(r.flags).toEqual([]);
  });

  it("por debajo del objetivo pero sobre el mínimo es 'se acaba'", () => {
    const r = evaluateStock({ quantity: 5, minStock: 2, targetQuantity: 10 }, NOW);
    expect(r.status).toBe("running_low");
    expect(r.deficit).toBe(5);
  });

  it("no marca 'se acaba' si ya está por debajo del mínimo", () => {
    const r = evaluateStock({ quantity: 1, minStock: 2, targetQuantity: 10 }, NOW);
    expect(r.status).toBe("low");
    expect(r.flags).not.toContain("running_low");
  });

  it("sin mínimo ni objetivo nunca marca bajo", () => {
    const r = evaluateStock({ quantity: 0 }, NOW);
    // cantidad 0 igual es "out", pero no "low"
    expect(r.flags).not.toContain("low");
    expect(r.isLow).toBe(false);
  });
});

describe("evaluateStock — déficit", () => {
  it("usa el objetivo cuando existe", () => {
    expect(evaluateStock({ quantity: 3, targetQuantity: 10 }, NOW).deficit).toBe(7);
  });

  it("cae al mínimo cuando no hay objetivo", () => {
    const r = evaluateStock({ quantity: 1, minStock: 4 }, NOW);
    expect(r.effectiveTarget).toBe(4);
    expect(r.deficit).toBe(3);
  });

  it("sin umbral el déficit es 0", () => {
    const r = evaluateStock({ quantity: 5 }, NOW);
    expect(r.effectiveTarget).toBe(0);
    expect(r.deficit).toBe(0);
  });

  it("nunca es negativo cuando hay más que el objetivo", () => {
    const r = evaluateStock({ quantity: 20, targetQuantity: 10 }, NOW);
    expect(r.deficit).toBe(0);
  });
});

describe("evaluateStock — vencimiento", () => {
  it("fecha pasada es vencido, y gana sobre todo lo demás", () => {
    const r = evaluateStock(
      { quantity: 0, minStock: 5, expirationDate: daysFromNow(-1) },
      NOW
    );
    expect(r.status).toBe("expired");
    expect(r.daysToExpiry).toBe(-1);
  });

  it("vence dentro del umbral es 'vence pronto'", () => {
    const r = evaluateStock(
      { quantity: 10, expirationDate: daysFromNow(EXPIRING_SOON_DAYS) },
      NOW
    );
    expect(r.status).toBe("expiring");
    expect(r.daysToExpiry).toBe(EXPIRING_SOON_DAYS);
  });

  it("justo fuera del umbral ya no avisa", () => {
    const r = evaluateStock(
      { quantity: 10, expirationDate: daysFromNow(EXPIRING_SOON_DAYS + 1) },
      NOW
    );
    expect(r.status).toBe("ok");
  });

  it("vencido gana sobre agotado (es el aviso más grave)", () => {
    const r = evaluateStock(
      { quantity: 0, expirationDate: daysFromNow(-5) },
      NOW
    );
    expect(r.status).toBe("expired");
    expect(r.flags).toContain("out");
  });

  it("agotado gana sobre stock bajo", () => {
    const r = evaluateStock({ quantity: 0, minStock: 5 }, NOW);
    expect(r.status).toBe("out");
    expect(r.flags).toContain("low");
  });

  it("acepta la fecha como string ISO", () => {
    const r = evaluateStock(
      { quantity: 5, expirationDate: daysFromNow(-2).toISOString() },
      NOW
    );
    expect(r.status).toBe("expired");
  });

  it("ignora fechas inválidas sin romper", () => {
    const r = evaluateStock({ quantity: 5, expirationDate: "no-es-fecha" }, NOW);
    expect(r.daysToExpiry).toBeNull();
    expect(r.status).toBe("ok");
  });

  it("sin fecha no evalúa vencimiento", () => {
    expect(evaluateStock({ quantity: 5 }, NOW).daysToExpiry).toBeNull();
  });
});

describe("evaluateStock — sin usar", () => {
  it("más días que el umbral sin consumo marca 'sin usar'", () => {
    const r = evaluateStock(
      { quantity: 5, lastUsedAt: daysFromNow(-(UNUSED_AFTER_DAYS + 1)) },
      NOW
    );
    expect(r.status).toBe("unused");
    expect(r.daysSinceUse).toBe(UNUSED_AFTER_DAYS + 1);
  });

  it("dentro del umbral no marca nada", () => {
    const r = evaluateStock(
      { quantity: 5, lastUsedAt: daysFromNow(-10) },
      NOW
    );
    expect(r.status).toBe("ok");
    expect(r.daysSinceUse).toBe(10);
  });

  it("stock bajo gana sobre 'sin usar'", () => {
    const r = evaluateStock(
      { quantity: 1, minStock: 5, lastUsedAt: daysFromNow(-100) },
      NOW
    );
    expect(r.status).toBe("low");
    expect(r.flags).toContain("unused");
  });

  it("nunca usado no dispara el aviso (no hay fecha)", () => {
    const r = evaluateStock({ quantity: 5, lastUsedAt: null }, NOW);
    expect(r.daysSinceUse).toBeNull();
    expect(r.status).toBe("ok");
  });
});

describe("evaluateStock — robustez", () => {
  it("tolera cantidad no finita", () => {
    const r = evaluateStock({ quantity: NaN }, NOW);
    expect(r.status).toBe("out");
    expect(Number.isFinite(r.deficit)).toBe(true);
  });

  it("siempre devuelve una etiqueta coherente", () => {
    const cases = [
      { quantity: 0 },
      { quantity: 1, minStock: 3 },
      { quantity: 5, targetQuantity: 10 },
      { quantity: 5, lastUsedAt: daysFromNow(-99) },
      { quantity: 5 },
    ];
    for (const c of cases) {
      const r = evaluateStock(c, NOW);
      expect(r.label).toBe(STOCK_STATUS_LABELS[r.status]);
      expect(typeof r.deficit).toBe("number");
    }
  });

  it("acumula todos los flags presentes, no solo el elegido", () => {
    const r = evaluateStock(
      {
        quantity: 1,
        minStock: 5,
        expirationDate: daysFromNow(2),
        lastUsedAt: daysFromNow(-60),
      },
      NOW
    );
    expect(r.status).toBe("expiring");
    expect(r.flags).toEqual(
      expect.arrayContaining(["expiring", "low", "unused"])
    );
  });
});

describe("isReplenishable", () => {
  it("es reponible con mínimo", () => {
    expect(isReplenishable({ quantity: 1, minStock: 2 })).toBe(true);
  });

  it("es reponible con objetivo", () => {
    expect(isReplenishable({ quantity: 1, targetQuantity: 5 })).toBe(true);
  });

  it("sin umbral es solo registro", () => {
    expect(isReplenishable({ quantity: 10 })).toBe(false);
    expect(isReplenishable({ quantity: 10, minStock: null })).toBe(false);
  });

  it("el mínimo en 0 cuenta como umbral definido", () => {
    expect(isReplenishable({ quantity: 0, minStock: 0 })).toBe(true);
  });
});
