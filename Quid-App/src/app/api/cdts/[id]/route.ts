import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncSavingsBudget } from "@/lib/savings-budget-sync";
import { getColombiaNow, createColombiaDate, formatDateToColombiaISO } from "@/lib/api";
import { validateBody, cdtUpdateSchema } from "@/lib/validations";

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

    const cdt = await db.cDT.findFirst({
      where: { id, userId: session.user.id },
      include: {
        goal: { select: { id: true, name: true, targetAmount: true, currentAmount: true } },
        account: { select: { id: true, name: true, type: true, color: true } },
      },
    });

    if (!cdt) {
      return NextResponse.json({ error: "CDT no encontrado" }, { status: 404 });
    }

    // Auto-detect matured status using Colombia timezone
    if (cdt.status === "active" && createColombiaDate(formatDateToColombiaISO(cdt.endDate)) <= getColombiaNow()) {
      await db.cDT.update({
        where: { id: cdt.id },
        data: { status: "matured" },
      });
      (cdt as Record<string, unknown>).status = "matured";
    }

    return NextResponse.json(cdt);
  } catch (error) {
    console.error("Get CDT error:", error);
    return NextResponse.json({ error: "Error al obtener CDT" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, cdtUpdateSchema);

    const existing = await db.cDT.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "CDT no encontrado" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.bank !== undefined) updateData.bank = body.bank;
    if (body.amount !== undefined) updateData.amount = parseFloat(String(body.amount));
    if (body.effectiveRate !== undefined) updateData.effectiveRate = parseFloat(String(body.effectiveRate));
    if (body.startDate !== undefined) updateData.startDate = createColombiaDate(body.startDate.split("T")[0]);
    if (body.endDate !== undefined) updateData.endDate = createColombiaDate(body.endDate.split("T")[0]);
    if (body.termDays !== undefined) updateData.termDays = body.termDays;
    if (body.interestEarned !== undefined) updateData.interestEarned = parseFloat(String(body.interestEarned));
    if (body.status !== undefined) updateData.status = body.status;
    if (body.goalId !== undefined) updateData.goalId = body.goalId || null;
    if (body.accountId !== undefined) updateData.accountId = body.accountId || null;
    if (body.withdrawnAmount !== undefined) updateData.withdrawnAmount = body.withdrawnAmount ? parseFloat(String(body.withdrawnAmount)) : null;
    if (body.withdrawnDate !== undefined) updateData.withdrawnDate = body.withdrawnDate ? getColombiaNow() : null;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.color !== undefined) updateData.color = body.color;

    // Auto-calculate termDays if dates are being updated
    if (body.startDate && body.endDate && !body.termDays) {
      const start = createColombiaDate(body.startDate.split("T")[0]);
      const end = createColombiaDate(body.endDate.split("T")[0]);
      updateData.termDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }

    const cdt = await db.cDT.update({
      where: { id },
      data: updateData,
      include: {
        goal: { select: { id: true, name: true, targetAmount: true, currentAmount: true } },
        account: { select: { id: true, name: true, type: true, color: true } },
      },
    });

    // If goalId changed, sync the savings budget
    const newGoalId = body.goalId !== undefined ? (body.goalId || null) : existing.goalId;
    const oldGoalId = existing.goalId;

    if (oldGoalId !== newGoalId) {
      await syncSavingsBudget(session.user.id);
    }

    return NextResponse.json(cdt);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update CDT error:", error);
    return NextResponse.json({ error: "Error al actualizar CDT" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.cDT.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "CDT no encontrado" }, { status: 404 });
    }

    await db.cDT.delete({ where: { id } });

    // If CDT was linked to a savings goal, sync the budget
    if (existing.goalId) {
      await syncSavingsBudget(session.user.id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete CDT error:", error);
    return NextResponse.json({ error: "Error al eliminar CDT" }, { status: 500 });
  }
}
