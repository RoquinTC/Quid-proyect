import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaTodayString, createColombiaDate } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";
import { adjustBudgetSpent, applyCreditInstallmentBudgetImpact } from "@/lib/budget-impact";
import { validateBody, shoppingListConfirmSchema } from "@/lib/validations";

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
    const { paymentType, accountId, subAccountId, debtId, installmentCount } = body;

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

    const purchaseDate = createColombiaDate(getColombiaTodayString());
    const category = "Alimentación";
    const subCategory = "Mercado";
    const description = `Compra de mercado - ${list.name}`;
    let debt: { id: string; type: string; cutoffDate: number | null; paymentDate: number | null } | null = null;
    let nextPaymentDate = new Date(purchaseDate);
    const totalInstallments = installmentCount && installmentCount > 1 ? installmentCount : 1;
    const installmentAmount = Math.round((totalAmount / totalInstallments) * 100) / 100;

    if (paymentType === "account") {
      const account = await db.account.findFirst({
        where: { id: accountId!, userId: session.user.id },
        select: { id: true },
      });
      if (!account) {
        return NextResponse.json({ error: "Cuenta de pago no encontrada" }, { status: 404 });
      }

      if (subAccountId) {
        const subAccount = await db.subAccount.findFirst({
          where: { id: subAccountId, account: { userId: session.user.id } },
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

      if (debt.cutoffDate && debt.paymentDate) {
        const purchaseDay = purchaseDate.getDate();
        const cutoffDay = debt.cutoffDate;
        const paymentDay = debt.paymentDate;
        const monthsToAdd = purchaseDay >= cutoffDay ? 2 : paymentDay > cutoffDay ? 1 : 2;
        const payMonth = purchaseDate.getMonth() + monthsToAdd;
        const maxDaysInPayMonth = new Date(purchaseDate.getFullYear(), payMonth + 1, 0).getDate();
        nextPaymentDate = new Date(
          purchaseDate.getFullYear(),
          payMonth,
          Math.min(paymentDay, maxDaysInPayMonth),
          12,
          0,
          0
        );
      } else {
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      }
    }

    const updatedList = await db.$transaction(async (tx) => {
      for (const item of list.items) {
        if (item.isPurchased && item.pantryItemId) {
          await tx.pantryItem.update({
            where: { id: item.pantryItemId },
            data: { quantity: { increment: item.quantity } },
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
        data: { status: "completed" },
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
