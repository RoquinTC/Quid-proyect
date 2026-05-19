import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";

const COLOMBIA_TIMEZONE = "America/Bogota";

/**
 * GET /api/dashboard/monthly-summary?months=12
 *
 * Returns an array of monthly financial summaries for the last N months.
 * Each entry: { month: "YYYY-MM", income: number, expenses: number, balance: number }
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const monthsParam = req.nextUrl.searchParams.get("months");
    const months = Math.min(Math.max(parseInt(monthsParam || "12", 10) || 12, 1), 24);

    // Calculate date range: from N months ago to now (Colombia timezone)
    const now = new Date();
    const colombiaNow = new Date(
      now.toLocaleString("en-US", { timeZone: COLOMBIA_TIMEZONE })
    );

    // Build the list of months we need data for
    const monthList: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(colombiaNow.getFullYear(), colombiaNow.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      monthList.push(`${y}-${m}`);
    }

    // Fetch all transactions in the date range
    const startDate = new Date(
      Date.UTC(
        parseInt(monthList[0].split("-")[0], 10),
        parseInt(monthList[0].split("-")[1], 10) - 1,
        1,
        5,
        0,
        0,
        0
      )
    );

    // End date is end of current month
    const lastMonth = monthList[monthList.length - 1];
    const [lastY, lastM] = lastMonth.split("-").map(Number);
    const endDate = new Date(Date.UTC(lastY, lastM, 1, 4, 59, 59, 999));

    // IMPORTANT: Exclude transfer counterpart transactions.
    // When you transfer $500K from Account A → B, two records are created:
    //   1. A "transfer" type on Account A (deducts from A)
    //   2. An "income" type on Account B (adds to B) — this is the COUNTERPART
    // Without exclusion, the counterpart income inflates the monthly income total,
    // making it look like you earned $500K when you just moved money between accounts.
    // We exclude by:
    //   - sourceModule: "finance_transfer" — explicitly tagged transfers
    //   - relatedTransactionId IS NOT NULL — transfer counterpart incomes
    const transactions = await db.transaction.findMany({
      where: {
        userId: session.user.id,
        date: {
          gte: startDate,
          lt: endDate,
        },
        type: { in: ["income", "expense"] },
        sourceModule: { not: "finance_transfer" },
        relatedTransactionId: null,
      },
      select: {
        type: true,
        amount: true,
        date: true,
        category: true,
      },
      orderBy: { date: "asc" },
    });

    // Aggregate by month
    const monthlyData: Record<
      string,
      { income: number; expenses: number }
    > = {};

    // Initialize all months with 0
    for (const m of monthList) {
      monthlyData[m] = { income: 0, expenses: 0 };
    }

    // Process transactions
    for (const tx of transactions) {
      // Convert transaction date to Colombia timezone month
      const txDate = new Date(tx.date);
      const colombiaDateStr = txDate.toLocaleDateString("sv-SE", {
        timeZone: COLOMBIA_TIMEZONE,
      });
      const monthKey = colombiaDateStr.substring(0, 7); // "YYYY-MM"

      if (monthlyData[monthKey]) {
        // IMPORTANT: tx.amount is a Prisma.Decimal object.
        // We must convert it to number BEFORE adding to avoid string concatenation:
        //   0 + Decimal("800000") → "0800000" (string!) without toNumber()
        //   0 + toNumber(Decimal("800000")) → 800000 (number!) ✓
        const amount = toNumber(tx.amount);
        if (tx.type === "income") {
          monthlyData[monthKey].income += amount;
        } else if (tx.type === "expense") {
          monthlyData[monthKey].expenses += amount;
        }
      }
    }

    // Build result with cumulative balance
    let runningBalance = 0;
    const result = monthList.map((month) => {
      const data = monthlyData[month] || { income: 0, expenses: 0 };
      runningBalance += data.income - data.expenses;
      return {
        month,
        income: Math.round(data.income),
        expenses: Math.round(data.expenses),
        balance: Math.round(runningBalance),
      };
    });

    // Calculate projection: average of last 3 months
    const last3 = result.slice(-3);
    const avgIncome =
      last3.length > 0
        ? last3.reduce((s, d) => s + d.income, 0) / last3.length
        : 0;
    const avgExpenses =
      last3.length > 0
        ? last3.reduce((s, d) => s + d.expenses, 0) / last3.length
        : 0;

    // Project 12 months forward
    let projectedBalance = result[result.length - 1]?.balance || 0;
    const projectionMonths: string[] = [];
    const lastMonthDate = new Date(
      parseInt(lastMonth.split("-")[0], 10),
      parseInt(lastMonth.split("-")[1], 10) - 1,
      1
    );

    for (let i = 1; i <= 12; i++) {
      const d = new Date(
        lastMonthDate.getFullYear(),
        lastMonthDate.getMonth() + i,
        1
      );
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      projectionMonths.push(`${y}-${m}`);
    }

    const projection = projectionMonths.map((month) => {
      projectedBalance += avgIncome - avgExpenses;
      return {
        month,
        income: Math.round(avgIncome),
        expenses: Math.round(avgExpenses),
        balance: Math.round(projectedBalance),
      };
    });

    return NextResponse.json({
      historical: result,
      projection,
      averages: {
        monthlyIncome: Math.round(avgIncome),
        monthlyExpenses: Math.round(avgExpenses),
        monthlySavings: Math.round(avgIncome - avgExpenses),
      },
    });
  } catch (error) {
    console.error("Monthly summary error:", error);
    return NextResponse.json(
      { error: "Error al obtener resumen mensual" },
      { status: 500 }
    );
  }
}
