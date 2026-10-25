import { describe, it, expect } from "vitest";
import { lineTotal, needsConversion, hasDiscount } from "@/lib/pantry/line-total";

describe("lineTotal — el precio deja de irse exagerado", () => {
  it("250 g a 38.000/kg son 9.500, no 9.500.000", () => {
    // El bug real: la línea multiplicaba precio × gramos.
    const total = lineTotal({
      quantity: 250,
      price: 38000,
      unit: "g",
      priceUnitId: "kg",
      multiplyQuantity: true,
    });
    expect(total).toBe(9500);
  });

  it("1 lb a 11.000/kg son 4.990", () => {
    // 0,45359237 × 11.000 = 4.989,52 → 4.989,52 redondeado a 2 decimales
    const total = lineTotal({
      quantity: 1,
      price: 11000,
      unit: "lb",
      priceUnitId: "kg",
    });
    expect(total).toBe(4989.52);
  });

  it("1 kg a 1.100/kg sigue siendo 1.100 (sin regresión)", () => {
    expect(
      lineTotal({ quantity: 1, price: 1100, unit: "kg", priceUnitId: "kg" })
    ).toBe(1100);
  });

  it("sin unidad de precio multiplica normal", () => {
    expect(lineTotal({ quantity: 3, price: 2500, unit: "unit" })).toBe(7500);
  });

  it("750 ml a 6.000/L son 4.500", () => {
    expect(
      lineTotal({ quantity: 750, price: 6000, unit: "ml", priceUnitId: "l" })
    ).toBe(4500);
  });

  it("precio nulo o cero da 0 sin romper", () => {
    expect(lineTotal({ quantity: 5, price: null, unit: "g" })).toBe(0);
    expect(lineTotal({ quantity: 5, price: 0, unit: "g" })).toBe(0);
    expect(lineTotal({ quantity: 5, price: NaN, unit: "g" })).toBe(0);
  });

  it("con unidad de precio explícita, el precio es unitario y manda sobre multiplyQuantity", () => {
    // Si la tienda cobra por kg, el precio SIEMPRE es por kg: no puede a la vez
    // ser "el total de la línea". Por eso `multiplyQuantity: false` se ignora
    // cuando hay unidad de precio — 9.500/kg por 0,25 kg son 2.375.
    expect(
      lineTotal({
        quantity: 250,
        price: 9500,
        unit: "g",
        priceUnitId: "kg",
        multiplyQuantity: false,
      })
    ).toBe(2375);
  });

  it("sin unidad de precio, multiplyQuantity false sí significa 'esto es el total'", () => {
    expect(
      lineTotal({ quantity: 250, price: 9500, unit: "g", multiplyQuantity: false })
    ).toBe(9500);
  });

  it("needsConversion distingue los casos", () => {
    expect(needsConversion({ quantity: 1, price: 1, unit: "g", priceUnitId: "kg" })).toBe(true);
    expect(needsConversion({ quantity: 1, price: 1, unit: "kg", priceUnitId: "kg" })).toBe(false);
    expect(needsConversion({ quantity: 1, price: 1, unit: "kg" })).toBe(false);
  });
});

describe("lineTotal — descuentos de línea", () => {
  it("descuento porcentual sobre el importe convertido", () => {
    // 250 g a 38.000/kg = 9.500; 10 % de descuento → 8.550
    expect(
      lineTotal({ quantity: 250, price: 38000, unit: "g", priceUnitId: "kg", discountType: "PERCENT", discountValue: 0.1 })
    ).toBe(8550);
  });

  it("descuento fijo resta del importe", () => {
    expect(
      lineTotal({ quantity: 2, price: 5000, unit: "unit", discountType: "FIXED", discountValue: 1500 })
    ).toBe(8500);
  });

  it("sin descuento el total no cambia", () => {
    expect(lineTotal({ quantity: 2, price: 5000, unit: "unit" })).toBe(10000);
  });

  it("hasDiscount distingue los casos", () => {
    expect(hasDiscount({ quantity: 1, price: 100, unit: "unit", discountType: "FIXED", discountValue: 10 })).toBe(true);
    expect(hasDiscount({ quantity: 1, price: 100, unit: "unit", discountValue: 0 })).toBe(false);
  });
});
