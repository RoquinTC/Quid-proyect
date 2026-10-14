import { describe, it, expect } from "vitest";
import {
  addDays,
  buildUpcoming,
  confidenceFor,
  countActionable,
  daysBetween,
  describeDays,
  describeKm,
  describeProjection,
  describeRelativeDay,
  estimateKmDueDate,
  severityFor,
  type DocumentLike,
  type MaintenanceLike,
  type ReminderLike,
} from "@/lib/transport-prediction";

// Local-time constructor keeps day arithmetic timezone-independent.
const TODAY = new Date(2026, 2, 10, 12, 0, 0); // 10 Mar 2026, midday

describe("date helpers", () => {
  it("counts whole days between midnights", () => {
    expect(daysBetween(new Date(2026, 2, 10, 23, 0), new Date(2026, 2, 13, 1, 0))).toBe(3);
  });

  it("counts backwards for past dates", () => {
    expect(daysBetween(new Date(2026, 2, 10), new Date(2026, 2, 4))).toBe(-6);
  });

  it("adds days from midnight", () => {
    const result = addDays(new Date(2026, 2, 10, 18, 30), 5);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(0);
  });
});

describe("confidenceFor", () => {
  it("reports none without a usable rate", () => {
    expect(confidenceFor(0)).toBe("none");
    expect(confidenceFor(null)).toBe("none");
    expect(confidenceFor(undefined)).toBe("none");
    expect(confidenceFor(Number.NaN)).toBe("none");
  });

  it("degrades a technically-valid but meaningless rate", () => {
    expect(confidenceFor(1.5)).toBe("low");
  });

  it("degrades while the model is still learning", () => {
    expect(confidenceFor(60, { isLearning: true })).toBe("low");
  });

  it("scales with history length", () => {
    expect(confidenceFor(60, { historyDays: 30 })).toBe("high");
    expect(confidenceFor(60, { historyDays: 10 })).toBe("medium");
    expect(confidenceFor(60, { historyDays: 3 })).toBe("low");
  });

  it("never claims high confidence without history length", () => {
    expect(confidenceFor(60)).toBe("medium");
  });
});

describe("estimateKmDueDate", () => {
  it("projects a distance target onto the calendar", () => {
    const result = estimateKmDueDate({
      currentKm: 10_000,
      dueKm: 11_000,
      avgKmPerDay: 50,
      today: TODAY,
    });
    expect(result.daysRemaining).toBe(20);
    expect(result.estimatedDate).toBe(addDays(TODAY, 20).toISOString());
    expect(result.kmPerDay).toBe(50);
  });

  it("refuses to invent a date with no rate", () => {
    const result = estimateKmDueDate({ currentKm: 10_000, dueKm: 11_000, avgKmPerDay: 0, today: TODAY });
    expect(result.estimatedDate).toBeNull();
    expect(result.daysRemaining).toBeNull();
    expect(result.confidence).toBe("none");
  });

  it("gives no future date once the target is already passed", () => {
    const result = estimateKmDueDate({ currentKm: 12_000, dueKm: 11_000, avgKmPerDay: 50, today: TODAY });
    expect(result.estimatedDate).toBeNull();
    expect(result.daysRemaining).toBeNull();
  });

  it("handles a missing target", () => {
    const result = estimateKmDueDate({ currentKm: 10_000, dueKm: null, avgKmPerDay: 50, today: TODAY });
    expect(result.estimatedDate).toBeNull();
    expect(result.confidence).toBe("none");
  });

  it("rounds up to at least one day for an imminent target", () => {
    const result = estimateKmDueDate({ currentKm: 10_000, dueKm: 10_010, avgKmPerDay: 100, today: TODAY });
    expect(result.daysRemaining).toBe(1);
  });

  it("propagates low confidence from a tiny rate", () => {
    const result = estimateKmDueDate({ currentKm: 10_000, dueKm: 11_000, avgKmPerDay: 2, today: TODAY });
    expect(result.confidence).toBe("low");
    expect(result.daysRemaining).toBe(500);
  });
});

describe("severityFor", () => {
  it("is danger when a limit is passed", () => {
    expect(severityFor({ kmRemaining: -50, daysRemaining: null, projectedDays: null })).toBe("danger");
    expect(severityFor({ kmRemaining: 0, daysRemaining: null, projectedDays: null })).toBe("danger");
    expect(severityFor({ kmRemaining: null, daysRemaining: -2, projectedDays: null })).toBe("danger");
  });

  it("is warning inside the user's own window", () => {
    expect(severityFor({ kmRemaining: 300, daysRemaining: null, projectedDays: null, warningKm: 500 })).toBe("warning");
    expect(severityFor({ kmRemaining: null, daysRemaining: 5, projectedDays: null, warningDays: 7 })).toBe("warning");
  });

  it("is soon within the wider horizon", () => {
    const byKm = severityFor({ kmRemaining: 1_200, daysRemaining: null, projectedDays: null, warningKm: 500 });
    expect(byKm).toBe("soon");
    const byProjection = severityFor({ kmRemaining: null, daysRemaining: null, projectedDays: 20 });
    expect(byProjection).toBe("soon");
  });

  it("is ok with room to spare", () => {
    expect(severityFor({ kmRemaining: 9_000, daysRemaining: 200, projectedDays: 180 })).toBe("ok");
  });

  it("lets a projection reach soon but never warning", () => {
    // 3 days away by projection alone: still only "soon", because a km/day
    // estimate is not precise enough to justify a hard alert.
    expect(severityFor({ kmRemaining: null, daysRemaining: null, projectedDays: 3 })).toBe("soon");
  });

  it("uses the documented defaults", () => {
    expect(severityFor({ kmRemaining: 400, daysRemaining: null, projectedDays: null })).toBe("warning");
    expect(severityFor({ kmRemaining: null, daysRemaining: 6, projectedDays: null })).toBe("warning");
  });
});

describe("human descriptions", () => {
  it("describes remaining and exceeded distance", () => {
    expect(describeKm(1_500)).toContain("1.500");
    expect(describeKm(-200)).toContain("superado");
    expect(describeKm(null)).toBeNull();
  });

  it("describes remaining and past days", () => {
    expect(describeDays(0)).toBe("vence hoy");
    expect(describeDays(1)).toBe("vence mañana");
    expect(describeDays(9)).toBe("en 9 días");
    expect(describeDays(-3)).toContain("vencido hace 3");
    expect(describeDays(null)).toBeNull();
  });

  it("marks untrusted projections and stays silent without confidence", () => {
    expect(describeProjection(20, "high")).toBe("20 días");
    expect(describeProjection(20, "low")).toBe("~20 días");
    expect(describeProjection(45, "medium")).toBe("~6 semanas");
    expect(describeProjection(20, "none")).toBeNull();
    expect(describeProjection(null, "high")).toBeNull();
  });
});

describe("describeRelativeDay", () => {
  it("reads today and yesterday", () => {
    expect(describeRelativeDay(new Date(2026, 2, 10), TODAY)).toBe("hoy");
    expect(describeRelativeDay(new Date(2026, 2, 9), TODAY)).toBe("ayer");
  });

  it("treats a future date as today rather than inventing a negative", () => {
    expect(describeRelativeDay(new Date(2026, 2, 12), TODAY)).toBe("hoy");
  });

  it("escalates through days, weeks, months and years", () => {
    expect(describeRelativeDay(new Date(2026, 2, 7), TODAY)).toBe("hace 3 días");
    expect(describeRelativeDay(new Date(2026, 2, 1), TODAY)).toBe("hace 1 sem");
    expect(describeRelativeDay(new Date(2025, 11, 10), TODAY)).toBe("hace 3 meses");
    expect(describeRelativeDay(new Date(2024, 2, 10), TODAY)).toBe("hace 2 años");
  });

  it("stays silent for an unparseable value", () => {
    expect(describeRelativeDay("no-es-fecha", TODAY)).toBe("");
    expect(describeRelativeDay(null as unknown as string, TODAY)).toBe("");
  });
});

describe("buildUpcoming", () => {
  const reminders: ReminderLike[] = [
    { id: "r1", title: "Cambio de aceite", dueKm: 11_000, warningKm: 500, isActive: true },
    { id: "r2", title: "SOAT", dueDate: new Date(2026, 2, 12), warningDays: 7, isActive: true },
    { id: "r3", title: "Inactivo", dueKm: 10_500, isActive: false },
    { id: "r4", title: "Ya hecho", dueKm: 10_500, completedAt: new Date(2026, 2, 1) },
  ];

  const maintenance: MaintenanceLike[] = [
    { id: "m1", description: "Frenos", nextDueKm: 10_100, reminderEnabled: true },
    { id: "m2", description: "Sin recordatorio", nextDueKm: 10_100, reminderEnabled: false },
  ];

  const documents: DocumentLike[] = [
    { id: "d1", type: "tecnomecanica", expiryDate: new Date(2026, 3, 20), reminderDays: 30, reminderEnabled: true },
    { id: "d2", type: "otro", expiryDate: new Date(2026, 3, 20), reminderEnabled: false },
  ];

  const build = (overrides: Partial<Parameters<typeof buildUpcoming>[0]> = {}) =>
    buildUpcoming({
      currentKm: 10_000,
      avgKmPerDay: 50,
      reminders,
      maintenanceRecords: maintenance,
      documents,
      today: TODAY,
      documentLabel: (doc) => (doc.type === "tecnomecanica" ? "Tecnomecánica" : doc.type),
      ...overrides,
    });

  it("skips inactive, completed and muted records", () => {
    const ids = build().map((item) => item.id);
    expect(ids).not.toContain("reminder-r3");
    expect(ids).not.toContain("reminder-r4");
    expect(ids).not.toContain("maintenance-m2");
    expect(ids).not.toContain("document-d2");
  });

  it("gives a km-only item a projected date", () => {
    const item = build().find((i) => i.id === "reminder-r1")!;
    expect(item.source).toBe("km");
    expect(item.kmRemaining).toBe(1_000);
    expect(item.daysRemaining).toBeNull();
    expect(item.projectedDays).toBe(20);
    expect(item.projectedDate).not.toBeNull();
    expect(item.confidence).toBe("medium");
    expect(item.effectiveDays).toBe(20);
  });

  it("prefers an explicit date over the projection", () => {
    const item = build().find((i) => i.id === "reminder-r2")!;
    expect(item.daysRemaining).toBe(2);
    expect(item.effectiveDays).toBe(2);
    expect(item.source).toBe("date");
  });

  it("marks both axes when a target has date and km", () => {
    const items = build({
      reminders: [{ id: "x", title: "Híbrido", dueKm: 10_500, dueDate: new Date(2026, 2, 20), isActive: true }],
    });
    expect(items.find((i) => i.id === "reminder-x")!.source).toBe("both");
  });

  it("sorts worst-first by days, pushing unbounded items last", () => {
    const items = build();
    const days = items.map((i) => i.effectiveDays);
    const known = days.filter((d): d is number => d != null);
    expect(known).toEqual([...known].sort((a, b) => a - b));
    const lastKnownIndex = days.lastIndexOf(known[known.length - 1]);
    for (let i = lastKnownIndex + 1; i < days.length; i += 1) {
      expect(days[i]).toBeNull();
    }
  });

  it("flags an overdue km target as danger with progress saturated", () => {
    const items = build({ reminders: [{ id: "late", title: "Atrasado", dueKm: 9_000, isActive: true }] });
    const item = items.find((i) => i.id === "reminder-late")!;
    expect(item.severity).toBe("danger");
    expect(item.kmRemaining).toBe(-1_000);
    expect(item.progress).toBe(1);
    expect(item.projectedDate).toBeNull();
  });

  it("sorts a km-only overdue item ahead of everything else", () => {
    const items = build({ reminders: [{ id: "late", title: "Atrasado", dueKm: 9_000, isActive: true }] });
    // Passed limits have no horizon, so they must lead the list regardless.
    expect(items.findIndex((i) => i.id === "reminder-late")).toBeLessThan(
      items.findIndex((i) => i.id === "document-d1")
    );
  });

  it("labels documents through the injected resolver", () => {
    const item = build().find((i) => i.id === "document-d1")!;
    expect(item.title).toBe("Tecnomecánica");
    expect(item.confidence).toBe("high");
  });

  it("returns an empty list for a vehicle with nothing pending", () => {
    expect(build({ reminders: [], maintenanceRecords: [], documents: [] })).toEqual([]);
  });

  it("survives a vehicle with no learned rate", () => {
    const items = build({ avgKmPerDay: 0, isLearning: true });
    const kmOnly = items.find((i) => i.id === "reminder-r1")!;
    expect(kmOnly.projectedDate).toBeNull();
    expect(kmOnly.confidence).toBe("none");
    expect(kmOnly.effectiveDays).toBeNull();
    // The explicit-date document is unaffected by the missing rate.
    expect(items.find((i) => i.id === "document-d1")!.effectiveDays).toBe(41);
  });

  it("counts only items needing attention", () => {
    const items = build();
    const actionable = countActionable(items);
    expect(actionable).toBeGreaterThan(0);
    expect(actionable).toBeLessThanOrEqual(items.length);
    expect(items.filter((i) => i.severity === "danger" || i.severity === "warning")).toHaveLength(actionable);
  });
});
