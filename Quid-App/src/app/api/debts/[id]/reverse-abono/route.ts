import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, debtReverseAbonoSchema } from "@/lib/validations";
import { applyBalanceDelta, applyBudgetDelta } from "@/lib/finance-ledger";
import { getNextInstallmentCapital } from "@/lib/installment-payment";

/**
 * Reverse a specific "abono a capital" by its Abono ID.
 *
 * What this does:
 * 1. Finds the Abono record with its AbonoDetail entries
 * 2. Restores each installment's remainingBalance (increment by the abono amount)
 * 3. Restores debt.currentBalance (increment by total abono)
 * 4. Restores account/subaccount balance (increment by total abono)
 * 5. Reverses budget spending (decrement by total abono)
 * 6. Deletes the associated expense transaction
 * 7. Marks the Abono as isReversed=true and clears transactionId
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: debtId } = await params;

    let body;
    try {
      body = await validateBody(req, debtReverseAbonoSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { abonoId } = body;

    if (!abonoId) {
      return NextResponse.json({ error: "Se requiere el ID del abono" }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const abono = await tx.abono.findFirst({
        where: {
          id: abonoId,
          debtId,
          userId: session.user.id,
          isReversed: false,
        },
        include: {
          details: true,
        },
      });

      if (!abono) {
        throw new Error("Abono no encontrado o ya fue reversado");
      }

      const debt = await tx.debt.findFirst({
        where: { id: debtId, userId: session.user.id },
        select: { category: true, subCategory: true },
      });

      const categoryReversals: Record<string, { category: string; subCategory: string | null; amount: number }> = {};

      for (const detail of abono.details) {
        const installment = await tx.installment.findUnique({
          where: { id: detail.installmentId },
        });

        if (installment) {
          const currentBalance = toNumber(installment.remainingBalance ?? installment.totalAmount);
          const restoredBalance = currentBalance + toNumber(detail.amount);
          const currentPaidAmount = toNumber(installment.paidAmount ?? 0);
          const restoredPaidAmount = Math.max(0, currentPaidAmount - toNumber(detail.amount));

          if (installment.isPaid && currentPaidAmount > toNumber(detail.amount)) {
            throw new Error("No puedes reversar este abono porque ya se registró un pago posterior de la cuota");
          }

          const updateData: Record<string, unknown> = {
            remainingBalance: restoredBalance,
            paidAmount: restoredPaidAmount,
            isPaid: false, // Restoring debt balance makes it unpaid
          };

          if (installment.totalInstallments === 1) {
            updateData.installmentAmount = restoredBalance;
          } else {
            updateData.installmentAmount = getNextInstallmentCapital(installment, restoredBalance);
          }

          await tx.installment.update({
            where: { id: installment.id },
            data: updateData,
          });

          const cat = installment.category || debt?.category || "Deudas";
          const subCat = installment.subCategory || debt?.subCategory || null;
          const key = subCat ? `${cat}::${subCat}` : cat;
          if (!categoryReversals[key]) {
            categoryReversals[key] = { category: cat, subCategory: subCat, amount: 0 };
          }
          categoryReversals[key].amount += toNumber(detail.amount);
        }
      }

      await tx.debt.update({
        where: { id: debtId },
        data: { currentBalance: { increment: abono.totalAmount } },
      });

      await applyBalanceDelta(tx, {
        accountId: abono.accountId,
        subAccountId: abono.subAccountId,
        amount: toNumber(abono.totalAmount),
      });

      for (const item of Object.values(categoryReversals)) {
        await applyBudgetDelta(tx, {
          userId: session.user.id,
          category: item.category,
          subCategory: item.subCategory,
          type: "expense",
          amount: -item.amount,
        });
      }

      if (abono.transactionId) {
        try {
          await tx.transaction.delete({
            where: { id: abono.transactionId },
          });
        } catch {
          // The linked transaction may have already been deleted.
        }
      }

      await tx.abono.update({
        where: { id: abono.id },
        data: {
          isReversed: true,
          transactionId: null,
        },
      });

      return {
        totalReversed: toNumber(abono.totalAmount),
        reversedDetails: abono.details.length,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Error && (error.message === "Abono no encontrado o ya fue reversado" || error.message.includes("pago posterior"))) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Reverse abono error:", error);
    return NextResponse.json({ error: "Error al reversar el abono" }, { status: 500 });
  }
}
