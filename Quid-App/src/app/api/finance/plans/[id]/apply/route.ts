import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";

export const dynamic = "force-dynamic";

const applySchema = z.object({
  accountId: z.string().optional().nullable(),
  /** Escenario elegido, solo para dejar constancia en la meta. */
  scenarioName: z.string().max(80).optional().nullable(),
});

/**
 * F-52 · Convertir el plan en una meta real.
 * Crea la meta de ahorro con el monto y la fecha del plan, y le vincula la
 * cuenta si se indicó. No mueve dinero: la meta es el compromiso.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const plan = await db.projectPlan.findFirst({
    where: { id, userId: session.user.id },
    include: { scenarios: true },
  });
  if (!plan) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (plan.goalId) {
    return NextResponse.json({ error: "Ese plan ya tiene una meta creada." }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = applySchema.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const goal = await db.savingsGoal.create({
    data: {
      userId: session.user.id,
      name: plan.name,
      description: parsed.data.scenarioName
        ? `Plan de proyecto · escenario: ${parsed.data.scenarioName}`
        : "Plan de proyecto",
      targetAmount: plan.targetAmount,
      currentAmount: plan.currentAmount,
      deadline: plan.targetDate,
      type: "general",
    },
  });

  if (parsed.data.accountId) {
    const account = await db.account.findFirst({
      where: { id: parsed.data.accountId, userId: session.user.id },
      select: { id: true },
    });
    if (account) {
      await db.savingsGoalAccount.create({
        data: { goalId: goal.id, accountId: account.id },
      });
    }
  }

  await db.projectPlan.update({
    where: { id: plan.id },
    data: { goalId: goal.id, status: "active", accountId: parsed.data.accountId ?? null },
  });

  return NextResponse.json({
    goalId: goal.id,
    targetAmount: toNumber(goal.targetAmount),
  }, { status: 201 });
}
