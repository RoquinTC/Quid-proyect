import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow, getColombiaTodayString, createColombiaDate } from "@/lib/api";
import { syncSavingsBudget } from "@/lib/savings-budget-sync";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, savingsContributeSchema } from "@/lib/validations";
import { createAndPushNotification } from "@/lib/push";

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
    let body;
    try {
      body = await validateBody(req, savingsContributeSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { amount, description, accountId, subAccountId } = body;

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
        date: createColombiaDate(getColombiaTodayString()),
        description: description || null,
        accountId: accountId || null,
      },
    });

    // Update goal current amount (will be recalculated by syncSavingsBudget below)
    // We still increment here so the value is correct immediately before sync runs
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
          subAccountId: subAccountId || null,
          type: "expense",
          amount,
          description: `Ahorro: ${goal.name}`,
          category: "Ahorros",
          subCategory: goal.name,
          date: createColombiaDate(getColombiaTodayString()),
          sourceModule: "finance",
          sourceId: goal.id,
        },
      });

      // Deduct from sub-account if provided, otherwise from the main account
      if (subAccountId) {
        await db.subAccount.update({
          where: { id: subAccountId },
          data: { balance: { increment: -amount } },
        });
      } else {
        await db.account.update({
          where: { id: accountId },
          data: { balance: { increment: -amount } },
        });
      }
    }

    // Recalculate cuota (abono a capital — cuota may decrease)
    await recalculateCuota(id);

    // Sync savings budget (current amount changed)
    await syncSavingsBudget(session.user.id);

    // ── Push Notification: Goal completed ──
    // Check if this contribution pushed the goal to 100%+
    const updatedGoal = await db.savingsGoal.findUnique({ where: { id } });
    if (updatedGoal && toNumber(updatedGoal.currentAmount) >= toNumber(updatedGoal.targetAmount)) {
      // Goal just completed — send notification
      try {
        await createAndPushNotification({
          userId: session.user.id,
          type: "goal_completed",
          title: "¡Meta cumplida!",
          message: `Tu meta "${updatedGoal.name}" ha alcanzado el 100%`,
          pushBody: `¡Meta cumplida! "${updatedGoal.name}" al 100%`,
          url: "/?tab=finance&sub=savings-detail",
        });
      } catch (notifError) {
        console.error("[Contribute] Failed to send goal notification:", notifError);
      }
    }

    return NextResponse.json(contribution, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Contribute to savings error:", error);
    return NextResponse.json({ error: "Error al aportar al ahorro" }, { status: 500 });
  }
}
