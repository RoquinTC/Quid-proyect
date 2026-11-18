import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { projectAll, type ScenarioKind } from "@/lib/finance/project-plan";

export const dynamic = "force-dynamic";

const scenarioSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["savings", "cdt", "etf", "stocks", "mixed"]),
  annualRatePercent: z.number().min(0).max(100),
  volatilityPercent: z.number().min(0).max(100).optional(),
  source: z.string().trim().max(160).optional().nullable(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetAmount: z.number().positive(),
  currentAmount: z.number().min(0).default(0),
  monthlyContribution: z.number().min(0).default(0),
  targetDate: z.string().optional().nullable(),
  scenarios: z.array(scenarioSchema).max(8).default([]),
});

function toDTO(plan: {
  id: string;
  name: string;
  targetAmount: unknown;
  currentAmount: unknown;
  monthlyContribution: unknown;
  targetDate: Date | null;
  status: string;
  goalId: string | null;
  scenarios: Array<{
    id: string;
    name: string;
    kind: string;
    annualRatePercent: unknown;
    volatilityPercent: unknown;
    source: string | null;
    isSelected: boolean;
  }>;
}) {
  return {
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
      kind: scenario.kind as ScenarioKind,
      annualRatePercent: toNumber(scenario.annualRatePercent),
      volatilityPercent: scenario.volatilityPercent ? toNumber(scenario.volatilityPercent) : 0,
      source: scenario.source,
      isSelected: scenario.isSelected,
    })),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const plans = await db.projectPlan.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { scenarios: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json({
    plans: plans.map((plan) => {
      const dto = toDTO(plan);
      const projections = projectAll(
        dto.scenarios.map((scenario) => ({
          name: scenario.name,
          kind: scenario.kind,
          annualRatePercent: scenario.annualRatePercent,
          volatilityPercent: scenario.volatilityPercent,
          source: scenario.source ?? undefined,
        })),
        {
          targetAmount: dto.targetAmount,
          currentAmount: dto.currentAmount,
          monthlyContribution: dto.monthlyContribution,
          targetDate: dto.targetDate,
        }
      );
      return { ...dto, projections };
    }),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const targetDate = data.targetDate ? new Date(`${data.targetDate}T05:00:00.000Z`) : null;

  const plan = await db.projectPlan.create({
    data: {
      userId: session.user.id,
      name: data.name,
      targetAmount: data.targetAmount,
      currentAmount: data.currentAmount,
      monthlyContribution: data.monthlyContribution,
      targetDate,
      scenarios: {
        create: data.scenarios.map((scenario, index) => ({
          name: scenario.name,
          kind: scenario.kind,
          annualRatePercent: scenario.annualRatePercent,
          volatilityPercent: scenario.volatilityPercent ?? null,
          source: scenario.source ?? null,
          isSelected: index === 0,
        })),
      },
    },
    include: { scenarios: true },
  });

  return NextResponse.json({ id: plan.id }, { status: 201 });
}
