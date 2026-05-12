import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * Determine which billing cycle an installment CURRENTLY belongs to,
 * based on its nextPaymentDate (not purchaseDate).
 *
 * For multi-installment purchases, after paying an installment the
 * nextPaymentDate advances to the next cycle, so the installment
 * correctly moves to the next billing cycle.
 *
 * Logic: work backwards from the payment date to find the cycle month.
 *   If paymentDay > cutoffDay -> payment is SAME month as cycle
 *     e.g. cutoff=3, payment=23 -> payment May 23 -> cycle May
 *   If paymentDay <= cutoffDay -> payment is NEXT month after cycle
 *     e.g. cutoff=20, payment=4  -> payment May 4  -> cycle April
 */
function getCycleFromPaymentDate(
  nextPaymentDate: Date,
  cutoffDay: number,
  paymentDay: number
): { year: number; month: number } {
  if (paymentDay > cutoffDay) {
    // Payment same month as cycle
    return { year: nextPaymentDate.getFullYear(), month: nextPaymentDate.getMonth() };
  } else {
    // Payment next month after cycle
    let month = nextPaymentDate.getMonth() - 1;
    let year = nextPaymentDate.getFullYear();
    if (month < 0) { month = 11; year -= 1; }
    return { year, month };
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

    // -- Parse request body for interest rates and selected installments --
    let body: {
      interestRates?: Record<string, number>;
      selectedInstallmentIds?: string[];
      // -- Loan (cuota fija) fields --
      confirmedCapital?: Record<string, number>;   // { installmentId: capitalAmount } -- user-confirmed capital
      confirmedInterest?: Record<string, number>;   // { installmentId: interestAmount } -- user-confirmed interest
      confirmedOtherCharges?: Record<string, number>; // { installmentId: otherChargesAmount } -- user-confirmed other charges
      payAccountId?: string | null;   // Account to debit the payment from (for loans)
      paySubAccountId?: string | null; // Sub-account to debit from (optional)
    } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is OK (no interest rates provided = no interest)
    }
    const interestRates = body.interestRates || {}; // { installmentId: ratePercent }
    const selectedInstallmentIds = body.selectedInstallmentIds; // If provided, only pay these
    const confirmedCapital = body.confirmedCapital || {};
    const confirmedInterest = body.confirmedInterest || {};
    const confirmedOtherCharges = body.confirmedOtherCharges || {};
    const payAccountId = body.payAccountId || null;
    const paySubAccountId = body.paySubAccountId || null;

    // -- Idempotency check: prevent double-pay if a payment was just made --
    const recentPayment = await db.transaction.findFirst({
      where: {
        userId: session.user.id,
        sourceModule: "finance",
        sourceId: id,
        type: "expense",
        createdAt: { gte: new Date(Date.now() - 10000) }, // within last 10 seconds
      },
    });
    if (recentPayment) {
      return NextResponse.json({ error: "Pago reciente en proceso, espera un momento" }, { status: 429 });
    }

    const debt = await db.debt.findFirst({
      where: { id, userId: session.user.id },
      include: { installments: { where: { isPaid: false }, orderBy: { nextPaymentDate: "asc" } } },
    });

    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    const today = getColombiaNow();

    // -- Determine which installments are due for payment --
    let dueInstallments;

    if (selectedInstallmentIds && selectedInstallmentIds.length > 0) {
      // User selected specific installments to pay (partial payment)
      dueInstallments = debt.installments.filter(
        (inst) => selectedInstallmentIds.includes(inst.id) && !inst.isPaid
      );
      if (dueInstallments.length === 0) {
        return NextResponse.json({ error: "Las cuotas seleccionadas no existen o ya estan pagadas" }, { status: 400 });
      }
    } else if (debt.cutoffDate && debt.paymentDate) {
      // Credit card with billing cycle: only pay installments from the cycle
      // whose cutoff date has passed (the bank has already generated the statement)
      const cycleMap = new Map<string, { installments: typeof debt.installments; cutoffDate: Date; paymentDueDate: Date }>();

      for (const inst of debt.installments) {
        const nextPayDate = new Date(inst.nextPaymentDate);
        const { year, month } = getCycleFromPaymentDate(nextPayDate, debt.cutoffDate!, debt.paymentDate!);
        const cycleKey = `${year}-${String(month + 1).padStart(2, "0")}`;

        if (!cycleMap.has(cycleKey)) {
          // Cutoff date of this cycle: cutoffDate day of the cycle month
          const cutoff = new Date(year, month, debt.cutoffDate, 23, 59, 59);

          // Calculate payment due date based on the relationship between paymentDate and cutoffDate
          let payMonth: number;
          let payYear: number;
          if (debt.paymentDate > debt.cutoffDate) {
            // Payment same month as cycle
            payMonth = month;
            payYear = year;
          } else {
            // Payment next month after cycle
            payMonth = month + 1;
            payYear = year;
            if (payMonth > 11) { payMonth = 0; payYear += 1; }
          }
          const maxDays = new Date(payYear, payMonth + 1, 0).getDate();
          const payDay = Math.min(debt.paymentDate, maxDays);
          const paymentDueDate = new Date(payYear, payMonth, payDay, 23, 59, 59);

          cycleMap.set(cycleKey, { installments: [], cutoffDate: cutoff, paymentDueDate });
        }
        cycleMap.get(cycleKey)!.installments.push(inst);
      }

      // Find cycles where the cutoff has passed (bank has generated the statement)
      // This allows paying as soon as the statement is available, not just on the payment deadline
      const dueCycles = Array.from(cycleMap.entries())
        .filter(([, cycle]) => cycle.cutoffDate <= today)
        .sort(([, a], [, b]) => a.cutoffDate.getTime() - b.cutoffDate.getTime());

      if (dueCycles.length === 0) {
        return NextResponse.json({ error: "No hay cuotas vencidas para pagar en el ciclo actual" }, { status: 400 });
      }

      // Pay only the oldest due cycle
      const [, dueCycle] = dueCycles[0];
      dueInstallments = dueCycle.installments;
    } else {
      // Non-credit-card debt: pay installments with nextPaymentDate <= today
      dueInstallments = debt.installments.filter(
        (inst) => new Date(inst.nextPaymentDate) <= today && !inst.isPaid
      );

      // For loans: if no due installments, allow paying the next upcoming one
      if (dueInstallments.length === 0 && debt.type === "loan") {
        const nextUnpaid = debt.installments
          .filter(inst => !inst.isPaid)
          .sort((a, b) => new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime());
        if (nextUnpaid.length > 0) {
          // If the user explicitly selected specific installments, respect that
          if (selectedInstallmentIds && selectedInstallmentIds.length > 0) {
            dueInstallments = nextUnpaid.filter(inst => selectedInstallmentIds.includes(inst.id));
          } else {
            dueInstallments = [nextUnpaid[0]];
          }
        }
      }
    }

    if (dueInstallments.length === 0) {
      return NextResponse.json({ error: "No hay cuotas vencidas para pagar" }, { status: 400 });
    }

    // Calculate total payment amount per category for budget updates
    const categoryPayments: Record<string, number> = {};
    let totalPayment = 0;

    // Track which installments were paid (so we can auto-create the next ones after)
    const paidInstallmentIds: string[] = [];

    // Determine if this is a loan with fixed cuota
    const isLoanFixed = debt.type === "loan" && debt.paymentType === "fixed";

    // Update each installment -- mark as paid
    for (const installment of dueInstallments) {
      let capital: number;
      let interestAmount: number;
      let interestRate: number;
      let otherChargesAmount: number;

      if (isLoanFixed) {
        // -- Prestamo con cuota fija: usar valores confirmados por el usuario --
        capital = confirmedCapital[installment.id] ?? 0;
        interestAmount = confirmedInterest[installment.id] ?? 0;
        interestRate = interestRates[installment.id] ?? (debt.interestRate ?? 0);
        otherChargesAmount = confirmedOtherCharges[installment.id] ?? (debt.otherCharges ?? 0);

        if (capital === 0 && interestAmount === 0) {
          // Fallback: calcular automaticamente si el usuario no confirmo
          const balance = installment.remainingBalance ?? debt.currentBalance;
          const annualRate = debt.interestRate ?? 0;
          const monthlyRate = annualRate > 0 ? annualRate / 12 : 0;
          interestRate = monthlyRate;
          interestAmount = toNumber(balance) * (monthlyRate / 100);
          const fixedCuota = debt.monthlyPayment ?? 0;
          capital = Math.max(toNumber(fixedCuota) - interestAmount - otherChargesAmount, 0);
        }
      } else {
        // -- Tarjeta de credito o cuota variable: logica original --
        // FIX: Use toNumber() to convert Prisma Decimal to number for arithmetic.
        capital = toNumber(installment.installmentAmount);

        // Calculate interest for multi-installment purchases
        interestAmount = 0;
        interestRate = 0;
        otherChargesAmount = 0;

        if (installment.totalInstallments > 1 && interestRates[installment.id] !== undefined) {
          // Interest = remainingBalance * (rate / 100)
          interestRate = interestRates[installment.id];
          const balance = installment.remainingBalance ?? installment.totalAmount;
          interestAmount = toNumber(balance) * (interestRate / 100);
        }
      }

      const totalPaymentForThis = capital + interestAmount + otherChargesAmount;
      totalPayment += totalPaymentForThis;

      // Track category spending for budget updates
      const catKey = installment.category || debt.category || "Deudas";
      const subCatKey = installment.subCategory || debt.subCategory || "";
      const budgetKey = subCatKey ? `${catKey}::${subCatKey}` : catKey;
      categoryPayments[budgetKey] = (categoryPayments[budgetKey] || 0) + totalPaymentForThis;

      // Mark this installment as paid
      await db.installment.update({
        where: { id: installment.id },
        data: {
          isPaid: true,
          paidAmount: totalPaymentForThis,
          interestRate: interestRate || null,
          interestAmount: interestAmount || null,
          otherChargesAmount: otherChargesAmount || null,
        },
      });

      // If NOT the last installment, we'll auto-create the next one below
      if (installment.currentInstallment < installment.totalInstallments) {
        paidInstallmentIds.push(installment.id);
      }
    }

    // Auto-create the next installment for each multi-installment purchase that was just paid
    for (const paidId of paidInstallmentIds) {
      const paidInst = await db.installment.findUnique({ where: { id: paidId } });
      if (!paidInst) continue;

      // Calculate next payment date: one month after the paid installment's nextPaymentDate
      const nextDate = new Date(paidInst.nextPaymentDate.getTime());
      nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);

      // Update remainingBalance: capital reduces the balance, not interest or other charges
      let capitalUsed: number;
      if (isLoanFixed) {
        // For loans: capital is what the user confirmed (paidAmount - interest - otherCharges)
        capitalUsed = toNumber(paidInst.paidAmount) - toNumber(paidInst.interestAmount) - toNumber(paidInst.otherChargesAmount);
      } else {
        // For credit cards: installmentAmount is the fixed capital
        capitalUsed = toNumber(paidInst.installmentAmount);
      }
      const previousBalance = toNumber(paidInst.remainingBalance ?? paidInst.totalAmount);
      const newRemainingBalance = previousBalance - capitalUsed;

      await db.installment.create({
        data: {
          debtId: paidInst.debtId,
          description: paidInst.description,
          totalAmount: paidInst.totalAmount,
          totalInstallments: paidInst.totalInstallments,
          currentInstallment: paidInst.currentInstallment + 1,
          installmentAmount: isLoanFixed ? capitalUsed : toNumber(paidInst.installmentAmount),
          paidAmount: 0,
          remainingBalance: Math.max(newRemainingBalance, 0), // Never negative
          purchaseDate: paidInst.purchaseDate,
          nextPaymentDate: nextDate,
          isPaid: false,
          accountId: paidInst.accountId,
          subAccountId: paidInst.subAccountId,
          category: paidInst.category,
          subCategory: paidInst.subCategory,
          recurringPaymentId: paidInst.recurringPaymentId,
        },
      });
    }

    // Update debt balance -- only capital reduces the balance, not interest or other charges
    // FIX: Use toNumber() to convert Prisma Decimal to number BEFORE arithmetic.
    let totalCapital = 0;
    for (const installment of dueInstallments) {
      if (isLoanFixed) {
        const capital = confirmedCapital[installment.id] ?? 0;
        const interest = confirmedInterest[installment.id] ?? 0;
        const other = confirmedOtherCharges[installment.id] ?? (debt.otherCharges ?? 0);
        if (capital === 0 && interest === 0) {
          // Fallback calculation
          const balance = installment.remainingBalance ?? debt.currentBalance;
          const annualRate = debt.interestRate ?? 0;
          const monthlyRate = annualRate > 0 ? annualRate / 12 : 0;
          const iAmount = toNumber(balance) * (monthlyRate / 100);
          const fixedCuota = debt.monthlyPayment ?? 0;
          totalCapital += Math.max(toNumber(fixedCuota) - iAmount - other, 0);
        } else {
          totalCapital += capital;
        }
      } else {
        totalCapital += toNumber(installment.installmentAmount);
      }
    }
    await db.debt.update({
      where: { id },
      data: { currentBalance: { increment: -totalCapital } },
    });

    // -- Create transactions and handle budget updates --
    // For CREDIT CARDS: create ONE "transfer" transaction per account group
    //   (this is just a payment/transfer, not a new expense -- budget was already
    //   updated at purchase time). Include installment details in notes for expandable UI.
    // For LOANS: create individual transactions per installment with correct category
    //   and update budget (loan payment IS the expense itself).

    const accountBalanceDeductions: Record<string, { accountId: string | null; subAccountId: string | null; amount: number }> = {};

    if (!isLoanFixed) {
      // -- CREDIT CARD: one grouped "transfer" per account --
      // Group installments by account
      const accountGroups: Record<string, {
        accountId: string | null;
        subAccountId: string | null;
        amount: number;
        installmentIds: string[];
        details: { installmentId: string; description: string; amount: number; category: string | null; subCategory: string | null; currentInstallment: number; totalInstallments: number }[];
      }> = {};

      for (const inst of dueInstallments) {
        const instInterestRate = interestRates[inst.id] ?? 0;
        const balance = inst.remainingBalance ?? inst.totalAmount;
        const instInterest = (inst.totalInstallments > 1 && instInterestRate) ? toNumber(balance) * (instInterestRate / 100) : 0;
        const instTotal = toNumber(inst.installmentAmount) + instInterest;

        const effectiveAccountId = inst.accountId;
        const effectiveSubAccountId = inst.subAccountId;
        const groupKey = `${effectiveAccountId || "none"}-${effectiveSubAccountId || "none"}`;

        if (!accountGroups[groupKey]) {
          accountGroups[groupKey] = {
            accountId: effectiveAccountId,
            subAccountId: effectiveSubAccountId,
            amount: 0,
            installmentIds: [],
            details: [],
          };
        }
        accountGroups[groupKey].amount += instTotal;
        accountGroups[groupKey].installmentIds.push(inst.id);
        accountGroups[groupKey].details.push({
          installmentId: inst.id,
          description: inst.description,
          amount: instTotal,
          category: inst.category,
          subCategory: inst.subCategory,
          currentInstallment: inst.currentInstallment,
          totalInstallments: inst.totalInstallments,
        });
      }

      // Create one "transfer" transaction per account group
      for (const group of Object.values(accountGroups)) {
        if (!group.accountId) continue;

        // Build a structured notes string with installment details for the expandable UI
        const detailsJson = JSON.stringify(group.details);
        const notesWithIds = `installmentIds:${group.installmentIds.join(",")} | ${detailsJson}`;

        await db.transaction.create({
          data: {
            userId: session.user.id,
            accountId: group.accountId,
            subAccountId: group.subAccountId || undefined,
            type: "transfer", // Payment to TC is a transfer, not a new expense
            amount: group.amount,
            description: `Pago tarjeta de credito ${debt.name}`,
            category: "Pago Tarjeta de Credito",
            subCategory: null,
            date: getColombiaNow(),
            sourceModule: "finance",
            sourceId: debt.id,
            notes: notesWithIds,
          },
        });

        const balanceKey = `${group.accountId || "none"}-${group.subAccountId || "none"}`;
        accountBalanceDeductions[balanceKey] = {
          accountId: group.accountId,
          subAccountId: group.subAccountId,
          amount: group.amount,
        };
      }

      // NO budget update for CC payment -- budget was already updated when the purchase was made
    } else {
      // -- LOAN: individual transactions per installment with correct category --
      for (const inst of dueInstallments) {
        const capital = confirmedCapital[inst.id] ?? 0;
        const interest = confirmedInterest[inst.id] ?? 0;
        const other = confirmedOtherCharges[inst.id] ?? (debt.otherCharges ?? 0);
        let instTotal: number;
        if (capital === 0 && interest === 0) {
          const balance = inst.remainingBalance ?? debt.currentBalance;
          const annualRate = debt.interestRate ?? 0;
          const monthlyRate = annualRate > 0 ? annualRate / 12 : 0;
          const iAmount = toNumber(balance) * (monthlyRate / 100);
          const fixedCuota = debt.monthlyPayment ?? 0;
          instTotal = Math.max(toNumber(fixedCuota) - iAmount - other, 0) + iAmount + other;
        } else {
          instTotal = capital + interest + other;
        }

        const txCategory = inst.category || debt.category || "Deudas";
        const txSubCategory = inst.subCategory || debt.subCategory || null;

        const effectiveAccountId = inst.accountId || payAccountId || debt.accountId || null;
        const effectiveSubAccountId = inst.subAccountId || paySubAccountId || debt.subAccountId || null;

        if (effectiveAccountId) {
          await db.transaction.create({
            data: {
              userId: session.user.id,
              accountId: effectiveAccountId,
              subAccountId: effectiveSubAccountId || undefined,
              type: "expense",
              amount: instTotal,
              description: `Pago prestamo ${debt.name} -- cuota ${inst.currentInstallment}/${inst.totalInstallments}`,
              category: txCategory,
              subCategory: txSubCategory,
              date: getColombiaNow(),
              sourceModule: "finance",
              sourceId: debt.id,
              notes: `installmentIds:${inst.id} | Cuota ${inst.currentInstallment}/${inst.totalInstallments} de "${inst.description}"`,
            },
          });

          const balanceKey = `${effectiveAccountId || "none"}-${effectiveSubAccountId || "none"}`;
          if (!accountBalanceDeductions[balanceKey]) {
            accountBalanceDeductions[balanceKey] = {
              accountId: effectiveAccountId,
              subAccountId: effectiveSubAccountId,
              amount: 0,
            };
          }
          accountBalanceDeductions[balanceKey].amount += instTotal;
        }
      }

      // Update budget for each category from installments (LOAN only)
      for (const [budgetKey, amount] of Object.entries(categoryPayments)) {
        let categoryToMatch: string;
        let subCatToMatch: string | null = null;

        if (budgetKey.includes("::")) {
          const [cat, sub] = budgetKey.split("::");
          categoryToMatch = cat;
          subCatToMatch = sub;
        } else {
          categoryToMatch = budgetKey;
        }

        let budget: { id: string; spent: number; [key: string]: unknown } | null = null;
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
            data: { spent: { increment: amount } },
          });
        }
      }
    }

    // Debit from accounts/subaccounts
    for (const deduction of Object.values(accountBalanceDeductions)) {
      if (deduction.subAccountId) {
        await db.subAccount.update({
          where: { id: deduction.subAccountId },
          data: { balance: { increment: -deduction.amount } },
        });
      } else if (deduction.accountId) {
        await db.account.update({
          where: { id: deduction.accountId },
          data: { balance: { increment: -deduction.amount } },
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalPayment,
      paidInstallments: dueInstallments.length,
      details: dueInstallments.map(inst => {
        if (isLoanFixed) {
          const capital = confirmedCapital[inst.id] ?? 0;
          const interest = confirmedInterest[inst.id] ?? 0;
          const other = confirmedOtherCharges[inst.id] ?? (debt.otherCharges ?? 0);
          return {
            id: inst.id,
            description: inst.description,
            capital,
            interestRate: debt.interestRate ?? null,
            interestAmount: interest || null,
            otherChargesAmount: other || null,
            totalAmount: capital + interest + other,
            currentInstallment: inst.currentInstallment,
            totalInstallments: inst.totalInstallments,
            remainingBalance: inst.remainingBalance ?? inst.totalAmount,
            accountId: inst.accountId,
            subAccountId: inst.subAccountId,
          };
        } else {
          const rate = interestRates[inst.id] ?? 0;
          const balance = inst.remainingBalance ?? inst.totalAmount;
          const interest = (inst.totalInstallments > 1 && rate) ? toNumber(balance) * (rate / 100) : 0;
          return {
            id: inst.id,
            description: inst.description,
            capital: toNumber(inst.installmentAmount),
            interestRate: rate || null,
            interestAmount: interest || null,
            otherChargesAmount: null,
            totalAmount: toNumber(inst.installmentAmount) + interest,
            currentInstallment: inst.currentInstallment,
            totalInstallments: inst.totalInstallments,
            remainingBalance: inst.remainingBalance ?? inst.totalAmount,
            accountId: inst.accountId,
            subAccountId: inst.subAccountId,
          };
        }
      }),
    });
  } catch (error) {
    console.error("Pay debt error:", error);
    return NextResponse.json({ error: "Error al procesar el pago" }, { status: 500 });
  }
}
