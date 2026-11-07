import { describe, it, expect, afterAll } from "vitest";
import { formatCurrency } from "@/lib/api";
import { setShowDecimals, getShowDecimals } from "@/lib/preferences";

/**
 * F-51 · La preferencia de decimales afecta a TODOS los importes de la app,
 * porque `formatCurrency` la lee de un módulo compartido.
 */
describe("formatCurrency con preferencia de decimales", () => {
  afterAll(() => setShowDecimals(true));

  it("muestra centavos por defecto", () => {
    setShowDecimals(true);
    expect(getShowDecimals()).toBe(true);
    expect(formatCurrency(5843278.81)).toContain(",81");
  });

  it("los oculta cuando la preferencia está apagada", () => {
    setShowDecimals(false);
    const texto = formatCurrency(5843278.81);
    expect(texto).not.toContain(",81");
    expect(texto).toContain("5.843.279");
  });

  it("redondea al peso entero y no inventa centavos", () => {
    setShowDecimals(false);
    expect(formatCurrency(45900.4)).not.toContain(",4");
    expect(formatCurrency(45900.6)).toContain("45.901");
  });

  it("sigue funcionando con valores inválidos", () => {
    setShowDecimals(false);
    expect(formatCurrency(null)).toBeTruthy();
    expect(formatCurrency("no-numero")).toBeTruthy();
  });
});
