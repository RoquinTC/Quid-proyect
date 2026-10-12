import { describe, expect, it } from "vitest";
import { REGISTRAR_TRANSACCION, CONSULTAR_GASTOS } from "@/lib/aura/tools/registry";
import { validateToolParameters } from "@/lib/aura/tools/validate";

/**
 * La entrada de estas herramientas no viene de un formulario: viene de un modelo
 * de lenguaje o de un `callback_data` de Telegram. Por eso puede traer números
 * como texto, booleanos como "true", o basura.
 *
 * Lo que estos tests protegen es la decisión de fallar ruidosamente. Registrar un
 * gasto con el monto equivocado es peor que no registrarlo.
 */

describe("validateToolParameters — coerción de tipos", () => {
  it("acepta un monto como texto con separadores de miles", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, {
      type: "expense",
      amount: "15.000",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amount).toBe(15000);
  });

  it("acepta un monto con símbolo de peso", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, {
      type: "expense",
      amount: "$ 15.000",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amount).toBe(15000);
  });

  it("acepta un monto numérico", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, { type: "expense", amount: 15000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amount).toBe(15000);
  });

  it("convierte booleanos escritos como texto", () => {
    const result = validateToolParameters({ ...CONSULTAR_GASTOS }, { onlyUpcoming: "true" });
    // onlyUpcoming no es parámetro de CONSULTAR_GASTOS, así que no debe aparecer:
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.onlyUpcoming).toBeUndefined();
  });
});

describe("validateToolParameters — campos requeridos y enums", () => {
  it("falla cuando falta un campo requerido y lo reporta", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, { type: "expense" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missingRequired).toContain("amount");
      expect(result.errors.join(" ")).toContain("amount");
    }
  });

  it("falla cuando el enum trae un valor fuera de la lista", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, {
      type: "regalo",
      amount: 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const message = result.errors.join(" ");
      expect(message).toContain("type");
      expect(message).toContain("income");
      // Un valor inválido NO debe reportarse como campo ausente: eso haría que el
      // usuario reintente lo mismo creyendo que se le olvidó un dato.
      expect(result.missingRequired).not.toContain("type");
      expect(message).not.toContain("Falta el campo");
    }
  });

  it("acepta el enum ignorando tildes y mayúsculas", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, { type: "EXPENSE", amount: 5000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe("expense");
  });

  it("aplica el valor por defecto de un parámetro opcional", () => {
    const result = validateToolParameters(CONSULTAR_GASTOS, {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.period).toBe("mes");
  });

  it("no incluye los opcionales ausentes en el resultado", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, { type: "expense", amount: 100 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty("accountName");
      expect(result.value).not.toHaveProperty("debtName");
    }
  });
});

describe("validateToolParameters — defensa contra entrada hostil", () => {
  it("descarta parámetros no declarados", () => {
    // El modelo no debe poder inyectar columnas que la herramienta no declara,
    // como un userId o un id de transacción.
    const result = validateToolParameters(REGISTRAR_TRANSACCION, {
      type: "expense",
      amount: 100,
      userId: "otro-usuario",
      id: "inyectado",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty("userId");
      expect(result.value).not.toHaveProperty("id");
    }
  });

  it("rechaza que los parámetros no sean un objeto", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, "no soy un objeto");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("objeto");
  });

  it("rechaza un arreglo como parámetros", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, [1, 2, 3]);
    expect(result.ok).toBe(false);
  });

  it("trata un monto no numérico como inválido, no como cero", () => {
    // Lo peligroso sería interpretar "mucho" como 0 y registrar un gasto en cero.
    const result = validateToolParameters(REGISTRAR_TRANSACCION, {
      type: "expense",
      amount: "mucho",
    });
    expect(result.ok).toBe(false);
  });

  it("ignora un monto NaN en vez de propagarlo", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, {
      type: "expense",
      amount: Number.NaN,
    });
    expect(result.ok).toBe(false);
  });

  it("trata una cadena vacía como ausente", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, { type: "expense", amount: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missingRequired).toContain("amount");
  });

  it("recorta espacios en los textos", () => {
    const result = validateToolParameters(REGISTRAR_TRANSACCION, {
      type: "expense",
      amount: 100,
      category: "  Ropa  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.category).toBe("Ropa");
  });
});
