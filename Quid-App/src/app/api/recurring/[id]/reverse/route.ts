import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Reverse a confirmed recurring payment.
 * This undoes the effects of confirmation:
 * - Reverses account/subaccount balance changes
 * - Reverses debt balance changes
 * - Deletes the transactions created by the confirmation
 * - Reverses budget spent increments
 * - Sets the payment back to pending
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

    if (payment.status !== "confirmed") {
      return NextResponse.json(
        { error: "Solo se pueden reversar pagos confirmados" },
        { status: 400 }
      );
    }

    const confirmedAmount = payment.actualAmount ?? payment.amount;

    // ============================================
    // Find and reverse transactions created by this confirmation
    // ============================================

    // Find expense/transfer transactions linked to this recurring payment
    const linkedTransactions = await db.transaction.findMany({
      where: {
        userId: session.user.id,
        sourceId: payment.id,
        sourceModule: "finance",
        isRecurring: true,
      },
    });

    for (const tx of linkedTransactions) {
      // Reverse the balance impact
      if (tx.type === "transfer" && tx.accountId) {
        // Restore source account balance (was decremented)
        await db.account.update({
          where: { id: tx.accountId },
          data: { balance: { increment: tx.amount } },
        });

        // Find and reverse the counterpart income transaction
        if (tx.relatedTransactionId) {
          const counterpart = await db.transaction.findUnique({
            where: { id: tx.relatedTransactionId },
          });
          if (counterpart) {
            // Reverse destination account/subaccount balance (was incremented)
            if (counterpart.subAccountId) {
              await db.subAccount.update({
                where: { id: counterpart.subAccountId },
                data: { balance: { increment: -counterpart.amount } },
              });
            } else if (counterpart.accountId) {
              await db.account.update({
                where: { id: counterpart.accountId },
                data: { balance: { increment: -counterpart.amount } },
              });
            }
            // Delete the counterpart transaction
            await db.transaction.delete({ where: { id: counterpart.id } });
          }
        }
      } else if (tx.type === "expense" && tx.accountId) {
        // Restore account balance (was decremented)
        await db.account.update({
          where: { id: tx.accountId },
          data: { balance: { increment: tx.amount } },
        });
      } else if (tx.type === "income" && tx.accountId) {
        // Reverse income: decrement account/subaccount balance (was incremented)
        if (tx.subAccountId) {
          await db.subAccount.update({
            where: { id: tx.subAccountId },
            data: { balance: { increment: -tx.amount } },
          });
        } else {
          await db.account.update({
            where: { id: tx.accountId },
            data: { balance: { increment: -tx.amount } },
          });
        }
      }

      // Delete the linked transaction
      await db.transaction.delete({ where: { id: tx.id } });
    }

    // ============================================
    // Reverse Installment created for debt/TC payments
    // When a debt-type recurring payment is confirmed, an Installment is created
    // (NOT a Transaction). We need to delete it and reverse the debt balance.
    // ============================================
    if (payment.debtId) {
      // Find the installment linked to this recurring payment
      // First try by recurringPaymentId (new code), then fall back to description match (legacy)
      let linkedInstallment = await db.installment.findFirst({
        where: {
          debtId: payment.debtId,
          recurringPaymentId: payment.id,
          isPaid: false,
        },
      });

      // Fallback: search by description pattern for installments created before the fix
      if (!linkedInstallment) {
        const descriptionPattern = `${payment.description}${payment.isRecurring ? ` (Recurrente - ${payment.frequency})` : ""}`;
        linkedInstallment = await db.installment.findFirst({
          where: {
            debtId: payment.debtId,
            description: descriptionPattern,
            isPaid: false,
            paidAmount: 0,
          },
          orderBy: { createdAt: "desc" },
        });
      }

      if (linkedInstallment) {
        // Reverse the debt balance (was incremented during confirmation)
        await db.debt.update({
          where: { id: payment.debtId },
          data: { currentBalance: { increment: -confirmedAmount } },
        });

        // Delete the linked installment
        await db.installment.delete({ where: { id: linkedInstallment.id } });
      } else {
        // Even if we can't find the installment, we should still reverse the debt balance
        // (the installment might have been manually deleted or paid)
        await db.debt.update({
          where: { id: payment.debtId },
          data: { currentBalance: { increment: -confirmedAmount } },
        });
      }
    }

    // ============================================
    // Reverse budget spent for expense/income type
    // For debtId (TC): budget was updated at purchase time, so we reverse it here too
    // ============================================
    if (payment.type === "expense" || payment.type === "income") {
      const budgetType = payment.type === "expense" ? "expense" : "income";
      const categoryToMatch = payment.category || (payment.type === "expense" ? "Pagos Recurrentes" : "Ingresos");
      const subCatToMatch = payment.subCategory || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let budget: any = null;
      if (subCatToMatch) {
        budget = await db.budget.findFirst({
          where: { userId: session.user.id, category: categoryToMatch, subCategory: subCatToMatch, type: budgetType },
        });
      }
      if (!budget) {
        budget = await db.budget.findFirst({
          where: { userId: session.user.id, category: categoryToMatch, subCategory: null, type: budgetType },
        });
      }
      if (budget) {
        await db.budget.update({
          where: { id: budget.id },
          data: { spent: { increment: -confirmedAmount } },
        });
      }
    }

    // ============================================
    // Delete the auto-generated next recurring payment (if it exists)
    // ============================================
    const nextPending = await db.recurringPayment.findFirst({
      where: {
        userId: session.user.id,
        description: payment.description,
        amount: payment.amount,
        type: payment.type,
        accountId: payment.accountId,
        debtId: payment.debtId,
        destinationAccountId: payment.destinationAccountId,
        destinationSubAccountId: payment.destinationSubAccountId,
        category: payment.category,
        subCategory: payment.subCategory,
        frequency: payment.frequency,
        isRecurring: payment.isRecurring,
        status: "pending",
        createdAt: { gte: payment.confirmedDate || payment.updatedAt },
      },
    });
    if (nextPending) {
      await db.recurringPayment.delete({ where: { id: nextPending.id } });
    }

    // ============================================
    // Reset the payment back to pending
    // ============================================
    await db.recurringPayment.update({
      where: { id },
      data: {
        status: "pending",
        actualAmount: null,
        confirmedDate: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Pago reversado exitosamente",
    });
  } catch (error: any) {
    console.error("Reverse recurring payment error:", error);
    const message = error?.message || "Error al reversar pago recurrente";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
