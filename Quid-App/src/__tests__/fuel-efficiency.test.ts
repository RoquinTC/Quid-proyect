import { describe, it, expect } from "vitest";
import {
  bucketEfficiency,
  buildEfficiencyCycles,
  describeEfficiencyQuality,
  detectSuspiciousFullTank,
  summarizeEfficiency,
  usableEfficiencyLogs,
  type EfficiencyLogLike,
} from "@/lib/fuel-efficiency";

// A tiny builder keeps the cases readable: km, gallons, full-tank flag.
function log(km: number, gallons: number, isFullTank: boolean, extra: Partial<EfficiencyLogLike> = {}): EfficiencyLogLike {
  return {
    id: `log-${km}`,
    date: new Date(2026, 0, 1 + Math.floor(km / 100)),
    km,
    gallons,
    isFullTank,
    pricePerGallon: 16_000,
    amount: gallons * 16_000,
    ...extra,
  };
}

describe("usableEfficiencyLogs", () => {
  it("drops logs with no volume but keeps a zero odometer", () => {
    const usable = usableEfficiencyLogs([log(0, 10, true), log(100, 0, true), log(200, -5, true)]);
    // A brand-new vehicle starts at km 0: that fill must survive, or the first
    // cycle would lose the very fill that opens it.
    expect(usable.map((l) => l.km)).toEqual([0]);
  });

  it("orders by odometer, not by date", () => {
    // Same-day entries with an out-of-order odometer must still read correctly.
    const usable = usableEfficiencyLogs([
      log(200, 10, true, { date: new Date(2026, 0, 1) }),
      log(100, 10, false, { date: new Date(2026, 0, 3) }),
      log(0, 10, true, { date: new Date(2026, 0, 2) }),
    ]);
    expect(usable.map((l) => l.km)).toEqual([0, 100, 200]);
  });
});

describe("buildEfficiencyCycles", () => {
  it("closes no cycle until a full tank is seen", () => {
    const { cycles, discardedBeforeFirstFullTank } = buildEfficiencyCycles([log(0, 10, false), log(100, 10, false)]);
    expect(cycles).toHaveLength(0);
    expect(discardedBeforeFirstFullTank).toBe(2);
  });

  it("closes one cycle between two full tanks", () => {
    const { cycles } = buildEfficiencyCycles([log(0, 10, true), log(500, 10, true)]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].distance).toBe(500);
    expect(cycles[0].volume).toBe(10);
    expect(cycles[0].efficiency).toBe(50);
  });

  it("includes partial fills in the cycle volume", () => {
    const { cycles } = buildEfficiencyCycles([log(0, 10, true), log(500, 5, false), log(1_000, 10, true)]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].distance).toBe(1_000);
    expect(cycles[0].volume).toBe(15);
    expect(cycles[0].partialFills).toBe(1);
    expect(cycles[0].efficiency).toBeCloseTo(66.667, 2);
  });

  it("REGRESSION: ignoring partial fills overstates efficiency", () => {
    const logs = [log(0, 10, true), log(500, 5, false), log(1_000, 10, true)];
    const { cycles } = buildEfficiencyCycles(logs);
    const correct = cycles[0].efficiency;
    // The naive sum that used to be computed: only full-tank gallons.
    const naive = 1_000 / 10;
    expect(correct).toBeLessThan(naive);
    expect(correct).toBeCloseTo(1_000 / 15, 3);
  });

  it("produces one cycle per full tank", () => {
    const { cycles } = buildEfficiencyCycles([log(0, 10, true), log(500, 10, true), log(1_200, 10, true)]);
    expect(cycles).toHaveLength(2);
    expect(cycles[0].distance).toBe(500);
    expect(cycles[1].distance).toBe(700);
  });

  it("closes no cycle when two full tanks share the same odometer", () => {
    // Sorting by odometer makes a decreasing reading impossible; the real guard
    // is a zero distance, which must not produce a division by zero.
    const { cycles } = buildEfficiencyCycles([log(1_000, 10, true), log(1_000, 10, true)]);
    expect(cycles).toHaveLength(0);
  });

  it("computes cost, cost per km and weighted price", () => {
    const { cycles } = buildEfficiencyCycles([
      log(0, 10, true, { amount: 100_000 }),
      log(500, 10, true, { amount: 200_000 }),
    ]);
    expect(cycles[0].cost).toBe(200_000);
    expect(cycles[0].costPerKm).toBe(400);
    expect(cycles[0].averagePricePerGallon).toBe(20_000);
  });

  it("keeps the station of the closing fill", () => {
    const { cycles } = buildEfficiencyCycles([log(0, 10, true), log(500, 10, true, { station: "Terpel Norte" })]);
    expect(cycles[0].station).toBe("Terpel Norte");
  });

  it("returns nothing for empty input", () => {
    expect(buildEfficiencyCycles(null).cycles).toHaveLength(0);
    expect(buildEfficiencyCycles([]).cycles).toHaveLength(0);
  });
});

describe("summarizeEfficiency", () => {
  it("reports the average as a quotient of sums, not a mean of ratios", () => {
    // Cycle A: 1000 km on 100 gal (10). Cycle B: 50 km on 10 gal (5).
    const summary = summarizeEfficiency([log(0, 100, true), log(1_000, 100, true), log(1_050, 10, true)]);
    expect(summary.cycles).toHaveLength(2);
    const meanOfRatios = (10 + 5) / 2;
    expect(summary.average).toBeCloseTo(1_050 / 110, 3);
    expect(summary.average).not.toBeCloseTo(meanOfRatios, 2);
    expect(summary.distanceTotal).toBe(1_050);
    expect(summary.volumeTotal).toBe(110);
  });

  it("matches the full-tank-only arithmetic when there are no partial fills", () => {
    // Guards the equivalence with the previous implementation for the common case.
    const summary = summarizeEfficiency([log(0, 10, true), log(500, 10, true), log(1_200, 10, true)]);
    const naiveTotalKm = 1_200 - 0;
    const naiveTotalGallons = 10 + 10;
    expect(summary.average).toBeCloseTo(naiveTotalKm / naiveTotalGallons, 3);
  });

  it("exposes best, worst and the last cycle", () => {
    const summary = summarizeEfficiency([log(0, 100, true), log(1_000, 100, true), log(1_050, 10, true)]);
    expect(summary.best).toBe(10);
    expect(summary.worst).toBe(5);
    expect(summary.lastCycle?.endKm).toBe(1_050);
  });

  it("stays in learning state with a fallback instead of inventing a number", () => {
    const summary = summarizeEfficiency([log(0, 10, true)], { fallbackAverage: 42 });
    expect(summary.isLearning).toBe(true);
    expect(summary.fromCycles).toBe(false);
    expect(summary.average).toBe(42);
    expect(summary.best).toBeNull();
  });

  it("computes the full-tank ratio as a data-quality signal", () => {
    const summary = summarizeEfficiency([log(0, 10, true), log(200, 5, false), log(400, 10, true), log(600, 5, false)]);
    expect(summary.fullTankRatio).toBeCloseTo(0.5, 5);
  });

  it("counts logs dropped before the first full tank", () => {
    const summary = summarizeEfficiency([log(0, 5, false), log(100, 10, true), log(500, 10, true)]);
    expect(summary.discardedBeforeFirstFullTank).toBe(1);
    expect(summary.average).toBe(40);
  });
});

describe("bucketEfficiency", () => {
  const cycles = buildEfficiencyCycles([
    log(0, 10, true),
    log(500, 10, true, { station: "Terpel" }), // 50 km/gal
    log(1_000, 10, true, { station: "Terpel" }), // 50 km/gal
    log(1_100, 10, true, { station: "Primax" }), // 10 km/gal
  ]).cycles;

  it("weights by distance and volume instead of averaging ratios", () => {
    const buckets = bucketEfficiency(cycles, (cycle) => cycle.station);
    const terpel = buckets.find((bucket) => bucket.key === "Terpel")!;
    const primax = buckets.find((bucket) => bucket.key === "Primax")!;
    expect(terpel.samples).toBe(2);
    expect(terpel.efficiency).toBe(50);
    expect(primax.efficiency).toBe(10);
    // Best first
    expect(buckets[0].key).toBe("Terpel");
  });

  it("honours a minimum sample size", () => {
    const buckets = bucketEfficiency(cycles, (cycle) => cycle.station, { minSamples: 2 });
    expect(buckets.map((bucket) => bucket.key)).toEqual(["Terpel"]);
  });

  it("skips cycles without a usable key", () => {
    const buckets = bucketEfficiency(cycles, () => null);
    expect(buckets).toHaveLength(0);
  });
});

describe("detectSuspiciousFullTank", () => {
  // A full tank at 1.000 km and a partial later on.
  const history = [
    { km: 1_000, isFullTank: true },
    { km: 1_100, isFullTank: false },
  ];
  const reference = 132; // a Colombian 150cc motorcycle

  /**
   * The whole point of judging by implied efficiency instead of fill size.
   *
   * Topping off an almost-full tank is a legitimate full tank — the most precise
   * kind. Warning about small fills would teach the driver to stop marking full
   * tanks, and a cycle can only close on a full tank, so the app would never
   * learn anything at all.
   */
  it("stays quiet on a legitimate top-off", () => {
    const suspicion = detectSuspiciousFullTank({
      km: 1_030,
      gallons: 0.4, // 30 km on 0.4 gal = 75 km/gal, entirely plausible
      isFullTank: true,
      history,
      referenceEfficiency: reference,
    });
    expect(suspicion).toBeNull();
  });

  it("accepts an ordinary full tank", () => {
    const suspicion = detectSuspiciousFullTank({
      km: 1_450,
      gallons: 3.5,
      isFullTank: true,
      history,
      referenceEfficiency: reference,
    });
    expect(suspicion).toBeNull();
  });

  it("flags a small fill after a long distance", () => {
    // 400 km on 0.9 gal would imply 444 km/gal. This is the exact shape of the
    // mistake that made the gauge read half a tank on an empty one.
    const suspicion = detectSuspiciousFullTank({
      km: 1_400,
      gallons: 0.9,
      isFullTank: true,
      history,
      referenceEfficiency: reference,
    });
    expect(suspicion).not.toBeNull();
    expect(suspicion!.distance).toBe(400);
    expect(suspicion!.impliedEfficiency).toBeCloseTo(444.4, 1);
    expect(suspicion!.reference).toBe(reference);
  });

  it("measures from the most recent full tank, not the first one", () => {
    const withNewerAnchor = [...history, { km: 1_350, isFullTank: true }];
    const suspicion = detectSuspiciousFullTank({
      km: 1_400,
      gallons: 0.9,
      isFullTank: true,
      history: withNewerAnchor,
      referenceEfficiency: reference,
    });
    // Only 50 km since the newer anchor: 55 km/gal, nothing to flag.
    expect(suspicion).toBeNull();
  });

  it("says nothing when the flag is off or the numbers are unusable", () => {
    const base = { km: 1_400, gallons: 0.9, history, referenceEfficiency: reference };
    expect(detectSuspiciousFullTank({ ...base, isFullTank: false })).toBeNull();
    expect(detectSuspiciousFullTank({ ...base, km: 0, isFullTank: true })).toBeNull();
    expect(detectSuspiciousFullTank({ ...base, gallons: 0, isFullTank: true })).toBeNull();
  });

  it("says nothing without a reference or an anchor to measure from", () => {
    const base = { km: 1_400, gallons: 0.9, isFullTank: true };
    expect(detectSuspiciousFullTank({ ...base, history, referenceEfficiency: 0 })).toBeNull();
    expect(detectSuspiciousFullTank({ ...base, history: [], referenceEfficiency: reference })).toBeNull();
    // Only partial fills known: there is no full tank to measure from yet.
    expect(
      detectSuspiciousFullTank({
        ...base,
        history: [{ km: 1_100, isFullTank: false }],
        referenceEfficiency: reference,
      })
    ).toBeNull();
  });

  it("ignores odometer readings ahead of the fill being entered", () => {
    const suspicion = detectSuspiciousFullTank({
      km: 1_400,
      gallons: 0.9,
      isFullTank: true,
      history: [{ km: 9_000, isFullTank: true }],
      referenceEfficiency: reference,
    });
    expect(suspicion).toBeNull();
  });

  it("respects a caller-supplied tolerance", () => {
    // 200 km on 1 gal = 200 km/gal, i.e. 1.5x the reference.
    const base = { km: 1_200, gallons: 1, isFullTank: true, history, referenceEfficiency: reference };
    expect(detectSuspiciousFullTank(base)).toBeNull();
    expect(detectSuspiciousFullTank({ ...base, toleranceFactor: 1.2 })).not.toBeNull();
  });
});

describe("summarizeEfficiency — the 12-month window", () => {
  const NOW = new Date(2026, 9, 14);

  /**
   * The production shape, reproduced.
   *
   * The old years are incomplete: 862 km recorded between two fills on a tank
   * that cannot cover it, because fills went unlogged. The recent months are
   * complete, at a realistic ~250 km per fill. A cumulative average drags the
   * old error forever; the window reflects how the vehicle runs now.
   */
  const old = [
    log(1_000, 3.5, true, { date: new Date(2018, 0, 1) }),
    log(1_862, 2.35, true, { date: new Date(2018, 5, 1) }),
    log(2_724, 2.35, true, { date: new Date(2018, 10, 1) }),
  ];
  const recent = [
    log(2_974, 2.3, true, { date: new Date(2025, 11, 1) }),
    log(3_224, 2.3, true, { date: new Date(2026, 1, 1) }),
    log(3_474, 2.3, true, { date: new Date(2026, 5, 1) }),
    log(3_724, 2.3, true, { date: new Date(2026, 9, 1) }),
  ];
  const history = [...old, ...recent];

  it("uses only the cycles inside the window", () => {
    const summary = summarizeEfficiency(history, { windowDays: 365, now: NOW });
    expect(summary.scope).toBe("window");
    expect(summary.windowDays).toBe(365);
    expect(summary.cycles).toHaveLength(4);
    expect(summary.average).toBeCloseTo(1_000 / 9.2, 1); // 108,7
  });

  it("shows how far the old records inflate the all-time average", () => {
    const allTime = summarizeEfficiency(history, { now: NOW });
    expect(allTime.scope).toBe("all-time");
    expect(allTime.totalCycles).toBe(6);
    expect(allTime.average).toBeCloseTo(2_724 / 13.9, 1); // 196
    // The whole point: the window is far below the cumulative number.
    expect(summarizeEfficiency(history, { windowDays: 365, now: NOW }).average)
      .toBeLessThan(allTime.average * 0.6);
  });

  it("keeps the full history when the window has too little data", () => {
    // Only one cycle closed in the last year: not enough to trust over years of
    // records, so the full history wins and `scope` says so.
    const thin = [...old, recent[0]];
    const summary = summarizeEfficiency(thin, { windowDays: 365, now: NOW });
    expect(summary.scope).toBe("all-time");
    expect(summary.cycles).toHaveLength(3);
  });

  it("honours a custom minimum", () => {
    const thin = [...old, recent[0]];
    const summary = summarizeEfficiency(thin, {
      windowDays: 365,
      now: NOW,
      minCyclesInWindow: 1,
    });
    expect(summary.scope).toBe("window");
    expect(summary.cycles).toHaveLength(1);
  });

  it("behaves exactly as before when no window is asked for", () => {
    const summary = summarizeEfficiency(history, { now: NOW });
    expect(summary.scope).toBe("all-time");
    expect(summary.windowDays).toBeNull();
    expect(summary.average).toBeCloseTo(196, 1);
  });

  it("still reports learning when there are no cycles at all", () => {
    const summary = summarizeEfficiency([log(0, 10, true, { date: NOW })], {
      windowDays: 365,
      now: NOW,
      fallbackAverage: 42,
    });
    expect(summary.scope).toBe("estimate");
    expect(summary.isLearning).toBe(true);
    expect(summary.average).toBe(42);
  });
});

describe("describeEfficiencyQuality", () => {
  it("tells the user what to do when there is not enough data", () => {
    const summary = summarizeEfficiency([log(0, 10, true)]);
    expect(describeEfficiencyQuality(summary)).toContain("dos tanqueos");
  });

  it("grades the quality of the history", () => {
    const solid = summarizeEfficiency([log(0, 10, true), log(500, 10, true)]);
    expect(describeEfficiencyQuality(solid)).toContain("sólidos");

    // A low full-tank ratio AND at least one closed cycle, otherwise the
    // summary is still in its learning state and no grade applies yet.
    const weak = summarizeEfficiency([
      log(0, 10, true),
      log(500, 10, true),
      log(600, 5, false),
      log(700, 5, false),
      log(800, 5, false),
      log(900, 5, false),
    ]);
    expect(weak.isLearning).toBe(false);
    expect(describeEfficiencyQuality(weak)).toContain("flojos");
  });
});
