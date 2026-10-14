// ─── Shared Fuel Level Calculation Utility ───
// Used by both /api/vehicles GET and /api/vehicles/[id]/fuel-level GET
// to compute the current fuel level for a vehicle based on its fuel logs.

import { getVehicleDefaultEfficiency } from "@/lib/constants/vehicle-catalog";
import { summarizeEfficiency } from "@/lib/fuel-efficiency";

interface FuelLogInput {
  id: string;
  date: Date;
  km: number;
  amount: number;
  pricePerGallon: number;
  gallons: number;
  isFullTank: boolean;
}

interface VehicleInput {
  tankCapacity: number | null;
  currentKm: number;
  type: string;
}

export interface FuelLevelResult {
  fuelLevel: number;       // percentage 0-100
  currentFuel: number;     // in gallons
  estimatedRange: number;  // km
  avgKmPerGallon: number;
  lastFullTankDate: string | null;
  lastFullTankKm: number;
  totalConsumed: number;   // gallons since last full tank
  anomalyDetected: boolean;
  expectedConsumption: number;
  actualConsumption: number;
  // ── Smart refuel prediction ──
  avgKmPerDay: number;           // average km driven per day (learned from history)
  daysUntilRefuel: number | null; // estimated days until tank is empty (null = not enough data)
  refuelByDate: string | null;    // ISO date string of estimated refuel date (null = not enough data)
  gallonsToRefuel: number;        // gallons needed to fill tank from current level
  isLowFuel: boolean;             // true if fuel level <= 20%
  isLearning: boolean;            // true if using default efficiency (not enough real data yet)
  lastPricePerGallon: number;     // price per gallon from the most recent fuel log

  // ── Explanatory breakdown ──
  // The level is an *estimate* driven by four inputs the user controls: the tank
  // capacity, the "full tank" flag, the odometer, and the efficiency. These
  // fields expose those inputs so a wrong reading can be explained instead of
  // just distrusted.
  /** Which path produced the number. */
  model: "full-tank" | "rough" | "none";
  /** Tank capacity the arithmetic assumed. */
  assumedTankCapacity: number;
  /** Kilometres travelled since the baseline full tank. */
  kmSinceFullTank: number;
  /** Gallons the model believes were burned since that baseline. */
  consumedSinceFullTank: number;
  /** Partial fills added back on top of the baseline. */
  partialsAddedSinceFullTank: number;
  /** Days since the most recent fuel log; null when there are none. */
  daysSinceLastLog: number | null;
  /** How much the level can be trusted. */
  confidence: "high" | "medium" | "low";
  /** Plain-language reasons behind `confidence`. */
  confidenceReasons: string[];
}

const DEFAULT_FUEL_LEVEL: FuelLevelResult = {
  fuelLevel: 0,
  currentFuel: 0,
  estimatedRange: 0,
  avgKmPerGallon: 0,
  lastFullTankDate: null,
  lastFullTankKm: 0,
  totalConsumed: 0,
  anomalyDetected: false,
  expectedConsumption: 0,
  actualConsumption: 0,
  avgKmPerDay: 0,
  daysUntilRefuel: null,
  refuelByDate: null,
  gallonsToRefuel: 0,
  isLowFuel: false,
  isLearning: true,
  lastPricePerGallon: 0,
  model: "none",
  assumedTankCapacity: 0,
  kmSinceFullTank: 0,
  consumedSinceFullTank: 0,
  partialsAddedSinceFullTank: 0,
  daysSinceLastLog: null,
  confidence: "low",
  confidenceReasons: ["Sin datos suficientes"],
};

/**
 * Calculate the current fuel level for a vehicle based on its fuel logs.
 * 
 * Algorithm:
 * 1. Find the last "full tank" log as the baseline (tank was full at that point)
 * 2. Calculate average km/gallon from historical full-tank-to-full-tank intervals
 * 3. From the full tank baseline, subtract estimated consumption based on km traveled
 * 4. Add any partial refuels since the full tank
 * 5. Detect anomalies (actual consumption > 130% of expected)
 * 6. Calculate average km/day to predict when refuel is needed
 */
export function calculateFuelLevel(
  vehicle: VehicleInput,
  fuelLogs: FuelLogInput[],
  now: Date = new Date()
): FuelLevelResult {
  // No tank capacity configured
  if (!vehicle.tankCapacity || vehicle.tankCapacity <= 0) {
    return DEFAULT_FUEL_LEVEL;
  }

  // No fuel logs
  if (fuelLogs.length === 0) {
    return {
      ...DEFAULT_FUEL_LEVEL,
      lastFullTankKm: vehicle.currentKm,
      gallonsToRefuel: vehicle.tankCapacity,
      assumedTankCapacity: vehicle.tankCapacity,
      confidenceReasons: ["Todavía no hay tanqueos registrados"],
    };
  }

  const tankCapacity = vehicle.tankCapacity;

  // ── Step 1: Calculate average km/gallon ──
  //
  // Tank-to-tank cycles are the single source of truth (see `fuel-efficiency`).
  // They include partial fills, which the previous inline arithmetic ignored:
  // summing only full-tank gallons under-counted volume and therefore OVERSTATED
  // efficiency whenever the driver topped up partially.
  const roughEstimate = (() => {
    if (fuelLogs.length < 2) return 0;
    const sortedLogs = [...fuelLogs].sort((a, b) => a.km - b.km);
    const totalKm = sortedLogs[sortedLogs.length - 1].km - sortedLogs[0].km;
    const totalGallons = sortedLogs.slice(1).reduce((sum, log) => sum + log.gallons, 0);
    return totalKm > 0 && totalGallons > 0 ? totalKm / totalGallons : 0;
  })();

  const efficiency = summarizeEfficiency(fuelLogs, {
    // Keep the previous rough estimate as the learning-state fallback so the
    // autonomy gauge does not regress for vehicles with little history.
    fallbackAverage: roughEstimate || getVehicleDefaultEfficiency(vehicle.type),
  });
  const avgKmPerGallon = efficiency.average;
  const isLearning = efficiency.isLearning;

  // ── Step 2: Find the last full tank as baseline ──
  //
  // Order defensively. The anchor MUST be the most recent full tank, but relying
  // on the caller to sort by date descending is a silent trap: an ascending array
  // anchors on the oldest full tank and destroys the estimate.
  const logsByDateDesc = [...fuelLogs].sort((a, b) => b.date.getTime() - a.date.getTime());
  const lastFullTankLog = logsByDateDesc.find(log => log.isFullTank);

  let currentFuel = 0;
  let lastFullTankDate: string | null = null;
  let lastFullTankKm = vehicle.currentKm;
  let totalConsumed = 0;
  let kmSinceFullTank = 0;
  let partialsAddedSinceFullTank = 0;
  let model: FuelLevelResult["model"] = "rough";

  if (lastFullTankLog) {
    // Start from full tank
    currentFuel = tankCapacity;
    lastFullTankDate = lastFullTankLog.date.toISOString();
    lastFullTankKm = lastFullTankLog.km;

    // Get all logs after the last full tank (by date, not by km)
    const logsAfterFullTank = fuelLogs
      .filter(log => log.date > lastFullTankLog.date && log.id !== lastFullTankLog.id)
      .sort((a, b) => a.km - b.km);

    // Use vehicle.currentKm as the reference point for consumption estimation.
    // This ensures the fuel level accounts for distance driven AFTER the last fuel log,
    // not just the distance recorded in fuel logs.
    const latestLogKm = logsAfterFullTank.length > 0
      ? logsAfterFullTank[logsAfterFullTank.length - 1].km
      : lastFullTankLog.km;
    const effectiveCurrentKm = Math.max(vehicle.currentKm, latestLogKm);
    const kmTraveled = effectiveCurrentKm - lastFullTankLog.km;

    if (kmTraveled > 0 && avgKmPerGallon > 0) {
      totalConsumed = kmTraveled / avgKmPerGallon;
      currentFuel = Math.max(0, tankCapacity - totalConsumed);
    }
    kmSinceFullTank = Math.max(0, kmTraveled);
    model = "full-tank";

    // Add partial refuels back (they add fuel to the tank)
    if (logsAfterFullTank.length > 0) {
      const partialRefuels = logsAfterFullTank.filter(log => !log.isFullTank);
      partialsAddedSinceFullTank = partialRefuels.reduce((sum, log) => sum + log.gallons, 0);
      currentFuel += partialsAddedSinceFullTank;
    }
  } else {
    // No full tank recorded - estimate from most recent logs using vehicle.currentKm
    const sortedLogs = [...fuelLogs].sort((a, b) => a.km - b.km);

    if (sortedLogs.length >= 1) {
      const totalAdded = sortedLogs.reduce((sum, log) => sum + log.gallons, 0);
      // Use vehicle.currentKm to estimate total distance from first log
      const firstLogKm = sortedLogs[0].km;
      const effectiveCurrentKm = Math.max(vehicle.currentKm, sortedLogs[sortedLogs.length - 1].km);
      const kmTraveled = effectiveCurrentKm - firstLogKm;

      if (kmTraveled > 0 && avgKmPerGallon > 0) {
        const estimatedConsumption = kmTraveled / avgKmPerGallon;
        currentFuel = Math.max(0, totalAdded - estimatedConsumption);
      } else {
        currentFuel = totalAdded;
      }
    }

    // Cap at tank capacity
    currentFuel = Math.min(currentFuel, tankCapacity);
  }

  // Clamp to valid range
  currentFuel = Math.max(0, Math.min(currentFuel, tankCapacity));

  // ── Step 3: Calculate derived values ──
  const fuelLevel = (currentFuel / tankCapacity) * 100;
  const estimatedRange = avgKmPerGallon > 0 ? currentFuel * avgKmPerGallon : 0;
  const gallonsToRefuel = Math.max(0, Math.round((tankCapacity - currentFuel) * 100) / 100);
  const isLowFuel = fuelLevel <= 20;

  // ── Step 4: Calculate average km per day (learned from fuel log history) ──
  let avgKmPerDay = 0;
  let daysUntilRefuel: number | null = null;
  let refuelByDate: string | null = null;

  // We need at least 2 fuel logs on different dates to estimate daily usage
  const sortedByDate = [...fuelLogs].sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sortedByDate.length >= 2) {
    const oldestLog = sortedByDate[0];
    const newestLog = sortedByDate[sortedByDate.length - 1];
    const totalDaysDiff = (newestLog.date.getTime() - oldestLog.date.getTime()) / (1000 * 60 * 60 * 24);
    const totalKmDiff = newestLog.km - oldestLog.km;

    // Only use if we have at least 3 days of history for a meaningful average
    if (totalDaysDiff >= 3 && totalKmDiff > 0) {
      avgKmPerDay = totalKmDiff / totalDaysDiff;

      // Predict days until refuel
      if (estimatedRange > 0 && avgKmPerDay > 0) {
        daysUntilRefuel = Math.floor(estimatedRange / avgKmPerDay);

        // Calculate the date
        const refuelDate = new Date(now);
        refuelDate.setDate(refuelDate.getDate() + daysUntilRefuel);
        refuelByDate = refuelDate.toISOString();
      }
    }
  }

  // ── Step 5: Anomaly detection ──
  let anomalyDetected = false;
  let expectedConsumption = 0;
  let actualConsumption = 0;

  if (lastFullTankLog && fuelLogs.length > 1) {
    const logsAfterFullTank = fuelLogs
      .filter(log => log.date > lastFullTankLog.date && log.id !== lastFullTankLog.id && !log.isFullTank)
      .sort((a, b) => a.km - b.km);

    if (logsAfterFullTank.length > 0) {
      const latestKm = logsAfterFullTank[logsAfterFullTank.length - 1].km;
      const kmSinceFullTank = latestKm - lastFullTankLog.km;

      expectedConsumption = kmSinceFullTank / avgKmPerGallon;
      actualConsumption = logsAfterFullTank.reduce((sum, log) => sum + log.gallons, 0);

      // Detect anomaly if actual consumption is 30% higher than expected
      if (expectedConsumption > 0 && actualConsumption > expectedConsumption * 1.3) {
        anomalyDetected = true;
      }
    }
  }

  // ── Step 6: Get last price per gallon from most recent fuel log ──
  const lastPricePerGallon = fuelLogs.length > 0
    ? [...fuelLogs].sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.pricePerGallon || 0
    : 0;

  // ── Step 7: How far can this estimate be trusted? ──
  //
  // The level is derived, not measured: it starts from a tank the user declared
  // full and subtracts estimated burn. Every input it depends on is a place
  // where reality can diverge, so the result says which ones are shaky.
  const mostRecentLog = [...fuelLogs].sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;
  const daysSinceLastLog = mostRecentLog
    ? Math.max(0, Math.floor((now.getTime() - mostRecentLog.date.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const confidenceReasons: string[] = [];
  const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;
  let confidence: FuelLevelResult["confidence"] = "high";
  const degrade = (level: "medium" | "low", reason: string) => {
    confidenceReasons.push(reason);
    if (CONFIDENCE_RANK[level] < CONFIDENCE_RANK[confidence]) confidence = level;
  };

  if (isLearning) {
    degrade("low", "El rendimiento todavía no se midió: se usa un valor típico del tipo de vehículo.");
  }
  if (daysSinceLastLog != null && daysSinceLastLog > 30) {
    degrade("low", `El último registro tiene ${daysSinceLastLog} días: no se sabe cuánto se manejó desde entonces.`);
  } else if (daysSinceLastLog != null && daysSinceLastLog > 7) {
    degrade("medium", `El último registro tiene ${daysSinceLastLog} días. Actualizá el kilometraje para afinar el nivel.`);
  }
  // The whole model hangs on the baseline tank being genuinely full. A fill far
  // smaller than the tank is the classic way this silently overestimates.
  if (lastFullTankLog && lastFullTankLog.gallons > 0 && lastFullTankLog.gallons < tankCapacity * 0.4) {
    degrade(
      "low",
      `El último "tanque lleno" cargó ${lastFullTankLog.gallons.toFixed(1)} de ${tankCapacity} gal. Si el tanque no quedó lleno, el nivel está sobreestimado.`
    );
  }
  if (!lastFullTankLog) {
    degrade("low", "No hay ningún tanqueo marcado como lleno: el nivel es una aproximación gruesa.");
  }
  if (fuelLogs.length < 3) {
    degrade("medium", "Hay pocos registros: la estimación mejora con más historial.");
  }
  if (confidenceReasons.length === 0) {
    confidenceReasons.push("Se apoya en un tanque lleno reciente y un rendimiento medido.");
  }

  return {
    fuelLevel: Math.round(fuelLevel * 100) / 100,
    currentFuel: Math.round(currentFuel * 100) / 100,
    estimatedRange: Math.round(estimatedRange),
    avgKmPerGallon: Math.round(avgKmPerGallon * 100) / 100,
    lastFullTankDate,
    lastFullTankKm,
    totalConsumed: Math.round(totalConsumed * 100) / 100,
    anomalyDetected,
    expectedConsumption: Math.round(expectedConsumption * 100) / 100,
    actualConsumption: Math.round(actualConsumption * 100) / 100,
    avgKmPerDay: Math.round(avgKmPerDay * 100) / 100,
    daysUntilRefuel,
    refuelByDate,
    gallonsToRefuel,
    isLowFuel,
    isLearning,
    lastPricePerGallon: Math.round(lastPricePerGallon * 100) / 100,
    model,
    assumedTankCapacity: tankCapacity,
    kmSinceFullTank: Math.round(kmSinceFullTank * 10) / 10,
    consumedSinceFullTank: Math.round(totalConsumed * 100) / 100,
    partialsAddedSinceFullTank: Math.round(partialsAddedSinceFullTank * 100) / 100,
    daysSinceLastLog,
    confidence,
    confidenceReasons,
  };
}
