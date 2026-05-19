import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, debtAbonoSchema } from "@/lib/validations";

/**
 * Process an "abono a capital" — an extra payment that reduces the remainingBalance
 * of selected installments WITHOUT marking them as paid.
 *
 * Flow:
 * 1. User selects which installments to abono and how much for each
 * 2. User picks account/subaccount and date
 * 3. This endpoint:
 *    - Reduces remainingBalance for each selected installment
 *    - Reduces debt.currentBalance by total abono amount
 *    - Creates an expense transaction ("Abono a tarjeta de crédito")
 *    - Creates Abono + AbonoDetail records for audit trail / reversal
 *    - Debits the selected account/subaccount
 *    - Updates budget
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

    let body;
    try {
      body = await validateBody(req, debtAbonoSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const { payments, accountId, subAccountId, date } = body;

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: "No se especificaron cuotas para el abono" }, { status: 400 });
    }

    if (!accountId) {
      return NextResponse.json({ error: "Se requiere una cuenta para el abono" }, { status: 400 });
    }

    // Verify debt belongs to user
    const debt = await db.debt.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    // ── Process each abono ──
    let totalAbono = 0;
    const details: Array<{
      installmentId: string;
      description: string;
      currentInstallment: number;
      totalInstallments: number;
      previousBalance: number;
      abonoAmount: number;
      newBalance: number;
    }> = [];

    for (const payment of payments) {
      const installment = await db.installment.findFirst({
        where: {
          id: payment.installmentId,
          debtId: id,
          isPaid: false,
        },
      });

      if (!installment) {
        return NextResponse.json(
          { error: `Cuota ${payment.installmentId} no encontrada o ya está pagada` },
          { status: 400 }
        );
      }

      if (payment.amount <= 0) {
        return NextResponse.json(
          { error: "El monto del abono debe ser mayor a 0" },
          { status: 400 }
        );
      }

      const previousBalance = toNumber(installment.remainingBalance ?? installment.totalAmount);

      if (payment.amount > previousBalance - toNumber(installment.installmentAmount)) {
        if (payment.amount > previousBalance) {
          return NextResponse.json(
            { error: `El abono ($${payment.amount.toLocaleString()}) excede el saldo pendiente ($${previousBalance.toLocaleString()}) de "${installment.description}"` },
            { status: 400 }
          );
        }
      }

      const newBalance = Math.max(previousBalance - payment.amount, 0);

      // Update installment's remainingBalance
      await db.installment.update({
        where: { id: installment.id },
        data: {
          remainingBalance: newBalance,
        },
      });

      totalAbono += payment.amount;

      details.push({
        installmentId: installment.id,
        description: installment.description,
        currentInstallment: installment.currentInstallment,
        totalInstallments: installment.totalInstallments,
        previousBalance,
        abonoAmount: payment.amount,
        newBalance,
      });
    }

    // ── Update debt balance ──
    await db.debt.update({
      where: { id },
      data: { currentBalance: { increment: -totalAbono } },
    });

    // ── Create expense transaction ──
    const transactionDate = date ? new Date(date) : getColombiaNow();
    const purchaseNames = details.map((d) => `${d.description} (cuota ${d.currentInstallment}/${d.totalInstallments})`);
    const installmentIds = details.map((d) => d.installmentId);

    const transactionData: {
      userId: string;
      accountId: string;
      subAccountId?: string;
      type: string;
      amount: number;
      description: string;
      category: string;
      subCategory?: string | null;
      date: Date;
      sourceModule: string;
      sourceId: string;
      notes: string;
    } = {
      userId: session.user.id,
      accountId,
      type: "expense",
      amount: totalAbono,
      description: debt.type === "loan"
        ? `Abono a préstamo ${debt.name}`
        : `Abono a tarjeta de crédito ${debt.name}`,
      category: debt.category || "Deudas",
      subCategory: debt.subCategory || null,
      date: transactionDate,
      sourceModule: "finance",
      sourceId: debt.id,
      notes: `Abono a capital: ${purchaseNames.join(", ")} | installmentIds: ${installmentIds.join(",")}`,
    };

    if (subAccountId) {
      transactionData.subAccountId = subAccountId;
    }

    const transaction = await db.transaction.create({ data: transactionData });

    // ── Create Abono + AbonoDetail records for audit trail ──
    const abonoRecord = await db.abono.create({
      data: {
        userId: session.user.id,
        debtId: id,
        transactionId: transaction.id,
        totalAmount: totalAbono,
        accountId,
        subAccountId: subAccountId || null,
        date: transactionDate,
        details: {
          create: details.map((d) => ({
            installmentId: d.installmentId,
            amount: d.abonoAmount,
            previousBalance: d.previousBalance,
            newBalance: d.newBalance,
          })),
        },
      },
    });

    // ── Debit account/subaccount ──
    if (subAccountId) {
      await db.subAccount.update({
        where: { id: subAccountId },
        data: { balance: { increment: -totalAbono } },
      });
    } else {
      await db.account.update({
        where: { id: accountId },
        data: { balance: { increment: -totalAbono } },
      });
    }

    // ── Update budget using debt's category ──
    const categoryToMatch = debt.category || "Deudas";
    const subCatToMatch = debt.subCategory || null;
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
        data: { spent: { increment: totalAbono } },
      });
    }

    return NextResponse.json({
      success: true,
      totalAbono,
      processedPayments: details.length,
      abonoId: abonoRecord.id,
      details,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Abono a capital error:", error);
    return NextResponse.json({ error: "Error al procesar el abono" }, { status: 500 });
  }
}
