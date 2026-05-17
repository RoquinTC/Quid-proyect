import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, fuelLogUpdateSchema } from "@/lib/validations";
import { reverseFinanceEntry } from "@/lib/transport-finance";

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

    const { date, km, amount, pricePerGallon, isFullTank, notes } = body;

    // Calculate new gallons if amount or price changed
    const newAmount = amount !== undefined ? amount : Number(existing.amount);
    const newPricePerGallon = pricePerGallon !== undefined ? pricePerGallon : Number(existing.pricePerGallon);
    const newGallons = newPricePerGallon > 0 ? Math.round((newAmount / newPricePerGallon) * 100) / 100 : Number(existing.gallons);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (date !== undefined && date) {
      updateData.date = createColombiaDate(date.split("T")[0]);
    }
    if (km !== undefined) updateData.km = Number(km);
    if (amount !== undefined) updateData.amount = Number(amount);
    if (pricePerGallon !== undefined) updateData.pricePerGallon = Number(pricePerGallon);
    if (amount !== undefined || pricePerGallon !== undefined) updateData.gallons = newGallons;
    if (isFullTank !== undefined) updateData.isFullTank = isFullTank;
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

    // Update the linked finance transaction if amount changed
    if (amount !== undefined) {
      await db.transaction.updateMany({
        where: { sourceModule: "transport", sourceId: logId },
        data: {
          amount: Number(amount),
        },
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
    await reverseFinanceEntry(logId, session.user.id);

    // ── Step 2: Reverse CC installment if applicable ──
    if (fuelLogFinance?.debtId) {
      // Find unpaid installments linked to this fuel log via sourceModule+sourceId in description
      const installments = await db.installment.findMany({
        where: {
          debtId: fuelLogFinance.debtId,
          isPaid: false,
        },
      });

      // Find the installment that was created for this specific fuel log
      // Match by totalAmount and recent purchaseDate
      const logAmount = Number(fuelLogFinance.amount);
      for (const inst of installments) {
        if (Number(inst.totalAmount) === logAmount) {
          // Decrease CC currentBalance by the installment totalAmount
          await db.debt.update({
            where: { id: inst.debtId },
            data: { currentBalance: { decrement: inst.totalAmount } },
          });
          await db.installment.delete({ where: { id: inst.id } });
          break; // Only reverse the first matching installment
        }
      }
    }

    // ── Step 3: Delete the fuel log record itself ──
    await db.fuelLog.delete({ where: { id: logId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete fuel log error:", error);
    return NextResponse.json({ error: "Error al eliminar registro de combustible" }, { status: 500 });
  }
}
