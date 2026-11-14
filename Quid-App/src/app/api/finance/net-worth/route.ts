import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { computeNetWorth } from "@/lib/finance/net-worth";

export const dynamic = "force-dynamic";

/** F-24 · Patrimonio neto del usuario: activos, pasivos y el neto. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  const [accounts, savings, cdts, debts] = await Promise.all([
    db.account.findMany({
      where: { userId },
      select: { name: true, balance: true },
    }),
    db.savingsGoal.findMany({
      where: { userId },
      select: { name: true, currentAmount: true },
    }),
    db.cDT.findMany({
      where: { userId, status: "active" },
      select: { bank: true, amount: true, interestEarned: true },
    }),
    db.debt.findMany({
      where: { userId },
      select: { name: true, currentBalance: true },
    }),
  ]);

  const result = computeNetWorth({
    accounts: accounts.map((account) => ({
      name: account.name,
      balance: toNumber(account.balance),
    })),
    savings: savings.map((goal) => ({
      name: goal.name,
      amount: toNumber(goal.currentAmount),
    })),
    cdts: cdts.map((cdt) => ({
      name: `CDT ${cdt.bank}`,
      amount: toNumber(cdt.amount) + toNumber(cdt.interestEarned),
    })),
    debts: debts.map((debt) => ({
      name: debt.name,
      balance: toNumber(debt.currentBalance),
    })),
  });

  return NextResponse.json(result);
}
