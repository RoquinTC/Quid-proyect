import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, debtReverseAbonoSchema } from "@/lib/validations";

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

    // Find the abono record
    const abono = await db.abono.findFirst({
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
      return NextResponse.json(
        { error: "Abono no encontrado o ya fue reversado" },
        { status: 404 }
      );
    }

    // ── 1. Restore each installment's remainingBalance ──
    for (const detail of abono.details) {
      const installment = await db.installment.findUnique({
        where: { id: detail.installmentId },
      });

      if (installment) {
        // Restore the remainingBalance by the amount that was deducted
        const currentBalance = toNumber(installment.remainingBalance ?? installment.totalAmount);
        const restoredBalance = currentBalance + toNumber(detail.amount);

        await db.installment.update({
          where: { id: installment.id },
          data: {
            remainingBalance: restoredBalance,
          },
        });
      }
    }

    // ── 2. Restore debt.currentBalance ──
    await db.debt.update({
      where: { id: debtId },
      data: { currentBalance: { increment: abono.totalAmount } },
    });

    // ── 3. Restore account/subaccount balance ──
    if (abono.subAccountId) {
      await db.subAccount.update({
        where: { id: abono.subAccountId },
        data: { balance: { increment: abono.totalAmount } },
      });
    } else {
      await db.account.update({
        where: { id: abono.accountId },
        data: { balance: { increment: abono.totalAmount } },
      });
    }

    // ── 4. Reverse budget spending using debt's category ──
    const debt = await db.debt.findFirst({
      where: { id: debtId, userId: session.user.id },
      select: { category: true, subCategory: true },
    });
    const categoryToMatch = debt?.category || "Deudas";
    const subCatToMatch = debt?.subCategory || null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let budget: any = null;
    if (subCatToMatch) {
      budget = await db.budget.findFirst({
        where: { userId: session.user.id, category: categoryToMatch, subCategory: subCatToMatch, type: "expense" },
      });
    }
    if (!budget) {
      budget = await db.budget.findFirst({
        where: { userId: session.user.id, category: categoryToMatch, subCategory: null, type: "expense" },
      });
    }
    if (budget) {
      await db.budget.update({
        where: { id: budget.id },
        data: { spent: { increment: -abono.totalAmount } },
      });
    }

    // ── 5. Delete the associated transaction ──
    if (abono.transactionId) {
      await db.transaction.delete({
        where: { id: abono.transactionId },
      }).catch(() => {
        // Transaction may have already been deleted; that's OK
      });
    }

    // ── 6. Mark abono as reversed ──
    await db.abono.update({
      where: { id: abono.id },
      data: {
        isReversed: true,
        transactionId: null,
      },
    });

    return NextResponse.json({
      success: true,
      totalReversed: toNumber(abono.totalAmount),
      reversedDetails: abono.details.length,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Reverse abono error:", error);
    return NextResponse.json({ error: "Error al reversar el abono" }, { status: 500 });
  }
}
