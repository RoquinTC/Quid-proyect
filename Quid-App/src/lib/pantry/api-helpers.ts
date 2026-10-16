/**
 * Helpers compartidos de las rutas de la Nevera.
 *
 * Centraliza tres cosas que, repetidas en cada ruta, se desincronizan:
 *  1. La sesión autenticada.
 *  2. El cálculo de estado de stock (para que la API y la UI coincidan siempre).
 *  3. La escritura del ledger: `applyMovement` es el ÚNICO punto que cambia
 *     `PantryItem.quantity`, y siempre crea el `PantryMovement` correspondiente.
 *
 * Regla 1 de la especificación: «El stock nunca se escribe directo. Siempre
 * `PantryMovement` + actualización en la misma transacción.»
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeName } from "@/lib/pantry/names";
import { evaluateStock, type StockEvaluation } from "@/lib/pantry/stock";
import type { Prisma } from "@prisma/client";

/** Sesión válida, o una respuesta 401 lista para devolver. */
export async function requireUserId(): Promise<
  { userId: string } | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  return { userId: session.user.id };
}

/** Serializa un `PantryItem` con su estado de stock ya evaluado. */
export function withStock<T extends {
  quantity: number;
  minStock?: number | null;
  targetQuantity?: number | null;
  expirationDate?: Date | string | null;
  lastUsedAt?: Date | string | null;
}>(item: T): T & StockEvaluation {
  return { ...item, ...evaluateStock(item) };
}

/**
 * Signo del movimiento según su tipo.
 *
 * `waste` y `out` restan; `in` y `adjust` se aplican tal cual (su cantidad ya
 * viene con signo para `adjust`, que puede corregir hacia arriba o hacia abajo).
 */
export function movementDelta(type: string, quantity: number): number {
  switch (type) {
    case "out":
    case "waste":
      return -Math.abs(quantity);
    case "in":
      return Math.abs(quantity);
    case "adjust":
      return quantity;
    default:
      return quantity;
  }
}

export interface MovementInput {
  itemId: string;
  userId: string;
  type: "in" | "out" | "adjust" | "waste";
  /** Cantidad del movimiento. Para `adjust` puede ser negativa. */
  quantity: number;
  unit?: string | null;
  note?: string | null;
  sourceListId?: string | null;
  sourceRecipeId?: string | null;
  sourceMealId?: string | null;
  sourceStore?: string | null;
  unitPrice?: number | null;
  confirmationId?: string | null;
  occurredAt?: Date;
  /**
   * Si es `true`, también actualiza `lastUsedAt` del producto (consumo real).
   * No se hace en `adjust` de recuento, porque contar no es usar.
   */
  touchLastUsed?: boolean;
}

/**
 * Aplica un movimiento al ledger y actualiza la cantidad del producto.
 *
 * Debe llamarse SIEMPRE dentro de una transacción (`tx`) cuando forma parte de
 * una operación mayor (confirmar compra, reversar, cocinar), para que un fallo
 * posterior revierta también el stock.
 *
 * La cantidad resultante se acota a 0: un consumo mayor que lo disponible no
 * deja stock negativo, porque el inventario físico tampoco puede serlo. Si
 * necesitas permitir negativos (recetas escaladas), no uses este helper.
 */
export async function applyMovement(
  tx: Prisma.TransactionClient,
  input: MovementInput
): Promise<{ movementId: string; newQuantity: number }> {
  const delta = movementDelta(input.type, input.quantity);

  const current = await tx.pantryItem.findUnique({
    where: { id: input.itemId },
    select: { quantity: true, unit: true },
  });
  if (!current) throw new Error("Producto de la nevera no encontrado");

  const newQuantity = Math.max(0, current.quantity + delta);

  const movement = await tx.pantryMovement.create({
    data: {
      itemId: input.itemId,
      userId: input.userId,
      type: input.type,
      quantity: Math.abs(input.quantity),
      unit: input.unit ?? current.unit,
      note: input.note ?? null,
      sourceListId: input.sourceListId ?? null,
      sourceRecipeId: input.sourceRecipeId ?? null,
      sourceMealId: input.sourceMealId ?? null,
      sourceStore: input.sourceStore ?? null,
      unitPrice: input.unitPrice ?? null,
      confirmationId: input.confirmationId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });

  await tx.pantryItem.update({
    where: { id: input.itemId },
    data: {
      quantity: newQuantity,
      ...(input.touchLastUsed ? { lastUsedAt: new Date() } : {}),
    },
  });

  return { movementId: movement.id, newQuantity };
}

/**
 * Busca el producto de la nevera equivalente a un nombre, para no duplicar.
 *
 * Usa la clave normalizada (la misma de la restricción única) y, si no hay
 * coincidencia exacta, un match por prefijo. Ver `names.ts`.
 */
export async function findPantryItemByName(
  userId: string,
  name: string,
  unit?: string | null
) {
  const nameNormalized = normalizeName(name);
  if (!nameNormalized) return null;

  // 1. Coincidencia exacta por clave normalizada.
  const exact = await db.pantryItem.findFirst({
    where: {
      userId,
      nameNormalized,
      ...(unit ? { unit } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (exact) return exact;

  // 2. Prefijo (el más corto, que es el más específico de los genéricos).
  const candidates = await db.pantryItem.findMany({
    where: {
      userId,
      nameNormalized: { startsWith: nameNormalized },
      isActive: true,
    },
    orderBy: { nameNormalized: "asc" },
    take: 20,
  });
  return candidates[0] ?? null;
}

/** Prisma no acepta `undefined` en un `data`; esto limpia el objeto. */
export function compact<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
