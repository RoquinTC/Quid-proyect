import { describe, it, expect } from "vitest";
import {
  VEHICLE_TYPE_OPTIONS,
  getVehicleDefaultEfficiency,
  kmPerGallonFromKmPerLiter,
} from "@/lib/constants/vehicle-catalog";

const LITERS_PER_GALLON = 3.785411784;

/** What the stored figure implies in km per litre. */
function impliedKmPerLiter(kmPerGallon: number) {
  return kmPerGallon / LITERS_PER_GALLON;
}

/** Vehicle types that burn fuel and therefore need a real efficiency figure. */
const FUEL_TYPES = ["motorcycle", "scooter", "car", "taxi", "truck", "bus", "other"];

describe("kmPerGallonFromKmPerLiter", () => {
  it("converts with the US gallon", () => {
    expect(kmPerGallonFromKmPerLiter(35)).toBe(132);
    expect(kmPerGallonFromKmPerLiter(10)).toBe(38);
    expect(kmPerGallonFromKmPerLiter(45)).toBe(170);
  });

  it("keeps zero at zero", () => {
    expect(kmPerGallonFromKmPerLiter(0)).toBe(0);
  });
});

describe("vehicle default efficiency", () => {
  /**
   * The defect this guards.
   *
   * The catalog used to store published per-LITRE figures while the app consumed
   * them as per-GALLON: a motorcycle read 35 and a bus read 10. Ten kilometres
   * per gallon is 2.6 km per litre, which no bus can do — the giveaway that the
   * numbers were litred but the field was galloned. The result understated every
   * initial range estimate 3.785-fold.
   */
  it("stores figures that are plausible per litre, not per gallon", () => {
    for (const type of FUEL_TYPES) {
      const value = VEHICLE_TYPE_OPTIONS.find((option) => option.value === type)!.defaultKmPerGallon;
      const perLiter = impliedKmPerLiter(value);
      expect(perLiter, `${type} implies ${perLiter.toFixed(1)} km/L`).toBeGreaterThan(8);
      expect(perLiter, `${type} implies ${perLiter.toFixed(1)} km/L`).toBeLessThan(50);
    }
  });

  it("no longer reports a motorcycle doing 9 km per litre", () => {
    const motorcycle = getVehicleDefaultEfficiency("motorcycle");
    expect(motorcycle).toBe(132);
    expect(impliedKmPerLiter(motorcycle)).toBeCloseTo(35, 0);
  });

  it("gives a bus a physically sane figure", () => {
    const bus = getVehicleDefaultEfficiency("bus");
    expect(bus).toBe(38);
    expect(impliedKmPerLiter(bus)).toBeGreaterThan(8);
  });

  it("leaves human and electric power at zero", () => {
    for (const type of ["bicycle", "e_bike", "electric_car", "electric_motorcycle", "electric_truck", "electric_scooter"]) {
      expect(getVehicleDefaultEfficiency(type)).toBe(0);
    }
  });

  it("falls back to a sane figure for an unknown or missing type", () => {
    expect(getVehicleDefaultEfficiency(null)).toBe(68);
    expect(getVehicleDefaultEfficiency("hovercraft")).toBe(68);
  });

  it("covers every fuel type in the catalog", () => {
    for (const type of FUEL_TYPES) {
      expect(VEHICLE_TYPE_OPTIONS.some((option) => option.value === type)).toBe(true);
    }
  });
});
