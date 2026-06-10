"use client";

import type { ReactElement, SVGProps } from "react";
import {
  BatteryCharging,
  Bike,
  Bus,
  BusFront,
  Car,
  CarFront,
  CarTaxiFront,
  CircleDot,
  CircleGauge,
  Disc,
  Fuel,
  Gauge,
  HelpCircle,
  Map,
  Navigation,
  Route,
  Shield,
  Star,
  Sun,
  Truck,
  TruckElectric,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  getVehicleDefaultIcon,
  getVehicleIconKeys,
  VEHICLE_TYPE_ICON_KEYS,
} from "@/lib/constants/vehicle-catalog";

type IconComponent = LucideIcon | ((props: SVGProps<SVGSVGElement>) => ReactElement);

function MotorcycleGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="M8.5 17h4.2l2.8-5.5h-3.2" />
      <path d="M10 9h3.2l2.8 3" />
      <path d="M14.8 8.5h3.4l1.5 2.5" />
      <path d="M6.5 14.2 9 10h2" />
      <path d="M4.2 12.7h3.3" />
    </svg>
  );
}

function SportMotorcycleGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="5.5" cy="17" r="2.8" />
      <circle cx="18.5" cy="17" r="2.8" />
      <path d="M8 16.5h4.7l2.4-4.8h-3.7l-2.8 2.7" />
      <path d="M12 9.2h4.4l2.2 2.5" />
      <path d="M15.8 8h3.4" />
      <path d="M4.5 13.8h5.2" />
      <path d="m7.6 11.2 2.3-2.1" />
    </svg>
  );
}

function ScooterGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M9.5 18h6" />
      <path d="M12 18V9.5h3.5" />
      <path d="M15.5 9.5 18 18" />
      <path d="M12 11H8.5a2.5 2.5 0 0 0-2.3 1.5L5 15.5" />
      <path d="M13.5 7.5h4" />
    </svg>
  );
}

function ElectricScooterGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M9.5 18h6" />
      <path d="M12 18V8h4" />
      <path d="M16 8 18 18" />
      <path d="m7 13 2-3h-3l2-3" />
      <path d="M14 6h4" />
    </svg>
  );
}

const iconMap: Record<string, IconComponent> = {
  motorcycle: MotorcycleGlyph,
  "motorcycle-sport": SportMotorcycleGlyph,
  "electric-motorcycle": MotorcycleGlyph,
  scooter: ScooterGlyph,
  "electric-scooter": ElectricScooterGlyph,
  bike: Bike,
  "e-bike": Bike,
  "car-front": CarFront,
  car: Car,
  "electric-car": CarFront,
  taxi: CarTaxiFront,
  truck: Truck,
  "truck-front": Truck,
  "truck-electric": TruckElectric,
  bus: Bus,
  "bus-front": BusFront,
  wheel: Disc,
  tire: CircleDot,
  battery: BatteryCharging,
  zap: Zap,
  gauge: Gauge,
  dashboard: CircleGauge,
  fuel: Fuel,
  route: Route,
  map: Map,
  navigation: Navigation,
  wrench: Wrench,
  shield: Shield,
  star: Star,
  sun: Sun,
  other: HelpCircle,
};

interface VehicleIconProps {
  icon?: string | null;
  type?: string | null;
  className?: string;
}

export function VehicleIcon({ icon, type, className }: VehicleIconProps) {
  const fallbackIcon = getVehicleDefaultIcon(type);
  const IconComponent = (icon && iconMap[icon]) || iconMap[fallbackIcon] || HelpCircle;
  return <IconComponent className={className} />;
}

export function getAvailableIconKeys(type?: string | null) {
  const preferred = getVehicleIconKeys(type);
  const extras = Object.keys(iconMap).filter((key) => !preferred.includes(key));
  return [...preferred, ...extras];
}

export const availableIconKeys = Object.keys(iconMap);

export const iconLabels: Record<string, string> = {
  motorcycle: "Moto",
  "motorcycle-sport": "Sport",
  "electric-motorcycle": "Moto EV",
  scooter: "Scooter",
  "electric-scooter": "Patín EV",
  bike: "Bici",
  "e-bike": "E-bike",
  "car-front": "Auto",
  car: "Carro",
  "electric-car": "Auto EV",
  taxi: "Taxi",
  truck: "Camión",
  "truck-front": "Carga",
  "truck-electric": "Truck EV",
  bus: "Bus",
  "bus-front": "Van",
  wheel: "Llanta",
  tire: "Rueda",
  battery: "Batería",
  zap: "Eléctrico",
  gauge: "Tablero",
  dashboard: "Medidor",
  fuel: "Combustible",
  route: "Ruta",
  map: "Mapa",
  navigation: "Navegar",
  wrench: "Taller",
  shield: "Seguro",
  star: "Favorito",
  sun: "Día",
  other: "Otro",
};

export const iconTypeGroups = VEHICLE_TYPE_ICON_KEYS;
