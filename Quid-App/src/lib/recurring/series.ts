/**
 * F-28 · Definición vs ocurrencia de un pago recurrente.
 *
 * `RecurringSeries` guarda QUÉ es el pago (monto, categoría, cuenta, frecuencia).
 * `RecurringPayment` guarda CADA ocurrencia con su fecha.
 *
 * Antes, la definición estaba copiada en cada fila: si cambiabas el monto de la
 * serie, había que reescribir N filas y era fácil que quedaran desincronizadas.
 * Ahora la siguiente ocurrencia se construye leyendo la serie.
 *
 * `seriesId` se enlaza por convención (String, sin FK declarada) para no romper
 * la validación de las filas existentes al arrancar. Ver el comentario en
 * prisma/schema.prisma.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export type SeriesSeed = {
  description: string;
  amount: number;
  type: string;
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  destinationAccountId?: string | null;
  destinationSubAccountId?: string | null;
  category?: string | null;
  subCategory?: string | null;
  frequency: string;
  customDays?: string | null;
  periodAmounts?: string | null;
  notes?: string | null;
  isRecurring?: boolean;
  payrollGroupId?: string | null;
  savingsGoalId?: string | null;
};

function toData(userId: string, seed: SeriesSeed) {
  return {
    userId,
    description: seed.description,
    amount: seed.amount,
    type: seed.type || "expense",
    accountId: seed.accountId || null,
    subAccountId: seed.subAccountId || null,
    debtId: seed.debtId || null,
    destinationAccountId: seed.destinationAccountId || null,
    destinationSubAccountId: seed.destinationSubAccountId || null,
    category: seed.category || null,
    subCategory: seed.subCategory || null,
    frequency: seed.frequency || "monthly",
    customDays: seed.customDays || null,
    periodAmounts: seed.periodAmounts || null,
    notes: seed.notes || null,
    isRecurring: seed.isRecurring ?? true,
    payrollGroupId: seed.payrollGroupId || null,
    savingsGoalId: seed.savingsGoalId || null,
  };
}

/**
 * Crea una serie nueva y devuelve su id.
 * @param id Permite fijar el id (nómina usa el id del grupo como serie).
 */
export async function createSeries(
  userId: string,
  seed: SeriesSeed,
  id?: string
): Promise<string> {
  const seriesId = id || randomUUID();
  await db.recurringSeries.create({
    data: { id: seriesId, ...toData(userId, seed) },
  });
  return seriesId;
}

/**
 * Garantiza que exista una serie con un id concreto (idempotente).
 * Se usa en nómina y metas de ahorro, que crean varias ocurrencias de golpe.
 */
export async function ensureSeries(
  userId: string,
  id: string,
  seed: SeriesSeed
): Promise<void> {
  const existing = await db.recurringSeries.findUnique({
    where: { id },
    select: { id: true },
  });
  if (existing) return;

  try {
    await db.recurringSeries.create({ data: { id, ...toData(userId, seed) } });
  } catch {
    // Otro request pudo crearla entre el find y el create; es inofensivo.
  }
}
