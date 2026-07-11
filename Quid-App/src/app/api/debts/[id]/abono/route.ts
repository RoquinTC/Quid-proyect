import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, debtAbonoSchema } from "@/lib/validations";
import { verifyEntityMutationAccess } from "@/lib/auth-guards";
import {
  applyBalanceDelta,
  applyBudgetDelta,
  assertSubAccountBelongsToAccount,
} from "@/lib/finance-ledger";

function normalizeOptionalId(value: string | null | undefined) {
  return value && value !== "none" && value !== "__none__" ? value : null;
}

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

    const { payments, accountId, date } = body;
    const subAccountId = normalizeOptionalId(body.subAccountId);

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: "No se especificaron cuotas para el abono" }, { status: 400 });
    }

    if (!accountId) {
      return NextResponse.json({ error: "Se requiere una cuenta para el abono" }, { status: 400 });
    }

    const entities: { type: "account" | "subAccount"; id: string }[] = [{ type: "account", id: accountId }];
    if (subAccountId) entities.push({ type: "subAccount", id: subAccountId });
    const accessError = await verifyEntityMutationAccess(session.user.id, entities);
    if (accessError) return accessError;

    // Verify debt belongs to user
    const debt = await db.debt.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    const transactionDate = date ? new Date(date) : getColombiaNow();
    const { totalAbono, details, abonoRecord } = await db.$transaction(async (tx) => {
      await assertSubAccountBelongsToAccount(
        tx,
        subAccountId,
        accountId,
        "La subcuenta seleccionada no pertenece a la cuenta de origen"
      );

      let total = 0;
      const processedDetails: Array<{
        installmentId: string;
        description: string;
        currentInstallment: number;
        totalInstallments: number;
        previousBalance: number;
        abonoAmount: number;
        newBalance: number;
      }> = [];

      for (const payment of payments) {
        const installment = await tx.installment.findFirst({
          where: {
            id: payment.installmentId,
            debtId: id,
            isPaid: false,
          },
        });

        if (!installment) {
          throw new Error(`Cuota ${payment.installmentId} no encontrada o ya está pagada`);
        }

        if (payment.amount <= 0) {
          throw new Error("El monto del abono debe ser mayor a 0");
        }

        const previousBalance = toNumber(installment.remainingBalance ?? installment.totalAmount);

        if (payment.amount > previousBalance) {
          throw new Error(
            `El abono ($${payment.amount.toLocaleString()}) excede el saldo pendiente ($${previousBalance.toLocaleString()}) de "${installment.description}"`
          );
        }

        const newBalance = Math.max(previousBalance - payment.amount, 0);

        await tx.installment.update({
          where: { id: installment.id },
          data: { remainingBalance: newBalance },
        });

        total += payment.amount;
        processedDetails.push({
          installmentId: installment.id,
          description: installment.description,
          currentInstallment: installment.currentInstallment,
          totalInstallments: installment.totalInstallments,
          previousBalance,
          abonoAmount: payment.amount,
          newBalance,
        });
      }

      await tx.debt.update({
        where: { id },
        data: { currentBalance: { increment: -total } },
      });

      const purchaseNames = processedDetails.map((d) => `${d.description} (cuota ${d.currentInstallment}/${d.totalInstallments})`);
      const installmentIds = processedDetails.map((d) => d.installmentId);

      const transaction = await tx.transaction.create({
        data: {
          userId: session.user.id,
          accountId,
          subAccountId: subAccountId || undefined,
          type: "expense",
          amount: total,
          description: debt.type === "loan"
            ? `Abono a préstamo ${debt.name}`
            : `Abono a tarjeta de crédito ${debt.name}`,
          category: debt.category || "Deudas",
          subCategory: debt.subCategory || null,
          date: transactionDate,
          sourceModule: "finance",
          sourceId: debt.id,
          notes: `Abono a capital: ${purchaseNames.join(", ")} | installmentIds: ${installmentIds.join(",")}`,
        },
      });

      const createdAbono = await tx.abono.create({
        data: {
          userId: session.user.id,
          debtId: id,
          transactionId: transaction.id,
          totalAmount: total,
          accountId,
          subAccountId: subAccountId || null,
          date: transactionDate,
          details: {
            create: processedDetails.map((d) => ({
              installmentId: d.installmentId,
              amount: d.abonoAmount,
              previousBalance: d.previousBalance,
              newBalance: d.newBalance,
            })),
          },
        },
      });

      await applyBalanceDelta(tx, {
        accountId,
        subAccountId,
        amount: -total,
      });

      await applyBudgetDelta(tx, {
        userId: session.user.id,
        category: debt.category || "Deudas",
        subCategory: debt.subCategory || null,
        type: "expense",
        amount: total,
      });

      return { totalAbono: total, details: processedDetails, abonoRecord: createdAbono };
    });

    return NextResponse.json({
      success: true,
      totalAbono,
      processedPayments: details.length,
      abonoId: abonoRecord.id,
      details,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Error) {
      const knownErrors = [
        "La subcuenta seleccionada no pertenece a la cuenta de origen",
        "El monto del abono debe ser mayor a 0",
      ];
      if (knownErrors.includes(error.message) || error.message.includes("no encontrada") || error.message.includes("excede el saldo")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error("Abono a capital error:", error);
    return NextResponse.json({ error: "Error al procesar el abono" }, { status: 500 });
  }
}
