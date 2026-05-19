// ─── Shared Fuel Level Calculation Utility ───
// Used by both /api/vehicles GET and /api/vehicles/[id]/fuel-level GET
// to compute the current fuel level for a vehicle based on its fuel logs.

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
  fuelLogs: FuelLogInput[]
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
    };
  }

  const tankCapacity = vehicle.tankCapacity;

  // ── Step 1: Calculate average km/gallon ──
  let avgKmPerGallon = 0;
  let isLearning = true; // Start as true, set to false only when we have real data

  // Prefer full-tank-to-full-tank calculations (most accurate)
  const fullTankLogs = fuelLogs
    .filter(log => log.isFullTank)
    .sort((a, b) => a.km - b.km);

  if (fullTankLogs.length >= 2) {
    const firstLog = fullTankLogs[0];
    const lastLog = fullTankLogs[fullTankLogs.length - 1];
    const totalKm = lastLog.km - firstLog.km;
    // The gallons filled at each full tank represent what was consumed since the previous fill
    const totalGallons = fullTankLogs.slice(1).reduce((sum, log) => sum + log.gallons, 0);

    if (totalGallons > 0 && totalKm > 0) {
      avgKmPerGallon = totalKm / totalGallons;
      isLearning = false;
    }
  }

  // Fallback: use all logs if not enough full-tank data
  if (avgKmPerGallon === 0 && fuelLogs.length >= 2) {
    const sortedLogs = [...fuelLogs].sort((a, b) => a.km - b.km);
    const totalKm = sortedLogs[sortedLogs.length - 1].km - sortedLogs[0].km;
    const totalGallons = sortedLogs.slice(1).reduce((sum, log) => sum + log.gallons, 0);

    if (totalGallons > 0 && totalKm > 0) {
      avgKmPerGallon = totalKm / totalGallons;
      // This is still learning because it's not full-tank-to-full-tank
      // but it's better than default, so we mark it as semi-learning
      isLearning = true;
    }
  }

  // Default efficiency if no data (conservative estimates by vehicle type)
  if (avgKmPerGallon === 0) {
    avgKmPerGallon = vehicle.type === 'motorcycle' ? 35 : vehicle.type === 'car' ? 25 : 15;
    isLearning = true;
  }

  // ── Step 2: Find the last full tank as baseline ──
  // Logs are sorted by date DESC, so find() gets the most recent full tank
  const lastFullTankLog = fuelLogs.find(log => log.isFullTank);

  let currentFuel = 0;
  let lastFullTankDate: string | null = null;
  let lastFullTankKm = vehicle.currentKm;
  let totalConsumed = 0;

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

    // Add partial refuels back (they add fuel to the tank)
    if (logsAfterFullTank.length > 0) {
      const partialRefuels = logsAfterFullTank.filter(log => !log.isFullTank);
      partialRefuels.forEach(log => {
        currentFuel += log.gallons;
      });
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
        const refuelDate = new Date();
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
  };
}
