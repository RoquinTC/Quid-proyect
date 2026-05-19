// ─── Transport Entity Types ───
// API response shapes (money = number, dates = string)

export interface Vehicle {
  id: string;
  name: string;
  type: string; // motorcycle, car, truck, other
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  tankCapacity?: number | null;
  fuelType?: string | null;
  currentKm: number;
  icon?: string | null;
  plate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // ── Related data ──
  documents?: VehicleDocument[];
  paymentDefault?: VehiclePaymentDefault | null;
}

export interface FuelLog {
  id: string;
  date: string;
  km: number;
  amount: number;
  pricePerGallon: number;
  gallons: number;
  isFullTank: boolean;
  station?: string | null;
  // ── Finance integration ──
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  installmentCount?: number | null;
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
  // ── Finance integration ──
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  installmentCount?: number | null;
  createdAt?: string;
  updatedAt?: string;
  // ── Related data ──
  items?: MaintenanceItem[];
}

export interface MaintenanceItem {
  id: string;
  maintenanceRecordId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string | null;
  createdAt?: string;
}

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  type: string; // soat, tecnomecanica, seguro, impuesto, otro
  documentNumber?: string | null;
  issueDate: string;
  expiryDate: string;
  cost: number;
  reminderDays: number;
  reminderEnabled: boolean;
  // ── Finance integration ──
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  installmentCount?: number | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface VehiclePaymentDefault {
  id: string;
  vehicleId: string;
  userId: string;
  paymentType: string; // "account" or "credit_card"
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  installmentCount?: number | null;
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
  // ── Smart refuel prediction ──
  avgKmPerDay: number;
  daysUntilRefuel: number | null;
  refuelByDate: string | null;
  gallonsToRefuel: number;
  isLowFuel: boolean;
  isLearning: boolean;
  lastPricePerGallon: number;
}

export interface FuelPrice {
  id: string;
  fuelType: string;
  pricePerGallon: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Payment Method Types (shared across transport forms) ───

export type PaymentMethodType = "account" | "credit_card";

export interface PaymentMethodData {
  paymentType: PaymentMethodType;
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  installmentCount?: number | null;
}

// ─── Document Types ───

export const DOCUMENT_TYPES = [
  { value: "soat", label: "SOAT" },
  { value: "tecnomecanica", label: "Tecnomecánica" },
  { value: "seguro", label: "Seguro" },
  { value: "impuesto", label: "Impuesto" },
  { value: "otro", label: "Otro" },
] as const;

// ─── Maintenance Types (expanded) ───

export const MAINTENANCE_TYPES = [
  { value: "oil_change", label: "Cambio de aceite", nextKmInterval: 5000, nextMonthInterval: 6 },
  { value: "tire_change", label: "Cambio de llantas", nextKmInterval: 40000, nextMonthInterval: 24 },
  { value: "brake_service", label: "Servicio de frenos", nextKmInterval: 20000, nextMonthInterval: 12 },
  { value: "general", label: "Revisión general", nextKmInterval: 10000, nextMonthInterval: 12 },
  { value: "parts_replacement", label: "Cambio de repuestos", nextKmInterval: 15000, nextMonthInterval: 12 },
  { value: "alignment", label: "Alineación/Balanceo", nextKmInterval: 10000, nextMonthInterval: 6 },
  { value: "suspension", label: "Suspensión", nextKmInterval: 30000, nextMonthInterval: 18 },
  { value: "transmission", label: "Transmisión", nextKmInterval: 40000, nextMonthInterval: 24 },
  { value: "electrical", label: "Sistema eléctrico", nextKmInterval: 20000, nextMonthInterval: 12 },
  { value: "cooling", label: "Sistema de enfriamiento", nextKmInterval: 20000, nextMonthInterval: 12 },
  { value: "ac", label: "Aire acondicionado", nextKmInterval: 20000, nextMonthInterval: 12 },
  { value: "battery", label: "Batería", nextKmInterval: 30000, nextMonthInterval: 18 },
  { value: "inspection", label: "Inspección/Revisión", nextKmInterval: 10000, nextMonthInterval: 12 },
  { value: "wash", label: "Lavado", nextKmInterval: 0, nextMonthInterval: 1 },
  { value: "aesthetics", label: "Estética", nextKmInterval: 0, nextMonthInterval: 0 },
  { value: "other", label: "Otro", nextKmInterval: 0, nextMonthInterval: 0 },
] as const;

// ─── Sub-category mapping for finance transactions ───

export const MAINTENANCE_SUBCATEGORY_MAP: Record<string, string> = {
  oil_change: "Aceite",
  tire_change: "Llantas",
  brake_service: "Frenos",
  general: "Mantenimiento",
  parts_replacement: "Repuestos",
  alignment: "Alineación",
  suspension: "Suspensión",
  transmission: "Transmisión",
  electrical: "Eléctrico",
  cooling: "Enfriamiento",
  ac: "A/C",
  battery: "Batería",
  inspection: "Inspección",
  wash: "Lavado",
  aesthetics: "Estética",
  other: "Otro",
};

export const DOCUMENT_SUBCATEGORY_MAP: Record<string, string> = {
  soat: "SOAT",
  tecnomecanica: "Tecnomecánica",
  seguro: "Seguro",
  impuesto: "Impuesto",
  otro: "Otro",
};
