import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { syncSavingsBudget } from "@/lib/savings-budget-sync";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * Recalculate the cuota for a savings goal and update its linked recurring payment
 */
async function recalculateCuota(goalId: string) {
  const goal = await db.savingsGoal.findUnique({
    where: { id: goalId },
  });

  if (!goal || !goal.deadline) return;

  const remaining = toNumber(goal.targetAmount) - toNumber(goal.currentAmount);
  if (remaining <= 0) {
    // Goal is complete — cancel the recurring payment
    await db.recurringPayment.updateMany({
      where: {
        savingsGoalId: goalId,
        status: "pending",
      },
      data: { status: "cancelled" },
    });
    return;
  }

  const now = getColombiaNow();
  const diffMs = goal.deadline.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  let periods: number;
  switch (goal.frequency) {
    case "semanal":
      periods = Math.max(Math.ceil(diffDays / 7), 1);
      break;
    case "quincenal":
      periods = Math.max(Math.ceil(diffDays / 15), 1);
      break;
    case "mensual":
    default:
      periods = Math.max(Math.ceil(diffDays / 30), 1);
      break;
  }

  const cuota = Math.round(remaining / periods);

  // Update the next pending recurring payment for this goal
  const nextPending = await db.recurringPayment.findFirst({
    where: {
      savingsGoalId: goalId,
      status: "pending",
    },
  });

  if (nextPending) {
    await db.recurringPayment.update({
      where: { id: nextPending.id },
      data: { amount: cuota },
    });
  }
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
    const body = await req.json();
    const { amount, description, accountId } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });
    }

    const goal = await db.savingsGoal.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!goal) {
      return NextResponse.json({ error: "Meta de ahorro no encontrada" }, { status: 404 });
    }

    // Create contribution
    const contribution = await db.savingsContribution.create({
      data: {
        goalId: id,
        amount,
        date: getColombiaNow(),
        description: description || null,
        accountId: accountId || null,
      },
    });

    // Update goal current amount
    await db.savingsGoal.update({
      where: { id },
      data: { currentAmount: { increment: amount } },
    });

    // If accountId provided, create expense transaction (transfer to savings)
    if (accountId) {
      await db.transaction.create({
        data: {
          userId: session.user.id,
          accountId,
          type: "expense",
          amount,
          description: `Ahorro: ${goal.name}`,
          category: "Ahorros",
          subCategory: goal.name,
          date: getColombiaNow(),
          sourceModule: "finance",
          sourceId: goal.id,
        },
      });

      await db.account.update({
        where: { id: accountId },
        data: { balance: { increment: -amount } },
      });
    }

    // Recalculate cuota (abono a capital — cuota may decrease)
    await recalculateCuota(id);

    // Sync savings budget (current amount changed)
    await syncSavingsBudget(session.user.id);

    return NextResponse.json(contribution, { status: 201 });
  } catch (error) {
    console.error("Contribute to savings error:", error);
    return NextResponse.json({ error: "Error al aportar al ahorro" }, { status: 500 });
  }
}
