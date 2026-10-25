/**
 * Reversa de una confirmación de compra — lógica única.
 *
 * Vive aquí y no en la ruta para que la usen tanto el botón **Reversar** como
 * **Eliminar → reversar y eliminar todo**, sin duplicar la operación ni
 * llamarse por HTTP interna.
 *
 * Qué revierte, en este orden:
 *  1. Inventario: resta del stock lo que esa confirmación sumó.
 *  2. Saldo de la lista: devuelve `confirmedQuantity` a cada línea.
 *  3. Auditoría: marca `reversedAt` en movimientos y en la confirmación.
 *  4. Finanzas: devuelve el dinero o revierte la cuota (fuera de la transacción,
 *     porque abre la suya).
 *
 * Es idempotente a nivel de ruta: quien llama debe comprobar `reversedAt` antes.
 */

import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { reversePantryFinanceEntry } from "@/lib/pantry-finance";

export interface ReverseResult {
  movementsReversed: number;
  linesRestored: number;
  financeReversed: number;
  financeWarning: string | null;
}

export async function reverseConfirmation(
  confirmationId: string,
  userId: string
): Promise<ReverseResult> {
  const confirmation = await db.pantryListConfirmation.findFirst({
    where: { id: confirmationId, userId },
    select: { id: true, shoppingListId: true, reversedAt: true },
  });
  if (!confirmation) throw new Error("Compra no encontrada");
  if (confirmation.reversedAt) throw new Error("already_reversed");

  const movements = await db.pantryMovement.findMany({
    where: { confirmationId, userId, reversedAt: null },
    orderBy: { occurredAt: "asc" },
  });

  const { linesRestored } = await db.$transaction(async (tx) => {
    let lines = 0;

    for (const movement of movements) {
      const qty = toNumber(movement.quantity);

      const item = await tx.pantryItem.findUnique({
        where: { id: movement.itemId },
        select: { quantity: true },
      });
      if (item) {
        await tx.pantryItem.update({
          where: { id: movement.itemId },
          data: { quantity: Math.max(0, toNumber(item.quantity) - qty) },
        });
      }

      if (movement.sourceItemId) {
        const line = await tx.shoppingListItem.findUnique({
          where: { id: movement.sourceItemId },
          select: { confirmedQuantity: true },
        });
        if (line) {
          await tx.shoppingListItem.update({
            where: { id: movement.sourceItemId },
            data: {
              confirmedQuantity: Math.max(0, toNumber(line.confirmedQuantity) - qty),
              // Vuelve a quedar pendiente de compra.
              isPurchased: false,
            },
          });
          lines += 1;
        }
      }

      await tx.pantryMovement.update({
        where: { id: movement.id },
        data: { reversedAt: new Date() },
      });
    }

    await tx.pantryListConfirmation.update({
      where: { id: confirmationId },
      data: { reversedAt: new Date() },
    });

    // La lista se reabre según cuánto quede saldado.
    const all = await tx.shoppingListItem.findMany({
      where: { shoppingListId: confirmation.shoppingListId },
      select: { quantity: true, confirmedQuantity: true },
    });
    const anyConfirmed = all.some((l) => toNumber(l.confirmedQuantity) > 0);
    const allSettled = all.every(
      (l) => toNumber(l.confirmedQuantity) >= toNumber(l.quantity) - 1e-9
    );

    await tx.shoppingList.update({
      where: { id: confirmation.shoppingListId },
      data: {
        status: allSettled ? "completed" : anyConfirmed ? "partially_confirmed" : "shopping",
        completedAt: null,
      },
    });

    return { linesRestored: lines };
  });

  let financeReversed = 0;
  let financeWarning: string | null = null;
  try {
    financeReversed = await reversePantryFinanceEntry(confirmationId, userId);
  } catch (error) {
    console.error("Reverse: inventario revertido pero Finanzas falló", error);
    financeWarning =
      "Se revirtió el inventario y la lista, pero no se pudo revertir el movimiento en Finanzas. Revísalo manualmente.";
  }

  return {
    movementsReversed: movements.length,
    linesRestored,
    financeReversed,
    financeWarning,
  };
}
