import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getCurrentBudgetPeriod } from "@/lib/holidays";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * GET /api/budgets/movements?category=X&subCategory=Y&type=expense
 *
 * Returns all movements for a budget category, including:
 * - Direct transactions from accounts (type: expense/income)
 * - CC installments (purchases made with credit card)
 *
 * This gives a complete view of spending in a category, unlike
 * the transactions API which only returns Transaction records
 * (missing CC purchases that live in the Installment model).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const category = req.nextUrl.searchParams.get("category");
    const subCategory = req.nextUrl.searchParams.get("subCategory");
    const type = req.nextUrl.searchParams.get("type") || "expense";

    if (!category) {
      return NextResponse.json({ error: "Categoría requerida" }, { status: 400 });
    }

    // Get user's budget period
    const settings = await db.userSettings.findUnique({ where: { userId } });
    const cutoffDay = settings?.budgetCutoffDay || 1;
    const respectHolidays = settings?.respectHolidays ?? true;
    const { start: periodStart, end: periodEnd } = getCurrentBudgetPeriod(
      cutoffDay,
      respectHolidays,
      getColombiaNow()
    );
    const periodEndPlus = new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000);

    // ── Source 1: Direct transactions ──
    // Match both exact subCategory and null subCategory
    //
    // IMPORTANT: We use AND with OR sub-conditions instead of top-level
    // `sourceModule: { not: "finance_transfer" }` because Prisma's `{ not: }`
    // generates SQL `<>` which EXCLUDES NULL rows (NULL <> value → NULL → falsy).
    // Manual transactions have sourceModule=NULL, so they would be silently dropped.
    const txWhere: Record<string, unknown> = {
      userId,
      date: { gte: periodStart, lt: periodEndPlus },
      type,
      AND: [
        // Include sourceModule=NULL (manual) and anything that isn't "finance_transfer"
        {
          OR: [
            { sourceModule: null },
            { sourceModule: { not: "finance_transfer" } },
          ],
        },
        // Include excludeFromBudget=false or NULL (exclude only explicitly-true)
        {
          OR: [
            { excludeFromBudget: false },
            { excludeFromBudget: { equals: null } },
          ],
        },
      ],
    };

    if (subCategory) {
      (txWhere.AND as unknown[]).push({
        OR: [
          { category, subCategory },
          { category, subCategory: null },
        ],
      });
    } else {
      // No subCategory filter: match ALL transactions in this category
      txWhere.category = category;
    }

    const transactions = await db.transaction.findMany({
      where: txWhere,
      select: {
        id: true,
        type: true,
        amount: true,
        description: true,
        category: true,
        subCategory: true,
        date: true,
        accountId: true,
        notes: true,
        account: { select: { id: true, name: true, type: true } },
      },
      orderBy: { date: "desc" },
    });

    // ── Source 2: CC Installments (expense budgets only) ──
    let installments: Array<{
      id: string;
      source: "installment";
      type: string;
      amount: number;
      description: string;
      category: string | null;
      subCategory: string | null;
      date: Date;
      debtId: string;
      debtName: string;
      debtColor: string;
      isPaid: boolean;
      currentInstallment: number;
      totalInstallments: number;
    }> = [];

    if (type === "expense") {
      const instWhere: Record<string, unknown> = {
        purchaseDate: { gte: periodStart, lte: periodEnd },
        debt: { type: { not: "loan" }, userId },
      };

      if (subCategory) {
        instWhere.OR = [
          { category, subCategory },
          { category, subCategory: null },
        ];
      } else {
        // No subCategory filter: match ALL installments in this category
        // regardless of their subCategory
        instWhere.category = category;
      }

      const rawInstallments = await db.installment.findMany({
        where: instWhere,
        select: {
          id: true,
          description: true,
          installmentAmount: true,
          category: true,
          subCategory: true,
          purchaseDate: true,
          isPaid: true,
          currentInstallment: true,
          totalInstallments: true,
          debt: { select: { id: true, name: true, color: true, type: true } },
        },
        orderBy: { purchaseDate: "desc" },
      });

      installments = rawInstallments.map((inst) => ({
        id: inst.id,
        source: "installment" as const,
        type: "expense",
        amount: toNumber(inst.installmentAmount),
        description: inst.description,
        category: inst.category,
        subCategory: inst.subCategory,
        date: inst.purchaseDate,
        debtId: inst.debt.id,
        debtName: inst.debt.name,
        debtColor: inst.debt.color,
        isPaid: inst.isPaid,
        currentInstallment: inst.currentInstallment,
        totalInstallments: inst.totalInstallments,
      }));
    }

    // ── Combine and sort by date (newest first) ──
    const allMovements = [
      ...transactions.map((tx) => ({
        id: tx.id,
        source: "transaction" as const,
        type: tx.type,
        amount: toNumber(tx.amount),
        description: tx.description,
        category: tx.category,
        subCategory: tx.subCategory,
        date: tx.date,
        accountName: tx.account?.name || null,
        accountId: tx.accountId,
        // TC installment fields (null for transactions)
        debtId: null as string | null,
        debtName: null as string | null,
        debtColor: null as string | null,
        isPaid: null as boolean | null,
        currentInstallment: null as number | null,
        totalInstallments: null as number | null,
      })),
      ...installments,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      movements: allMovements,
      period: { start: periodStart, end: periodEnd },
      total: allMovements.length,
      totalAmount: allMovements.reduce((sum, m) => sum + m.amount, 0),
    });
  } catch (error) {
    console.error("Budget movements error:", error);
    return NextResponse.json(
      { error: "Error al obtener movimientos del presupuesto" },
      { status: 500 }
    );
  }
}
