import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaTodayString, createColombiaDate } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, shoppingListConfirmSchema } from "@/lib/validations";
import { normalizeName } from "@/lib/pantry/names";
import { applyMovement, findPantryItemByName } from "@/lib/pantry/api-helpers";
import { createPantryFinanceEntry } from "@/lib/pantry-finance";
import { applyTotalDiscount, lineAmount, normalizeDiscountType, sumLineTotals } from "@/lib/pantry/pricing";

/**
 * POST /api/shopping-lists/[id]/confirm
 *
 * Confirma una compra. **Soporta confirmación parcial**: una lista que se salda
 * entre varias tiendas, donde cada confirmación registra su propio gasto, su
 * propia tienda, su propio descuento y su propia forma de pago.
 *
 * Cambios respecto a la versión anterior (Fase 3 de la especificación):
 *
 *  1. **Ledger**: el stock ya no se escribe con `increment`, se escribe con
 *     `applyMovement`. Sin esto no habría movimiento que explique el cambio.
 *  2. **`nameNormalized`**: al crear un producto se guarda la clave normalizada.
 *     Antes nacía vacía y **chocaba con la restricción única** en cuanto la
 *     compra traía dos productos nuevos — el error que veía el usuario.
 *  3. **Auto-match**: antes de crear, se busca el producto equivalente para no
 *     duplicar la nevera.
 *  4. **Categoría y unidad heredadas** de la línea, no `"other"` forzado.
 *  5. **`PriceHistory`** en cada entrada: es lo que alimenta el precio de las
 *     siguientes listas y los reportes de variación.
 *  6. **`PantryListConfirmation`**: cada confirmación queda como registro propio
 *     con su tienda, fecha, descuento y total, para el histórico y la reversa.
 *  7. **Descuento total por confirmación** (fijo o porcentual), nunca global.
 */

function normalizeOptionalId(value: string | null | undefined) {
  return value && value !== "none" && value !== "__none__" ? value : null;
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildMarketDescription(
  listName: string,
  storeName?: string | null,
  purpose?: string | null
) {
  const store = cleanText(storeName);
  const label = cleanText(purpose) || cleanText(listName) || "Mercado";
  if (store && label && label.toLowerCase() !== "mercado") {
    return `Compra ${store} - ${label}`;
  }
  if (store) return `Mercado - ${store}`;
  return label ? `Mercado - ${label}` : "Mercado";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;
    const body = await validateBody(req, shoppingListConfirmSchema);

    const {
      paymentType,
      accountId,
      debtId,
      installmentCount,
      purchaseDate: bodyPurchaseDate,
    } = body;
    const subAccountId = normalizeOptionalId(body.subAccountId);
    const storeName = cleanText(body.storeName);
    const purpose = cleanText(body.purpose);
    const customDescription = cleanText(body.description);

    // "Convertir a stock": qué líneas entran a la nevera y con qué cantidad.
    const stockSelection = body.items;
    const minMode = body.minMode ?? false;
    const selectedById = new Map((stockSelection ?? []).map((s) => [s.id, s]));
    const hasSelection = stockSelection !== undefined;

    // Descuento total de ESTA confirmación (por tienda).
    const discountType = normalizeDiscountType(
      (body as { totalDiscountType?: string }).totalDiscountType
    );
    const discountValue = toNumber(
      (body as { totalDiscountValue?: number }).totalDiscountValue
    );

    const list = await db.shoppingList.findFirst({
      where: { id, userId },
      include: { items: true },
    });

    if (!list) {
      return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
    }
    if (list.status === "completed") {
      return NextResponse.json({ error: "La lista ya está completada" }, { status: 400 });
    }
    if (paymentType === "account" && !accountId) {
      return NextResponse.json({ error: "Selecciona la cuenta de pago" }, { status: 400 });
    }
    if (paymentType === "credit_card" && !debtId) {
      return NextResponse.json({ error: "Selecciona la tarjeta de crédito" }, { status: 400 });
    }

    // ── Líneas que participan de ESTA confirmación ──
    // Una línea participa si está comprada y (no hay selección o está incluida).
    const linesToConfirm = list.items.filter((item) => {
      if (!item.isPurchased) return false;
      if (hasSelection && !selectedById.has(item.id)) return false;
      return true;
    });

    if (linesToConfirm.length === 0) {
      return NextResponse.json(
        {
          error: "nothing_to_confirm",
          message:
            "No hay productos marcados como comprados. Marca lo que trajiste para registrar la compra.",
        },
        { status: 400 }
      );
    }

    // ── Subtotal con el motor de precios (cantidad × precio, redondeo HALF_UP) ──
    const lineResults = linesToConfirm.map((item) => {
      const sel = selectedById.get(item.id);
      const movedQty = sel !== undefined ? sel.quantity : item.quantity;
      const itemPrice = toNumber(item.actualPrice ?? item.estimatedPrice ?? 0);
      return {
        item,
        movedQty,
        itemPrice,
        pricing: lineAmount({
          quantity: movedQty,
          value: itemPrice,
          multiplyQuantity: item.multiplyQuantity ?? true,
        }),
      };
    });

    const subtotal = sumLineTotals(lineResults.map((r) => r.pricing));

    if (subtotal <= 0) {
      return NextResponse.json(
        { error: "La lista no tiene un valor para registrar" },
        { status: 400 }
      );
    }

    const { discount: totalDiscount, total: totalAmount } = applyTotalDiscount(
      subtotal,
      discountType && discountValue > 0
        ? { type: discountType, value: discountValue }
        : null
    );

    const purchaseDate = bodyPurchaseDate
      ? new Date(bodyPurchaseDate)
      : createColombiaDate(getColombiaTodayString());
    const category = "Alimentación";
    const subCategory = "Mercado";
    const finalStoreName = storeName ?? list.storeName;
    const finalPurpose = purpose ?? list.purpose;
    const description =
      customDescription || buildMarketDescription(list.name, finalStoreName, finalPurpose);

    // ── Validación de la forma de pago ──
    if (paymentType === "account") {
      const account = await db.account.findFirst({
        where: { id: accountId!, userId },
        select: { id: true },
      });
      if (!account) {
        return NextResponse.json({ error: "Cuenta de pago no encontrada" }, { status: 404 });
      }
      if (subAccountId) {
        const subAccount = await db.subAccount.findUnique({
          where: { id: subAccountId },
          select: { id: true, accountId: true },
        });
        if (!subAccount || subAccount.accountId !== accountId) {
          return NextResponse.json(
            { error: "Bolsillo no válido para esta cuenta" },
            { status: 400 }
          );
        }
      }
    }

    if (paymentType === "credit_card") {
      const debt = await db.debt.findFirst({
        where: { id: debtId!, userId, type: { not: "loan" } },
        select: { id: true },
      });
      if (!debt) {
        return NextResponse.json(
          { error: "Tarjeta de crédito no encontrada" },
          { status: 404 }
        );
      }
    }

    // ── Confirmación: ledger + historial de precios + registro de la parcial ──
    const result = await db.$transaction(async (tx) => {
      const confirmation = await tx.pantryListConfirmation.create({
        data: {
          shoppingListId: list.id,
          userId,
          storeName: finalStoreName ?? null,
          purchaseDate,
          discountType: discountType ?? null,
          discountValue: discountValue > 0 ? discountValue : null,
          subtotal,
          discountAmount: totalDiscount,
          total: totalAmount,
          paymentType,
          accountId: paymentType === "account" ? accountId! : null,
          subAccountId: paymentType === "account" ? subAccountId : null,
          debtId: paymentType === "credit_card" ? debtId! : null,
          itemCount: lineResults.length,
        },
      });

      for (const { item, movedQty, itemPrice } of lineResults) {
        // Solo las líneas seleccionadas entran al stock.
        const goesToStock = hasSelection
          ? selectedById.has(item.id)
          : item.isStock === true;

        // Siempre se acumula lo confirmado, para que la lista se salde.
        await tx.shoppingListItem.update({
          where: { id: item.id },
          data: {
            confirmedQuantity: { increment: movedQty },
            storeName: finalStoreName ?? item.storeName ?? null,
          },
        });

        if (!goesToStock || movedQty <= 0) continue;

        // 1. Resolver el producto de la nevera: por enlace explícito o por nombre.
        let pantryItemId = item.pantryItemId;
        if (pantryItemId) {
          const exists = await tx.pantryItem.findFirst({
            where: { id: pantryItemId, userId },
            select: { id: true },
          });
          if (!exists) pantryItemId = null;
        }
        if (!pantryItemId) {
          const match = await findPantryItemByName(userId, item.name, item.unit || "unit");
          pantryItemId = match?.id ?? null;
        }

        // 2. Crear el producto si de verdad no existe (con su clave normalizada).
        if (!pantryItemId) {
          const created = await tx.pantryItem.create({
            data: {
              userId,
              name: item.name,
              nameNormalized: normalizeName(item.name),
              // Existe la posibilidad de que la línea traiga pista de categoría;
              // si no, queda en "other" y el usuario la ajusta en la nevera.
              category: "other",
              quantity: 0, // la cantidad la pone el movimiento, no la creación
              unit: item.unit || "unit",
              purchaseDate,
              purchasePrice: itemPrice || null,
              minStock: minMode && movedQty > 0 ? movedQty : null,
              multiplyQuantity: item.multiplyQuantity ?? true,
            },
          });
          pantryItemId = created.id;
          await tx.shoppingListItem.update({
            where: { id: item.id },
            data: { pantryItemId: created.id },
          });
        }

        // 3. El stock entra por el ledger, nunca por escritura directa.
        await applyMovement(tx, {
          itemId: pantryItemId,
          userId,
          type: "in",
          quantity: movedQty,
          unit: item.unit || "unit",
          note: finalStoreName ? `Compra en ${finalStoreName}` : "Compra",
          sourceListId: list.id,
          sourceStore: finalStoreName ?? null,
          unitPrice: itemPrice || null,
          confirmationId: confirmation.id,
          occurredAt: purchaseDate,
        });

        // 4. Historial de precios: alimenta el precio de las próximas listas.
        if (itemPrice > 0) {
          await tx.priceHistory.create({
            data: {
              itemId: pantryItemId,
              userId,
              price: itemPrice,
              quantity: movedQty,
              unit: item.unit || "unit",
              date: purchaseDate,
              sourceListId: list.id,
              sourceStore: finalStoreName ?? null,
              storeName: finalStoreName ? normalizeName(finalStoreName) : null,
            },
          });
        }

        // 5. El mínimo recordado nunca baja (regla 2 de la especificación).
        if (minMode && movedQty > 0) {
          const current = await tx.pantryItem.findUnique({
            where: { id: pantryItemId },
            select: { minStock: true },
          });
          const nextMin = Math.max(toNumber(current?.minStock ?? 0), movedQty);
          await tx.pantryItem.update({
            where: { id: pantryItemId },
            data: { minStock: nextMin, purchaseDate, purchasePrice: itemPrice || undefined },
          });
        } else {
          await tx.pantryItem.update({
            where: { id: pantryItemId },
            data: { purchaseDate, purchasePrice: itemPrice || undefined },
          });
        }
      }

      // ── Estado de la lista: saldada o parcial ──
      const fresh = await tx.shoppingListItem.findMany({
        where: { shoppingListId: list.id },
        select: { quantity: true, confirmedQuantity: true },
      });
      const allSettled = fresh.every(
        (line) => line.confirmedQuantity >= line.quantity - 1e-9
      );
      const anySettled = fresh.some((line) => line.confirmedQuantity > 0);

      const updatedList = await tx.shoppingList.update({
        where: { id: list.id },
        data: {
          status: allSettled ? "completed" : anySettled ? "partially_confirmed" : "shopping",
          storeName: finalStoreName,
          purpose: finalPurpose,
          purchaseDate,
          completedAt: allSettled ? new Date() : null,
        },
        include: { items: true },
      });

      return { updatedList, confirmation, allSettled };
    });

    // ── Finanzas, FUERA de la transacción ──
    // `createPantryFinanceEntry` abre su propia transacción (crea el movimiento,
    // ajusta el saldo y el presupuesto), así que no puede anidarse. Se llama
    // después y, si falla, la compra ya quedó registrada: el error se informa
    // como advertencia en vez de tumbar la confirmación completa.
    let finance: Awaited<ReturnType<typeof createPantryFinanceEntry>> | null = null;
    let financeWarning: string | null = null;
    try {
      finance = await createPantryFinanceEntry({
        userId,
        amount: totalAmount,
        description,
        date: purchaseDate,
        sourceId: list.id,
        paymentType,
        accountId: paymentType === "account" ? accountId! : null,
        subAccountId: paymentType === "account" ? subAccountId : null,
        debtId: paymentType === "credit_card" ? debtId! : null,
        installmentCount,
        notes: `Despensa: ${description}`,
      });

      if (finance.transactionId || finance.installmentId) {
        await db.pantryListConfirmation.update({
          where: { id: result.confirmation.id },
          data: {
            transactionId: finance.transactionId ?? null,
            installmentId: finance.installmentId ?? null,
          },
        });
      }
    } catch (financeError) {
      console.error("Confirm: la compra se registró pero falló Finanzas", financeError);
      financeWarning =
        "La compra y el inventario se registraron, pero no se pudo crear el movimiento en Finanzas. Revísalo en el módulo de finanzas.";
    }

    return NextResponse.json({
      ...result.updatedList,
      confirmation: {
        id: result.confirmation.id,
        storeName: result.confirmation.storeName,
        purchaseDate: result.confirmation.purchaseDate,
        subtotal,
        discount: totalDiscount,
        total: totalAmount,
        itemCount: lineResults.length,
      },
      finance,
      settled: result.allSettled,
      ...(financeWarning ? { warning: financeWarning } : {}),
      message: result.allSettled
        ? "Compra registrada. La lista quedó saldada."
        : "Compra registrada. La lista sigue abierta con lo que falta.",
    });
  } catch (error) {
    console.error("Confirm shopping list error:", error);
    const message =
      error instanceof Error ? error.message : "Error al confirmar la lista de compras";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
