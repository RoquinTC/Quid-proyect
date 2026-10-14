/**
 * Fuel entry validation.
 *
 * The system derives the volume from the money:
 *
 *     gallons = amount ÷ pricePerGallon
 *
 * which makes the price field dangerous. Typing `15` where `15000` was meant
 * turns a 46.314 COP fill into 3.087 gallons — 880 times the real volume — and
 * that single row poisons the average efficiency, the autonomy estimate and the
 * refuel forecast for the whole vehicle. This happened in production, so the
 * guard lives here.
 *
 * Design choice: the CAPACITY rule blocks, the PRICE band only warns.
 *
 *   - More fuel than the tank holds is physically impossible, whatever the era,
 *     so it must never be saved.
 *   - A price outside today's band is suspicious but not impossible (prices
 *     change over the years), and blocking on it would eventually reject
 *     legitimate data. It warns and points at the likely fix instead.
 *
 * Pure module: no DB, no React.
 */

export interface FuelEntryIssue {
  code: "invalid_price" | "gallons_over_capacity" | "implausible_price";
  message: string;
  /** True when the entry must be refused. */
  blocking: boolean;
}

/** Plausible COP-per-gallon band for Colombia. Wide on purpose. */
export const PLAUSIBLE_PRICE_PER_GALLON_COP = { min: 3_000, max: 30_000 };

/** Filling to the neck can exceed the nominal capacity slightly. */
export const CAPACITY_TOLERANCE = 1.1;

function positive(value: number | string | null | undefined): number {
  if (typeof value === "string" && value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatCop(value: number): string {
  return Math.round(value).toLocaleString("es-CO");
}

function formatVolume(value: number): string {
  return (Math.round(value * 100) / 100).toLocaleString("es-CO");
}

/**
 * When a price looks like it was typed in thousands ("15" for 15.000), say so.
 * That is the concrete mistake behind the corrupted production rows, so naming
 * the fix beats describing the symptom.
 */
function scaledPriceSuggestion(price: number, band: { min: number; max: number }): string | null {
  if (price <= 0 || price >= band.min) return null;
  const scaled = price * 1000;
  if (scaled < band.min || scaled > band.max) return null;
  return `¿Quisiste decir ${formatCop(scaled)} por galón?`;
}

/**
 * Check a fuel entry before it is saved.
 *
 * Returns null when there is nothing to say. The caller decides what to do with
 * a blocking issue; the form refuses to submit and says why.
 */
export function validateFuelEntry(params: {
  amount?: number | string | null;
  pricePerGallon?: number | string | null;
  /** Volume actually stored, when already computed by the caller. */
  gallons?: number | null;
  tankCapacity?: number | null;
  priceBand?: { min: number; max: number };
  capacityTolerance?: number;
}): FuelEntryIssue | null {
  const price = positive(params.pricePerGallon);
  if (price <= 0) return null; // the form already requires it

  const amount = positive(params.amount);
  const gallons = params.gallons != null && Number(params.gallons) > 0
    ? Number(params.gallons)
    : amount > 0
      ? amount / price
      : 0;

  const capacity = positive(params.tankCapacity);
  const tolerance = params.capacityTolerance ?? CAPACITY_TOLERANCE;
  const band = params.priceBand ?? PLAUSIBLE_PRICE_PER_GALLON_COP;

  // 1. Physically impossible: more fuel than the tank holds. This is the rule
  //    that catches a price typed in thousands.
  if (capacity > 0 && gallons > capacity * tolerance) {
    const impliedPrice = amount > 0 ? amount / capacity : 0;
    const notes = [
      scaledPriceSuggestion(price, band),
      impliedPrice > 0
        ? `Con ${formatCop(amount)} en un tanque de ${formatVolume(capacity)}, el precio estaría cerca de ${formatCop(impliedPrice)}.`
        : null,
    ].filter(Boolean);

    return {
      code: "gallons_over_capacity",
      message:
        `Eso daría ${formatVolume(gallons)} galones y tu tanque es de ${formatVolume(capacity)}. ` +
        `Los galones se calculan como valor pagado ÷ precio.` +
        (notes.length > 0 ? ` ${notes.join(" ")}` : ""),
      blocking: true,
    };
  }

  // 2. Suspicious, but not impossible.
  if (price < band.min || price > band.max) {
    const suggestion = scaledPriceSuggestion(price, band);
    return {
      code: "implausible_price",
      message:
        `El precio por galón (${formatCop(price)}) está fuera del rango esperado ` +
        `(${formatCop(band.min)} a ${formatCop(band.max)}).` +
        (suggestion ? ` ${suggestion}` : ""),
      blocking: false,
    };
  }

  return null;
}
