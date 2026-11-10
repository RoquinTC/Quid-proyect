import { describe, it, expect } from "vitest";
import {
  detectSubscriptions,
  nextChargeDate,
  normalizeMerchant,
} from "@/lib/finance/subscription-detector";

function expense(date: string, amount: number, description: string, extra: Record<string, unknown> = {}) {
  return { id: `t-${date}-${amount}`, date, amount, description, type: "expense", ...extra };
}

describe("F-23 · detección de suscripciones", () => {
  it("normaliza el comercio y sobrevive a los números de referencia", () => {
    expect(normalizeMerchant("NETFLIX.COM 1234")).toBe("netflix");
    expect(normalizeMerchant("Netflix.com SAS Bogotá")).toBe("netflix");
    expect(normalizeMerchant("COMPRA POS SPOTIFY AB")).toBe("spotify ab");
  });

  it("detecta un cobro mensual repetido tres veces", () => {
    const candidates = detectSubscriptions([
      expense("2026-08-10", 44_900, "NETFLIX.COM 1234"),
      expense("2026-09-09", 44_900, "NETFLIX.COM 5678"),
      expense("2026-10-09", 44_900, "NETFLIX.COM 9012"),
    ]);

    expect(candidates).toHaveLength(1);
    const [candidate] = candidates;
    expect(candidate.merchantKey).toBe("netflix");
    expect(candidate.amount).toBe(44_900);
    expect(candidate.occurrences).toBe(3);
    expect(candidate.cadenceDays).toBeGreaterThanOrEqual(29);
    expect(candidate.cadenceDays).toBeLessThanOrEqual(31);
    expect(candidate.lastCharge).toBe("2026-10-09");
    expect(candidate.nextCharge).toBe("2026-11-08");
    expect(candidate.confidence).toBe("medium");
  });

  it("sube la confianza a alta con cuatro cobros estables", () => {
    const candidates = detectSubscriptions([
      expense("2026-07-10", 20_000, "Spotify"),
      expense("2026-08-10", 20_000, "Spotify"),
      expense("2026-09-10", 20_000, "Spotify"),
      expense("2026-10-10", 20_000, "Spotify"),
    ]);
    expect(candidates[0].confidence).toBe("high");
  });

  it("no propone dos cobros: hace falta un patrón", () => {
    const candidates = detectSubscriptions([
      expense("2026-09-10", 44_900, "Netflix"),
      expense("2026-10-10", 44_900, "Netflix"),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("ignora los cobros semanales: eso no es una suscripción mensual", () => {
    const candidates = detectSubscriptions([
      expense("2026-10-01", 12_000, "Panadería"),
      expense("2026-10-08", 12_000, "Panadería"),
      expense("2026-10-15", 12_000, "Panadería"),
      expense("2026-10-22", 12_000, "Panadería"),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("descarta montos que varían demasiado", () => {
    const candidates = detectSubscriptions([
      expense("2026-08-10", 30_000, "Gimnasio"),
      expense("2026-09-10", 90_000, "Gimnasio"),
      expense("2026-10-10", 30_000, "Gimnasio"),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("separa comercios distintos y ordena por monto", () => {
    const candidates = detectSubscriptions([
      expense("2026-08-05", 20_000, "Spotify"),
      expense("2026-09-05", 20_000, "Spotify"),
      expense("2026-10-05", 20_000, "Spotify"),
      expense("2026-08-12", 80_000, "Gimnasio Bodytech"),
      expense("2026-09-12", 80_000, "Gimnasio Bodytech"),
      expense("2026-10-12", 80_000, "Gimnasio Bodytech"),
    ]);

    expect(candidates.map((candidate) => candidate.merchantKey)).toEqual([
      "gimnasio bodytech",
      "spotify",
    ]);
  });

  it("no detecta ingresos, aunque se repitan", () => {
    const candidates = detectSubscriptions([
      { id: "1", date: "2026-08-01", amount: 3_000_000, description: "Sueldo", type: "income" },
      { id: "2", date: "2026-09-01", amount: 3_000_000, description: "Sueldo", type: "income" },
      { id: "3", date: "2026-10-01", amount: 3_000_000, description: "Sueldo", type: "income" },
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("calcula el próximo cobro desde el último", () => {
    expect(nextChargeDate("2026-10-09", 30)).toBe("2026-11-08");
  });
});
