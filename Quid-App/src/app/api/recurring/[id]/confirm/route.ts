import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncSavingsBudget } from "@/lib/savings-budget-sync";
import { verifyEntityOwnership } from "@/lib/auth-guards";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, recurringConfirmSchema } from "@/lib/validations";
import { createColombiaDate, getColombiaTodayString } from "@/lib/api";

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
    const effectiveDestAccountId = isSavingsGoal ? (destinationAccountId || payment.destinationAccountId) : payment.destinationAccountId;
    const effectiveDestSubAccountId = isSavingsGoal ? (destinationSubAccountId !== undefined ? destinationSubAccountId : payment.destinationSubAccountId) : payment.destinationSubAccountId;

    // Re-verify ownership of all referenced entities before mutating balances
    const entitiesToVerify: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    if (payment.accountId) entitiesToVerify.push({ type: "account", id: payment.accountId });
    if (payment.subAccountId) entitiesToVerify.push({ type: "subAccount", id: payment.subAccountId });
    if (payment.debtId) entitiesToVerify.push({ type: "debt", id: payment.debtId });
    if (effectiveDestAccountId) entitiesToVerify.push({ type: "account", id: effectiveDestAccountId });
    if (effectiveDestSubAccountId) entitiesToVerify.push({ type: "subAccount", id: effectiveDestSubAccountId });

    const ownershipError = await verifyEntityOwnership(session.user.id, entitiesToVerify);
    if (ownershipError) return ownershipError;

    // 1. Mark payment as confirmed
    await db.recurringPayment.update({
      where: { id },
      data: {
        status: "confirmed",
        actualAmount: confirmedAmount,
        confirmedDate: todayColombia,
        // Update destination if provided (for savings goals)
        destinationAccountId: effectiveDestAccountId || payment.destinationAccountId,
        destinationSubAccountId: effectiveDestSubAccountId !== undefined ? effectiveDestSubAccountId : payment.destinationSubAccountId,
      },
    });

    // ============================================
    // TRANSFER TYPE: Create bidirectional transfer
    // ============================================
    if (payment.type === "transfer" && payment.accountId && effectiveDestAccountId) {
      // Create the outgoing transfer transaction (deducts from source)
      const sourceAccount = await db.account.findUnique({
        where: { id: payment.accountId },
        select: { name: true },
      });
      const destAccount = await db.account.findUnique({
        where: { id: effectiveDestAccountId },
        select: { name: true },
      });

      const transferTx = await db.transaction.create({
        data: {
          userId: session.user.id,
          accountId: payment.accountId,
          subAccountId: payment.subAccountId || null,
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

      // Decrement source account balance
      await db.account.update({
        where: { id: payment.accountId },
        data: { balance: { increment: -confirmedAmount } },
      });

      // If source was a sub-account, also decrement its balance
      if (payment.subAccountId) {
        await db.subAccount.update({
          where: { id: payment.subAccountId },
          data: { balance: { increment: -confirmedAmount } },
        });
      }

      // Create the incoming income transaction (adds to destination)
      const destSubAccount = effectiveDestSubAccountId
        ? await db.subAccount.findUnique({ where: { id: effectiveDestSubAccountId }, select: { name: true } })
        : null;

      const counterpart = await db.transaction.create({
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
          excludeFromBudget: true, // Counterpart of a transfer — not real income
          notes: `Transferencia recurrente desde ${sourceAccount?.name || "cuenta"}`,
          relatedTransactionId: transferTx.id,
        },
      });

      // Link source transfer to its counterpart
      await db.transaction.update({
        where: { id: transferTx.id },
        data: { relatedTransactionId: counterpart.id },
      });

      // Increment destination account/subaccount balance
      if (effectiveDestSubAccountId) {
        await db.subAccount.update({
          where: { id: effectiveDestSubAccountId },
          data: { balance: { increment: confirmedAmount } },
        });
      } else {
        await db.account.update({
          where: { id: effectiveDestAccountId },
          data: { balance: { increment: confirmedAmount } },
        });
      }

      // If this is a savings goal transfer, add the contribution to the goal
      if (isSavingsGoal && linkedGoalId) {
        await db.savingsContribution.create({
          data: {
            goalId: linkedGoalId,
            amount: confirmedAmount,
            date: todayColombia,
            description: `Cuota de ahorro (${payment.frequency})`,
            accountId: effectiveDestAccountId,
            transactionId: counterpart.id,
          },
        });

        await db.savingsGoal.update({
          where: { id: linkedGoalId },
          data: { currentAmount: { increment: confirmedAmount } },
        });

        // Recalculate cuota for the goal
        const goal = await db.savingsGoal.findUnique({ where: { id: linkedGoalId } });
        if (goal && goal.deadline) {
          const remaining = toNumber(goal.targetAmount) - toNumber(goal.currentAmount);
          if (remaining <= 0) {
            // Goal complete — cancel future payments linked to this goal
            await db.recurringPayment.updateMany({
              where: { savingsGoalId: goal.id, status: "pending" },
              data: { status: "cancelled" },
            });
          } else {
            // Recalculate cuota for remaining payments linked to this goal
            const diffMs = goal.deadline.getTime() - todayColombia.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            let periods: number;
            switch (goal.frequency) {
              case "weekly": periods = Math.max(Math.ceil(diffDays / 7), 1); break;
              case "biweekly": periods = Math.max(Math.ceil(diffDays / 15), 1); break;
              default: periods = Math.max(Math.ceil(diffDays / 30), 1); break;
            }
            const newCuota = Math.round(remaining / periods);
            const nextPending = await db.recurringPayment.findFirst({
              where: { savingsGoalId: goal.id, status: "pending" },
            });
            if (nextPending) {
              await db.recurringPayment.update({
                where: { id: nextPending.id },
                data: { amount: newCuota },
              });
            }
          }
        }

        // Sync savings budget
        await syncSavingsBudget(session.user.id);
      }
    } else if (payment.debtId) {
      // ============================================
      // EXPENSE TYPE — CREDIT CARD / DEBT
      // Register as an Installment (Compra en Cuotas) on the TC.
      // ============================================

      // 1. Increment the debt's currentBalance
      if (payment.debt) {
        await db.debt.update({
          where: { id: payment.debtId },
          data: { currentBalance: { increment: confirmedAmount } },
        });
      }

      // 2. Create an Installment record
      // Calculate nextPaymentDate based on cutoff and payment dates
      const nextPayment = new Date(todayColombia);
      if (payment.debt?.paymentDate) {
        // Determine which cycle this purchase belongs to
        let cycleMonth: number;
        let cycleYear: number;
        if (payment.debt.cutoffDate && todayColombia.getDate() >= payment.debt.cutoffDate) {
          // Purchase is ON or AFTER cutoff → belongs to NEXT month's cycle
          cycleMonth = todayColombia.getMonth() + 1;
          cycleYear = todayColombia.getFullYear();
          if (cycleMonth > 11) {
            cycleMonth = 0;
            cycleYear += 1;
          }
        } else {
          // Purchase is BEFORE cutoff → belongs to THIS month's cycle
          cycleMonth = todayColombia.getMonth();
          cycleYear = todayColombia.getFullYear();
        }

        // Calculate payment month based on relationship between paymentDate and cutoffDate
        let payMonth: number;
        let payYear: number;
        if (payment.debt.cutoffDate && payment.debt.paymentDate > payment.debt.cutoffDate) {
          // Payment same month as cycle (e.g. cutoff=3, payment=23)
          payMonth = cycleMonth;
          payYear = cycleYear;
        } else {
          // Payment next month after cycle (e.g. cutoff=20, payment=4)
          payMonth = cycleMonth + 1;
          payYear = cycleYear;
          if (payMonth > 11) {
            payMonth = 0;
            payYear += 1;
          }
        }
        const maxDaysInPayMonth = new Date(payYear, payMonth + 1, 0).getDate();
        const payDay = Math.min(payment.debt.paymentDate, maxDaysInPayMonth);
        nextPayment.setTime(new Date(payYear, payMonth, payDay, 12, 0, 0).getTime());
      } else {
        nextPayment.setMonth(nextPayment.getMonth() + 1);
      }

      await db.installment.create({
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
          subAccountId: payment.subAccountId || null,
          category: payment.category || null,
          subCategory: payment.subCategory || null,
          recurringPaymentId: payment.id,
        },
      });

      // 3. Update budget spent if category matches
      // IMPORTANT: For credit cards (not loans), we do NOT update the budget here because
      // the recalculate route counts CC installments via Source B (installments with purchaseDate
      // in period). Updating the budget here would cause double-counting:
      //   once here (direct increment) + once via recalculate (Source B).
      // For loans, budget IS updated because loan installments are NOT counted by recalculate
      // Source B (it only counts CC installments, not loan installments).
      const isLoan = payment.debt?.type === "loan";
      if (isLoan) {
        const categoryToMatch = payment.category || "Deudas";
        const subCatToMatch = payment.subCategory || null;
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
            data: { spent: { increment: confirmedAmount } },
          });
        }
      }
      // For CC: NO budget update — budget was already updated when the purchase was made
      // (recalculate Source B counts CC installments)
    } else if (payment.type === "income") {
      // ============================================
      // INCOME TYPE — (Payroll / Nómina)
      // Add to account/subaccount balance and create transaction
      // ============================================

      if (payment.accountId) {
        await db.transaction.create({
          data: {
            userId: session.user.id,
            accountId: payment.accountId,
            subAccountId: payment.subAccountId || null,
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

        // Increment account balance
        if (payment.subAccountId) {
          await db.subAccount.update({
            where: { id: payment.subAccountId },
            data: { balance: { increment: confirmedAmount } },
          });
        } else {
          await db.account.update({
            where: { id: payment.accountId },
            data: { balance: { increment: confirmedAmount } },
          });
        }
      }

      // Update income budget spent if category matches
      const categoryToMatch = payment.category || "Sueldo";
      const subCatToMatch = payment.subCategory || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let budget: any = null;
      if (subCatToMatch) {
        budget = await db.budget.findFirst({
          where: { userId: session.user.id, category: categoryToMatch, subCategory: subCatToMatch, type: "income" },
        });
      }
      if (!budget) {
        budget = await db.budget.findFirst({
          where: { userId: session.user.id, category: categoryToMatch, subCategory: null, type: "income" },
        });
      }
      if (budget) {
        await db.budget.update({
          where: { id: budget.id },
          data: { spent: { increment: confirmedAmount } },
        });
      }
    } else {
      // ============================================
      // EXPENSE TYPE — NORMAL (from account, no debt)
      // Deduct from account balance and create transaction
      // ============================================

      if (payment.accountId && payment.account) {
        await db.transaction.create({
          data: {
            userId: session.user.id,
            accountId: payment.accountId,
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

        // Decrement account balance
        await db.account.update({
          where: { id: payment.accountId },
          data: { balance: { increment: -confirmedAmount } },
        });
      }

      // Update budget spent if category matches
      const categoryToMatch = payment.category || "Pagos Recurrentes";
      const subCatToMatch = payment.subCategory || null;
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
          data: { spent: { increment: confirmedAmount } },
        });
      }
    }

    // 5. For recurring payments (isRecurring=true), auto-generate next scheduled date
    if (payment.isRecurring && payment.frequency !== "one_time") {
      const nextDate = getNextScheduledDate(payment.scheduledDate, payment.frequency, payment.customDays);

      // Calculate the amount for the next payment based on periodAmounts
      let nextAmount = payment.amount;
      if (payment.periodAmounts) {
        try {
          const dist = JSON.parse(payment.periodAmounts);
          if (Array.isArray(dist) && dist.length > 0) {
            // Determine which index we're on based on the scheduled date
            // For biweekly: 0 = first day, 1 = second day
            // For weekly: 0 = week 1, 1 = week 2, 2 = week 3, 3 = week 4
            let nextIndex = 0;
            if (payment.frequency === "biweekly" && payment.customDays) {
              const days = JSON.parse(payment.customDays).sort((a: number, b: number) => a - b);
              const nextDay = nextDate.getDate();
              if (nextDay >= days[1]) nextIndex = 1;
            } else if (payment.frequency === "weekly") {
              // Week of the month (1-4)
              nextIndex = Math.min(Math.floor((nextDate.getDate() - 1) / 7), dist.length - 1);
            }
            if (dist[nextIndex] && dist[nextIndex] > 0) {
              nextAmount = dist[nextIndex];
            }
          }
        } catch { /* use current amount */ }
      }

      await db.recurringPayment.create({
        data: {
          userId: session.user.id,
          description: payment.description,
          amount: nextAmount,
          type: payment.type,
          accountId: payment.accountId,
          subAccountId: payment.subAccountId,
          debtId: payment.debtId,
          destinationAccountId: effectiveDestAccountId || payment.destinationAccountId,
          destinationSubAccountId: effectiveDestSubAccountId !== undefined ? effectiveDestSubAccountId : payment.destinationSubAccountId,
          category: payment.category,
          subCategory: payment.subCategory,
          scheduledDate: nextDate,
          frequency: payment.frequency,
          customDays: payment.customDays, // Carry over custom days
          periodAmounts: payment.periodAmounts, // Carry over period amounts
          notes: payment.notes,
          isRecurring: true,
          status: "pending",
          payrollGroupId: payment.payrollGroupId || null, // Carry over payroll group link
          savingsGoalId: payment.savingsGoalId || null, // Carry over savings goal link
        },
      });
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
