import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncSavingsBudget } from "@/lib/savings-budget-sync";
import { adjustBudgetSpent, applyCreditInstallmentBudgetImpact } from "@/lib/budget-impact";
import { verifyEntityMutationAccess } from "@/lib/auth-guards";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, recurringConfirmSchema } from "@/lib/validations";
import { createColombiaDate, getColombiaTodayString } from "@/lib/api";
import { applyBalanceDelta } from "@/lib/finance-ledger";
import { getCreditCardNextPaymentDate } from "@/lib/credit-card-cycle";

function normalizeSubAccountId(value: string | null | undefined) {
  return value && value !== "none" && value !== "__none__" ? value : null;
}

/**
 * Calculate the next scheduled date for a recurring payment.
 * - Monthly with customDays: customDays is a JSON array with one day, e.g. "[15]"
 * - Biweekly with customDays: customDays is a JSON array with one or two days:
 *   - "[1,15]" → alternates between both days (legacy, still supported)
 *   - "[1]" → single day, jumps to same day next month (new per-day model)
 * - Weekly: jumps 7 days forward
 * - Falls back to simple date arithmetic for other frequencies
 */
function getNextScheduledDate(currentDate: Date, frequency: string, customDays?: string | null): Date {
  // Helper: clamp a day to the actual max days in a given month
  const clampDay = (year: number, month: number, day: number): number => {
    const maxDays = new Date(year, month + 1, 0).getDate();
    return Math.min(day, maxDays);
  };

  // Monthly with custom day
  if (frequency === "monthly" && customDays) {
    try {
      const parsed = JSON.parse(customDays);
      // Support both "[15]" (array) and "15" (number) formats
      const day = Array.isArray(parsed) ? parsed[0] : parsed;
      if (typeof day === "number" && day >= 1 && day <= 31) {
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        const nextMonth = currentMonth + 1;
        const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
        return new Date(nextYear, nextMonth % 12, clampDay(nextYear, nextMonth % 12, day));
      }
    } catch { /* fall through */ }
  }

  // Biweekly with custom days
  if (frequency === "biweekly" && customDays) {
    try {
      const days = JSON.parse(customDays).sort((a: number, b: number) => a - b);
      if (days.length === 1) {
        // Single-day biweekly: this is a per-day recurring payment.
        // Jump to the same day next month.
        const day = days[0];
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        const nextMonth = currentMonth + 1;
        const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
        return new Date(nextYear, nextMonth % 12, clampDay(nextYear, nextMonth % 12, day));
      }
      if (days.length === 2) {
        // Legacy two-day biweekly: alternates between the two days
        const [day1, day2] = days;
        const currentDay = currentDate.getDate();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();

        if (currentDay < day1) {
          return new Date(currentYear, currentMonth, clampDay(currentYear, currentMonth, day1));
        } else if (currentDay < day2) {
          return new Date(currentYear, currentMonth, clampDay(currentYear, currentMonth, day2));
        } else {
          const nextMonth = currentMonth + 1;
          const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
          return new Date(nextYear, nextMonth % 12, clampDay(nextYear, nextMonth % 12, day1));
        }
      }
    } catch { /* fall through */ }
  }

  const next = new Date(currentDate);
  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 15);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      // one_time — no next date
      return next;
  }
  return next;
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
      body = await validateBody(req, recurringConfirmSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { actualAmount, destinationAccountId, destinationSubAccountId } = body;

    // Find the recurring payment
    const payment = await db.recurringPayment.findFirst({
      where: { id, userId: session.user.id },
      include: {
        account: true,
        debt: true,
        destinationAccount: true,
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Pago recurrente no encontrado" },
        { status: 404 }
      );
    }

    if (payment.status !== "pending") {
      return NextResponse.json(
        { error: "Solo se pueden confirmar pagos pendientes" },
        { status: 400 }
      );
    }

    const confirmedAmount = actualAmount !== undefined ? actualAmount : payment.amount;
    // Use Colombia date for transaction creation (midnight Colombia = 05:00 UTC)
    // This ensures transactions are stored consistently regardless of server timezone
    const todayColombia = createColombiaDate(getColombiaTodayString());

    // Check if this is a savings goal transfer (category: "Ahorros")
    const isSavingsGoal = payment.category === "Ahorros";
    let linkedGoalId: string | null = null;

    if (isSavingsGoal && payment.subCategory) {
      // Find the savings goal by name
      const goal = await db.savingsGoal.findFirst({
        where: {
          userId: session.user.id,
          name: payment.subCategory,
          isActive: true,
        },
      });
      linkedGoalId = goal?.id || null;
    }

    // For savings goal transfers, the destination is chosen at confirmation time
    const sourceSubAccountId = normalizeSubAccountId(payment.subAccountId);
    const effectiveDestAccountId = isSavingsGoal ? (destinationAccountId || payment.destinationAccountId) : payment.destinationAccountId;
    const effectiveDestSubAccountId = normalizeSubAccountId(
      isSavingsGoal
        ? (destinationSubAccountId !== undefined ? destinationSubAccountId : payment.destinationSubAccountId)
        : payment.destinationSubAccountId
    );

    if (payment.type === "transfer" && payment.accountId && effectiveDestAccountId) {
      if (payment.accountId === effectiveDestAccountId && sourceSubAccountId === effectiveDestSubAccountId) {
        return NextResponse.json(
          { error: "El origen y el destino de la transferencia recurrente no pueden ser el mismo lugar" },
          { status: 400 }
        );
      }
    }

    // Re-verify write access of all referenced entities before mutating balances.
    // This allows transfers from an owned account into a shared account where the
    // user has editor access.
    const entitiesToVerify: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    if (payment.accountId) entitiesToVerify.push({ type: "account", id: payment.accountId });
    if (sourceSubAccountId) entitiesToVerify.push({ type: "subAccount", id: sourceSubAccountId });
    if (payment.debtId) entitiesToVerify.push({ type: "debt", id: payment.debtId });
    if (effectiveDestAccountId) entitiesToVerify.push({ type: "account", id: effectiveDestAccountId });
    if (effectiveDestSubAccountId) entitiesToVerify.push({ type: "subAccount", id: effectiveDestSubAccountId });

    const accessError = await verifyEntityMutationAccess(session.user.id, entitiesToVerify);
    if (accessError) return accessError;

    if (sourceSubAccountId) {
      const sourceSubAccount = await db.subAccount.findFirst({
        where: { id: sourceSubAccountId, accountId: payment.accountId || "" },
      });
      if (!sourceSubAccount) {
        return NextResponse.json(
          { error: "El bolsillo origen no pertenece a la cuenta origen" },
          { status: 400 }
        );
      }
    }

    if (effectiveDestSubAccountId) {
      const destinationSubAccount = await db.subAccount.findFirst({
        where: { id: effectiveDestSubAccountId, accountId: effectiveDestAccountId || "" },
      });
      if (!destinationSubAccount) {
        return NextResponse.json(
          { error: "El bolsillo destino no pertenece a la cuenta destino" },
          { status: 400 }
        );
      }
    }

    let shouldSyncSavingsBudget = false;

    await db.$transaction(async (tx) => {
      await tx.recurringPayment.update({
        where: { id },
        data: {
          status: "confirmed",
          actualAmount: confirmedAmount,
          confirmedDate: todayColombia,
          destinationAccountId: effectiveDestAccountId || payment.destinationAccountId,
          destinationSubAccountId: effectiveDestSubAccountId,
        },
      });

      if (payment.type === "transfer" && payment.accountId && effectiveDestAccountId) {
        const sourceAccount = await tx.account.findUnique({
          where: { id: payment.accountId },
          select: { name: true },
        });

        const transferTx = await tx.transaction.create({
          data: {
            userId: session.user.id,
            accountId: payment.accountId,
            subAccountId: sourceSubAccountId,
            type: "transfer",
            amount: confirmedAmount,
            description: payment.description,
            category: payment.category || null,
            subCategory: payment.subCategory || null,
            date: todayColombia,
            sourceModule: "finance",
            sourceId: payment.id,
            isRecurring: true,
            notes: `Transferencia recurrente confirmada - ${payment.frequency}`,
          },
        });

        await applyBalanceDelta(tx, {
          accountId: payment.accountId,
          subAccountId: sourceSubAccountId,
          amount: -confirmedAmount,
        });

        const counterpart = await tx.transaction.create({
          data: {
            userId: session.user.id,
            accountId: effectiveDestAccountId,
            subAccountId: effectiveDestSubAccountId || null,
            type: "income",
            amount: confirmedAmount,
            description: `Transferencia recibida: ${payment.description}`,
            category: isSavingsGoal ? "Ahorros" : "Otros",
            subCategory: isSavingsGoal ? payment.subCategory : null,
            date: todayColombia,
            sourceModule: isSavingsGoal ? "finance" : undefined,
            excludeFromBudget: true,
            notes: `Transferencia recurrente desde ${sourceAccount?.name || "cuenta"}`,
            relatedTransactionId: transferTx.id,
          },
        });

        await tx.transaction.update({
          where: { id: transferTx.id },
          data: { relatedTransactionId: counterpart.id },
        });

        await applyBalanceDelta(tx, {
          accountId: effectiveDestAccountId,
          subAccountId: effectiveDestSubAccountId,
          amount: confirmedAmount,
        });

        if (isSavingsGoal && linkedGoalId) {
          await tx.savingsContribution.create({
            data: {
              goalId: linkedGoalId,
              amount: confirmedAmount,
              date: todayColombia,
              description: `Cuota de ahorro (${payment.frequency})`,
              accountId: effectiveDestAccountId,
              transactionId: counterpart.id,
            },
          });

          await tx.savingsGoal.update({
            where: { id: linkedGoalId },
            data: { currentAmount: { increment: confirmedAmount } },
          });

          const goal = await tx.savingsGoal.findUnique({ where: { id: linkedGoalId } });
          if (goal && goal.deadline) {
            const remaining = toNumber(goal.targetAmount) - toNumber(goal.currentAmount);
            if (remaining <= 0) {
              await tx.recurringPayment.updateMany({
                where: { savingsGoalId: goal.id, status: "pending" },
                data: { status: "cancelled" },
              });
            } else {
              const diffMs = goal.deadline.getTime() - todayColombia.getTime();
              const diffDays = diffMs / (1000 * 60 * 60 * 24);
              let periods: number;
              switch (goal.frequency) {
                case "weekly": periods = Math.max(Math.ceil(diffDays / 7), 1); break;
                case "biweekly": periods = Math.max(Math.ceil(diffDays / 15), 1); break;
                default: periods = Math.max(Math.ceil(diffDays / 30), 1); break;
              }
              const newCuota = Math.round(remaining / periods);
              const nextPending = await tx.recurringPayment.findFirst({
                where: { savingsGoalId: goal.id, status: "pending" },
              });
              if (nextPending) {
                await tx.recurringPayment.update({
                  where: { id: nextPending.id },
                  data: { amount: newCuota },
                });
              }
            }
          }

          shouldSyncSavingsBudget = true;
        }
      } else if (payment.debtId) {
        if (payment.debt) {
          await tx.debt.update({
            where: { id: payment.debtId },
            data: { currentBalance: { increment: confirmedAmount } },
          });
        }

        const nextPayment = getCreditCardNextPaymentDate({
          purchaseDate: todayColombia,
          cutoffDate: payment.debt?.cutoffDate,
          paymentDate: payment.debt?.paymentDate,
        });

        const installment = await tx.installment.create({
          data: {
            debtId: payment.debtId,
            description: `${payment.description}${payment.isRecurring ? ` (Recurrente - ${payment.frequency})` : ""}`,
            totalAmount: confirmedAmount,
            totalInstallments: 1,
            currentInstallment: 1,
            installmentAmount: confirmedAmount,
            paidAmount: 0,
            purchaseDate: todayColombia,
            nextPaymentDate: nextPayment,
            isPaid: false,
            accountId: payment.accountId || null,
            subAccountId: sourceSubAccountId,
            category: payment.category || null,
            subCategory: payment.subCategory || null,
            recurringPaymentId: payment.id,
            sourceModule: "finance",
            sourceId: payment.id,
          },
        });

        const isLoan = payment.debt?.type === "loan";
        if (isLoan) {
          await adjustBudgetSpent({
            userId: session.user.id,
            category: payment.category || "Deudas",
            subCategory: payment.subCategory || null,
            type: "expense",
            amount: confirmedAmount,
            client: tx,
          });
        } else {
          await applyCreditInstallmentBudgetImpact({
            userId: session.user.id,
            debtType: payment.debt?.type,
            category: installment.category,
            subCategory: installment.subCategory,
            installmentAmount: Number(installment.installmentAmount),
            nextPaymentDate: installment.nextPaymentDate,
            client: tx,
          });
        }
      } else if (payment.type === "income") {
        if (payment.accountId) {
          await tx.transaction.create({
            data: {
              userId: session.user.id,
              accountId: payment.accountId,
              subAccountId: sourceSubAccountId,
              type: "income",
              amount: confirmedAmount,
              description: payment.description,
              category: payment.category || "Sueldo",
              subCategory: payment.subCategory || null,
              date: todayColombia,
              sourceModule: "finance",
              sourceId: payment.id,
              isRecurring: true,
              notes: `Ingreso recurrente confirmado - ${payment.frequency}`,
            },
          });

          await applyBalanceDelta(tx, {
            accountId: payment.accountId,
            subAccountId: sourceSubAccountId,
            amount: confirmedAmount,
          });
        }

        await adjustBudgetSpent({
          userId: session.user.id,
          category: payment.category || "Sueldo",
          subCategory: payment.subCategory || null,
          type: "income",
          amount: confirmedAmount,
          client: tx,
        });
      } else {
        if (payment.accountId && payment.account) {
          await tx.transaction.create({
            data: {
              userId: session.user.id,
              accountId: payment.accountId,
              subAccountId: sourceSubAccountId,
              type: "expense",
              amount: confirmedAmount,
              description: payment.description,
              category: payment.category || "Pagos Recurrentes",
              subCategory: payment.subCategory || null,
              date: todayColombia,
              sourceModule: "finance",
              sourceId: payment.id,
              isRecurring: true,
              notes: `Pago recurrente confirmado - ${payment.frequency}`,
            },
          });

          await applyBalanceDelta(tx, {
            accountId: payment.accountId,
            subAccountId: sourceSubAccountId,
            amount: -confirmedAmount,
          });
        }

        await adjustBudgetSpent({
          userId: session.user.id,
          category: payment.category || "Pagos Recurrentes",
          subCategory: payment.subCategory || null,
          type: "expense",
          amount: confirmedAmount,
          client: tx,
        });
      }

      if (payment.isRecurring && payment.frequency !== "one_time") {
        const nextDate = getNextScheduledDate(payment.scheduledDate, payment.frequency, payment.customDays);

        let nextAmount = payment.amount;
        if (payment.periodAmounts) {
          try {
            const dist = JSON.parse(payment.periodAmounts);
            if (Array.isArray(dist) && dist.length > 0) {
              let nextIndex = 0;
              if (payment.frequency === "biweekly" && payment.customDays) {
                const days = JSON.parse(payment.customDays).sort((a: number, b: number) => a - b);
                const nextDay = nextDate.getDate();
                if (nextDay >= days[1]) nextIndex = 1;
              } else if (payment.frequency === "weekly") {
                nextIndex = Math.min(Math.floor((nextDate.getDate() - 1) / 7), dist.length - 1);
              }
              if (dist[nextIndex] && dist[nextIndex] > 0) {
                nextAmount = dist[nextIndex];
              }
            }
          } catch { /* use current amount */ }
        }

        await tx.recurringPayment.create({
          data: {
            userId: session.user.id,
            description: payment.description,
            amount: nextAmount,
            type: payment.type,
            accountId: payment.accountId,
            subAccountId: sourceSubAccountId,
            debtId: payment.debtId,
            destinationAccountId: effectiveDestAccountId || payment.destinationAccountId,
            destinationSubAccountId: effectiveDestSubAccountId,
            category: payment.category,
            subCategory: payment.subCategory,
            scheduledDate: nextDate,
            frequency: payment.frequency,
            customDays: payment.customDays,
            periodAmounts: payment.periodAmounts,
            notes: payment.notes,
            isRecurring: true,
            status: "pending",
            payrollGroupId: payment.payrollGroupId || null,
            savingsGoalId: payment.savingsGoalId || null,
          },
        });
      }
    });

    if (shouldSyncSavingsBudget) {
      await syncSavingsBudget(session.user.id);
    }

    // Fetch the updated payment with relations for the response
    const updatedPayment = await db.recurringPayment.findFirst({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
        subAccount: {
          select: {
            id: true,
            name: true,
          },
        },
        debt: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            currentBalance: true,
          },
        },
        destinationAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      payment: updatedPayment,
      confirmedAmount,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Confirm recurring payment error:", error);
    const message = error instanceof Error ? error.message : String(error);

    // Detect missing DB columns (Prisma error after schema change)
    if (
      message.includes("Unknown column") ||
      message.includes("does not exist") ||
      message.includes("no column") ||
      message.includes("no such column") ||
      message.includes("SQLITE_ERROR")
    ) {
      console.error("[DB Schema] Columna faltante detectada. Se necesita prisma db push.", message);
      return NextResponse.json(
        { error: "Error de base de datos: reinicia el contenedor Docker para sincronizar el esquema (prisma db push)" },
        { status: 500 }
      );
    }

    // Detect foreign key constraint errors
    if (message.includes("FOREIGN KEY") || message.includes("foreign key")) {
      return NextResponse.json(
        { error: "Error de referencia: una de las cuentas o deudas asociadas no fue encontrada" },
        { status: 400 }
      );
    }

    // Return more detailed error in development, generic in production
    const detail = process.env.NODE_ENV === "development"
      ? `: ${message}`
      : "";
    return NextResponse.json(
      { error: `Error al confirmar pago recurrente${detail}` },
      { status: 500 }
    );
  }
}
