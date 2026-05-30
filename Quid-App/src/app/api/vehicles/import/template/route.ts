import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

const SHEETS = {
  combustible: [
    "vehiculo",
    "fecha",
    "kilometraje",
    "costo_total",
    "precio_por_galon",
    "galones",
    "tanque_lleno",
    "estacion",
    "notas",
  ],
  mantenimientos: [
    "vehiculo",
    "fecha",
    "kilometraje",
    "tipo",
    "descripcion",
    "costo_total",
    "proximo_km",
    "proxima_fecha",
    "recordatorio_activo",
  ],
  documentos: [
    "vehiculo",
    "tipo",
    "numero_documento",
    "fecha_emision",
    "fecha_vencimiento",
    "costo_total",
    "recordar_dias_antes",
    "recordatorio_activo",
    "notas",
  ],
};

function addSheet(wb: XLSX.WorkBook, name: string, headers: string[]) {
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = headers.map((header) => ({
    wch: Math.max(14, Math.min(26, header.length + 3)),
  }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const vehicles = await db.vehicle.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      select: { name: true, plate: true, type: true, currentKm: true },
    });

    const wb = XLSX.utils.book_new();
    const instructions = [
      ["PLANTILLA DE CARGUE HISTÓRICO DE TRANSPORTE"],
      ["Uso", "Completa solamente las hojas que necesites y conserva los encabezados."],
      ["Vehículo", "Escribe exactamente el nombre registrado en QUID. Consulta la hoja Vehículos."],
      ["Fechas", "Usa el formato AAAA-MM-DD. También se aceptan fechas válidas de Excel."],
      ["Importante", "La carga histórica NO modifica saldos de cuentas, tarjetas ni presupuestos."],
      ["Duplicados", "QUID omite registros que ya existan con la misma fecha, vehículo y kilometraje."],
      ["Combustible", "Si dejas galones vacíos, QUID los calcula como costo_total / precio_por_galon."],
      ["Mantenimiento", "Tipos sugeridos: oil_change, tire_change, brake_service, general, parts_replacement, alignment, suspension, transmission, electrical, cooling, ac, battery, inspection, wash, aesthetics, other."],
      ["Documentos", "Tipos sugeridos: soat, tecnomecanica, seguro, impuesto, otro."],
    ];
    const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
    wsInstructions["!cols"] = [{ wch: 20 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Instrucciones");

    const vehicleRows = [
      ["vehiculo", "placa", "tipo", "kilometraje_actual"],
      ...vehicles.map((vehicle) => [
        vehicle.name,
        vehicle.plate || "",
        vehicle.type,
        vehicle.currentKm,
      ]),
    ];
    const wsVehicles = XLSX.utils.aoa_to_sheet(vehicleRows);
    wsVehicles["!cols"] = [{ wch: 28 }, { wch: 15 }, { wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsVehicles, "Vehiculos");

    addSheet(wb, "Combustible", SHEETS.combustible);
    addSheet(wb, "Mantenimientos", SHEETS.mantenimientos);
    addSheet(wb, "Documentos", SHEETS.documentos);

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="quid-plantilla-transporte.xlsx"',
      },
    });
  } catch (error) {
    console.error("Transport template generation error:", error);
    return NextResponse.json({ error: "Error al generar la plantilla" }, { status: 500 });
  }
}
