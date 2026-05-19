import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, vehiclePaymentDefaultSchema } from "@/lib/validations";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    const paymentDefault = await db.vehiclePaymentDefault.findUnique({
      where: { vehicleId: id },
    });

    return NextResponse.json(paymentDefault || { paymentType: "account", accountId: null, subAccountId: null, debtId: null, installmentCount: null });
  } catch (error) {
    console.error("Get payment default error:", error);
    return NextResponse.json({ error: "Error al obtener método de pago predeterminado" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, vehiclePaymentDefaultSchema);
    const { paymentType, accountId, subAccountId, debtId, installmentCount } = body;

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    // Upsert: create or update the payment default
    const paymentDefault = await db.vehiclePaymentDefault.upsert({
      where: { vehicleId: id },
      update: {
        paymentType,
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        debtId: debtId || null,
        installmentCount: installmentCount || null,
        userId: session.user.id,
      },
      create: {
        vehicleId: id,
        userId: session.user.id,
        paymentType,
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        debtId: debtId || null,
        installmentCount: installmentCount || null,
      },
    });

    return NextResponse.json(paymentDefault);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update payment default error:", error);
    return NextResponse.json({ error: "Error al actualizar método de pago predeterminado" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    await db.vehiclePaymentDefault.deleteMany({
      where: { vehicleId: id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete payment default error:", error);
    return NextResponse.json({ error: "Error al eliminar método de pago predeterminado" }, { status: 500 });
  }
}
