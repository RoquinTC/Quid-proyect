import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate, getColombiaNow } from "@/lib/api";
import { validateBody, debtInstallmentCreateSchema } from "@/lib/validations";

export async function GET(
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

    const installments = await db.installment.findMany({
      where: { debtId: id },
      orderBy: { nextPaymentDate: "asc" },
    });

    return NextResponse.json(installments);
  } catch (error) {
    console.error("Get installments error:", error);
    return NextResponse.json({ error: "Error al obtener cuotas" }, { status: 500 });
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
      body = await validateBody(req, debtInstallmentCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { description, totalAmount, totalInstallments, purchaseDate, accountId, subAccountId, category, subCategory } = body;

    if (!description || !totalAmount || !totalInstallments) {
      return NextResponse.json({ error: "Descripción, monto total y número de cuotas son requeridos" }, { status: 400 });
    }

    const debt = await db.debt.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!debt) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    // Validate account belongs to user if provided
    if (accountId) {
      const account = await db.account.findFirst({
        where: { id: accountId, userId: session.user.id },
      });
      if (!account) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 400 });
      }

      // Validate subAccount belongs to the account if provided
      if (subAccountId) {
        const subAccount = await db.subAccount.findFirst({
          where: { id: subAccountId, accountId },
        });
        if (!subAccount) {
          return NextResponse.json({ error: "Subcuenta no encontrada o no pertenece a la cuenta" }, { status: 400 });
        }
      }
    }

    const installmentAmount = totalAmount / totalInstallments; // Capital fijo por cuota
    const remainingBalance = totalAmount; // Saldo pendiente inicial = monto total
    const purchaseDateObj = purchaseDate ? createColombiaDate(purchaseDate.split("T")[0]) : getColombiaNow();

    // Calculate next payment date based on debt's payment date and cutoff date
    // Logic: Determine which cycle the purchase belongs to, then calculate payment date.
    // A purchase ON the cutoff day belongs to the current cycle.
    // If paymentDate > cutoffDate → payment is SAME month as cycle
    //   e.g. cutoff=3, payment=23 → purchase May 3, cycle May, payment May 23
    // If paymentDate <= cutoffDate → payment is NEXT month after cycle
    //   e.g. cutoff=20, payment=4 → purchase Apr 20, cycle April, payment May 4
    const nextPayment = new Date(purchaseDateObj);
    if (debt.paymentDate) {
      // Determine which cycle this purchase belongs to
      let cycleMonth: number;
      let cycleYear: number;
      if (debt.cutoffDate && purchaseDateObj.getDate() >= debt.cutoffDate) {
        // Purchase is ON or AFTER cutoff → belongs to NEXT month's cycle
        cycleMonth = purchaseDateObj.getMonth() + 1;
        cycleYear = purchaseDateObj.getFullYear();
        if (cycleMonth > 11) {
          cycleMonth = 0;
          cycleYear += 1;
        }
      } else {
        // Purchase is BEFORE cutoff → belongs to THIS month's cycle
        cycleMonth = purchaseDateObj.getMonth();
        cycleYear = purchaseDateObj.getFullYear();
      }

      // Calculate payment month based on relationship between paymentDate and cutoffDate
      let payMonth: number;
      let payYear: number;
      if (debt.cutoffDate && debt.paymentDate > debt.cutoffDate) {
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
      // Clamp day to valid days in month
      const maxDaysInPayMonth = new Date(payYear, payMonth + 1, 0).getDate();
      const payDay = Math.min(debt.paymentDate, maxDaysInPayMonth);
      nextPayment.setTime(new Date(payYear, payMonth, payDay, 12, 0, 0).getTime());
    } else {
      nextPayment.setMonth(nextPayment.getMonth() + 1);
    }

    const installment = await db.installment.create({
      data: {
        debtId: id,
        description,
        totalAmount,
        totalInstallments,
        currentInstallment: 1,
        installmentAmount,
        paidAmount: 0,
        remainingBalance,
        purchaseDate: purchaseDateObj,
        nextPaymentDate: nextPayment,
        isPaid: false,
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        category: category || null,
        subCategory: subCategory || null,
      },
    });

    // Update debt current balance
    await db.debt.update({
      where: { id },
      data: { currentBalance: { increment: totalAmount } },
    });

    return NextResponse.json(installment, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create installment error:", error);
    const message = error instanceof Error ? error.message : "Error al crear cuota";
    // Detect missing DB columns (Prisma error after schema change)
    if (message.includes("Unknown column") || message.includes("does not exist") || message.includes("no column")) {
      return NextResponse.json(
        { error: "Error de base de datos: ejecuta 'npx prisma db push' para sincronizar el esquema" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Error al crear cuota" }, { status: 500 });
  }
}
