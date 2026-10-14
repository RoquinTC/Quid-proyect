/**
 * Fuel Efficiency — tank-to-tank cycle engine.
 *
 * Implements the rule Drivvo documents for its own "fuel efficiency": the value
 * is only computed between two FULL tanks. Filling up closes the previous cycle
 * and opens a new one, and the fuel loaded during the closing fill measures what
 * was consumed since the previous full tank.
 *
 * Two consequences shape this implementation:
 *
 *  1. PARTIAL FILLS COUNT. Everything loaded after a full tank — partial or not —
 *     is fuel that was burned before the cycle closes. Ignoring partial fills
 *     under-counts volume and therefore OVERSTATES efficiency, which is the
 *     opposite of a safe error.
 *
 *  2. THE AVERAGE IS A QUOTIENT OF SUMS (Σdistance / Σvolume), never a mean of
 *     per-cycle ratios. Both give similar-looking numbers, but only the first is
 *     correct when cycles have different lengths.
 *
 * Ordering is by odometer, not by date, because that is what defines a cycle.
 * Everything here is pure: no DB, no React, no I/O.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface EfficiencyLogLike {
  id: string;
  date: string | Date;
  km: number;
  gallons: number;
  isFullTank?: boolean | null;
  pricePerGallon?: number | null;
  amount?: number | null;
  station?: string | null;
}

export interface EfficiencyCycle {
  /** Id of the log that closed the cycle. */
  id: string;
  startKm: number;
  endKm: number;
  startDate: string | Date;
  endDate: string | Date;
  /** Kilometres covered by the cycle. */
  distance: number;
  /** Fuel loaded during the cycle, partial fills included. */
  volume: number;
  /** kilometre per gallon (or per unit of volume). */
  efficiency: number;
  cost: number;
  costPerKm: number;
  /** Volume-weighted price per gallon across the cycle. */
  averagePricePerGallon: number;
  /** Station of the closing fill, when recorded. */
  station: string | null;
  /** How many of the cycle's fills were partial. */
  partialFills: number;
}

export interface EfficiencyBucket {
  key: string;
  samples: number;
  distance: number;
  volume: number;
  /** Weighted efficiency for the bucket. */
  efficiency: number;
}

export interface EfficiencySummary {
  /** Headline efficiency over every closed cycle. */
  average: number;
  /** Efficiency of the most recent closed cycle. */
  lastCycle: EfficiencyCycle | null;
  best: number | null;
  worst: number | null;
  cycles: EfficiencyCycle[];
  distanceTotal: number;
  volumeTotal: number;
  /** Full tanks over usable logs. Data quality signal, as Drivvo surfaces it. */
  fullTankRatio: number;
  /** True when no cycle could be closed yet. */
  isLearning: boolean;
  /** True when the headline number came from closed cycles only. */
  fromCycles: boolean;
  /** Logs dropped because a full tank had not been seen yet. */
  discardedBeforeFirstFullTank: number;
  /** Which slice of history produced the headline number. */
  scope: EfficiencyScope;
  /** The window applied, when one was requested. */
  windowDays: number | null;
  /** Cycles found in the whole history, before any window. */
  totalCycles: number;
}

export type EfficiencyScope = "window" | "all-time" | "estimate";

// ─── Helpers ─────────────────────────────────────────────────────────

function positive(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Cost of a fill: the recorded amount, or gallons × price as a fallback. */
function fillCost(log: EfficiencyLogLike): number {
  const amount = positive(log.amount);
  if (amount > 0) return amount;
  return positive(log.gallons) * positive(log.pricePerGallon);
}

/**
 * Usable logs sorted by odometer.
 *
 * A log with no volume cannot take part in a cycle (a zero-volume fill inside a
 * cycle would inflate efficiency — the same latent defect Drivvo has), so it is
 * dropped rather than silently skewing the result.
 *
 * A zero odometer is KEPT: it is a legitimate reading for a brand-new vehicle,
 * and dropping it would silently discard the fill that opens the first cycle.
 */
export function usableEfficiencyLogs(logs: EfficiencyLogLike[] | null | undefined): EfficiencyLogLike[] {
  return [...(logs ?? [])]
    .filter((log): log is EfficiencyLogLike => Boolean(log))
    .filter((log) => {
      const gallons = Number(log.gallons ?? 0);
      const km = Number(log.km ?? 0);
      return Number.isFinite(gallons) && gallons > 0 && Number.isFinite(km) && km >= 0;
    })
    .sort((a, b) => a.km - b.km);
}

// ─── Core: cycles ────────────────────────────────────────────────────

/**
 * Walk the odometer and close a cycle at every full tank.
 *
 * Volume and cost accumulate from the log right after the previous full tank up
 * to and including the one that closes the cycle.
 */
export function buildEfficiencyCycles(logs: EfficiencyLogLike[] | null | undefined): {
  cycles: EfficiencyCycle[];
  discardedBeforeFirstFullTank: number;
} {
  const ordered = usableEfficiencyLogs(logs);
  const cycles: EfficiencyCycle[] = [];
  let discardedBeforeFirstFullTank = 0;

  let baseline: EfficiencyLogLike | null = null;
  let volume = 0;
  let cost = 0;
  let partialFills = 0;

  for (const log of ordered) {
    if (!baseline) {
      if (log.isFullTank) {
        baseline = log; // the cycle opens here; this fill is not consumed yet
      } else {
        discardedBeforeFirstFullTank += 1;
      }
      continue;
    }

    volume += positive(log.gallons);
    cost += fillCost(log);
    if (!log.isFullTank) partialFills += 1;

    if (!log.isFullTank) continue;

    const distance = log.km - baseline.km;
    if (distance > 0 && volume > 0) {
      cycles.push({
        id: log.id,
        startKm: baseline.km,
        endKm: log.km,
        startDate: baseline.date,
        endDate: log.date,
        distance,
        volume: Math.round(volume * 1000) / 1000,
        efficiency: Math.round((distance / volume) * 1000) / 1000,
        cost: Math.round(cost * 100) / 100,
        costPerKm: Math.round((cost / distance) * 100) / 100,
        averagePricePerGallon: Math.round((cost / volume) * 100) / 100,
        station: log.station ?? null,
        partialFills,
      });
    }

    baseline = log;
    volume = 0;
    cost = 0;
    partialFills = 0;
  }

  return { cycles, discardedBeforeFirstFullTank };
}

// ─── Aggregation ─────────────────────────────────────────────────────

/**
 * Summarize a vehicle's efficiency from its fill history.
 *
 * WHY A WINDOW EXISTS
 *
 * The average is a quotient of sums over every closed cycle, so it is cumulative:
 * a bad year keeps pulling on the number forever. That is not theoretical. In
 * production one vehicle had years whose records were incomplete — 862 km
 * recorded between two fills on a 3.65-gallon tank, which no motorcycle can do —
 * and those missing fills inflated the all-time average to 213 km/gallon against
 * a real figure nearer 140. Diluting that away would have taken about 44,000 km
 * of flawless logging.
 *
 * So the headline can be limited to recent cycles, which reflects how the vehicle
 * is driven now and heals itself as soon as new fills are complete. The window is
 * never silent about a shortage of data: if it holds fewer than
 * `minCyclesInWindow` cycles the full history is used instead, and `scope` says
 * which one won.
 *
 * When no cycle can be closed at all, the caller-supplied `fallbackAverage` is
 * kept (typically the conservative per-vehicle-type default) and `isLearning`
 * stays true, so the UI never presents a guess as a measurement.
 */
export function summarizeEfficiency(
  logs: EfficiencyLogLike[] | null | undefined,
  options: {
    fallbackAverage?: number;
    /** Count only cycles closed within this many days. */
    windowDays?: number;
    /** Reference instant for the window. Defaults to now. */
    now?: Date;
    /** Cycles a window needs before it is trusted over the full history. */
    minCyclesInWindow?: number;
  } = {}
): EfficiencySummary {
  const { cycles: allCycles, discardedBeforeFirstFullTank } = buildEfficiencyCycles(logs);
  const usable = usableEfficiencyLogs(logs);
  const fullTanks = usable.filter((log) => log.isFullTank).length;

  const windowDays = options.windowDays != null && options.windowDays > 0 ? options.windowDays : null;
  const minCycles = options.minCyclesInWindow ?? 2;
  const now = options.now ?? new Date();

  let cycles = allCycles;
  let scope: EfficiencyScope = allCycles.length > 0 ? "all-time" : "estimate";

  if (windowDays != null && allCycles.length > 0) {
    const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
    const inWindow = allCycles.filter((cycle) => {
      const end = toDate(cycle.endDate);
      return end != null && end.getTime() >= cutoff;
    });

    if (inWindow.length >= minCycles) {
      cycles = inWindow;
      scope = "window";
    }
    // Too little recent data: fall back to the full history rather than telling
    // a vehicle that still has years of records that nothing is known.
  }

  const distanceTotal = cycles.reduce((sum, cycle) => sum + cycle.distance, 0);
  const volumeTotal = cycles.reduce((sum, cycle) => sum + cycle.volume, 0);
  const fromCycles = cycles.length > 0 && volumeTotal > 0;
  const average = fromCycles ? distanceTotal / volumeTotal : positive(options.fallbackAverage);

  const efficiencies = cycles.map((cycle) => cycle.efficiency);
  const lastCycle = cycles.length > 0 ? cycles[cycles.length - 1] : null;

  return {
    average: Math.round(average * 1000) / 1000,
    lastCycle,
    best: efficiencies.length > 0 ? Math.max(...efficiencies) : null,
    worst: efficiencies.length > 0 ? Math.min(...efficiencies) : null,
    cycles,
    distanceTotal,
    volumeTotal: Math.round(volumeTotal * 1000) / 1000,
    fullTankRatio: usable.length > 0 ? fullTanks / usable.length : 0,
    isLearning: !fromCycles,
    fromCycles,
    discardedBeforeFirstFullTank,
    scope,
    windowDays,
    totalCycles: allCycles.length,
  };
}

/**
 * Group cycles by a key (station, fuel type…) and return weighted efficiency.
 *
 * Weighting by distance/volume rather than averaging per-cycle ratios keeps a
 * single long trip from being cancelled out by a short one.
 */
export function bucketEfficiency(
  cycles: EfficiencyCycle[],
  keyOf: (cycle: EfficiencyCycle) => string | null | undefined,
  options: { minSamples?: number } = {}
): EfficiencyBucket[] {
  const minSamples = options.minSamples ?? 1;
  const buckets = new Map<string, { samples: number; distance: number; volume: number }>();

  for (const cycle of cycles) {
    const raw = keyOf(cycle);
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key) continue;
    const current = buckets.get(key) ?? { samples: 0, distance: 0, volume: 0 };
    current.samples += 1;
    current.distance += cycle.distance;
    current.volume += cycle.volume;
    buckets.set(key, current);
  }

  return [...buckets.entries()]
    .filter(([, value]) => value.samples >= minSamples && value.volume > 0)
    .map(([key, value]) => ({
      key,
      samples: value.samples,
      distance: value.distance,
      volume: Math.round(value.volume * 1000) / 1000,
      efficiency: Math.round((value.distance / value.volume) * 1000) / 1000,
    }))
    .sort((a, b) => b.efficiency - a.efficiency);
}

/**
 * How far above the reference figure an implied efficiency may go before the
 * fill is treated as mislabelled.
 */
export const FULL_TANK_TOLERANCE_FACTOR = 2.5;

export interface FullTankSuspicion {
  /** Kilometres since the previous full tank. */
  distance: number;
  /** Efficiency this fill would produce if it really filled the tank. */
  impliedEfficiency: number;
  /** The figure it was compared against. */
  reference: number;
}

/**
 * Is this fill marked "full" likely to be a mistake?
 *
 * A full tank is what closes a cycle, so the app divides the whole distance
 * since the previous full tank by the gallons loaded now. A SMALL fill is not
 * suspicious on its own — topping off an almost-full tank is a perfectly good
 * full tank, and the most precise kind. The defect is a small fill after a LONG
 * distance, because that is what inflates the average and makes the gauge show
 * fuel that is not there.
 *
 * Returns null when there is nothing to flag.
 */
export function detectSuspiciousFullTank(params: {
  km: number;
  gallons: number;
  isFullTank?: boolean | null;
  /** Known fills, to locate the previous full tank. */
  history?: Array<{ km: number; isFullTank?: boolean | null }> | null;
  /** The vehicle's own efficiency, or a per-type default. */
  referenceEfficiency?: number | null;
  toleranceFactor?: number;
}): FullTankSuspicion | null {
  const { km, gallons, isFullTank, history, referenceEfficiency, toleranceFactor } = params;

  if (!isFullTank) return null;
  if (!(positive(gallons) > 0) || !(positive(km) > 0)) return null;

  const reference = positive(referenceEfficiency);
  if (reference <= 0) return null;

  const previousFullTank = [...(history ?? [])]
    .filter((log) => Boolean(log) && log.isFullTank && positive(log.km) < km)
    .sort((a, b) => b.km - a.km)[0];
  if (!previousFullTank) return null;

  const distance = km - previousFullTank.km;
  if (distance <= 0) return null;

  const impliedEfficiency = distance / positive(gallons);
  const factor = toleranceFactor ?? FULL_TANK_TOLERANCE_FACTOR;
  if (impliedEfficiency <= reference * factor) return null;

  return { distance, impliedEfficiency, reference };
}

/**
 * How much of the recorded history actually feeds the calculation.
 * Drivvo surfaces the same idea as the "full tank quality" bar.
 */
export function describeEfficiencyQuality(summary: EfficiencySummary): string {
  if (summary.isLearning) {
    return "Se necesitan dos tanqueos a tanque lleno para calcular el rendimiento.";
  }
  const ratio = Math.round(summary.fullTankRatio * 100);
  if (ratio >= 80) return `Datos sólidos: ${ratio}% de tus cargas son a tanque lleno.`;
  if (ratio >= 50) return `Datos aceptables: ${ratio}% a tanque lleno. Más tanques llenos lo hacen más preciso.`;
  return `Datos flojos: solo ${ratio}% a tanque lleno. Cargá el tanque completo para mejorar el cálculo.`;
}
