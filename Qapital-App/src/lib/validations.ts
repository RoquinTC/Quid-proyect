/**
 * Zod Validation Schemas for API Routes
 *
 * Centralized schemas for request body validation.
 * Each resource has a Create (full) and Update (partial) schema.
 * Action-specific endpoints (pay, confirm, contribute) have their own schemas.
 *
 * Usage in route handlers:
 *   import { accountCreateSchema, validateBody } from "@/lib/validations";
 *   const body = await validateBody(request, accountCreateSchema);
 */

import { z } from "zod";

// ============================================
// HELPER: Validate request body with Zod
// ============================================

/**
 * Validate a Request body against a Zod schema.
 * Returns the parsed data on success, or throws a Response with 400 status.
 *
 * @param request - The incoming Request object
 * @param schema - A Zod schema to validate against
 * @returns The validated and typed data
 * @throws Response with 400 status and error details
 */
export async function validateBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new Response(
      JSON.stringify({ error: "Cuerpo de la petición vacío o JSON inválido" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    throw new Response(
      JSON.stringify({ error: "Datos inválidos", details: errors }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return result.data;
}

// ============================================
// COMMON REUSABLE SCHEMAS
// ============================================

const isoDateString = z.string().min(1).describe("ISO date string");
const optionalString = z.string().nullable().optional();
const optionalNumber = z.number().nullable().optional();
const optionalBoolean = z.boolean().nullable().optional();

// ============================================
// AUTH
// ============================================

export const authRegisterSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export const authResetPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
  currentPassword: z.string().min(1, "La contraseña actual es obligatoria"),
  newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
  confirmPassword: z.string().min(1, "Confirma la nueva contraseña"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

// ============================================
// ACCOUNTS
// ============================================

export const accountCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  type: z.string().min(1, "El tipo es obligatorio"),
  balance: z.number().optional().default(0),
  color: z.string().optional().default("#10B981"),
  isHighYield: z.boolean().optional().default(false),
  yieldPercentage: z.number().nullable().optional(),
  isShared: z.boolean().optional().default(false),
  excludeFromAvailable: z.boolean().optional().default(false),
  icon: z.string().nullable().optional(),
});

export const accountUpdateSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().nullable().optional(),
  isHighYield: z.boolean().optional(),
  yieldPercentage: z.number().nullable().optional(),
  isShared: z.boolean().optional(),
  excludeFromAvailable: z.boolean().optional(),
  order: z.number().optional(),
  balance: z.number().optional(),
});

export const subAccountCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  type: z.string().optional().default("pocket"),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  balance: z.number().optional().default(0),
  isHighYield: z.boolean().optional().default(false),
  yieldPercentage: z.number().nullable().optional(),
  excludeFromAvailable: z.boolean().optional().default(false),
});

export const subAccountUpdateSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isHighYield: z.boolean().optional(),
  yieldPercentage: z.number().nullable().optional(),
  excludeFromAvailable: z.boolean().optional(),
  order: z.number().optional(),
  balance: z.number().optional(),
});

// ============================================
// TRANSACTIONS
// ============================================

export const transactionCreateSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().positive("El monto debe ser positivo"),
  description: z.string().min(1, "La descripción es obligatoria"),
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
  date: isoDateString.optional(),
  sourceModule: z.string().nullable().optional(),
  sourceId: z.string().nullable().optional(),
  isRecurring: z.boolean().optional().default(false),
  notes: z.string().nullable().optional(),
  transferToAccountId: z.string().nullable().optional(),
  transferToSubAccountId: z.string().nullable().optional(),
  excludeFromBudget: z.boolean().nullable().optional().default(false),
  receiptUrl: z.string().nullable().optional(),
});

export const transactionUpdateSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]).optional(),
  amount: z.number().positive().optional(),
  description: z.string().optional(),
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
  date: isoDateString.optional(),
  notes: z.string().nullable().optional(),
  isRecurring: z.boolean().optional(),
  excludeFromBudget: z.boolean().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
});

// ============================================
// BUDGETS
// ============================================

export const budgetCreateSchema = z.object({
  type: z.enum(["income", "expense"]),
  category: z.string().min(1, "La categoría es obligatoria"),
  subCategory: z.string().nullable().optional(),
  amount: z.number().positive("El monto debe ser positivo"),
  period: z.string().optional().default("monthly"),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export const budgetUpdateSchema = z.object({
  type: z.enum(["income", "expense"]).optional(),
  category: z.string().optional(),
  subCategory: z.string().nullable().optional(),
  amount: z.number().optional(),
  spent: z.number().optional(),
  period: z.string().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

// ============================================
// DEBTS
// ============================================

export const debtCreateSchema = z.object({
  type: z.enum(["credit_card", "loan", "other"]),
  name: z.string().min(1, "El nombre es obligatorio"),
  color: z.string().optional().default("#EF4444"),
  icon: z.string().nullable().optional(),
  bank: z.string().nullable().optional(),
  totalAmount: z.number().positive("El monto total debe ser positivo"),
  currentBalance: z.number().optional(),
  interestRate: z.number().nullable().optional(),
  cutoffDate: z.number().nullable().optional(),
  paymentDate: z.number().nullable().optional(),
  monthlyPayment: z.number().nullable().optional(),
  remainingPayments: z.number().nullable().optional(),
  startDate: isoDateString.nullable().optional(),
  endDate: isoDateString.nullable().optional(),
  paymentType: z.string().nullable().optional(),
  otherCharges: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
});

export const debtUpdateSchema = z.object({
  type: z.enum(["credit_card", "loan", "other"]).optional(),
  name: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().nullable().optional(),
  bank: z.string().nullable().optional(),
  totalAmount: z.number().optional(),
  currentBalance: z.number().optional(),
  interestRate: z.number().nullable().optional(),
  cutoffDate: z.number().nullable().optional(),
  paymentDate: z.number().nullable().optional(),
  monthlyPayment: z.number().nullable().optional(),
  remainingPayments: z.number().nullable().optional(),
  startDate: isoDateString.nullable().optional(),
  endDate: isoDateString.nullable().optional(),
  paymentType: z.string().nullable().optional(),
  otherCharges: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
});

export const debtPaySchema = z.object({
  interestRates: z.record(z.string(), z.number()).optional().default({}),
  selectedInstallmentIds: z.array(z.string()).nullable().optional(),
  confirmedCapital: z.record(z.string(), z.number()).optional().default({}),
  confirmedInterest: z.record(z.string(), z.number()).optional().default({}),
  confirmedOtherCharges: z.record(z.string(), z.number()).optional().default({}),
  payAccountId: z.string().nullable().optional(),
  paySubAccountId: z.string().nullable().optional(),
});

export const debtAbonoSchema = z.object({
  payments: z.array(z.object({
    installmentId: z.string().min(1),
    amount: z.number().positive("El monto del abono debe ser positivo"),
  })).min(1, "Debe haber al menos un pago"),
  accountId: z.string().min(1, "La cuenta es obligatoria"),
  subAccountId: z.string().nullable().optional(),
  date: isoDateString.optional(),
});

export const debtReverseAbonoSchema = z.object({
  abonoId: z.string().min(1, "El ID del abono es obligatorio"),
});

export const debtInstallmentCreateSchema = z.object({
  description: z.string().min(1, "La descripción es obligatoria"),
  totalAmount: z.number().positive("El monto total debe ser positivo"),
  totalInstallments: z.number().int().positive("Debe tener al menos 1 cuota"),
  purchaseDate: isoDateString.optional(),
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
});

// ============================================
// INSTALLMENTS
// ============================================

export const installmentUpdateSchema = z.object({
  description: z.string().optional(),
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
  purchaseDate: isoDateString.optional(),
  totalAmount: z.number().positive().optional(),
  totalInstallments: z.number().int().positive().optional(),
});

// ============================================
// RECURRING PAYMENTS
// ============================================

export const recurringCreateSchema = z.object({
  description: z.string().min(1, "La descripción es obligatoria"),
  amount: z.number().positive("El monto debe ser positivo"),
  type: z.enum(["expense", "transfer"]).optional().default("expense"),
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
  debtId: z.string().nullable().optional(),
  destinationAccountId: z.string().nullable().optional(),
  destinationSubAccountId: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
  scheduledDate: isoDateString,
  frequency: z.string().optional().default("monthly"),
  notes: z.string().nullable().optional(),
  isRecurring: z.boolean().optional().default(true),
});

export const recurringUpdateSchema = z.object({
  scope: z.enum(["single", "series"]).optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  actualAmount: z.number().optional(),
  type: z.string().optional(),
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
  debtId: z.string().nullable().optional(),
  destinationAccountId: z.string().nullable().optional(),
  destinationSubAccountId: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subCategory: z.string().nullable().optional(),
  scheduledDate: isoDateString.optional(),
  confirmedDate: isoDateString.nullable().optional(),
  status: z.string().optional(),
  frequency: z.string().optional(),
  notes: z.string().nullable().optional(),
  isRecurring: z.boolean().optional(),
});

export const recurringConfirmSchema = z.object({
  actualAmount: z.number().optional(),
  destinationAccountId: z.string().nullable().optional(),
  destinationSubAccountId: z.string().nullable().optional(),
});

// ============================================
// SAVINGS GOALS
// ============================================

export const savingsCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  description: z.string().nullable().optional(),
  targetAmount: z.number().positive("El monto objetivo debe ser positivo"),
  deadline: isoDateString,
  frequency: z.enum(["mensual", "quincenal", "semanal"]),
  monthlyDay: z.number().nullable().optional(),
  biweeklyDays: z.string().nullable().optional(),
  weeklyDay: z.number().nullable().optional(),
  periodAmounts: z.string().nullable().optional(),
  sourceAccountId: z.string().nullable().optional(),
  destinationAccountId: z.string().nullable().optional(),
  linkedCDTIds: z.array(z.string()).optional().default([]),
  linkedAccountItems: z.array(z.object({
    accountId: z.string(),
    subAccountId: z.string().optional(),
  })).optional().default([]),
  icon: z.string().nullable().optional(),
  color: z.string().optional().default("#8B5CF6"),
  type: z.string().optional().default("general"),
});

export const savingsUpdateSchema = z.object({
  name: z.string().optional(),
  targetAmount: z.number().optional(),
  deadline: isoDateString.optional(),
  frequency: z.string().optional(),
  monthlyDay: z.number().nullable().optional(),
  biweeklyDays: z.string().nullable().optional(),
  weeklyDay: z.number().nullable().optional(),
  periodAmounts: z.string().nullable().optional(),
  sourceAccountId: z.string().nullable().optional(),
  destinationAccountId: z.string().nullable().optional(),
  linkedCDTIds: z.array(z.string()).optional(),
  linkedAccountItems: z.array(z.object({
    accountId: z.string(),
    subAccountId: z.string().optional(),
  })).optional(),
});

export const savingsContributeSchema = z.object({
  amount: z.number().positive("El monto debe ser positivo"),
  description: z.string().optional(),
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
});

export const savingsLinkAccountSchema = z.object({
  accountId: z.string().min(1, "La cuenta es obligatoria"),
  subAccountId: z.string().nullable().optional(),
});

// ============================================
// CDTS
// ============================================

export const cdtCreateSchema = z.object({
  bank: z.string().min(1, "El banco es obligatorio"),
  amount: z.number().positive("El monto debe ser positivo"),
  effectiveRate: z.number().positive("La tasa debe ser positiva"),
  startDate: isoDateString,
  endDate: isoDateString,
  termDays: z.number().optional(),
  goalId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  color: z.string().optional().default("#14B8A6"),
});

export const cdtUpdateSchema = z.object({
  bank: z.string().optional(),
  amount: z.number().optional(),
  effectiveRate: z.number().optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  termDays: z.number().optional(),
  interestEarned: z.number().optional(),
  status: z.string().optional(),
  goalId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  withdrawnAmount: z.number().optional(),
  withdrawnDate: isoDateString.nullable().optional(),
  notes: z.string().nullable().optional(),
  color: z.string().optional(),
});

export const cdtFinalizeSchema = z.object({
  withdrawnAmount: z.number().min(0, "El monto retirado es obligatorio"),
  destinationAccountId: z.string().min(1, "La cuenta de destino es obligatoria"),
  destinationSubAccountId: z.string().nullable().optional(),
  withdrawnDate: isoDateString.optional(),
});

// ============================================
// YIELD
// ============================================

export const yieldCreateSchema = z.object({
  accountId: z.string().nullable().optional(),
  subAccountId: z.string().nullable().optional(),
  actualYield: z.number(),
  yieldPercentage: z.number().nullable().optional(),
  projectedYield: z.number().nullable().optional(),
  parentAccountId: z.string().nullable().optional(),
  yieldRecordId: z.string().nullable().optional(),
});

export const yieldReverseSchema = z.object({
  yieldRecordId: z.string().min(1, "El ID del registro es obligatorio"),
});

// ============================================
// VEHICLES
// ============================================

export const vehicleCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  type: z.string().optional().default("motorcycle"),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  color: z.string().nullable().optional(),
  tankCapacity: z.number().nullable().optional(),
  fuelType: z.string().optional().default("gasoline"),
  currentKm: z.number().optional().default(0),
});

export const vehicleUpdateSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  color: z.string().nullable().optional(),
  tankCapacity: z.number().nullable().optional(),
  fuelType: z.string().optional(),
  currentKm: z.number().optional(),
});

export const fuelLogCreateSchema = z.object({
  date: isoDateString.optional(),
  km: z.number().optional(),
  amount: z.number().positive("El monto es obligatorio"),
  pricePerGallon: z.number().positive("El precio por galón es obligatorio"),
  isFullTank: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
});

export const maintenanceCreateSchema = z.object({
  type: z.string().optional().default("general"),
  description: z.string().min(1, "La descripción es obligatoria"),
  cost: z.number().positive("El costo es obligatorio"),
  km: z.number().optional(),
  date: isoDateString.optional(),
  nextDueKm: z.number().nullable().optional(),
  nextDueDate: isoDateString.nullable().optional(),
  reminderEnabled: z.boolean().optional().default(true),
});

export const maintenanceUpdateSchema = z.object({
  type: z.string().optional(),
  description: z.string().optional(),
  cost: z.number().optional(),
  km: z.number().optional(),
  date: isoDateString.optional(),
  nextDueKm: z.number().nullable().optional(),
  nextDueDate: isoDateString.nullable().optional(),
  reminderEnabled: z.boolean().optional(),
});

// ============================================
// FUEL PRICES
// ============================================

export const fuelPriceCreateSchema = z.object({
  fuelType: z.string().optional().default("gasoline"),
  pricePerGallon: z.number().positive("El precio por galón es obligatorio"),
});

// ============================================
// MEDICATIONS
// ============================================

export const medicationCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  dosage: z.string().min(1, "La dosis es obligatoria"),
  frequency: z.string().optional().default("daily"),
  customSchedule: z.any().nullable().optional(),
  disease: z.string().nullable().optional(),
  howToTake: z.string().nullable().optional(),
  startDate: isoDateString.nullable().optional(),
  endDate: isoDateString.nullable().optional(),
  isActive: z.boolean().optional().default(true),
  reminderEnabled: z.boolean().optional().default(true),
  reminderTimes: z.array(z.string()).nullable().optional(),
});

export const medicationUpdateSchema = z.object({
  name: z.string().optional(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
  customSchedule: z.any().nullable().optional(),
  disease: z.string().nullable().optional(),
  howToTake: z.string().nullable().optional(),
  startDate: isoDateString.nullable().optional(),
  endDate: isoDateString.nullable().optional(),
  isActive: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTimes: z.array(z.string()).nullable().optional(),
});

// ============================================
// APPOINTMENTS
// ============================================

export const appointmentCreateSchema = z.object({
  doctorName: z.string().nullable().optional(),
  specialty: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  date: isoDateString,
  notes: z.string().nullable().optional(),
  reminderEnabled: z.boolean().optional().default(true),
  status: z.string().optional().default("scheduled"),
});

export const appointmentUpdateSchema = z.object({
  doctorName: z.string().nullable().optional(),
  specialty: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  date: isoDateString.optional(),
  notes: z.string().nullable().optional(),
  reminderEnabled: z.boolean().optional(),
  status: z.string().optional(),
});

// ============================================
// PANTRY
// ============================================

export const pantryCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  category: z.string().optional().default("other"),
  quantity: z.number().optional().default(0),
  unit: z.string().optional().default("unit"),
  expirationDate: isoDateString.nullable().optional(),
  purchaseDate: isoDateString.nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  minStock: z.number().nullable().optional(),
});

export const pantryUpdateSchema = z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  expirationDate: isoDateString.nullable().optional(),
  purchaseDate: isoDateString.nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  minStock: z.number().nullable().optional(),
});

// ============================================
// SHOPPING LISTS
// ============================================

export const shoppingListCreateSchema = z.object({
  name: z.string().optional().default("Lista de Mercado"),
  profileId: z.string().nullable().optional(),
});

export const shoppingListUpdateSchema = z.object({
  name: z.string().optional(),
  status: z.string().optional(),
  profileId: z.string().nullable().optional(),
});

export const shoppingItemCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  quantity: z.number().optional().default(1),
  unit: z.string().optional().default("unit"),
  estimatedPrice: z.number().nullable().optional(),
  pantryItemId: z.string().nullable().optional(),
});

export const shoppingItemUpdateSchema = z.object({
  name: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  estimatedPrice: z.number().nullable().optional(),
  actualPrice: z.number().nullable().optional(),
  isPurchased: z.boolean().optional(),
  checked: z.boolean().optional(),
});

export const shoppingGenerateSchema = z.object({
  name: z.string().optional(),
  profileId: z.string().nullable().optional(),
});

// ============================================
// HEALTH PROFILES
// ============================================

export const healthProfileCreateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  type: z.string().optional().default("owner"),
  diseases: z.array(z.string()).nullable().optional(),
  restrictions: z.array(z.string()).nullable().optional(),
  aiRestrictions: z.array(z.string()).nullable().optional(),
});

export const healthProfileUpdateSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  diseases: z.array(z.string()).nullable().optional(),
  restrictions: z.array(z.string()).nullable().optional(),
  aiRestrictions: z.array(z.string()).nullable().optional(),
});

// ============================================
// PAYROLL
// ============================================

const scheduleSchema = z.object({
  day: z.number().optional(),
  dayOfWeek: z.number().optional(),
  amount: z.number().positive("El monto del horario debe ser positivo"),
});

export const payrollCreateSchema = z.object({
  description: z.string().optional().default("Sueldo"),
  frequency: z.enum(["monthly", "biweekly", "weekly"]),
  schedules: z.array(scheduleSchema).min(1, "Debe haber al menos un horario"),
  accountId: z.string().min(1, "La cuenta es obligatoria"),
  subAccountId: z.string().nullable().optional(),
  category: z.string().optional().default("Sueldo"),
  subCategory: z.string().nullable().optional(),
  adjustToBusinessDay: z.boolean().optional().default(false),
  businessDayDirection: z.enum(["before", "after"]).optional().default("before"),
});

export const payrollUpdateSchema = z.object({
  description: z.string().optional(),
  frequency: z.enum(["monthly", "biweekly", "weekly"]).optional(),
  schedules: z.array(scheduleSchema).optional(),
  accountId: z.string().optional(),
  subAccountId: z.string().nullable().optional(),
  category: z.string().optional(),
  subCategory: z.string().nullable().optional(),
  adjustToBusinessDay: z.boolean().optional(),
  businessDayDirection: z.enum(["before", "after"]).optional(),
});

// ============================================
// SETTINGS
// ============================================

export const settingsUpdateSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  budgetCutoffDay: z.number().int().min(1).max(31).optional(),
  respectHolidays: z.boolean().optional(),
  countryCode: z.string().optional(),
  notificationsEnabled: z.boolean().optional(),
  lockOnResume: z.boolean().optional(),
  pinEnabled: z.boolean().optional(),
  biometricEnabled: z.boolean().optional(),
});

export const importSchema = z.object({
  rows: z.array(z.object({
    modulo: z.string(),
    campo1: z.string(),
    campo2: z.string().optional(),
    campo3: z.string().optional(),
    campo4: z.string().optional(),
    campo5: z.string().optional(),
    campo6: z.string().optional(),
    campo7: z.string().optional(),
    campo8: z.string().optional(),
  })).min(1, "Debe haber al menos una fila"),
});

// ============================================
// CATEGORIES
// ============================================

export const categoryUpdateSchema = z.object({
  type: z.enum(["income", "expense"]),
  oldCategory: z.string().min(1),
  oldSubCategory: z.string().nullable().optional(),
  newCategory: z.string().min(1),
  newSubCategory: z.string().nullable().optional(),
});

export const categoryDeleteSchema = z.object({
  type: z.enum(["income", "expense"]),
  category: z.string().min(1),
  subCategory: z.string().nullable().optional(),
});

export const categoryCreateSchema = z.object({
  type: z.enum(["income", "expense"]),
  name: z.string().min(1, "El nombre es obligatorio"),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

// ============================================
// USER ONBOARDING
// ============================================

export const onboardingSchema = z.object({
  currency: z.string().optional(),
  onboardingCompleted: z.boolean().optional(),
  name: z.string().optional(),
});
