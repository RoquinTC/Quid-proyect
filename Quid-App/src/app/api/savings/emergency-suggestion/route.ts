import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

async function buildEmergencySuggestion(userId: string) {
  const now = new Date();
  const since = new Date(now);
  since.setDate(now.getDate() - 90);

  const [transactions, recurring, existingGoal, accounts] = await Promise.all([
    db.transaction.findMany({
      where: {
        userId,
        type: "expense",
        date: { gte: since },
        category: { notIn: ["Ahorros", "Transferencias"] },
      },
      select: { amount: true },
    }),
    db.recurringPayment.findMany({
      where: {
        userId,
        status: "pending",
        type: "expense",
        category: { notIn: ["Ahorros", "Transferencias"] },
      },
      select: { amount: true },
    }),
    db.savingsGoal.findFirst({
      where: { userId, type: "emergency_fund", isActive: true },
      orderBy: { createdAt: "desc" },
    }),
    db.account.findMany({
      where: { userId, type: { in: ["savings", "cash", "digital_wallet"] } },
      select: { balance: true },
    }),
  ]);

  const recentExpenses = transactions.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const averageMonthlyExpenses = Math.round(recentExpenses / 3);
  const fixedMonthlyExpenses = recurring.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const monthlyNeed = Math.max(averageMonthlyExpenses, fixedMonthlyExpenses);
  const recommendedMonths = monthlyNeed > 0 ? 3 : 1;
  const recommendedTarget = Math.max(500000, Math.round(monthlyNeed * recommendedMonths));
  const currentEmergencyLiquidity = accounts.reduce((sum, item) => sum + toNumber(item.balance), 0);
  const gap = Math.max(0, recommendedTarget - Math.max(currentEmergencyLiquidity, toNumber(existingGoal?.currentAmount ?? 0)));
  const monthlyContribution = Math.ceil(gap / 6);
  const aiSuggestion = monthlyNeed > 0
    ? `Tu colchón recomendado es de ${recommendedMonths} meses de gastos esenciales. Con tu ritmo reciente, la meta sugerida es ${recommendedTarget.toLocaleString("es-CO")} COP; puedes construirla en 6 meses con aportes de ${monthlyContribution.toLocaleString("es-CO")} COP.`
    : "Aún no hay suficiente historial de gastos. Quid propone una meta base mientras registras más movimientos.";

  return {
    existingGoalId: existingGoal?.id ?? null,
    recommendedTarget,
    currentEmergencyLiquidity,
    averageMonthlyExpenses,
    fixedMonthlyExpenses,
    monthlyNeed,
    gap,
    monthlyContribution,
    recommendedDeadline: addMonths(now, 6).toISOString(),
    aiSuggestion,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    return NextResponse.json(await buildEmergencySuggestion(session.user.id));
  } catch (error: any) {
    console.error("Emergency suggestion error:", error);
    return NextResponse.json({ error: error.message || "Error calculando fondo de emergencia" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const suggestion = await buildEmergencySuggestion(session.user.id);
    const deadline = new Date(suggestion.recommendedDeadline);

    const goal = suggestion.existingGoalId
      ? await db.savingsGoal.update({
          where: { id: suggestion.existingGoalId },
          data: {
            targetAmount: suggestion.recommendedTarget,
            deadline,
            aiSuggestion: suggestion.aiSuggestion,
          },
        })
      : await db.savingsGoal.create({
          data: {
            userId: session.user.id,
            name: "Fondo de emergencia",
            description: "Colchón para cubrir gastos esenciales ante imprevistos.",
            targetAmount: suggestion.recommendedTarget,
            deadline,
            frequency: "mensual",
            monthlyDay: 1,
            type: "emergency_fund",
            icon: "Shield",
            color: "#0EA5E9",
            aiSuggestion: suggestion.aiSuggestion,
          },
        });

    return NextResponse.json({ success: true, goal, suggestion });
  } catch (error: any) {
    console.error("Create emergency fund error:", error);
    return NextResponse.json({ error: error.message || "Error creando fondo de emergencia" }, { status: 500 });
  }
}
