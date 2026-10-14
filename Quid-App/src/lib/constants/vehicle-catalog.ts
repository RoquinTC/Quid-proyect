export type VehicleTypeOption = {
  value: string;
  label: string;
  shortLabel: string;
  defaultIcon: string;
  gradient: string;
  defaultKmPerGallon: number;
};

/**
 * Default efficiency per vehicle type.
 *
 * These were previously stored as bare numbers taken from published per-LITRE
 * figures, but they are consumed as kilometres per GALLON. A bus reading
 * "10 km/gallon" is 2.6 km/L — physically impossible — which is what gave the
 * mix-up away. The per-litre value is now the input and the conversion is
 * explicit, because reading the old numbers as km/gal understated every initial
 * range estimate by a factor of 3.785.
 */
const LITERS_PER_GALLON = 3.785411784;

/** Convert a published km-per-litre figure into the km-per-gallon the app uses. */
export function kmPerGallonFromKmPerLiter(kmPerLiter: number) {
  return Math.round(kmPerLiter * LITERS_PER_GALLON);
}

export const VEHICLE_TYPE_OPTIONS: VehicleTypeOption[] = [
  {
    value: "motorcycle",
    label: "Motocicleta",
    shortLabel: "Moto",
    defaultIcon: "motorcycle",
    gradient: "from-cyan-500 to-blue-600",
    defaultKmPerGallon: kmPerGallonFromKmPerLiter(35), // ~132 km/gal
  },
  {
    value: "electric_motorcycle",
    label: "Moto eléctrica",
    shortLabel: "Moto eléctrica",
    defaultIcon: "electric-motorcycle",
    gradient: "from-sky-500 to-emerald-500",
    defaultKmPerGallon: 0,
  },
  {
    value: "scooter",
    label: "Scooter / motoneta",
    shortLabel: "Scooter",
    defaultIcon: "scooter",
    gradient: "from-violet-500 to-cyan-500",
    defaultKmPerGallon: kmPerGallonFromKmPerLiter(45), // ~170 km/gal
  },
  {
    value: "electric_scooter",
    label: "Patín eléctrico",
    shortLabel: "Patín",
    defaultIcon: "electric-scooter",
    gradient: "from-lime-500 to-cyan-500",
    defaultKmPerGallon: 0,
  },
  {
    value: "bicycle",
    label: "Bicicleta",
    shortLabel: "Bici",
    defaultIcon: "bike",
    gradient: "from-emerald-500 to-teal-600",
    defaultKmPerGallon: 0,
  },
  {
    value: "e_bike",
    label: "Bicicleta eléctrica",
    shortLabel: "E-bike",
    defaultIcon: "e-bike",
    gradient: "from-emerald-500 to-sky-500",
    defaultKmPerGallon: 0,
  },
  {
    value: "car",
    label: "Carro",
    shortLabel: "Carro",
    defaultIcon: "car-front",
    gradient: "from-blue-500 to-indigo-600",
    defaultKmPerGallon: kmPerGallonFromKmPerLiter(25), // ~95 km/gal
  },
  {
    value: "electric_car",
    label: "Carro eléctrico",
    shortLabel: "Auto EV",
    defaultIcon: "electric-car",
    gradient: "from-blue-500 to-emerald-500",
    defaultKmPerGallon: 0,
  },
  {
    value: "taxi",
    label: "Taxi / plataforma",
    shortLabel: "Taxi",
    defaultIcon: "taxi",
    gradient: "from-yellow-400 to-orange-500",
    defaultKmPerGallon: kmPerGallonFromKmPerLiter(24), // ~91 km/gal
  },
  {
    value: "truck",
    label: "Camión / camioneta",
    shortLabel: "Camión",
    defaultIcon: "truck",
    gradient: "from-indigo-500 to-purple-600",
    defaultKmPerGallon: kmPerGallonFromKmPerLiter(15), // ~57 km/gal
  },
  {
    value: "electric_truck",
    label: "Camión eléctrico",
    shortLabel: "Truck EV",
    defaultIcon: "truck-electric",
    gradient: "from-indigo-500 to-emerald-500",
    defaultKmPerGallon: 0,
  },
  {
    value: "bus",
    label: "Bus / van",
    shortLabel: "Bus",
    defaultIcon: "bus",
    gradient: "from-orange-500 to-rose-500",
    defaultKmPerGallon: kmPerGallonFromKmPerLiter(10), // ~38 km/gal
  },
  {
    value: "other",
    label: "Otro vehículo",
    shortLabel: "Otro",
    defaultIcon: "route",
    gradient: "from-slate-500 to-gray-600",
    defaultKmPerGallon: kmPerGallonFromKmPerLiter(18), // ~68 km/gal
  },
];

export const VEHICLE_TYPE_LABELS = Object.fromEntries(
  VEHICLE_TYPE_OPTIONS.map((type) => [type.value, type.label]),
) as Record<string, string>;

export const VEHICLE_TYPE_SHORT_LABELS = Object.fromEntries(
  VEHICLE_TYPE_OPTIONS.map((type) => [type.value, type.shortLabel]),
) as Record<string, string>;

export const VEHICLE_GRADIENTS = Object.fromEntries(
  VEHICLE_TYPE_OPTIONS.map((type) => [type.value, type.gradient]),
) as Record<string, string>;

export const VEHICLE_DEFAULT_ICONS = Object.fromEntries(
  VEHICLE_TYPE_OPTIONS.map((type) => [type.value, type.defaultIcon]),
) as Record<string, string>;

export const VEHICLE_TYPE_ICON_KEYS: Record<string, string[]> = {
  motorcycle: ["motorcycle", "motorcycle-sport", "scooter", "wheel", "gauge", "fuel", "wrench", "route", "shield", "zap"],
  electric_motorcycle: ["electric-motorcycle", "motorcycle", "zap", "battery", "route", "gauge", "shield", "star"],
  scooter: ["scooter", "motorcycle", "wheel", "route", "gauge", "fuel", "star"],
  electric_scooter: ["electric-scooter", "zap", "battery", "route", "wheel", "star"],
  bicycle: ["bike", "route", "map", "wheel", "shield", "sun", "star"],
  e_bike: ["e-bike", "bike", "zap", "battery", "route", "wheel", "star"],
  car: ["car-front", "car", "gauge", "fuel", "route", "shield", "wrench", "star"],
  electric_car: ["electric-car", "car-front", "zap", "battery", "route", "gauge", "star"],
  taxi: ["taxi", "car-front", "route", "map", "star", "gauge"],
  truck: ["truck", "truck-front", "fuel", "gauge", "route", "wrench", "shield"],
  electric_truck: ["truck-electric", "truck", "zap", "battery", "route", "gauge"],
  bus: ["bus", "bus-front", "route", "map", "shield", "gauge"],
  other: ["route", "map", "navigation", "gauge", "wrench", "shield", "star"],
};

export const ELECTRIC_VEHICLE_TYPES = new Set(["electric_motorcycle", "electric_scooter", "e_bike", "electric_car", "electric_truck"]);
export const HUMAN_POWERED_VEHICLE_TYPES = new Set(["bicycle"]);

export function getVehicleTypeLabel(type?: string | null, short = false) {
  if (!type) return short ? "Vehículo" : "Vehículo";
  return (short ? VEHICLE_TYPE_SHORT_LABELS[type] : VEHICLE_TYPE_LABELS[type]) || type;
}

export function getVehicleGradient(type?: string | null) {
  return (type && VEHICLE_GRADIENTS[type]) || VEHICLE_GRADIENTS.other;
}

export function getVehicleDefaultIcon(type?: string | null) {
  return (type && VEHICLE_DEFAULT_ICONS[type]) || VEHICLE_DEFAULT_ICONS.other;
}

export function getVehicleIconKeys(type?: string | null) {
  return (type && VEHICLE_TYPE_ICON_KEYS[type]) || VEHICLE_TYPE_ICON_KEYS.other;
}

export function getVehicleDefaultEfficiency(type?: string | null) {
  return VEHICLE_TYPE_OPTIONS.find((option) => option.value === type)?.defaultKmPerGallon
    ?? kmPerGallonFromKmPerLiter(18);
}

