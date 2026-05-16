"use client";

import {
  Bike,
  Car,
  Truck,
  HelpCircle,
  Zap,
  Flame,
  Shield,
  Star,
  Heart,
  Rocket,
  Snowflake,
  Sun,
  Moon,
  Gauge,
  Fuel,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  bike: Bike,
  zap: Zap,
  flame: Flame,
  shield: Shield,
  star: Star,
  heart: Heart,
  rocket: Rocket,
  snowflake: Snowflake,
  sun: Sun,
  moon: Moon,
  gauge: Gauge,
  fuel: Fuel,
};

const typeDefaultMap: Record<string, LucideIcon> = {
  motorcycle: Bike,
  car: Car,
  truck: Truck,
  other: HelpCircle,
};

interface VehicleIconProps {
  icon?: string | null;
  type: string;
  className?: string;
}

export function VehicleIcon({ icon, type, className }: VehicleIconProps) {
  // If icon field is set and found in map, use it; otherwise fall back to type-based default
  const IconComponent = (icon && iconMap[icon]) || typeDefaultMap[type] || HelpCircle;
  return <IconComponent className={className} />;
}

/** Available icon keys for the icon selector */
export const availableIconKeys = Object.keys(iconMap);

/** Labels for the icon selector */
export const iconLabels: Record<string, string> = {
  bike: "Moto",
  zap: "Eléctrico",
  flame: "Llama",
  shield: "Escudo",
  star: "Estrella",
  heart: "Corazón",
  rocket: "Cohete",
  snowflake: "Nieve",
  sun: "Sol",
  moon: "Luna",
  gauge: "Tablero",
  fuel: "Combustible",
};
