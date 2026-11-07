import { describe, it, expect } from "vitest";
import { evaluateExpression, parseAmountLiteral, looksLikeExpression } from "@/lib/parse/expression";
import { maskAmountInput } from "@/lib/format/money-input";

/** Extrae el valor numérico de un resultado del parser. */
function value(raw: string): number | null {
  const result = evaluateExpression(raw);
  return result.ok ? result.value : null;
}

/**
 * La máscara escribe "1.000"; el parser debe leerlo como mil, no como 1,0 ni
 * como una operación. Si esto se rompe, los montos quedan mal guardados.
 */
describe("la máscara y el parser hablan el mismo idioma", () => {
  it("1.000 es mil pesos", () => {
    expect(parseAmountLiteral("1.000")).toBe(1000);
    expect(value("1.000")).toBe(1000);
  });

  it("no confunde el punto de mil con una operación", () => {
    expect(looksLikeExpression("1.000")).toBe(false);
    expect(looksLikeExpression("1.000.000")).toBe(false);
  });

  it("lee el decimal con coma", () => {
    expect(parseAmountLiteral("1.000,50")).toBe(1000.5);
    expect(value("1.000,50")).toBe(1000.5);
  });

  it("sobrevive a la ida y vuelta de la máscara", () => {
    const casos: Array<[string, number]> = [
      ["100", 100],
      ["1000", 1000],
      ["10000", 10000],
      ["1234567", 1234567],
      ["1234567,89", 1234567.89],
    ];
    for (const [raw, expected] of casos) {
      expect(value(maskAmountInput(raw))).toBe(expected);
    }
  });

  it("la calculadora sigue funcionando con operadores", () => {
    expect(value("12000/3")).toBe(4000);
    expect(looksLikeExpression("12000/3")).toBe(true);
  });
});
