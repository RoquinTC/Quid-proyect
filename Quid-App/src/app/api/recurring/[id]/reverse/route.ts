import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { adjustBudgetSpent, applyCreditInstallmentBudgetImpact } from "@/lib/budget-impact";
import { toNumber } from "@/lib/decimal-serializer";
import { applyBalanceDelta } from "@/lib/finance-ledger";

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

    await db.$transaction(async (txClient) => {
      for (const transaction of linkedTransactions) {
        if (transaction.type === "transfer" && transaction.accountId) {
          await applyBalanceDelta(txClient, {
            accountId: transaction.accountId,
            subAccountId: transaction.subAccountId,
            amount: toNumber(transaction.amount),
          });

          if (transaction.relatedTransactionId) {
            const counterpart = await txClient.transaction.findUnique({
              where: { id: transaction.relatedTransactionId },
            });
            if (counterpart) {
              await applyBalanceDelta(txClient, {
                accountId: counterpart.accountId,
                subAccountId: counterpart.subAccountId,
                amount: -toNumber(counterpart.amount),
              });
              await txClient.transaction.delete({ where: { id: counterpart.id } });
            }
          }
        } else if (transaction.type === "expense" && transaction.accountId) {
          await applyBalanceDelta(txClient, {
            accountId: transaction.accountId,
            subAccountId: transaction.subAccountId,
            amount: toNumber(transaction.amount),
          });
        } else if (transaction.type === "income" && transaction.accountId) {
          await applyBalanceDelta(txClient, {
            accountId: transaction.accountId,
            subAccountId: transaction.subAccountId,
            amount: -toNumber(transaction.amount),
          });
        }

        await txClient.transaction.delete({ where: { id: transaction.id } });
      }

      if (payment.debtId) {
        let linkedInstallment = await txClient.installment.findFirst({
          where: {
            debtId: payment.debtId,
            recurringPaymentId: payment.id,
            isPaid: false,
          },
        });

        if (!linkedInstallment) {
          const descriptionPattern = `${payment.description}${payment.isRecurring ? ` (Recurrente - ${payment.frequency})` : ""}`;
          linkedInstallment = await txClient.installment.findFirst({
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
          await applyCreditInstallmentBudgetImpact({
            userId: session.user.id,
            debtType: payment.debt?.type,
            category: linkedInstallment.category,
            subCategory: linkedInstallment.subCategory,
            installmentAmount: Number(linkedInstallment.installmentAmount),
            nextPaymentDate: linkedInstallment.nextPaymentDate,
            direction: -1,
            client: txClient,
          });

          await txClient.installment.delete({ where: { id: linkedInstallment.id } });
        }

        await txClient.debt.update({
          where: { id: payment.debtId },
          data: { currentBalance: { increment: -confirmedAmount } },
        });
      }

      if (!payment.debtId && (payment.type === "expense" || payment.type === "income")) {
        const budgetType = payment.type === "expense" ? "expense" : "income";
        const categoryToMatch = payment.category || (payment.type === "expense" ? "Pagos Recurrentes" : "Ingresos");
        const subCatToMatch = payment.subCategory || null;
        await adjustBudgetSpent({
          userId: session.user.id,
          category: categoryToMatch,
          subCategory: subCatToMatch,
          type: budgetType,
          amount: -Number(confirmedAmount),
          client: txClient,
        });
      }

      const nextPending = await txClient.recurringPayment.findFirst({
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
        await txClient.recurringPayment.delete({ where: { id: nextPending.id } });
      }

      await txClient.recurringPayment.update({
        where: { id },
        data: {
          status: "pending",
          actualAmount: null,
          confirmedDate: null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Pago reversado exitosamente",
    });
  } catch (error) {
    console.error("Reverse recurring payment error:", error);
    const message = error instanceof Error ? error.message : "Error al reversar pago recurrente";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
