import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, vehicleUpdateSchema } from "@/lib/validations";
import { calculateFuelLevel } from "@/lib/fuel-level";
import { toNumber } from "@/lib/decimal-serializer";
import { reverseFinanceEntry } from "@/lib/transport-finance";

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

    return NextResponse.json(vehicle);
  } catch (error) {
    console.error("Get vehicle error:", error);
    return NextResponse.json({ error: "Error al obtener vehículo" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, vehicleUpdateSchema);
    const { name, type, brand, model, year, color, tankCapacity, fuelType, currentKm, icon, plate } = body;

    const existing = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    const vehicle = await db.vehicle.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(brand !== undefined && { brand }),
        ...(model !== undefined && { model }),
        ...(year !== undefined && { year }),
        ...(color !== undefined && { color }),
        ...(tankCapacity !== undefined && { tankCapacity }),
        ...(fuelType !== undefined && { fuelType }),
        ...(currentKm !== undefined && { currentKm }),
        ...(icon !== undefined && { icon }),
        ...(plate !== undefined && { plate }),
      },
      include: {
        fuelLogs: { orderBy: { date: "desc" } },
        maintenanceRecords: { orderBy: { date: "desc" } },
      },
    });

    return NextResponse.json(vehicle);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update vehicle error:", error);
    return NextResponse.json({ error: "Error al actualizar vehículo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
      include: {
        fuelLogs: { select: { id: true } },
        maintenanceRecords: { select: { id: true } },
        documents: { select: { id: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    // Reverse all finance entries BEFORE deleting the vehicle (cascade delete would orphans them)
    for (const log of existing.fuelLogs) {
      await reverseFinanceEntry(log.id, session.user.id);
    }
    for (const rec of existing.maintenanceRecords) {
      await reverseFinanceEntry(rec.id, session.user.id);
    }
    for (const doc of existing.documents) {
      await reverseFinanceEntry(doc.id, session.user.id);
    }

    await db.vehicle.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete vehicle error:", error);
    return NextResponse.json({ error: "Error al eliminar vehículo" }, { status: 500 });
  }
}
