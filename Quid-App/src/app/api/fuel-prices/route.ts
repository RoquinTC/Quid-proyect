import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, fuelPriceCreateSchema } from "@/lib/validations";
import { toNumber } from "@/lib/decimal-serializer";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const fuelPrices = await db.fuelPrice.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
    });

    const latestLogs = await db.fuelLog.findMany({
      where: {
        vehicle: { userId: session.user.id },
      },
      include: {
        vehicle: { select: { fuelType: true } },
      },
      orderBy: { date: "desc" },
    });

    const knownTypes = new Set(fuelPrices.map((price) => price.fuelType));
    const derivedPrices = latestLogs.flatMap((log) => {
      const fuelType = log.vehicle.fuelType || "gasoline";
      if (knownTypes.has(fuelType)) return [];
      knownTypes.add(fuelType);
      return [{
        id: `derived-${fuelType}`,
        userId: session.user.id,
        fuelType,
        pricePerGallon: toNumber(log.pricePerGallon),
        updatedAt: log.date.toISOString(),
        createdAt: log.date.toISOString(),
        derivedFromLastLog: true,
      }];
    });

    return NextResponse.json([
      ...fuelPrices.map((price) => ({
        ...price,
        pricePerGallon: toNumber(price.pricePerGallon),
      })),
      ...derivedPrices,
    ]);
  } catch (error) {
    console.error("Get fuel prices error:", error);
    return NextResponse.json({ error: "Error al obtener precios de combustible" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await validateBody(req, fuelPriceCreateSchema);
    const { fuelType, pricePerGallon } = body;

    // Upsert: find existing by userId+fuelType or create new
    const existing = await db.fuelPrice.findFirst({
      where: { userId: session.user.id, fuelType: fuelType || "gasoline" },
    });

    let fuelPrice;
    if (existing) {
      fuelPrice = await db.fuelPrice.update({
        where: { id: existing.id },
        data: { pricePerGallon },
      });
    } else {
      fuelPrice = await db.fuelPrice.create({
        data: {
          userId: session.user.id,
          fuelType: fuelType || "gasoline",
          pricePerGallon,
        },
      });
    }

    return NextResponse.json(fuelPrice, { status: existing ? 200 : 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create/update fuel price error:", error);
    return NextResponse.json({ error: "Error al guardar precio de combustible" }, { status: 500 });
  }
}
