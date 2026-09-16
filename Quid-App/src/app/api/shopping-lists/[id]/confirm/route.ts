import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaTodayString, createColombiaDate } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";
import { adjustBudgetSpent, applyCreditInstallmentBudgetImpact } from "@/lib/budget-impact";
import { validateBody, shoppingListConfirmSchema } from "@/lib/validations";
import { verifyEntityMutationAccess } from "@/lib/auth-guards";
import { getCreditCardNextPaymentDate } from "@/lib/credit-card-cycle";

function normalizeOptionalId(value: string | null | undefined) {
  return value && value !== "none" && value !== "__none__" ? value : null;
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildMarketDescription(listName: string, storeName?: string | null, purpose?: string | null) {
  const store = cleanText(storeName);
  const label = cleanText(purpose) || cleanText(listName) || "Mercado";
  if (store && label && label.toLowerCase() !== "mercado") return `Compra ${store} - ${label}`;
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
    // "Convertir a stock": selected items with their (stepper) quantities, and
    // whether to write the bought amount as the pantry item's minStock.
    const stockSelection = body.items;
    const minMode = body.minMode ?? false;
    const selectedById = new Map((stockSelection ?? []).map((s) => [s.id, s]));
    const hasSelection = stockSelection !== undefined;

    const list = await db.shoppingList.findFirst({
      where: { id, userId: session.user.id },
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

    // Calculate total amount
    const totalAmount = list.items.reduce((sum, item) => {
      const price = toNumber(item.actualPrice ?? item.estimatedPrice ?? 0);
      return sum + price * toNumber(item.quantity);
    }, 0);

    if (totalAmount <= 0) {
      return NextResponse.json({ error: "La lista no tiene un valor para registrar" }, { status: 400 });
    }

    const purchaseDate = bodyPurchaseDate ? new Date(bodyPurchaseDate) : createColombiaDate(getColombiaTodayString());
    const category = "Alimentación";
    const subCategory = "Mercado";
    const finalStoreName = storeName ?? list.storeName;
    const finalPurpose = purpose ?? list.purpose;
    const description = customDescription || buildMarketDescription(list.name, finalStoreName, finalPurpose);
    let debt: { id: string; type: string; cutoffDate: number | null; paymentDate: number | null } | null = null;
    let nextPaymentDate = new Date(purchaseDate);
    const totalInstallments = installmentCount && installmentCount > 1 ? installmentCount : 1;
    const installmentAmount = Math.round((totalAmount / totalInstallments) * 100) / 100;

    if (paymentType === "account") {
      const entities: { type: "account" | "subAccount"; id: string }[] = [{ type: "account", id: accountId! }];
      if (subAccountId) entities.push({ type: "subAccount", id: subAccountId });
      const accessError = await verifyEntityMutationAccess(session.user.id, entities);
      if (accessError) return accessError;

      if (subAccountId) {
        const subAccount = await db.subAccount.findUnique({
          where: { id: subAccountId },
          select: { id: true, accountId: true },
        });
        if (!subAccount || subAccount.accountId !== accountId) {
          return NextResponse.json({ error: "Bolsillo no válido para esta cuenta" }, { status: 400 });
        }
      }
    }

    if (paymentType === "credit_card") {
      debt = await db.debt.findFirst({
        where: { id: debtId!, userId: session.user.id, type: { not: "loan" } },
        select: { id: true, type: true, cutoffDate: true, paymentDate: true },
      });
      if (!debt) {
        return NextResponse.json({ error: "Tarjeta de crédito no encontrada" }, { status: 404 });
      }

      nextPaymentDate = getCreditCardNextPaymentDate({
        purchaseDate,
        cutoffDate: debt.cutoffDate,
        paymentDate: debt.paymentDate,
      });
    }

    const updatedList = await db.$transaction(async (tx) => {
      for (const item of list.items) {
        if (!item.isPurchased) continue;
        // If a selection was sent ("Convertir a stock"), only selected items
        // land in the pantry; unselected = "no lo muevas a stock".
        if (hasSelection && !selectedById.has(item.id)) continue;

        const sel = selectedById.get(item.id);
        const movedQty = sel !== undefined ? sel.quantity : item.quantity;
        const itemPrice = toNumber(item.actualPrice ?? item.estimatedPrice ?? 0);

        if (item.pantryItemId) {
          const existing = await tx.pantryItem.findUnique({
            where: { id: item.pantryItemId },
            select: { minStock: true },
          });
          // "Convertir a stock": never lower an existing min; seed it from the
          // (stepper) bought quantity when the "Recordar mínimos" toggle is on.
          const nextMin =
            minMode && !Number.isNaN(movedQty)
              ? Math.max(toNumber(existing?.minStock ?? 0), movedQty)
              : existing?.minStock ?? null;

          await tx.pantryItem.update({
            where: { id: item.pantryItemId },
            data: {
              quantity: { increment: movedQty },
              purchaseDate,
              purchasePrice: itemPrice || undefined,
              minStock: nextMin ?? null,
            },
          });
        } else {
          const created = await tx.pantryItem.create({
            data: {
              userId: session.user.id,
              name: item.name,
              category: "other",
              quantity: movedQty,
              unit: item.unit || "unit",
              purchaseDate,
              purchasePrice: itemPrice || null,
              minStock: minMode && !Number.isNaN(movedQty) ? movedQty : null,
            },
          });
          // Link the fresh pantry item back so future conversions edit it.
          await tx.shoppingListItem.update({
            where: { id: item.id },
            data: { pantryItemId: created.id },
          });
        }
      }

      if (paymentType === "account") {
        await tx.transaction.create({
          data: {
            userId: session.user.id,
            type: "expense",
            amount: totalAmount,
            description,
            category,
            subCategory,
            sourceModule: "pantry",
            sourceId: list.id,
            date: purchaseDate,
            accountId: accountId!,
            subAccountId: subAccountId || null,
          },
        });

        if (subAccountId) {
          await tx.subAccount.update({
            where: { id: subAccountId },
            data: { balance: { decrement: totalAmount } },
          });
        } else {
          await tx.account.update({
            where: { id: accountId! },
            data: { balance: { decrement: totalAmount } },
          });
        }
      } else if (debt) {
        await tx.installment.create({
          data: {
            debtId: debt.id,
            description,
            totalAmount,
            totalInstallments,
            currentInstallment: 1,
            installmentAmount,
            paidAmount: 0,
            remainingBalance: totalAmount,
            purchaseDate,
            nextPaymentDate,
            isPaid: false,
            accountId: null,
            subAccountId: null,
            category,
            subCategory,
            sourceModule: "pantry",
            sourceId: list.id,
          },
        });

        await tx.debt.update({
          where: { id: debt.id },
          data: { currentBalance: { increment: totalAmount } },
        });

      }

      return tx.shoppingList.update({
        where: { id },
        data: {
          status: "completed",
          storeName: finalStoreName,
          purpose: finalPurpose,
          purchaseDate,
          completedAt: new Date(),
        },
        include: { items: true },
      });
    });

    if (paymentType === "credit_card" && debt) {
      await applyCreditInstallmentBudgetImpact({
        userId: session.user.id,
        debtType: debt.type,
        category,
        subCategory,
        installmentAmount,
        nextPaymentDate,
      });
    } else {
      await adjustBudgetSpent({
        userId: session.user.id,
        category,
        subCategory,
        type: "expense",
        amount: totalAmount,
      });
    }

    return NextResponse.json(updatedList);
  } catch (error) {
    console.error("Confirm shopping list error:", error);
    return NextResponse.json({ error: "Error al confirmar lista de compras" }, { status: 500 });
  }
}
