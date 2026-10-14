import { describe, it, expect } from "vitest";
import { calculateFuelLevel } from "@/lib/fuel-level";

// Fixed "now" keeps every case deterministic.
const NOW = new Date(2026, 2, 20, 12, 0, 0);
const DAY = 86_400_000;

function log(
  id: string,
  daysAgo: number,
  km: number,
  gallons: number,
  isFullTank: boolean,
  pricePerGallon = 16_000
) {
  return {
    id,
    date: new Date(NOW.getTime() - daysAgo * DAY),
    km,
    gallons,
    isFullTank,
    pricePerGallon,
    amount: gallons * pricePerGallon,
  };
}

const VEHICLE = { tankCapacity: 4.5, currentKm: 1_250, type: "motorcycle" };

describe("calculateFuelLevel — coherent history", () => {
  // Two full tanks 180 km apart on 4.5 gal => a measured 40 km/gal.
  const history = [
    log("a", 20, 1_000, 4.5, true),
    log("b", 10, 1_180, 4.5, true),
  ];

  it("starts from the most recent full tank and subtracts measured burn", () => {
    const result = calculateFuelLevel(VEHICLE, history, NOW);
    expect(result.model).toBe("full-tank");
    expect(result.lastFullTankKm).toBe(1_180);
    expect(result.kmSinceFullTank).toBe(70); // 1.250 - 1.180
    expect(result.avgKmPerGallon).toBe(40);
    expect(result.consumedSinceFullTank).toBeCloseTo(1.75, 2); // 70 / 40
    expect(result.currentFuel).toBeCloseTo(2.75, 2); // 4.5 - 1.75
    expect(result.fuelLevel).toBeCloseTo(61.11, 1);
    expect(result.estimatedRange).toBe(110); // 2.75 * 40
  });

  it("explains its own inputs", () => {
    const result = calculateFuelLevel(VEHICLE, history, NOW);
    expect(result.assumedTankCapacity).toBe(4.5);
    expect(result.daysSinceLastLog).toBe(10);
    expect(result.confidenceReasons.length).toBeGreaterThan(0);
    expect(result.isLowFuel).toBe(false);
  });

  it("adds partial fills after the baseline back on top", () => {
    const withPartial = [...history, log("c", 5, 1_230, 0.8, false)];
    const result = calculateFuelLevel({ ...VEHICLE, currentKm: 1_250 }, withPartial, NOW);
    expect(result.partialsAddedSinceFullTank).toBeCloseTo(0.8, 2);
    expect(result.kmSinceFullTank).toBe(70); // 1.250 - 1.180
    // 4.5 - (70/40) + 0.8
    expect(result.currentFuel).toBeCloseTo(3.55, 2);
  });

  it("never reports more than the tank holds", () => {
    const overfilled = [...history, log("c", 2, 1_240, 4.0, false)];
    const result = calculateFuelLevel(VEHICLE, overfilled, NOW);
    expect(result.currentFuel).toBeLessThanOrEqual(4.5);
    expect(result.fuelLevel).toBeLessThanOrEqual(100);
  });

  it("clamps to empty instead of going negative", () => {
    const result = calculateFuelLevel({ ...VEHICLE, currentKm: 5_000 }, history, NOW);
    expect(result.currentFuel).toBe(0);
    expect(result.fuelLevel).toBe(0);
    expect(result.isLowFuel).toBe(true);
  });
});

describe("calculateFuelLevel — the ways it can be wrong", () => {
  it("flags a 'full tank' far smaller than the tank as an overestimate risk", () => {
    // The classic silent failure: a top-up recorded as full. The model believes
    // the tank is at capacity afterwards, so the level runs high.
    const history = [log("a", 20, 1_000, 4.5, true), log("b", 3, 1_100, 0.5, true)];
    const result = calculateFuelLevel({ ...VEHICLE, currentKm: 1_150 }, history, NOW);
    expect(result.confidence).toBe("low");
    expect(result.confidenceReasons.join(" ")).toContain("sobreestimado");
  });

  it("warns when the last record is old, because unknown km hide burn", () => {
    // 40 days without a record: real distance driven since then is invisible,
    // so the level reads higher than reality.
    const history = [log("a", 60, 1_000, 4.5, true), log("b", 40, 1_100, 4.5, true)];
    const result = calculateFuelLevel({ ...VEHICLE, currentKm: 1_100 }, history, NOW);
    expect(result.daysSinceLastLog).toBe(40);
    expect(result.confidence).toBe("low");
    expect(result.confidenceReasons.join(" ")).toContain("40 días");
  });

  it("is only medium when the record is a week old", () => {
    const history = [log("a", 30, 1_000, 4.5, true), log("b", 9, 1_180, 4.5, true)];
    const result = calculateFuelLevel({ ...VEHICLE, currentKm: 1_200 }, history, NOW);
    expect(result.confidence).toBe("medium");
  });

  it("drops to a rough model, and says so, without any full tank", () => {
    const history = [log("a", 10, 1_000, 2, false), log("b", 5, 1_100, 2, false)];
    const result = calculateFuelLevel({ ...VEHICLE, currentKm: 1_150 }, history, NOW);
    expect(result.model).toBe("rough");
    expect(result.confidence).toBe("low");
    expect(result.confidenceReasons.join(" ")).toContain("ningún tanqueo marcado como lleno");
  });

  it("is low confidence while the efficiency is still a generic default", () => {
    const history = [log("a", 3, 1_000, 4.5, true)];
    const result = calculateFuelLevel({ ...VEHICLE, currentKm: 1_050 }, history, NOW);
    expect(result.isLearning).toBe(true);
    expect(result.confidence).toBe("low");
    expect(result.confidenceReasons.join(" ")).toContain("no se midió");
  });
});

describe("calculateFuelLevel — nothing to work with", () => {
  it("returns an explained empty result without a tank capacity", () => {
    const result = calculateFuelLevel({ tankCapacity: null, currentKm: 1_000, type: "motorcycle" }, [], NOW);
    expect(result.model).toBe("none");
    expect(result.fuelLevel).toBe(0);
    expect(result.confidence).toBe("low");
  });

  it("returns an explained result with no logs at all", () => {
    const result = calculateFuelLevel(VEHICLE, [], NOW);
    expect(result.model).toBe("none");
    expect(result.gallonsToRefuel).toBe(4.5);
    expect(result.assumedTankCapacity).toBe(4.5);
    expect(result.confidenceReasons.join(" ")).toContain("tanqueos registrados");
  });
});
