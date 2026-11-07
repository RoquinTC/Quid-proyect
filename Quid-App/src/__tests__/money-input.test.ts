import { describe, it, expect } from "vitest";
import { maskAmountInput, cleanAmountInput } from "@/lib/format/money-input";

describe("maskAmountInput", () => {
  it("deja los números cortos tal cual", () => {
    expect(maskAmountInput("1")).toBe("1");
    expect(maskAmountInput("100")).toBe("100");
  });

  it("pone el punto de mil al llegar a cuatro dígitos", () => {
    expect(maskAmountInput("1000")).toBe("1.000");
    expect(maskAmountInput("10000")).toBe("10.000");
    expect(maskAmountInput("100000")).toBe("100.000");
    expect(maskAmountInput("1000000")).toBe("1.000.000");
  });

  it("reconoce la coma como decimal", () => {
    expect(maskAmountInput("1000,5")).toBe("1.000,5");
    expect(maskAmountInput("1000,50")).toBe("1.000,50");
    expect(maskAmountInput("1234567,89")).toBe("1.234.567,89");
  });

  it("conserva la coma recién escrita", () => {
    expect(maskAmountInput("1000,")).toBe("1.000,");
  });

  it("no permite más de dos decimales", () => {
    expect(maskAmountInput("1000,555")).toBe("1.000,55");
  });

  it("descarta una segunda coma", () => {
    expect(maskAmountInput("1000,5,5")).toBe("1.000,55");
  });

  it("ignora letras y símbolos", () => {
    expect(maskAmountInput("$ 1a0b000")).toBe("10.000");
    expect(maskAmountInput("abc")).toBe("");
  });

  it("recorta ceros a la izquierda", () => {
    expect(maskAmountInput("007")).toBe("7");
    expect(maskAmountInput("0,5")).toBe("0,5");
  });

  it("no lanza con vacío", () => {
    expect(maskAmountInput("")).toBe("");
  });
});

describe("cleanAmountInput", () => {
  it("deja solo dígitos y una coma", () => {
    expect(cleanAmountInput("1.234,56")).toBe("1234,56");
    expect(cleanAmountInput("$1.000")).toBe("1000");
  });
});
