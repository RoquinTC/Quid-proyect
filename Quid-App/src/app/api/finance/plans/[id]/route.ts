import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { projectAll, type ScenarioKind } from "@/lib/finance/project-plan";

export const dynamic = "force-dynamic";

const scenarioSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["savings", "cdt", "etf", "stocks", "mixed"]),
  annualRatePercent: z.number().min(0).max(100),
  volatilityPercent: z.number().min(0).max(100).optional(),
  source: z.string().trim().max(160).optional().nullable(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  targetAmount: z.number().positive().optional(),
  currentAmount: z.number().min(0).optional(),
  monthlyContribution: z.number().min(0).optional(),
  targetDate: z.string().nullable().optional(),
  /** Si viene, reemplaza los escenarios (permite editar tasas y recalcular). */
  scenarios: z.array(scenarioSchema).max(8).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const plan = await db.projectPlan.findFirst({
    where: { id, userId: session.user.id },
    include: { scenarios: { orderBy: { createdAt: "asc" } } },
  });
  if (!plan) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const projections = projectAll(
    plan.scenarios.map((scenario) => ({
      name: scenario.name,
      kind: scenario.kind as ScenarioKind,
      annualRatePercent: toNumber(scenario.annualRatePercent),
      volatilityPercent: scenario.volatilityPercent ? toNumber(scenario.volatilityPercent) : 0,
      source: scenario.source ?? undefined,
    })),
    {
      targetAmount: toNumber(plan.targetAmount),
      currentAmount: toNumber(plan.currentAmount),
      monthlyContribution: toNumber(plan.monthlyContribution),
      targetDate: plan.targetDate ? plan.targetDate.toISOString() : null,
    }
  );

  return NextResponse.json({
    id: plan.id,
    name: plan.name,
    targetAmount: toNumber(plan.targetAmount),
    currentAmount: toNumber(plan.currentAmount),
    monthlyContribution: toNumber(plan.monthlyContribution),
    targetDate: plan.targetDate ? plan.targetDate.toISOString() : null,
    status: plan.status,
    goalId: plan.goalId,
    scenarios: plan.scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      kind: scenario.kind,
      annualRatePercent: toNumber(scenario.annualRatePercent),
      volatilityPercent: scenario.volatilityPercent ? toNumber(scenario.volatilityPercent) : 0,
      source: scenario.source,
      isSelected: scenario.isSelected,
    })),
    projections,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const plan = await db.projectPlan.findFirst({ where: { id, userId: session.user.id } });
  if (!plan) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const data = parsed.data;

  await db.$transaction(async (tx) => {
    await tx.projectPlan.update({
      where: { id: plan.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.targetAmount !== undefined ? { targetAmount: data.targetAmount } : {}),
        ...(data.currentAmount !== undefined ? { currentAmount: data.currentAmount } : {}),
        ...(data.monthlyContribution !== undefined
          ? { monthlyContribution: data.monthlyContribution }
          : {}),
        ...(data.targetDate !== undefined
          ? {
              targetDate: data.targetDate
                ? new Date(`${data.targetDate}T05:00:00.000Z`)
                : null,
            }
          : {}),
      },
    });

    if (data.scenarios) {
      await tx.planScenario.deleteMany({ where: { planId: plan.id } });
      if (data.scenarios.length > 0) {
        await tx.planScenario.createMany({
          data: data.scenarios.map((scenario, index) => ({
            planId: plan.id,
            name: scenario.name,
            kind: scenario.kind,
            annualRatePercent: scenario.annualRatePercent,
            volatilityPercent: scenario.volatilityPercent ?? null,
            source: scenario.source ?? null,
            isSelected: index === 0,
          })),
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const deleted = await db.projectPlan.deleteMany({ where: { id, userId: session.user.id } });
  if (deleted.count === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
