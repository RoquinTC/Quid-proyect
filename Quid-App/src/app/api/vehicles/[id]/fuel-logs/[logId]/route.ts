import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, fuelLogUpdateSchema } from "@/lib/validations";
import {
  createFinanceEntry,
  getTransportDescription,
  reverseFinanceEntry,
  reverseUnpaidCreditInstallmentByAmount,
} from "@/lib/transport-finance";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, logId } = await params;
    const body = await validateBody(req, fuelLogUpdateSchema);

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    const existing = await db.fuelLog.findFirst({
      where: { id: logId, vehicleId: id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    const {
      date, km, amount, pricePerGallon, isFullTank, station, notes,
      paymentType, accountId, subAccountId, debtId, installmentCount,
    } = body;

    // Calculate new gallons if amount or price changed
    const newAmount = amount !== undefined ? amount : Number(existing.amount);
    const newPricePerGallon = pricePerGallon !== undefined ? pricePerGallon : Number(existing.pricePerGallon);
    const newGallons = newPricePerGallon > 0 ? Math.round((newAmount / newPricePerGallon) * 100) / 100 : Number(existing.gallons);

    const updateData: Parameters<typeof db.fuelLog.update>[0]["data"] = {};
    if (date !== undefined && date) {
      updateData.date = createColombiaDate(date.split("T")[0]);
    }
    if (km !== undefined) updateData.km = Number(km);
    if (amount !== undefined) updateData.amount = Number(amount);
    if (pricePerGallon !== undefined) updateData.pricePerGallon = Number(pricePerGallon);
    if (amount !== undefined || pricePerGallon !== undefined) updateData.gallons = newGallons;
    if (isFullTank !== undefined) updateData.isFullTank = isFullTank;
    if (station !== undefined) updateData.station = station;
    if (accountId !== undefined) updateData.accountId = accountId || null;
    if (subAccountId !== undefined) updateData.subAccountId = subAccountId || null;
    if (debtId !== undefined) updateData.debtId = debtId || null;
    if (installmentCount !== undefined) updateData.installmentCount = installmentCount || null;
    if (notes !== undefined) updateData.notes = notes;

    const log = await db.fuelLog.update({
      where: { id: logId },
      data: updateData,
    });

    // Update km on vehicle if the new km is higher
    if (km !== undefined && Number(km) > vehicle.currentKm) {
      await db.vehicle.update({
        where: { id },
        data: { currentKm: Number(km) },
      });
    }

    const financeChanged =
      amount !== undefined ||
      date !== undefined ||
      paymentType !== undefined ||
      accountId !== undefined ||
      subAccountId !== undefined ||
      debtId !== undefined ||
      installmentCount !== undefined ||
      station !== undefined ||
      notes !== undefined;

    if (financeChanged) {
      await reverseFinanceEntry(logId, session.user.id);
      await createFinanceEntry({
        userId: session.user.id,
        amount: Number(log.amount),
        description: getTransportDescription("fuel", vehicle.name),
        category: "Transporte",
        subCategory: "Combustible",
        date: log.date,
        sourceModule: "transport",
        sourceId: log.id,
        paymentType: paymentType || (log.debtId ? "credit_card" : "account"),
        accountId: log.accountId,
        subAccountId: log.subAccountId,
        debtId: log.debtId,
        installmentCount: log.installmentCount,
        notes: log.station ? `Gasolinera: ${log.station}` : log.notes,
        vehicleName: vehicle.name,
      });
    }

    return NextResponse.json(log);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update fuel log error:", error);
    return NextResponse.json({ error: "Error al actualizar registro de combustible" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; logId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, logId } = await params;

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    const existing = await db.fuelLog.findFirst({
      where: { id: logId, vehicleId: id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    // ── Capture finance data before deletion ──
    const fuelLogFinance = await db.fuelLog.findFirst({
      where: { id: logId },
      select: { debtId: true, amount: true, accountId: true },
    });

    // ── Step 1: Reverse account-based finance entry ──
    // This restores account balance, budget spent, and deletes the transaction
    const reversedLinkedInstallments = await reverseFinanceEntry(logId, session.user.id);

    // ── Step 2: Reverse CC installment if applicable ──
    if (fuelLogFinance?.debtId && reversedLinkedInstallments === 0) {
      await reverseUnpaidCreditInstallmentByAmount({
        userId: session.user.id,
        debtId: fuelLogFinance.debtId,
        totalAmount: Number(fuelLogFinance.amount),
      });
    }

    // ── Step 3: Delete the fuel log record itself ──
    await db.fuelLog.delete({ where: { id: logId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete fuel log error:", error);
    return NextResponse.json({ error: "Error al eliminar registro de combustible" }, { status: 500 });
  }
}
