import { describe, it, expect } from "vitest";
import {
  parseCapture,
  extractAmount,
  detectType,
  extractMerchant,
  extractDate,
} from "@/lib/inbox/parse";

const REF = new Date(2026, 10, 5); // 5 de noviembre de 2026

describe("extractAmount", () => {
  it("lee montos con símbolo de pesos", () => {
    expect(extractAmount("Compra por $45.900 en EXITO")).toBe(45900);
    expect(extractAmount("Pago COP 1.234.567")).toBe(1234567);
    expect(extractAmount("$ 89.900,50")).toBe(89900.5);
  });

  it("lee montos sin símbolo cuando son claramente dinero", () => {
    expect(extractAmount("Compraste 45.900 en Exito")).toBe(45900);
    expect(extractAmount("retiro por 200000")).toBe(200000);
  });

  it("elige el mayor cuando hay varios números", () => {
    // 04/11 es fecha, 1 es cuota, 3 es cuenta: el monto es 45.900
    expect(extractAmount("04/11 compra $45.900 cuota 1 de 3")).toBe(45900);
  });

  it("devuelve null si no hay monto y no inventa", () => {
    expect(extractAmount("Hola, ¿cómo estás?")).toBeNull();
    expect(extractAmount("")).toBeNull();
    expect(extractAmount("cuota 3 de 12")).toBeNull();
  });

  it("descarta montos absurdos", () => {
    expect(extractAmount("$0")).toBeNull();
    expect(extractAmount("$999999999999999")).toBeNull();
  });
});

describe("detectType", () => {
  it("reconoce dinero que entra", () => {
    expect(detectType("Recibiste una transferencia por $200.000").type).toBe("income");
    expect(detectType("Abono a tu cuenta").type).toBe("income");
    expect(detectType("Te llegó un pago").type).toBe("income");
  });

  it("reconoce dinero que sale", () => {
    expect(detectType("Compra en EXITO por $45.900").type).toBe("expense");
    expect(detectType("Pago de factura").type).toBe("expense");
  });

  it("por defecto asume gasto y lo marca como no explícito", () => {
    const r = detectType("Movimiento $45.900");
    expect(r.type).toBe("expense");
    expect(r.explicit).toBe(false);
  });

  it("ignora tildes y mayúsculas", () => {
    expect(detectType("RECIBISTE UN PAGO").type).toBe("income");
    expect(detectType("consignación").type).toBe("income");
  });
});

describe("extractMerchant", () => {
  it("saca el comercio después de 'en'", () => {
    expect(extractMerchant("Compra por $45.900 en EXITO PRADO")).toBe("EXITO PRADO");
    expect(extractMerchant("Pago en Netflix.com")).toBe("Netflix.com");
  });

  it("acepta la forma 'comercio:'", () => {
    expect(extractMerchant("Comercio: RAPPI")).toBe("RAPPI");
  });

  it("rechaza frases que no son un comercio", () => {
    // Casos reales de SMS: una oración no es el nombre de un negocio.
    expect(extractMerchant("Full Equipo tienes plan celular ilimitado")).toBeNull();
    expect(extractMerchant("en cajero automatico es 276000")).toBeNull();
    expect(extractMerchant("Compra en tu tienda de siempre por 10000")).toBeNull();
  });

  it("acepta comercios de una o dos palabras en mayusculas", () => {
    expect(extractMerchant("pago en RAPPI")).toBe("RAPPI");
    expect(extractMerchant("compra en D1 SANTAFE")).toBe("D1 SANTAFE");
  });
  it("devuelve null si no hay comercio", () => {
    expect(extractMerchant("Cargo por $10.000")).toBeNull();
  });
});

describe("extractDate", () => {
  it("lee dd/mm y completa el año de referencia", () => {
    expect(extractDate("compra 04/11", REF)).toBe("2026-11-04");
    expect(extractDate("04/11/2025", REF)).toBe("2025-11-04");
  });

  it("lee ISO", () => {
    expect(extractDate("2026-11-04 13:22", REF)).toBe("2026-11-04");
  });

  it("devuelve null si no hay fecha válida", () => {
    expect(extractDate("sin fecha", REF)).toBeNull();
    expect(extractDate("32/13", REF)).toBeNull();
  });
});

describe("parseCapture", () => {
  it("lee un SMS bancario típico completo", () => {
    const sms =
      "Bancolombia: Compraste $45.900 en EXITO PRADO con tu T.Debito *1234. 04/11 13:22";
    const r = parseCapture(sms, REF);

    expect(r.amount).toBe(45900);
    expect(r.type).toBe("expense");
    expect(r.merchant).toBe("EXITO PRADO");
    expect(r.date).toBe("2026-11-04");
    expect(r.confidence).toBe(1);
    expect(r.signals).toEqual({ amount: true, type: true, merchant: true, date: true });
  });

  it("detecta un ingreso", () => {
    const r = parseCapture("Recibiste una transferencia por $200.000 de JUAN PEREZ", REF);
    expect(r.type).toBe("income");
    expect(r.amount).toBe(200000);
  });

  it("con texto pobre deja el monto en null y baja la confianza", () => {
    const r = parseCapture("me debes lo del almuerzo", REF);
    expect(r.amount).toBeNull();
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("nunca lanza con entradas raras", () => {
    expect(() => parseCapture("")).not.toThrow();
    expect(() => parseCapture("   ")).not.toThrow();
    expect(() => parseCapture("$$$ ,,, ...")).not.toThrow();
  });

  it("prefiere el monto con símbolo sobre números sueltos mayores", () => {
    const r = parseCapture("Compra $45.900, referencia 999999", REF);
    expect(r.amount).toBe(45900);
  });
});
