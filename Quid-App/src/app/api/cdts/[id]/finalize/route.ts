import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncSavingsBudget } from "@/lib/savings-budget-sync";
import { getColombiaNow, createColombiaDate } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, cdtFinalizeSchema } from "@/lib/validations";

/**
 * Finalize (withdraw) a CDT.
 * 
 * This endpoint:
 * 1. Marks the CDT as withdrawn with the actual received amount
 * 2. Deposits the received amount into the selected destination account/subaccount
 * 3. Creates an income transaction for the deposit
 * 4. If the CDT was linked to a savings goal:
 *    a. Removes the provisional invested amount from the goal
 *    b. Adds the actual net received amount to the goal (since it's now real money)
 *    c. Re-syncs the savings budget
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

    const { id } = await params;
    const body = await validateBody(req, cdtFinalizeSchema);
    const { withdrawnAmount, withdrawnDate, destinationAccountId, destinationSubAccountId } = body;

    // Find the CDT
    const cdt = await db.cDT.findFirst({
      where: { id, userId: session.user.id },
      include: {
        goal: { select: { id: true, name: true, targetAmount: true, currentAmount: true } },
        account: { select: { id: true, name: true, type: true, color: true } },
      },
    });

    if (!cdt) {
      return NextResponse.json({ error: "CDT no encontrado" }, { status: 404 });
    }

    if (cdt.status === "withdrawn") {
      return NextResponse.json(
        { error: "Este CDT ya fue finalizado" },
        { status: 400 }
      );
    }

    const now = getColombiaNow();
    const wDate = withdrawnDate ? createColombiaDate(withdrawnDate.split("T")[0]) : now;
    const wAmount = parseFloat(String(withdrawnAmount));

    // 1. Update the CDT status
    await db.cDT.update({
      where: { id },
      data: {
        status: "withdrawn",
        withdrawnAmount: wAmount,
        withdrawnDate: wDate,
        accountId: destinationAccountId, // Update the payout account
      },
    });

    // 2. Deposit the received amount into the destination account/subaccount
    if (destinationSubAccountId) {
      await db.subAccount.update({
        where: { id: destinationSubAccountId },
        data: { balance: { increment: wAmount } },
      });
    } else {
      await db.account.update({
        where: { id: destinationAccountId },
        data: { balance: { increment: wAmount } },
      });
    }

    // 3. Create an income transaction for the deposit
    const destAccount = await db.account.findUnique({
      where: { id: destinationAccountId },
      select: { name: true },
    });
    const destSubAccount = destinationSubAccountId
      ? await db.subAccount.findUnique({ where: { id: destinationSubAccountId }, select: { name: true } })
      : null;

    await db.transaction.create({
      data: {
        userId: session.user.id,
        accountId: destinationAccountId,
        subAccountId: destinationSubAccountId || null,
        type: "income",
        amount: wAmount,
        description: `CDT ${cdt.bank} — vencimiento`,
        category: "Inversiones",
        date: wDate,
        sourceModule: "finance",
        sourceId: cdt.id,
        isRecurring: false,
        notes: `Finalización CDT: invertido ${toNumber(cdt.amount)}, recibido ${wAmount}${destSubAccount ? ` → ${destSubAccount.name}` : ""}`,
      },
    });

    // 4. If linked to a savings goal, update the goal
    if (cdt.goalId && cdt.goal) {
      // a. Remove the provisional invested amount
      const goal = cdt.goal;
      const newCurrentAfterRemoval = Math.max(toNumber(goal.currentAmount) - toNumber(cdt.amount), 0);

      // b. Add the actual received amount (real money now)
      const finalCurrent = newCurrentAfterRemoval + wAmount;

      await db.savingsGoal.update({
        where: { id: cdt.goalId },
        data: { currentAmount: finalCurrent },
      });

      // c. Record the contribution changes
      await db.savingsContribution.create({
        data: {
          goalId: cdt.goalId,
          amount: -toNumber(cdt.amount),
          date: now,
          description: `CDT ${cdt.bank} — reversa valor provisional (finalización)`,
        },
      });

      await db.savingsContribution.create({
        data: {
          goalId: cdt.goalId,
          amount: wAmount,
          date: now,
          description: `CDT ${cdt.bank} — abono real por vencimiento`,
        },
      });

      // d. Unlink the CDT from the goal (since it's now finalized)
      await db.cDT.update({
        where: { id },
        data: { goalId: null },
      });

      // e. Sync the savings budget
      await syncSavingsBudget(session.user.id);
    }

    return NextResponse.json({
      success: true,
      message: "CDT finalizado exitosamente",
      withdrawnAmount: wAmount,
      destinationAccount: destAccount?.name,
      destinationSubAccount: destSubAccount?.name,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Finalize CDT error:", error);
    const message = error?.message || "Error al finalizar CDT";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
