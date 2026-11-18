import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { advisePlan } from "@/lib/finance/plan-advisor";

export const dynamic = "force-dynamic";

/**
 * F-52b · "¿Cuánto puedo aportar?" calculado con datos reales.
 *
 * No pregunta: mira los últimos 3 meses de movimientos, las cuotas de las
 * deudas activas y lo que ya está apartado. Devuelve la propuesta con sus
 * razones.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userId = session.user.id;
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const [transactions, debts, goals, cdts, accounts] = await Promise.all([
    db.transaction.findMany({
      where: { userId, date: { gte: from } },
      select: { type: true, amount: true, excludeFromBudget: true },
    }),
    db.debt.findMany({
      where: { userId },
      select: { monthlyPayment: true, currentBalance: true },
    }),
    db.savingsGoal.findMany({ where: { userId }, select: { currentAmount: true } }),
    db.cDT.findMany({ where: { userId, status: "active" }, select: { amount: true } }),
    // F-53 · las cuentas marcadas como "no disponible" son colchón real.
    db.account.findMany({
      where: { userId, excludeFromAvailable: true },
      select: { balance: true },
    }),
  ]);

  const income = transactions
    .filter((row) => row.type === "income")
    .reduce((sum, row) => sum + toNumber(row.amount), 0) / 3;
  const expenses = transactions
    .filter((row) => row.type === "expense" && !row.excludeFromBudget)
    .reduce((sum, row) => sum + toNumber(row.amount), 0) / 3;

  const debtPayments = debts
    .filter((debt) => toNumber(debt.currentBalance) > 0)
    .reduce((sum, debt) => sum + toNumber(debt.monthlyPayment), 0);

  // Colchón: lo apartado en metas y CDT, o lo que haya en cuentas marcadas como
  // no disponibles (lo que sea mayor, para no contar dos veces la misma plata).
  const savedInGoals =
    goals.reduce((sum, goal) => sum + toNumber(goal.currentAmount), 0) +
    cdts.reduce((sum, cdt) => sum + toNumber(cdt.amount), 0);
  const savedInExcluded = accounts.reduce((sum, account) => sum + toNumber(account.balance), 0);
  const emergencyFund = Math.max(savedInGoals, savedInExcluded);

  const advice = advisePlan({
    monthlyIncome: Math.round(income),
    monthlyExpenses: Math.round(expenses),
    monthlyDebtPayments: Math.round(debtPayments),
    emergencyFund: Math.round(emergencyFund),
  });

  return NextResponse.json({
    input: {
      monthlyIncome: Math.round(income),
      monthlyExpenses: Math.round(expenses),
      monthlyDebtPayments: Math.round(debtPayments),
      emergencyFund: Math.round(emergencyFund),
    },
    advice,
  });
}
