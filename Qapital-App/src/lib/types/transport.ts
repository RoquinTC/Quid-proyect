// ─── Transport Entity Types ───
// API response shapes (money = number, dates = string)

export interface Vehicle {
  id: string;
  name: string;
  type: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  tankCapacity?: number | null;
  fuelType?: string | null;
  currentKm: number;
  icon?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FuelLog {
  id: string;
  date: string;
  km: number;
  amount: number;
  pricePerGallon: number;
  gallons: number;
  isFullTank: boolean;
  notes?: string | null;
  createdAt?: string;
}

export interface MaintenanceRecord {
  id: string;
  type: string;
  description: string;
  cost: number;
  km: number;
  date: string;
  nextDueKm?: number | null;
  nextDueDate?: string | null;
  reminderEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface FuelLevelData {
  fuelLevel: number;
  currentFuel: number;
  estimatedRange: number;
  avgKmPerGallon: number;
  lastFullTankDate: string | null;
  lastFullTankKm: number;
  totalConsumed: number;
  anomalyDetected: boolean;
  expectedConsumption: number;
  actualConsumption: number;
}

export interface FuelPrice {
  id: string;
  fuelType: string;
  pricePerGallon: number;
  createdAt?: string;
  updatedAt?: string;
}
