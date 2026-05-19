import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, subAccountCreateSchema } from "@/lib/validations";

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

    const account = await db.account.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const subAccounts = await db.subAccount.findMany({
      where: { accountId: id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(subAccounts);
  } catch (error) {
    console.error("Get sub-accounts error:", error);
    return NextResponse.json({ error: "Error al obtener sub-cuentas" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, subAccountCreateSchema);
    const { name, type, icon, color, balance, isHighYield, yieldPercentage, excludeFromAvailable } = body;

    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const account = await db.account.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const subAccountCount = await db.subAccount.count({
      where: { accountId: id },
    });

    const subAccount = await db.subAccount.create({
      data: {
        accountId: id,
        name,
        type: type || "pocket",
        icon,
        color,
        balance: balance || 0,
        isHighYield: isHighYield || false,
        yieldPercentage: isHighYield ? yieldPercentage : null,
        excludeFromAvailable: excludeFromAvailable || false,
        order: subAccountCount,
      },
    });

    return NextResponse.json(subAccount, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create sub-account error:", error);
    return NextResponse.json({ error: "Error al crear sub-cuenta" }, { status: 500 });
  }
}
