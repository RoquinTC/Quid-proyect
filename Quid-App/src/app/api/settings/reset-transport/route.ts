import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Delete all transport data (order matters due to foreign keys)
    await db.fuelLog.deleteMany({ where: { vehicle: { userId } } });
    await db.maintenanceRecord.deleteMany({ where: { vehicle: { userId } } });
    await db.fuelPrice.deleteMany({ where: { userId } });
    await db.vehicle.deleteMany({ where: { userId } });

    // Also delete any transport-related transactions
    await db.transaction.deleteMany({
      where: { userId, sourceModule: "transport" },
    });

    return NextResponse.json({ success: true, message: "Todos los datos de transporte han sido eliminados" });
  } catch (error) {
    console.error("Reset transport data error:", error);
    return NextResponse.json({ error: "Error al eliminar datos de transporte" }, { status: 500 });
  }
}
