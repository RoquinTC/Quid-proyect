import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, debtCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const debts = await db.debt.findMany({
      where: { userId: session.user.id },
      include: {
        installments: { orderBy: { nextPaymentDate: "asc" } },
        abonos: {
          include: { details: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(debts);
  } catch (error) {
    console.error("Get debts error:", error);
    return NextResponse.json({ error: "Error al obtener deudas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await validateBody(req, debtCreateSchema);
    const { type, name, color, icon, bank, totalAmount, currentBalance, interestRate, cutoffDate, paymentDate, monthlyPayment, remainingPayments, startDate, endDate, paymentType, otherCharges, category, subCategory, accountId, subAccountId } = body;

    if (!type || !name || totalAmount === undefined) {
      return NextResponse.json({ error: "Tipo, nombre y monto total son requeridos" }, { status: 400 });
    }

    const debt = await db.debt.create({
      data: {
        userId: session.user.id,
        type,
        name,
        color: color || "#EF4444",
        icon,
        bank,
        totalAmount,
        currentBalance: currentBalance !== undefined ? currentBalance : totalAmount,
        interestRate,
        cutoffDate,
        paymentDate,
        monthlyPayment,
        remainingPayments,
        startDate: startDate ? createColombiaDate(startDate.split("T")[0]) : null,
        endDate: endDate ? createColombiaDate(endDate.split("T")[0]) : null,
        paymentType: type === "loan" ? (paymentType || null) : null,
        otherCharges: type === "loan" ? (otherCharges || null) : null,
        category: type === "loan" ? (category || null) : null,
        subCategory: type === "loan" ? (subCategory || null) : null,
        accountId: type === "loan" ? (accountId || null) : null,
        subAccountId: type === "loan" ? (subAccountId || null) : null,
      },
      include: { installments: true },
    });

    // ── Auto-create first installment for loans ──
    if (type === "loan" && paymentDate) {
      const totalInstallments = remainingPayments || 1;
      const startBalance = currentBalance !== undefined ? currentBalance : totalAmount;

      // Calculate next payment date based on paymentDate and startDate
      let nextPaymentDate: Date;
      if (startDate) {
        const start = new Date(startDate);
        nextPaymentDate = new Date(start.getFullYear(), start.getMonth(), Math.min(paymentDate, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()), 12, 0, 0);
      } else {
        // Default: next occurrence of paymentDate
        const now = new Date();
        const thisMonthPay = new Date(now.getFullYear(), now.getMonth(), Math.min(paymentDate, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()), 12, 0, 0);
        nextPaymentDate = thisMonthPay >= now ? thisMonthPay : new Date(now.getFullYear(), now.getMonth() + 1, Math.min(paymentDate, new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate()), 12, 0, 0);
      }

      // For fixed cuota, estimate the initial capital portion
      // interestRate for loans is NMV (annual nominal), monthly rate = NMV / 12
      const isFixedCuota = paymentType === "fixed";
      let installmentCapital: number;
      if (isFixedCuota && interestRate && monthlyPayment) {
        const otherChargesVal = otherCharges || 0;
        const monthlyRate = interestRate / 12;
        const estimatedInterest = startBalance * (monthlyRate / 100);
        installmentCapital = Math.max(monthlyPayment - estimatedInterest - otherChargesVal, 0);
      } else if (isFixedCuota && monthlyPayment) {
        installmentCapital = monthlyPayment;
      } else {
        // Variable cuota or no monthly payment specified — use balance / installments as estimate
        installmentCapital = totalInstallments > 0 ? startBalance / totalInstallments : startBalance;
      }

      await db.installment.create({
        data: {
          debtId: debt.id,
          description: name || "Préstamo",
          totalAmount: startBalance,
          totalInstallments,
          currentInstallment: 1,
          installmentAmount: installmentCapital,
          paidAmount: 0,
          remainingBalance: startBalance,
          purchaseDate: debt.startDate || debt.createdAt,
          nextPaymentDate,
          isPaid: false,
          accountId: accountId || null,
          subAccountId: subAccountId || null,
          category: category || null,
          subCategory: subCategory || null,
        },
      });

      // ── Auto-create budget entry for the loan ──
      // If a category was specified and monthlyPayment exists, create/update a budget
      if (category && monthlyPayment) {
        const budgetCategory = category;
        const budgetSubCategory = subCategory || null;

        // Check if budget already exists for this category
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let existingBudget: any = null;
        if (budgetSubCategory) {
          existingBudget = await db.budget.findFirst({
            where: { userId: session.user.id, category: budgetCategory, subCategory: budgetSubCategory, type: "expense" },
          });
        }
        if (!existingBudget) {
          existingBudget = await db.budget.findFirst({
            where: { userId: session.user.id, category: budgetCategory, subCategory: null, type: "expense" },
          });
        }

        if (existingBudget) {
          // Add the monthlyPayment to the existing budget amount
          await db.budget.update({
            where: { id: existingBudget.id },
            data: { amount: { increment: monthlyPayment } },
          });
        } else {
          // Create a new budget entry
          await db.budget.create({
            data: {
              userId: session.user.id,
              type: "expense",
              category: budgetCategory,
              subCategory: budgetSubCategory,
              amount: monthlyPayment,
              spent: 0,
              period: "monthly",
            },
          });
        }
      }
    }

    return NextResponse.json(debt, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create debt error:", error);
    return NextResponse.json({ error: "Error al crear deuda" }, { status: 500 });
  }
}
