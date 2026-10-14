import { describe, it, expect } from "vitest";
import { validateFuelEntry } from "@/lib/fuel-entry-validation";

describe("validateFuelEntry — the production failure", () => {
  /**
   * These are the real rows found in production: the price per gallon was typed
   * in thousands, so `gallons = amount ÷ price` produced thousands of gallons in
   * a 3.5-gallon tank and wrecked the vehicle's efficiency for months.
   */
  it("blocks a price typed in thousands", () => {
    const issue = validateFuelEntry({
      amount: 46_314,
      pricePerGallon: 15,
      tankCapacity: 3.5,
    });
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe("gallons_over_capacity");
    expect(issue!.blocking).toBe(true);
    expect(issue!.message).toContain("3.087,6");
    expect(issue!.message).toContain("15.000");
  });

  it("blocks the second production row too", () => {
    const issue = validateFuelEntry({ amount: 50_591, pricePerGallon: 15, tankCapacity: 3.5 });
    expect(issue!.blocking).toBe(true);
  });

  it("catches the same mistake on a different tank", () => {
    const issue = validateFuelEntry({ amount: 23_000, pricePerGallon: 2_200, tankCapacity: 3.65 });
    // 23.000 / 2.200 = 10,45 gal in a 3,65 gal tank
    expect(issue!.blocking).toBe(true);
  });
});

describe("validateFuelEntry — accepts real fills", () => {
  it("accepts an ordinary fill", () => {
    // 50.000 at 15.000/gal on a 3,5 gal tank => 3,33 gal
    expect(validateFuelEntry({ amount: 50_000, pricePerGallon: 15_000, tankCapacity: 3.5 })).toBeNull();
  });

  it("accepts filling to the neck", () => {
    // A real production row: 3,56 gal in a nominal 3,5 gal tank.
    const issue = validateFuelEntry({ amount: 53_085, pricePerGallon: 14_920, tankCapacity: 3.5 });
    expect(issue).toBeNull();
  });

  it("accepts a small top-off", () => {
    expect(validateFuelEntry({ amount: 6_000, pricePerGallon: 15_000, tankCapacity: 3.5 })).toBeNull();
  });

  it("accepts a historical price within the band", () => {
    expect(validateFuelEntry({ amount: 19_492, pricePerGallon: 8_000, tankCapacity: 3.65 })).toBeNull();
  });

  it("uses the gallons the caller already computed", () => {
    // Even with a sane price, a volume over the tank must be refused.
    const issue = validateFuelEntry({ pricePerGallon: 15_000, gallons: 40, tankCapacity: 3.5 });
    expect(issue!.blocking).toBe(true);
  });
});

describe("validateFuelEntry — the price band only warns", () => {
  it("warns, without blocking, on a price far below the band", () => {
    // A small amount keeps the volume legal, so this cannot be proven wrong —
    // but it is almost certainly a typo, and prices change over the years, so it
    // must not be refused outright.
    const issue = validateFuelEntry({ amount: 5_000, pricePerGallon: 2_200, tankCapacity: 3.65 });
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe("implausible_price");
    expect(issue!.blocking).toBe(false);
  });

  it("suggests the likely intended price when it looks like thousands", () => {
    const issue = validateFuelEntry({ amount: 6_000, pricePerGallon: 15, tankCapacity: 3.5 });
    // 6.000 / 15 = 400 gal, so this blocks first — check the warning path alone.
    if (issue?.code === "implausible_price") {
      expect(issue.message).toContain("15.000");
    }
    // With a big enough tank the volume stays legal and the warning can be read.
    const warning = validateFuelEntry({ amount: 6_000, pricePerGallon: 15, tankCapacity: 500 });
    expect(warning!.code).toBe("implausible_price");
    expect(warning!.message).toContain("15.000");
  });

  it("warns on an absurdly high price", () => {
    const issue = validateFuelEntry({ amount: 5_000, pricePerGallon: 900_000, tankCapacity: 3.5 });
    expect(issue!.code).toBe("implausible_price");
    expect(issue!.blocking).toBe(false);
  });
});

describe("validateFuelEntry — says nothing when it cannot judge", () => {
  it("stays silent without a price", () => {
    expect(validateFuelEntry({ amount: 50_000, tankCapacity: 3.5 })).toBeNull();
    expect(validateFuelEntry({ amount: 50_000, pricePerGallon: "", tankCapacity: 3.5 })).toBeNull();
  });

  it("stays silent without a tank capacity", () => {
    expect(validateFuelEntry({ amount: 46_314, pricePerGallon: 15_000, tankCapacity: null })).toBeNull();
  });

  it("stays silent with no amount and no gallons", () => {
    expect(validateFuelEntry({ pricePerGallon: 15_000, tankCapacity: 3.5 })).toBeNull();
  });
});
