import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * Reverse the last payment made for a debt's installments.
 *
 * With the "mark as paid + auto-create next" model:
 * - When we paid: installment was marked isPaid=true, and a NEW installment was auto-created
 * - To reverse: delete the auto-created next installment, then mark the original back as unpaid
 * - Also restores account/subaccount balances, deletes transactions, reverses budget, restores debt.currentBalance
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const debt = await db.debt.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    // ── 1. Find the most recent PAYMENT transactions for this debt ──
    // Note: Only look for "Pago" transactions, NOT "Abono" transactions (those have their own reverse endpoint)
    // CC payments are "transfer" type, loan payments are "expense" type
    const transactions = await db.transaction.findMany({
      where: {
        userId: session.user.id,
        sourceModule: "finance",
        sourceId: debt.id,
        type: { in: ["expense", "transfer"] },
        description: { startsWith: "Pago" },
        notes: { not: { startsWith: "Abono a capital" } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (transactions.length === 0) {
      return NextResponse.json(
        { error: "No hay pagos para reversar" },
        { status: 400 }
      );
    }

    // Group the MOST RECENT transactions into a batch (created within 2 seconds of the newest one)
    // This ensures we only reverse ONE payment operation, even if the user pressed pay multiple times
    const mostRecentTime = transactions[0].createdAt.getTime();
    const batchTransactions = transactions.filter(
      (tx) => Math.abs(tx.createdAt.getTime() - mostRecentTime) < 2000
    );

    // Calculate total amount from the batch transactions
    const batchTotalAmount = batchTransactions.reduce((sum, tx) => sum + toNumber(tx.amount), 0);

    // ── 2. Identify the installments that were paid in this batch ──
    // Strategy A: Try extracting installment IDs from transaction notes (primary format)
    // Notes format: "installmentIds:id1,id2|Compras pagadas: ...|{...json...}"
    let allInstallmentIds: string[] = [];
    for (const tx of batchTransactions) {
      if (tx.notes) {
        // Try new format with pipe delimiter first
        const matchWithPipe = tx.notes.match(/installmentIds:([^|]+)/);
        if (matchWithPipe) {
          const ids = matchWithPipe[1].split(",").map((id: string) => id.trim()).filter(Boolean);
          allInstallmentIds.push(...ids);
        } else {
          // Fallback: old format (whitespace delimited)
          const matchOld = tx.notes.match(/installmentIds:\s*([^\s]+)/);
          if (matchOld) {
            const ids = matchOld[1].split(",").filter(Boolean);
            allInstallmentIds.push(...ids);
          }
        }
      }
    }

    // Deduplicate installment IDs (in case multiple transactions reference the same installment)
    allInstallmentIds = [...new Set(allInstallmentIds)];

    // Strategy B: Fallback — match by purchase names from notes (legacy format)
    if (allInstallmentIds.length === 0) {
      const purchaseNames: string[] = [];
      for (const tx of batchTransactions) {
        if (tx.notes) {
          const match = tx.notes.match(/Compras pagadas:\s*(.+?)(?:\s*\||$)/);
          if (match) {
            const names = match[1].split(",").map((n) => n.trim()).filter(Boolean);
            purchaseNames.push(...names);
          }
        }
      }

      if (purchaseNames.length > 0) {
        const paidInstallments = await db.installment.findMany({
          where: {
            debtId: debt.id,
            paidAmount: { gt: 0 },
            description: { in: purchaseNames },
          },
          orderBy: { updatedAt: "desc" },
        });

        allInstallmentIds = paidInstallments
          .slice(0, purchaseNames.length)
          .map((inst) => inst.id);
      }
    }

    // Strategy C: Last resort — find recently paid installments by total amount match
    if (allInstallmentIds.length === 0) {
      const paidInstallments = await db.installment.findMany({
        where: {
          debtId: debt.id,
          paidAmount: { gt: 0 },
        },
        orderBy: { updatedAt: "desc" },
      });

      let runningTotal = 0;
      const matched: string[] = [];
      for (const inst of paidInstallments) {
        if (runningTotal + toNumber(inst.installmentAmount) <= batchTotalAmount + 1) {
          matched.push(inst.id);
          runningTotal += toNumber(inst.installmentAmount);
        }
        if (Math.abs(runningTotal - batchTotalAmount) < 1) break;
      }

      if (matched.length > 0 && Math.abs(runningTotal - batchTotalAmount) < 1) {
        allInstallmentIds = matched;
      }
    }

    if (allInstallmentIds.length === 0) {
      return NextResponse.json(
        { error: "No se pudieron identificar las cuotas del último pago" },
        { status: 400 }
      );
    }

    // ── 3. Find and reverse each installment ──
    const installments = await db.installment.findMany({
      where: {
        id: { in: allInstallmentIds },
        debtId: debt.id,
      },
    });

    let totalReversed = 0;
    const categoryReversals: Record<string, number> = {};

    for (const installment of installments) {
      // In the new model, paid installments have isPaid=true and paidAmount=installmentAmount
      // We need to: (a) delete the auto-created next installment, (b) mark this one back as unpaid
      const reversalAmount = toNumber(installment.paidAmount || installment.installmentAmount);
      totalReversed += reversalAmount;

      // Track category for budget reversal
      const catKey = installment.category || "Deudas";
      const subCatKey = installment.subCategory || "";
      const budgetKey = subCatKey ? `${catKey}::${subCatKey}` : catKey;
      categoryReversals[budgetKey] = (categoryReversals[budgetKey] || 0) + reversalAmount;

      // (a) Delete the auto-created next installment (if it exists)
      // The "next" installment has: same description, same debtId, currentInstallment = this.currentInstallment + 1
      if (installment.currentInstallment < installment.totalInstallments) {
        const nextInstallment = await db.installment.findFirst({
          where: {
            debtId: installment.debtId,
            description: installment.description,
            currentInstallment: installment.currentInstallment + 1,
            isPaid: false,
          },
        });
        if (nextInstallment) {
          await db.installment.delete({ where: { id: nextInstallment.id } });
        }
      }

      // (b) Mark this installment back as unpaid, clear interest data
      await db.installment.update({
        where: { id: installment.id },
        data: {
          isPaid: false,
          paidAmount: 0,
          interestRate: null,
          interestAmount: null,
          otherChargesAmount: null,
        },
      });
    }

    // ── 4. Restore debt balance (only by the capital that was paid) ──
    // For loans: only capital reduces the balance (not interest or otherCharges)
    // For credit cards: installmentAmount is the capital
    let totalCapitalToRestore = 0;
    for (const installment of installments) {
      if (debt.type === "loan") {
        // For loans: paidAmount includes capital + interest + otherCharges
        // We only restore capital (= paidAmount - interestAmount - otherChargesAmount)
        const paidTotal = toNumber(installment.paidAmount || 0);
        const interestPaid = toNumber(installment.interestAmount || 0);
        const otherPaid = toNumber(installment.otherChargesAmount || 0);
        totalCapitalToRestore += (paidTotal - interestPaid - otherPaid);
      } else {
        totalCapitalToRestore += toNumber(installment.installmentAmount);
      }
    }
    if (totalCapitalToRestore > 0) {
      await db.debt.update({
        where: { id: debt.id },
        data: { currentBalance: { increment: totalCapitalToRestore } },
      });
    }

    // ── 5. Reverse transactions and restore account/subaccount balances ──
    for (const tx of batchTransactions) {
      // Restore subaccount if present, otherwise restore account
      if (tx.subAccountId) {
        await db.subAccount.update({
          where: { id: tx.subAccountId },
          data: { balance: { increment: toNumber(tx.amount) } },
        });
      } else if (tx.accountId) {
        await db.account.update({
          where: { id: tx.accountId },
          data: { balance: { increment: toNumber(tx.amount) } },
        });
      }

      // Delete the transaction
      await db.transaction.delete({ where: { id: tx.id } });
    }

    // ── 6. Reverse budget spending (LOANS only) ──
    // For credit cards: budget was already updated at purchase time (not at payment time),
    // so we DON'T reverse it here. Reversing the installment (step 3) will cause
    // the recalculate to properly adjust.
    // For loans: the payment IS the expense, so we reverse the budget.
    const isLoan = debt.type === "loan";
    if (isLoan) {
      for (const [budgetKey, amount] of Object.entries(categoryReversals)) {
        let categoryToMatch: string;
        let subCatToMatch: string | null = null;

        if (budgetKey.includes("::")) {
          const [cat, sub] = budgetKey.split("::");
          categoryToMatch = cat;
          subCatToMatch = sub;
        } else {
          categoryToMatch = budgetKey;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let budget: any = null;
        if (subCatToMatch) {
          budget = await db.budget.findFirst({
            where: {
              userId: session.user.id,
              category: categoryToMatch,
              subCategory: subCatToMatch,
              type: "expense",
            },
          });
        }
        if (!budget) {
          budget = await db.budget.findFirst({
            where: {
              userId: session.user.id,
              category: categoryToMatch,
              subCategory: null,
              type: "expense",
            },
          });
        }
        if (budget) {
          await db.budget.update({
            where: { id: budget.id },
            data: { spent: { increment: -amount } },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalReversed,
      reversedInstallments: installments.length,
    });
  } catch (error) {
    console.error("Reverse debt payment error:", error);
    return NextResponse.json(
      { error: "Error al reversar el pago" },
      { status: 500 }
    );
  }
}
