import { describe, it, expect } from "vitest";
import {
  lineAmount,
  applyTotalDiscount,
  roundMoney,
  sumLineTotals,
  allocateProportionally,
  normalizeDiscountType,
  normalizePercent,
} from "@/lib/pantry/pricing";

describe("roundMoney", () => {
  it("redondea HALF_UP a 2 decimales", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(0.125)).toBe(0.13);
  });

  it("no altera valores ya exactos", () => {
    expect(roundMoney(2500)).toBe(2500);
    expect(roundMoney(19.99)).toBe(19.99);
  });

  it("maneja entradas no finitas devolviendo 0", () => {
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
  });

  it("conserva el signo", () => {
    expect(roundMoney(-1.005)).toBe(-1.01);
  });
});

describe("lineAmount — multiplicación", () => {
  it("multiplica cantidad por precio unitario", () => {
    const r = lineAmount({ quantity: 3, value: 2500, multiplyQuantity: true });
    expect(r.amount).toBe(7500);
    expect(r.total).toBe(7500);
  });

  it("trata el valor como total cuando no multiplica (granel: g, ml)", () => {
    const r = lineAmount({ quantity: 500, value: 12000, multiplyQuantity: false });
    expect(r.amount).toBe(12000);
    expect(r.total).toBe(12000);
  });

  it("redondea el producto de la línea", () => {
    const r = lineAmount({ quantity: 3, value: 0.335, multiplyQuantity: true });
    expect(r.amount).toBe(1.01);
  });

  it("tolera cantidad y valor no finitos", () => {
    expect(lineAmount({ quantity: NaN, value: 100, multiplyQuantity: true }).total).toBe(0);
    expect(lineAmount({ quantity: 2, value: NaN, multiplyQuantity: true }).total).toBe(0);
  });

  it("cantidad cero da línea cero", () => {
    expect(lineAmount({ quantity: 0, value: 2500, multiplyQuantity: true }).total).toBe(0);
  });
});

describe("lineAmount — descuentos", () => {
  it("descuento FIXED resta un monto", () => {
    const r = lineAmount({
      quantity: 1, value: 10000, multiplyQuantity: true,
      discountType: "FIXED", discountValue: 1500,
    });
    expect(r.discount).toBe(1500);
    expect(r.base).toBe(8500);
    expect(r.total).toBe(8500);
  });

  it("descuento PERCENT con fracción", () => {
    const r = lineAmount({
      quantity: 1, value: 100000, multiplyQuantity: true,
      discountType: "PERCENT", discountValue: 0.10,
    });
    expect(r.discount).toBe(10000);
    expect(r.total).toBe(90000);
  });

  it("descuento PERCENT acepta '20' como 20 por ciento", () => {
    const r = lineAmount({
      quantity: 1, value: 50000, multiplyQuantity: true,
      discountType: "PERCENT", discountValue: 20,
    });
    expect(r.discount).toBe(10000);
    expect(r.total).toBe(40000);
  });

  it("un descuento fijo mayor que la línea no produce negativos", () => {
    const r = lineAmount({
      quantity: 1, value: 3000, multiplyQuantity: true,
      discountType: "FIXED", discountValue: 9000,
    });
    expect(r.discount).toBe(3000);
    expect(r.base).toBe(0);
    expect(r.total).toBe(0);
  });

  it("rechaza un porcentaje fuera de rango en vez de recortarlo en silencio", () => {
    const r = lineAmount({
      quantity: 1, value: 8000, multiplyQuantity: true,
      discountType: "PERCENT", discountValue: 500, // 500 %
    });
    expect(r.discountApplied).toBe(false);
    expect(r.discount).toBe(0);
    expect(r.total).toBe(8000);
  });

  it("acepta exactamente 100 % como descuento total de la línea", () => {
    const r = lineAmount({
      quantity: 1, value: 8000, multiplyQuantity: true,
      discountType: "PERCENT", discountValue: 100,
    });
    expect(r.discountApplied).toBe(true);
    expect(r.discount).toBe(8000);
    expect(r.total).toBe(0);
  });

  it("ignora descuentos de tipo desconocido sin romper", () => {
    const r = lineAmount({
      quantity: 1, value: 10000, multiplyQuantity: true,
      discountType: "BOGO" as never, discountValue: 5000,
    });
    expect(r.discountApplied).toBe(false);
    expect(r.total).toBe(10000);
  });

  it("acepta el tipo de descuento en minúsculas", () => {
    const r = lineAmount({
      quantity: 1, value: 10000, multiplyQuantity: true,
      discountType: "percent" as never, discountValue: 0.5,
    });
    expect(r.total).toBe(5000);
  });
});

describe("lineAmount — impuesto", () => {
  it("aplica el impuesto DESPUÉS del descuento, sobre la base descontada", () => {
    const r = lineAmount({
      quantity: 1, value: 100000, multiplyQuantity: true,
      discountType: "PERCENT", discountValue: 0.10,
      taxEnabled: true, taxRate: 0.19,
    });
    // 100000 − 10000 = 90000;  90000 × 0.19 = 17100;  90000 + 17100 = 107100
    expect(r.base).toBe(90000);
    expect(r.tax).toBe(17100);
    expect(r.total).toBe(107100);
  });

  it("no aplica impuesto si el descuento dejó la base en cero", () => {
    const r = lineAmount({
      quantity: 1, value: 5000, multiplyQuantity: true,
      discountType: "FIXED", discountValue: 5000,
      taxEnabled: true, taxRate: 0.19,
    });
    expect(r.base).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.total).toBe(0);
  });

  it("no aplica impuesto si está deshabilitado", () => {
    const r = lineAmount({
      quantity: 1, value: 10000, multiplyQuantity: true,
      taxEnabled: false, taxRate: 0.19,
    });
    expect(r.tax).toBe(0);
    expect(r.total).toBe(10000);
  });

  it("no aplica impuesto con tasa cero o no finita", () => {
    expect(lineAmount({
      quantity: 1, value: 10000, multiplyQuantity: true,
      taxEnabled: true, taxRate: 0,
    }).tax).toBe(0);
    expect(lineAmount({
      quantity: 1, value: 10000, multiplyQuantity: true,
      taxEnabled: true, taxRate: NaN,
    }).tax).toBe(0);
  });
});

describe("applyTotalDiscount — descuento total por tienda", () => {
  it("descuento porcentual sobre el subtotal", () => {
    const r = applyTotalDiscount(150000, { type: "PERCENT", value: 0.20 });
    expect(r.discount).toBe(30000);
    expect(r.total).toBe(120000);
  });

  it("descuento fijo sobre el subtotal", () => {
    const r = applyTotalDiscount(150000, { type: "FIXED", value: 5000 });
    expect(r.discount).toBe(5000);
    expect(r.total).toBe(145000);
  });

  it("un descuento mayor que el subtotal deja el total en 0, nunca negativo", () => {
    const r = applyTotalDiscount(3000, { type: "FIXED", value: 9000 });
    expect(r.discount).toBe(3000);
    expect(r.total).toBe(0);
  });

  it("sin descuento devuelve el subtotal intacto", () => {
    expect(applyTotalDiscount(150000, null).total).toBe(150000);
    expect(applyTotalDiscount(150000, undefined).total).toBe(150000);
    expect(applyTotalDiscount(150000, { type: "FIXED", value: 0 }).total).toBe(150000);
  });

  it("el desglose por tienda es independiente: cada confirmación lleva el suyo", () => {
    // Compra dividida: tienda A con 20 % y tienda B sin descuento.
    const a = applyTotalDiscount(100000, { type: "PERCENT", value: 0.20 });
    const b = applyTotalDiscount(60000, { type: "FIXED", value: 0 });
    expect(a.total).toBe(80000);
    expect(b.total).toBe(60000);
    expect(a.total + b.total).toBe(140000);
  });
});

describe("sumLineTotals", () => {
  it("suma los totales de línea", () => {
    const lines = [
      lineAmount({ quantity: 2, value: 1500, multiplyQuantity: true }),
      lineAmount({ quantity: 1, value: 8000, multiplyQuantity: true }),
    ];
    expect(sumLineTotals(lines)).toBe(11000);
  });

  it("suma vacía da 0", () => {
    expect(sumLineTotals([])).toBe(0);
  });
});

describe("allocateProportionally", () => {
  it("reparte proporcionalmente", () => {
    expect(allocateProportionally(100, [1, 1])).toEqual([50, 50]);
    expect(allocateProportionally(300, [1, 2])).toEqual([100, 200]);
  });

  it("la suma de las partes es exactamente el total (método del resto mayor)", () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
  });

  it("no pierde ni gana centavos con pesos incómodos", () => {
    const parts = allocateProportionally(0.05, [1, 1, 1]);
    expect(Math.round(parts.reduce((a, b) => a + b, 0) * 100)).toBe(5);
  });

  it("pesos en cero reparten cero", () => {
    expect(allocateProportionally(100, [0, 0])).toEqual([0, 0]);
    expect(allocateProportionally(100, [])).toEqual([]);
  });

  it("total cero reparte cero", () => {
    expect(allocateProportionally(0, [1, 2])).toEqual([0, 0]);
  });

  it("ignora pesos negativos o no finitos", () => {
    expect(allocateProportionally(100, [-5, 1, NaN])).toEqual([0, 100, 0]);
  });
});

describe("normalizeDiscountType", () => {
  it("reconoce las variantes de texto", () => {
    expect(normalizeDiscountType("FIXED")).toBe("FIXED");
    expect(normalizeDiscountType("fixed")).toBe("FIXED");
    expect(normalizeDiscountType("PERCENT")).toBe("PERCENT");
    expect(normalizeDiscountType("percent")).toBe("PERCENT");
    expect(normalizeDiscountType("percentage")).toBe("PERCENT");
  });

  it("rechaza lo que no reconoce", () => {
    expect(normalizeDiscountType("BOGO")).toBeUndefined();
    expect(normalizeDiscountType(null)).toBeUndefined();
    expect(normalizeDiscountType(1)).toBeUndefined();
  });
});

describe("normalizePercent", () => {
  it("acepta fracción y por ciento", () => {
    expect(normalizePercent(0.19)).toBe(0.19);
    expect(normalizePercent(19)).toBe(0.19);
    expect(normalizePercent(100)).toBe(1);
    expect(normalizePercent(1)).toBe(1);
  });

  it("rechaza fuera de rango y no numéricos", () => {
    expect(normalizePercent(101)).toBeUndefined();
    expect(normalizePercent(-1)).toBeUndefined();
    expect(normalizePercent(NaN)).toBeUndefined();
    expect(normalizePercent("20")).toBeUndefined();
    expect(normalizePercent(null)).toBeUndefined();
  });

  it("acepta cero", () => {
    expect(normalizePercent(0)).toBe(0);
  });
});

describe("casos combinados reales", () => {
  it("lista de mercado de 3 líneas con descuento total por tienda", () => {
    const lines = [
      lineAmount({ quantity: 2, value: 4500, multiplyQuantity: true }),  // 9000
      lineAmount({ quantity: 1, value: 12000, multiplyQuantity: true }), // 12000
      lineAmount({ quantity: 500, value: 8000, multiplyQuantity: false }), // 8000 granel
    ];
    const subtotal = sumLineTotals(lines);
    expect(subtotal).toBe(29000);

    const { total } = applyTotalDiscount(subtotal, { type: "PERCENT", value: 0.10 });
    expect(total).toBe(26100);
  });

  it("atún: precio se actualiza entre compras (el motor no memoriza, solo calcula)", () => {
    const antes = lineAmount({ quantity: 1, value: 2000, multiplyQuantity: true });
    const despues = lineAmount({ quantity: 1, value: 2500, multiplyQuantity: true });
    expect(antes.total).toBe(2000);
    expect(despues.total).toBe(2500);
  });
});
