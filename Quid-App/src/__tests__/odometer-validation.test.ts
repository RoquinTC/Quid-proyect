import { describe, it, expect } from "vitest";
import {
  SUSPICIOUS_JUMP_FACTOR,
  highestKnownKm,
  validateOdometer,
  type OdometerReading,
} from "@/lib/odometer-validation";

const jan = (day: number) => new Date(2026, 0, day);

// A small, coherent history: 10.000 km on the 1st, 10.500 on the 10th, 11.000 on the 20th.
const HISTORY: OdometerReading[] = [
  { id: "a", km: 10_000, date: jan(1) },
  { id: "b", km: 10_500, date: jan(10) },
  { id: "c", km: 11_000, date: jan(20) },
];

describe("highestKnownKm", () => {
  it("returns the maximum usable reading", () => {
    expect(highestKnownKm(HISTORY)).toBe(11_000);
  });

  it("ignores garbage and empty input", () => {
    expect(highestKnownKm([])).toBe(0);
    expect(highestKnownKm(null)).toBe(0);
    expect(highestKnownKm([{ km: Number.NaN }, { km: -50 }])).toBe(0);
  });
});

describe("validateOdometer — input sanity", () => {
  it("rejects values that are not a valid odometer", () => {
    for (const bad of ["", null, undefined, "abc", Number.NaN, -1]) {
      const result = validateOdometer({ km: bad });
      expect(result.code).toBe("invalid");
      expect(result.blocking).toBe(true);
    }
  });

  it("accepts a plausible value with no history", () => {
    expect(validateOdometer({ km: 1_000 }).status).toBe("ok");
  });
});

describe("validateOdometer — the odometer cannot go back", () => {
  it("blocks a new record below the current odometer", () => {
    const result = validateOdometer({ km: 9_500, currentKm: 10_000, mode: "create" });
    expect(result.code).toBe("below_current");
    expect(result.blocking).toBe(true);
    expect(result.message).toContain("10.000");
  });

  it("allows a new record above it", () => {
    expect(validateOdometer({ km: 10_200, currentKm: 10_000, mode: "create" }).status).toBe("ok");
  });

  it("does NOT apply that rule while editing an old record", () => {
    // Editing the 10.000 km fill-up when the vehicle already shows 11.000.
    const result = validateOdometer({
      km: 10_000,
      currentKm: 11_000,
      date: jan(1),
      history: HISTORY,
      editingId: "a",
      mode: "edit",
    });
    expect(result.status).toBe("ok");
  });
});

describe("validateOdometer — date-aware ordering", () => {
  it("blocks a value below an earlier reading", () => {
    const result = validateOdometer({ km: 10_200, date: jan(15), history: HISTORY });
    expect(result.code).toBe("below_earlier_reading");
    expect(result.blocking).toBe(true);
    expect(result.message).toContain("10.500");
  });

  it("blocks a value above a later reading", () => {
    const result = validateOdometer({ km: 11_200, date: jan(15), history: HISTORY });
    expect(result.code).toBe("above_later_reading");
    expect(result.blocking).toBe(true);
    expect(result.message).toContain("11.000");
  });

  it("accepts a past fill-up inserted between its neighbours", () => {
    // Lower than today's odometer, but correctly placed in time: below 11.000
    // (the later reading) and above 10.500 (the earlier one). Appending-only
    // rules must not reject a legitimate back-filled record.
    const result = validateOdometer({ km: 10_700, date: jan(15), currentKm: 11_000, history: HISTORY });
    expect(result.status).toBe("ok");
  });

  it("still enforces the floor when appending at the end of the history", () => {
    const result = validateOdometer({ km: 10_700, date: jan(25), currentKm: 11_000, history: HISTORY });
    expect(result.code).toBe("below_current");
  });

  it("excludes the record being edited from its own comparison", () => {
    const result = validateOdometer({
      km: 10_450,
      date: jan(10),
      history: HISTORY,
      editingId: "b",
      mode: "edit",
    });
    expect(result.status).toBe("ok");
  });
});

describe("validateOdometer — duplicates and typos", () => {
  it("blocks the same odometer on the same date", () => {
    const result = validateOdometer({ km: 10_500, date: jan(10), history: HISTORY });
    expect(result.code).toBe("duplicate");
    expect(result.blocking).toBe(true);
  });

  it("allows the same odometer on a different date", () => {
    // Two fills without moving is odd but legitimate (e.g. filling a jerrycan).
    const result = validateOdometer({ km: 10_500, date: jan(12), currentKm: 10_500, history: HISTORY });
    expect(result.code).not.toBe("duplicate");
  });

  it("warns, but does not block, on an implausible jump", () => {
    const result = validateOdometer({ km: 90_000, date: jan(25), history: HISTORY });
    expect(result.code).toBe("suspicious_jump");
    expect(result.status).toBe("warning");
    expect(result.blocking).toBe(false);
  });

  it("uses the documented jump factor", () => {
    const justUnder = 11_000 * SUSPICIOUS_JUMP_FACTOR;
    expect(validateOdometer({ km: justUnder, date: jan(25), history: HISTORY }).code).not.toBe("suspicious_jump");
    expect(validateOdometer({ km: justUnder + 1, date: jan(25), history: HISTORY }).code).toBe("suspicious_jump");
  });

  it("does not warn when there is nothing to compare against", () => {
    expect(validateOdometer({ km: 999_999 }).status).toBe("ok");
  });

  it("accepts a numeric string, as forms produce", () => {
    expect(validateOdometer({ km: "10200", currentKm: 10_000, mode: "create" }).status).toBe("ok");
  });
});
