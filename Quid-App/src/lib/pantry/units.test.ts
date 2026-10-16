import { describe, it, expect } from "vitest";
import {
  UNITS,
  findUnit,
  isKnownUnit,
  unitDimension,
  defaultMultiplyQuantity,
  areUnitsCompatible,
  convertQuantity,
  roundQuantity,
  unitLabel,
  resolveLinePrice,
  FALLBACK_UNIT_CODE,
} from "@/lib/pantry/units";

describe("catálogo de unidades", () => {
  it("no tiene códigos duplicados", () => {
    const codes = UNITS.map((u) => u.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("todos los códigos están en minúsculas sin espacios", () => {
    for (const unit of UNITS) {
      expect(unit.code).toBe(unit.code.toLowerCase());
      expect(unit.code).not.toMatch(/\s/);
    }
  });

  it("cada dimensión conocida tiene factor positivo", () => {
    for (const unit of UNITS) {
      expect(unit.factorToBase).toBeGreaterThan(0);
    }
  });

  it("la unidad de respaldo existe en el catálogo y multiplica", () => {
    const fallback = findUnit(FALLBACK_UNIT_CODE);
    expect(fallback).toBeDefined();
    expect(fallback!.defaultMultiplyQuantity).toBe(true);
  });
});

describe("findUnit", () => {
  it("encuentra unidades conocidas sin distinguir mayúsculas", () => {
    expect(findUnit("kg")?.code).toBe("kg");
    expect(findUnit("KG")?.code).toBe("kg");
    expect(findUnit(" Kg ")?.code).toBe("kg");
  });

  it("devuelve undefined para desconocidas o vacías", () => {
    expect(findUnit("cucharada")).toBeUndefined();
    expect(findUnit("")).toBeUndefined();
    expect(findUnit(null)).toBeUndefined();
    expect(findUnit(undefined)).toBeUndefined();
  });

  it("isKnownUnit refleja lo mismo", () => {
    expect(isKnownUnit("g")).toBe(true);
    expect(isKnownUnit("cucharada")).toBe(false);
  });
});

describe("defaultMultiplyQuantity — la regla de SoftList", () => {
  it("NO multiplica para gramos y mililitros", () => {
    expect(defaultMultiplyQuantity("g")).toBe(false);
    expect(defaultMultiplyQuantity("ml")).toBe(false);
  });

  it("SÍ multiplica para el resto", () => {
    expect(defaultMultiplyQuantity("kg")).toBe(true);
    expect(defaultMultiplyQuantity("unit")).toBe(true);
    expect(defaultMultiplyQuantity("bottle")).toBe(true);
    expect(defaultMultiplyQuantity("lb")).toBe(true);
  });

  it("unidades desconocidas multiplican (criterio de SoftList)", () => {
    expect(defaultMultiplyQuantity("cucharada")).toBe(true);
    expect(defaultMultiplyQuantity(null)).toBe(true);
  });
});

describe("unitDimension", () => {
  it("clasifica masa, volumen y conteo", () => {
    expect(unitDimension("kg")).toBe("mass");
    expect(unitDimension("lb")).toBe("mass");
    expect(unitDimension("l")).toBe("volume");
    expect(unitDimension("ml")).toBe("volume");
    expect(unitDimension("unit")).toBe("count");
  });

  it("desconocidas son unknown", () => {
    expect(unitDimension("cucharada")).toBe("unknown");
  });
});

describe("areUnitsCompatible", () => {
  it("misma dimensión es compatible", () => {
    expect(areUnitsCompatible("g", "kg")).toBe(true);
    expect(areUnitsCompatible("ml", "l")).toBe(true);
    expect(areUnitsCompatible("lb", "oz")).toBe(true);
  });

  it("dimensiones distintas no lo son", () => {
    expect(areUnitsCompatible("kg", "l")).toBe(false);
    expect(areUnitsCompatible("unit", "kg")).toBe(false);
  });

  it("con una desconocida no se puede afirmar compatibilidad", () => {
    expect(areUnitsCompatible("cucharada", "kg")).toBe(false);
    expect(areUnitsCompatible("kg", "cucharada")).toBe(false);
  });
});

describe("convertQuantity", () => {
  it("convierte g → kg (el caso 'escribo en gramos, precio por kilo')", () => {
    const r = convertQuantity(500, "g", "kg");
    expect(r.converted).toBe(true);
    expect(r.quantity).toBeCloseTo(0.5, 10);
  });

  it("convierte kg → g", () => {
    const r = convertQuantity(1.5, "kg", "g");
    expect(r.converted).toBe(true);
    expect(r.quantity).toBeCloseTo(1500, 10);
  });

  it("convierte ml → l", () => {
    expect(convertQuantity(250, "ml", "l").quantity).toBeCloseTo(0.25, 10);
  });

  it("convierte libras a kilos", () => {
    expect(convertQuantity(1, "lb", "kg").quantity).toBeCloseTo(0.45359237, 8);
  });

  it("misma unidad devuelve la cantidad intacta", () => {
    const r = convertQuantity(3, "kg", "kg");
    expect(r.quantity).toBe(3);
    expect(r.converted).toBe(true);
  });

  it("unidades incompatibles NO lanzan: devuelven la cantidad y converted false", () => {
    const r = convertQuantity(2, "kg", "unit");
    expect(r.quantity).toBe(2);
    expect(r.converted).toBe(false);
  });

  it("unidad desconocida devuelve la cantidad y converted false", () => {
    expect(convertQuantity(2, "kg", "cucharada").converted).toBe(false);
    expect(convertQuantity(2, "cucharada", "kg").converted).toBe(false);
  });

  it("usa unitWeightFactor cuando la unidad destino es desconocida", () => {
    const r = convertQuantity(2, "kg", "bulto", 0.02);
    expect(r.converted).toBe(true);
    expect(r.quantity).toBeCloseTo(0.04, 10);
  });

  it("ignora un unitWeightFactor no positivo", () => {
    expect(convertQuantity(2, "kg", "bulto", 0).converted).toBe(false);
    expect(convertQuantity(2, "kg", "bulto", -1).converted).toBe(false);
  });

  it("unidades vacías devuelven la cantidad intacta", () => {
    const r = convertQuantity(5, null, null);
    expect(r.quantity).toBe(5);
    expect(r.converted).toBe(true);
  });

  it("cantidad no finita devuelve 0 sin romper", () => {
    expect(convertQuantity(NaN, "g", "kg")).toEqual({ quantity: 0, converted: false });
    expect(convertQuantity(Infinity, "g", "kg")).toEqual({ quantity: 0, converted: false });
  });
});

describe("roundQuantity", () => {
  it("redondea a 3 decimales (las cantidades no son dinero)", () => {
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
    expect(roundQuantity(1.23456)).toBe(1.235);
    expect(roundQuantity(1 / 3)).toBe(0.333);
  });

  it("no altera enteros", () => {
    expect(roundQuantity(7)).toBe(7);
  });
});

describe("unitLabel", () => {
  it("usa singular con cantidad 1 y plural en el resto", () => {
    expect(unitLabel("bottle", 1)).toBe("botella");
    expect(unitLabel("bottle", 2)).toBe("botellas");
  });

  it("sin cantidad usa el singular", () => {
    expect(unitLabel("bottle")).toBe("botella");
  });

  it("unidades de símbolo no cambian con la cantidad", () => {
    expect(unitLabel("kg", 1)).toBe("kg");
    expect(unitLabel("kg", 5)).toBe("kg");
  });

  it("unidad desconocida devuelve el código tal cual", () => {
    expect(unitLabel("cucharada", 2)).toBe("cucharada");
    expect(unitLabel(null)).toBe("");
  });
});

describe("resolveLinePrice — tienda cobra por kg, compro en g o lb", () => {
  it("400 g a 12.000/kg → 4.800", () => {
    const r = resolveLinePrice({
      quantity: 400,
      value: 12000,
      unit: "g",
      priceUnitCode: "kg",
    });
    expect(r.converted).toBe(true);
    expect(r.multiplied).toBe(true);
    expect(r.quantityInPriceUnit).toBeCloseTo(0.4, 10);
    expect(r.total).toBe(4800);
  });

  it("1 lb a 12.000/kg → 5.443,11", () => {
    const r = resolveLinePrice({
      quantity: 1,
      value: 12000,
      unit: "lb",
      priceUnitCode: "kg",
    });
    // La cantidad mostrada se redondea a 3 decimales, pero el precio se calcula
    // con el valor completo (0,45359237), no con el redondeado.
    expect(r.quantityInPriceUnit).toBe(0.454);
    expect(r.total).toBe(5443.11);
  });

  it("2 kg a 12.000/kg → 24.000 sin conversión real", () => {
    const r = resolveLinePrice({
      quantity: 2,
      value: 12000,
      unit: "kg",
      priceUnitCode: "kg",
    });
    expect(r.multiplied).toBe(true);
    expect(r.total).toBe(24000);
  });

  it("250 g a 8.000/kg → 2.000", () => {
    expect(resolveLinePrice({
      quantity: 250, value: 8000, unit: "g", priceUnitCode: "kg",
    }).total).toBe(2000);
  });

  it("conversión inversa: 1 kg con precio por libra", () => {
    // 1 kg = 2,20462262 lb  ×  5.000/lb  =  11.023,11
    const r = resolveLinePrice({
      quantity: 1,
      value: 5000,
      unit: "kg",
      priceUnitCode: "lb",
    });
    expect(r.quantityInPriceUnit).toBe(2.205);
    expect(r.total).toBe(11023.11);
  });

  it("ml con precio por litro", () => {
    expect(resolveLinePrice({
      quantity: 750, value: 6000, unit: "ml", priceUnitCode: "l",
    }).total).toBe(4500);
  });

  it("sin unidad de precio equivale a la misma unidad", () => {
    const r = resolveLinePrice({ quantity: 3, value: 2500, unit: "unit" });
    expect(r.converted).toBe(false);
    expect(r.total).toBe(7500);
  });

  it("unidades incompatibles: el valor capturado pasa a ser el total de la línea", () => {
    // La tienda cobra por kg pero compré "unidad": no se inventa conversión,
    // y multiplicar por una cantidad no convertible daría un precio falso.
    const r = resolveLinePrice({
      quantity: 2, value: 15000, unit: "unit", priceUnitCode: "kg",
      multiplyQuantity: true,
    });
    expect(r.converted).toBe(false);
    expect(r.multiplied).toBe(false);
    expect(r.total).toBe(15000);
  });

  it("multiplyQuantity false (granel ya pesado): el valor ES el total, sin conversión", () => {
    // Caso legítimo de granel: ya pesaste y el ticket dice el total, así que no
    // hay unidad de precio que convertir.
    const r = resolveLinePrice({
      quantity: 400, value: 4800, unit: "g",
      multiplyQuantity: false,
    });
    expect(r.multiplied).toBe(false);
    expect(r.total).toBe(4800);
  });

  it("el override explícito manda sobre el default de la unidad", () => {
    // Por defecto 'g' no multiplica; forzándolo, sí.
    const r = resolveLinePrice({
      quantity: 400, value: 12000, unit: "g", priceUnitCode: "kg",
      multiplyQuantity: true,
    });
    expect(r.multiplied).toBe(true);
    expect(r.total).toBe(4800);
  });

  it("con unidad de precio distinta, el default de g/ml NO impide el cálculo real", () => {
    // 400 g a 12.000/kg debe dar 4.800 aunque 'g' no multiplique por defecto:
    // con unidad de precio explícita el precio es intrínsecamente unitario.
    const r = resolveLinePrice({
      quantity: 400, value: 12000, unit: "g", priceUnitCode: "kg",
    });
    expect(r.multiplied).toBe(true);
    expect(r.total).toBe(4800);
  });

  it("sin unidad de precio distinta, manda el default de la unidad", () => {
    // 'g' por defecto NO multiplica ⇒ el valor es el total de la línea.
    const g = resolveLinePrice({ quantity: 400, value: 4800, unit: "g" });
    expect(g.multiplied).toBe(false);
    expect(g.total).toBe(4800);

    // 'kg' por defecto SÍ multiplica.
    const kg = resolveLinePrice({ quantity: 2, value: 12000, unit: "kg" });
    expect(kg.multiplied).toBe(true);
    expect(kg.total).toBe(24000);
  });

  it("usa unitWeightFactor con unidad de precio desconocida", () => {
    const r = resolveLinePrice({
      quantity: 2, value: 100, unit: "kg", priceUnitCode: "bulto",
      unitWeightFactor: 0.02,
    });
    expect(r.converted).toBe(true);
    expect(r.total).toBe(4);
  });

  it("cantidades y valores no finitos no producen NaN", () => {
    expect(resolveLinePrice({
      quantity: NaN, value: 1000, unit: "kg", priceUnitCode: "g",
    }).total).toBe(0);
    expect(resolveLinePrice({
      quantity: 2, value: NaN, unit: "kg", priceUnitCode: "g",
    }).total).toBe(0);
  });

  it("cantidad cero da total cero", () => {
    expect(resolveLinePrice({
      quantity: 0, value: 12000, unit: "g", priceUnitCode: "kg",
      multiplyQuantity: true,
    }).total).toBe(0);
  });
});
