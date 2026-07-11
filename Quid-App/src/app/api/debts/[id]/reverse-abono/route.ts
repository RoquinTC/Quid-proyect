import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, debtReverseAbonoSchema } from "@/lib/validations";
import { applyBalanceDelta, applyBudgetDelta } from "@/lib/finance-ledger";

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

      for (const detail of abono.details) {
        const installment = await tx.installment.findUnique({
          where: { id: detail.installmentId },
        });

        if (installment) {
          const currentBalance = toNumber(installment.remainingBalance ?? installment.totalAmount);
          const restoredBalance = currentBalance + toNumber(detail.amount);

          await tx.installment.update({
            where: { id: installment.id },
            data: { remainingBalance: restoredBalance },
          });
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

      const debt = await tx.debt.findFirst({
        where: { id: debtId, userId: session.user.id },
        select: { category: true, subCategory: true },
      });

      await applyBudgetDelta(tx, {
        userId: session.user.id,
        category: debt?.category || "Deudas",
        subCategory: debt?.subCategory || null,
        type: "expense",
        amount: -toNumber(abono.totalAmount),
      });

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
    if (error instanceof Error && error.message === "Abono no encontrado o ya fue reversado") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Reverse abono error:", error);
    return NextResponse.json({ error: "Error al reversar el abono" }, { status: 500 });
  }
}
