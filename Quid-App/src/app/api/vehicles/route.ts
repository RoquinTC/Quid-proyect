import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, vehicleCreateSchema } from "@/lib/validations";
import { calculateFuelLevel } from "@/lib/fuel-level";
import { toNumber } from "@/lib/decimal-serializer";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const vehicles = await db.vehicle.findMany({
      where: { userId: session.user.id },
      include: {
        fuelLogs: { orderBy: { date: "desc" } },
        maintenanceRecords: {
          orderBy: { date: "desc" },
          include: { items: true },
        },
        documents: {
          orderBy: { expiryDate: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Compute fuel level for each vehicle and attach it to the response
    const vehiclesWithFuelLevel = vehicles.map((vehicle) => {
      const { fuelLogs, maintenanceRecords, documents, ...vehicleData } = vehicle;

      // Serialize Decimal fields
      const serializedLogs = fuelLogs.map((log) => ({
        ...log,
        amount: toNumber(log.amount),
        pricePerGallon: toNumber(log.pricePerGallon),
        date: log.date.toISOString(),
        createdAt: log.createdAt?.toISOString(),
      }));

      const serializedMaintenance = maintenanceRecords.map((rec) => ({
        ...rec,
        cost: toNumber(rec.cost),
        date: rec.date.toISOString(),
        nextDueDate: rec.nextDueDate?.toISOString() ?? null,
        createdAt: rec.createdAt?.toISOString(),
        updatedAt: rec.updatedAt?.toISOString(),
        items: rec.items?.map((item) => ({
          ...item,
          unitPrice: toNumber(item.unitPrice),
          totalPrice: toNumber(item.totalPrice),
        })) || [],
      }));

      const serializedDocuments = documents.map((doc) => ({
        ...doc,
        cost: toNumber(doc.cost),
        issueDate: doc.issueDate.toISOString(),
        expiryDate: doc.expiryDate.toISOString(),
        createdAt: doc.createdAt?.toISOString(),
        updatedAt: doc.updatedAt?.toISOString(),
      }));

      // Calculate fuel level using shared utility
      const fuelLevelData = calculateFuelLevel(
        {
          tankCapacity: vehicle.tankCapacity,
          currentKm: vehicle.currentKm,
          type: vehicle.type,
        },
        fuelLogs.map((log) => ({
          id: log.id,
          date: log.date,
          km: log.km,
          amount: toNumber(log.amount),
          pricePerGallon: toNumber(log.pricePerGallon),
          gallons: log.gallons,
          isFullTank: log.isFullTank,
        }))
      );

      return {
        ...vehicleData,
        currentKm: vehicle.currentKm,
        tankCapacity: vehicle.tankCapacity,
        year: vehicle.year,
        fuelLogs: serializedLogs.slice(0, 10), // Up to 10 recent fuel logs for the card view
        maintenanceRecords: serializedMaintenance,
        documents: serializedDocuments,
        fuelLevel: fuelLevelData.fuelLevel,
        currentFuel: fuelLevelData.currentFuel,
        estimatedRange: fuelLevelData.estimatedRange,
        avgKmPerGallon: fuelLevelData.avgKmPerGallon,
        anomalyDetected: fuelLevelData.anomalyDetected,
        // Smart refuel prediction fields
        avgKmPerDay: fuelLevelData.avgKmPerDay,
        daysUntilRefuel: fuelLevelData.daysUntilRefuel,
        refuelByDate: fuelLevelData.refuelByDate,
        gallonsToRefuel: fuelLevelData.gallonsToRefuel,
        isLowFuel: fuelLevelData.isLowFuel,
        isLearning: fuelLevelData.isLearning,
        lastPricePerGallon: fuelLevelData.lastPricePerGallon,
      };
    });

    return NextResponse.json(vehiclesWithFuelLevel);
  } catch (error) {
    console.error("Get vehicles error:", error);
    return NextResponse.json({ error: "Error al obtener vehículos" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await validateBody(req, vehicleCreateSchema);
    const { name, type, brand, model, year, color, tankCapacity, fuelType, currentKm, icon, plate } = body;

    const vehicle = await db.vehicle.create({
      data: {
        userId: session.user.id,
        name,
        type: type || "motorcycle",
        brand,
        model,
        year,
        color,
        tankCapacity,
        fuelType: fuelType || "gasoline",
        currentKm: currentKm ?? 0,
        icon: icon || null,
        plate: plate || null,
      },
      include: {
        fuelLogs: true,
        maintenanceRecords: true,
      },
    });

    // Compute fuel level for consistent response shape (same as GET /api/vehicles)
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

    // Serialize to match GET response shape
    const { fuelLogs, maintenanceRecords, ...vehicleData } = vehicle;
    const serializedVehicle = {
      ...vehicleData,
      fuelLogs: [],
      maintenanceRecords: [],
      fuelLevel: fuelLevelData.fuelLevel,
      currentFuel: fuelLevelData.currentFuel,
      estimatedRange: fuelLevelData.estimatedRange,
      avgKmPerGallon: fuelLevelData.avgKmPerGallon,
      anomalyDetected: fuelLevelData.anomalyDetected,
      lastPricePerGallon: fuelLevelData.lastPricePerGallon,
    };

    return NextResponse.json(serializedVehicle, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create vehicle error:", error);
    return NextResponse.json({ error: "Error al crear vehículo" }, { status: 500 });
  }
}
