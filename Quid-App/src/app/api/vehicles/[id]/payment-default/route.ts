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
      include: {
        account: { select: { name: true } },
        subAccount: { select: { name: true } },
        debt: { select: { name: true } },
      },
    });

    return NextResponse.json(paymentDefault ? {
      ...paymentDefault,
      accountName: paymentDefault.account?.name ?? null,
      subAccountName: paymentDefault.subAccount?.name ?? null,
      debtName: paymentDefault.debt?.name ?? null,
    } : { paymentType: "account", accountId: null, subAccountId: null, debtId: null, installmentCount: null });
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

    if (paymentType === "account" && !accountId) {
      return NextResponse.json(
        { error: "Selecciona una cuenta para guardar el método de pago predeterminado." },
        { status: 400 }
      );
    }

    if (paymentType === "credit_card" && !debtId) {
      return NextResponse.json(
        { error: "Selecciona una tarjeta de crédito para guardar el método de pago predeterminado." },
        { status: 400 }
      );
    }

    if (accountId) {
      const account = await db.account.findFirst({
        where: { id: accountId, userId: session.user.id },
        select: { id: true },
      });
      if (!account) {
        return NextResponse.json(
          { error: "La cuenta seleccionada no existe o no pertenece a tu usuario." },
          { status: 400 }
        );
      }
    }

    if (subAccountId) {
      const subAccount = await db.subAccount.findFirst({
        where: { id: subAccountId, account: { userId: session.user.id } },
        select: { id: true },
      });
      if (!subAccount) {
        return NextResponse.json(
          { error: "El bolsillo seleccionado no existe o no pertenece a tu usuario." },
          { status: 400 }
        );
      }
    }

    if (debtId) {
      const debt = await db.debt.findFirst({
        where: { id: debtId, userId: session.user.id, type: "credit_card" },
        select: { id: true },
      });
      if (!debt) {
        return NextResponse.json(
          { error: "La tarjeta seleccionada no existe o no pertenece a tu usuario." },
          { status: 400 }
        );
      }
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

    const saved = await db.vehiclePaymentDefault.findUnique({
      where: { vehicleId: id },
      include: {
        account: { select: { name: true } },
        subAccount: { select: { name: true } },
        debt: { select: { name: true } },
      },
    });

    return NextResponse.json(saved ? {
      ...saved,
      accountName: saved.account?.name ?? null,
      subAccountName: saved.subAccount?.name ?? null,
      debtName: saved.debt?.name ?? null,
    } : paymentDefault);
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
