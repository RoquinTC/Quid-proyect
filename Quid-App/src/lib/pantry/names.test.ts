import { describe, it, expect } from "vitest";
import {
  normalizeName,
  searchKey,
  isSameName,
  matchExistingProduct,
} from "@/lib/pantry/names";

describe("normalizeName", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(normalizeName("Café")).toBe("cafe");
    expect(normalizeName("AGUACATE")).toBe("aguacate");
    expect(normalizeName("Jamón")).toBe("jamon");
  });

  it("quita todos los espacios", () => {
    expect(normalizeName("Leche Entera")).toBe("lecheentera");
    expect(normalizeName("  Leche   Entera  ")).toBe("lecheentera");
    expect(normalizeName("Leche\tEntera\n")).toBe("lecheentera");
  });

  it("'Leche' y 'leche' colapsan a la misma clave (el bug de SoftList, corregido)", () => {
    expect(normalizeName("Leche")).toBe(normalizeName("leche"));
    expect(normalizeName("LECHE ENTERA 1L")).toBe("lecheentera1l");
  });

  it("trata la eñe de forma estable", () => {
    // NFD descompone "ñ" en "n" + tilde, que se elimina.
    expect(normalizeName("Piña")).toBe("pina");
    expect(normalizeName("Pina")).toBe("pina");
  });

  it("devuelve cadena vacía para entradas vacías", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName(null)).toBe("");
    expect(normalizeName(undefined)).toBe("");
  });

  it("si tras normalizar queda vacío, devuelve el original recortado", () => {
    expect(normalizeName("...")).toBe("...");
  });

  it("es idempotente", () => {
    const once = normalizeName("Café Molido 500g");
    expect(normalizeName(once)).toBe(once);
  });
});

describe("searchKey", () => {
  it("colapsa puntuación además de acentos y espacios", () => {
    expect(searchKey("Leche en polvo, 1kg")).toBe("lecheenpolvo1kg");
    expect(searchKey("Café-Molido")).toBe("cafemolido");
    expect(searchKey("Arroz (1 lb)")).toBe("arroz1lb");
  });

  it("coincide con normalizeName cuando no hay puntuación", () => {
    expect(searchKey("Leche Entera")).toBe(normalizeName("Leche Entera"));
  });

  it("devuelve vacío para entradas vacías", () => {
    expect(searchKey("")).toBe("");
    expect(searchKey(null)).toBe("");
  });
});

describe("isSameName", () => {
  it("detecta el mismo producto con distinta escritura", () => {
    expect(isSameName("Leche Entera", "lecheentera")).toBe(true);
    expect(isSameName("Café", "cafe")).toBe(true);
  });

  it("no confunde productos distintos", () => {
    expect(isSameName("Leche", "Leche en polvo")).toBe(false);
  });

  it("nunca considera equivalentes dos vacíos", () => {
    expect(isSameName("", "")).toBe(false);
    expect(isSameName(null, null)).toBe(false);
  });
});

describe("matchExistingProduct", () => {
  const inventory = [
    { id: "1", name: "Leche Entera 1L" },
    { id: "2", name: "Café Molido" },
    { id: "3", name: "Arroz" },
    { id: "4", name: "Arroz Integral" },
    { id: "5", name: "Pan Tajado" },
  ];
  const getName = (p: { id: string; name: string }) => p.name;

  it("encuentra por coincidencia exacta normalizada", () => {
    expect(matchExistingProduct("leche entera 1L", inventory, getName)?.id).toBe("1");
  });

  it("encuentra ignorando acentos y mayúsculas", () => {
    expect(matchExistingProduct("CAFE MOLIDO", inventory, getName)?.id).toBe("2");
  });

  it("encuentra ignorando puntuación", () => {
    expect(matchExistingProduct("Café-Molido", inventory, getName)?.id).toBe("2");
  });

  it("prefiere la coincidencia exacta sobre el prefijo", () => {
    expect(matchExistingProduct("Arroz", inventory, getName)?.id).toBe("3");
    expect(matchExistingProduct("Arroz Integral", inventory, getName)?.id).toBe("4");
  });

  it("cae a prefijo cuando no hay coincidencia exacta, eligiendo el más corto", () => {
    expect(matchExistingProduct("arroz int", inventory, getName)?.id).toBe("4");
  });

  it("devuelve undefined cuando nada es razonablemente equivalente", () => {
    expect(matchExistingProduct("Aceite de oliva", inventory, getName)).toBeUndefined();
    expect(matchExistingProduct("", inventory, getName)).toBeUndefined();
  });

  it("funciona con inventario vacío", () => {
    expect(matchExistingProduct("Leche", [], getName)).toBeUndefined();
  });

  it("es case-insensitive en el nombre buscado", () => {
    expect(matchExistingProduct("PAN TAJADO", inventory, getName)?.id).toBe("5");
  });
});
