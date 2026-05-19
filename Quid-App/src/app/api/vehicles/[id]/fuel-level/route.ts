import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateFuelLevel } from "@/lib/fuel-level";
import { toNumber } from "@/lib/decimal-serializer";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
      include: {
        fuelLogs: {
          orderBy: { date: "desc" },
        },
      },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    // Use shared calculation utility
    const fuelLevelData = calculateFuelLevel(
      {
        tankCapacity: vehicle.tankCapacity,
        currentKm: vehicle.currentKm,
        type: vehicle.type,
      },
      vehicle.fuelLogs.map((log) => ({
        id: log.id,
        date: log.date,
        km: log.km,
        amount: toNumber(log.amount),
        pricePerGallon: toNumber(log.pricePerGallon),
        gallons: log.gallons,
        isFullTank: log.isFullTank,
      }))
    );

    return NextResponse.json(fuelLevelData);
  } catch (error) {
    console.error("Get fuel level error:", error);
    return NextResponse.json({ error: "Error al calcular nivel de combustible" }, { status: 500 });
  }
}
