import { describe, it, expect } from "vitest";
import { findRuleFor, suggestRuleName, suggestRuleContains, normalizeForMatch } from "@/lib/inbox/rules";

function rule(overrides: Partial<{
  id: string; name: string; contains: string; category: string | null;
  subCategory: string | null; accountId: string | null; type: string | null;
  priority: number; active: boolean;
}> = {}) {
  return {
    id: "r1",
    name: "Arriendo",
    contains: "arriendo",
    category: "Vivienda",
    subCategory: null,
    accountId: "acc-1",
    type: "expense",
    priority: 0,
    active: true,
    ...overrides,
  };
}

describe("normalizeForMatch", () => {
  it("ignora mayúsculas y tildes", () => {
    expect(normalizeForMatch("Cajéro AUTOMÁTICO")).toBe("cajero automatico");
  });
});

describe("findRuleFor", () => {
  it("aplica la regla cuando el texto contiene la palabra", () => {
    const applied = findRuleFor("Su retiro sin tarjeta en CAJERO automatico", [
      rule({ contains: "cajero", category: "Efectivo", type: "transfer" }),
    ]);
    expect(applied).not.toBeNull();
    expect(applied!.category).toBe("Efectivo");
    expect(applied!.type).toBe("transfer");
  });

  it("ignora tildes y mayúsculas al comparar", () => {
    expect(findRuleFor("ARRENDAMIENTO de noviembre", [rule({ contains: "arrendamiento" })])).not.toBeNull();
  });

  it("devuelve null si ninguna coincide", () => {
    expect(findRuleFor("Compra en EXITO", [rule({ contains: "netflix" })])).toBeNull();
  });

  it("ignora reglas inactivas", () => {
    expect(findRuleFor("arriendo", [rule({ active: false })])).toBeNull();
  });

  it("gana la de menor prioridad", () => {
    const applied = findRuleFor("pago tarjeta", [
      rule({ id: "baja", name: "B", contains: "pago", priority: 5, category: "General" }),
      rule({ id: "alta", name: "A", contains: "pago", priority: 1, category: "Tarjetas" }),
    ]);
    expect(applied!.id).toBe("alta");
  });

  it("a igual prioridad gana el texto más específico", () => {
    const applied = findRuleFor("TRANSFERENCIA LULO BANK", [
      rule({ id: "generica", name: "G", contains: "transferencia", priority: 0 }),
      rule({ id: "especifica", name: "E", contains: "transferencia lulo", priority: 0 }),
    ]);
    expect(applied!.id).toBe("especifica");
  });

  it("no lanza con textos vacíos ni reglas rotas", () => {
    expect(findRuleFor("", [rule()])).toBeNull();
    expect(findRuleFor("arriendo", [rule({ contains: "   " })])).toBeNull();
    expect(findRuleFor("arriendo", [])).toBeNull();
  });
});

describe("sugerencias para crear una regla desde una captura", () => {
  it("usa el comercio cuando existe", () => {
    expect(suggestRuleContains("EXITO PRADO", "Compraste $45.900 en EXITO PRADO")).toBe("EXITO PRADO");
  });

  it("si no hay comercio, toma palabras significativas sin números", () => {
    const contains = suggestRuleContains(null, "Su retiro sin tarjeta en cajero por $100.000 el 17/10");
    expect(contains.toLowerCase()).toContain("retiro");
    expect(contains).not.toMatch(/\d/);
  });

  it("el nombre no queda vacío ni larguísimo", () => {
    expect(suggestRuleName(null, "")).toBe("Regla");
    expect(suggestRuleName("A".repeat(100), "")).toHaveLength(38);
  });
});
