import { describe, it, expect } from "vitest";
import {
  evaluateExpression,
  parseAmountLiteral,
  looksLikeExpression,
} from "@/lib/parse/expression";

describe("parseAmountLiteral", () => {
  it("lee enteros simples", () => {
    expect(parseAmountLiteral("12000")).toBe(12000);
    expect(parseAmountLiteral("0")).toBe(0);
  });

  it("interpreta el punto como separador de miles (convención COP)", () => {
    expect(parseAmountLiteral("12.000")).toBe(12000);
    expect(parseAmountLiteral("1.234.567")).toBe(1234567);
  });

  it("interpreta la coma como decimal", () => {
    expect(parseAmountLiteral("12,50")).toBe(12.5);
    expect(parseAmountLiteral("12.000,50")).toBe(12000.5);
  });

  it("mantiene el punto decimal cuando no son 3 dígitos", () => {
    expect(parseAmountLiteral("12.5")).toBe(12.5);
    expect(parseAmountLiteral("0.99")).toBe(0.99);
  });

  it("admite negativos", () => {
    expect(parseAmountLiteral("-5000")).toBe(-5000);
  });

  it("rechaza basura", () => {
    expect(Number.isNaN(parseAmountLiteral("abc"))).toBe(true);
    expect(Number.isNaN(parseAmountLiteral(""))).toBe(true);
    expect(Number.isNaN(parseAmountLiteral("12..34"))).toBe(true);
  });
});

describe("looksLikeExpression", () => {
  it("detecta operadores", () => {
    expect(looksLikeExpression("12000/3")).toBe(true);
    expect(looksLikeExpression("2500+1800")).toBe(true);
    expect(looksLikeExpression("(1200+800)*2")).toBe(true);
  });

  it("no confunde un negativo con una expresión", () => {
    expect(looksLikeExpression("-5000")).toBe(false);
  });

  it("no marca números planos", () => {
    expect(looksLikeExpression("12000")).toBe(false);
    expect(looksLikeExpression("12.000")).toBe(false);
    expect(looksLikeExpression("")).toBe(false);
  });
});

describe("evaluateExpression", () => {
  it("devuelve números planos sin marcarlos como expresión", () => {
    const r = evaluateExpression("12.000");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(12000);
      expect(r.isExpression).toBe(false);
    }
  });

  it("divide una cuenta entre varios", () => {
    const r = evaluateExpression("120000/3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(40000);
  });

  it("respeta la precedencia", () => {
    const a = evaluateExpression("2500+1800*2");
    expect(a.ok && a.value).toBe(6100);

    const b = evaluateExpression("(2500+1800)*2");
    expect(b.ok && b.value).toBe(8600);
  });

  it("soporta resta y negativos", () => {
    const a = evaluateExpression("5000-2000");
    expect(a.ok && a.value).toBe(3000);

    const b = evaluateExpression("-5000+1000");
    expect(b.ok && b.value).toBe(-4000);
  });

  it("redondea a 2 decimales", () => {
    const r = evaluateExpression("100/3");
    expect(r.ok && r.value).toBe(33.33);
  });

  it("marca división por cero como error", () => {
    const r = evaluateExpression("100/0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cero/i);
  });

  it("detecta paréntesis sin cerrar", () => {
    const r = evaluateExpression("(1200+800");
    expect(r.ok).toBe(false);
  });

  it("detecta operador colgando", () => {
    const r = evaluateExpression("1200+");
    expect(r.ok).toBe(false);
  });

  it("rechaza letras", () => {
    const r = evaluateExpression("1200+abc");
    expect(r.ok).toBe(false);
  });

  it("rechaza entrada vacía", () => {
    const r = evaluateExpression("   ");
    expect(r.ok).toBe(false);
  });

  it("no ejecuta código arbitrario", () => {
    const r = evaluateExpression("alert(1)");
    expect(r.ok).toBe(false);
  });
});
