import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

type ImportResult = {
  total: number;
  created: number;
  skipped: number;
  fuelLogs: number;
  maintenanceRecords: number;
  documents: number;
  errors: string[];
};

type Row = Record<string, unknown>;

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function text(row: Row, key: string) {
  return String(row[key] ?? "").trim();
}

function number(row: Row, key: string) {
  const raw = row[key];
  if (typeof raw === "number") return raw;
  return Number(String(raw ?? "").replace(/\./g, "").replace(",", ".")) || 0;
}

function boolean(row: Row, key: string, defaultValue = true) {
  const value = normalize(row[key]);
  if (!value) return defaultValue;
  return ["si", "sí", "true", "1", "yes", "x"].includes(value);
}

function date(row: Row, key: string): Date | null {
  const raw = row[key];
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d) : null;
  }
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizedRows(ws: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<Row>(ws, { defval: "" }).map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value]))
  );
}

function message(sheet: string, row: number, detail: string) {
  return `${sheet}, fila ${row + 2}: ${detail}`;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecciona un archivo Excel" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo supera el máximo de 5 MB" }, { status: 400 });
    }

    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true });
    const vehicles = await db.vehicle.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, currentKm: true },
    });
    const vehicleMap = new Map(vehicles.map((vehicle) => [normalize(vehicle.name), vehicle]));
    const maxKm = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.currentKm]));
    const result: ImportResult = {
      total: 0,
      created: 0,
      skipped: 0,
      fuelLogs: 0,
      maintenanceRecords: 0,
      documents: 0,
      errors: [],
    };

    const vehicleFor = (row: Row, sheet: string, index: number) => {
      const name = text(row, "vehiculo");
      const vehicle = vehicleMap.get(normalize(name));
      if (!vehicle) result.errors.push(message(sheet, index, `vehículo "${name}" no existe en QUID`));
      return vehicle;
    };

    for (const sheetName of wb.SheetNames) {
      const sheetKey = normalize(sheetName);
      const ws = wb.Sheets[sheetName];
      if (!ws || ["instrucciones", "vehiculos"].includes(sheetKey)) continue;
      const rows = normalizedRows(ws);

      if (sheetKey === "combustible") {
        for (const [index, row] of rows.entries()) {
          result.total++;
          const vehicle = vehicleFor(row, sheetName, index);
          const recordDate = date(row, "fecha");
          const km = number(row, "kilometraje");
          const amount = number(row, "costo_total");
          const pricePerGallon = number(row, "precio_por_galon");
          const gallons = number(row, "galones") || (pricePerGallon > 0 ? amount / pricePerGallon : 0);
          if (!vehicle || !recordDate || km < 0 || amount <= 0 || pricePerGallon <= 0 || gallons <= 0) {
            result.skipped++;
            if (vehicle) result.errors.push(message(sheetName, index, "revisa fecha, kilometraje, costo, precio por galón y galones"));
            continue;
          }
          const exists = await db.fuelLog.findFirst({ where: { vehicleId: vehicle.id, date: recordDate, km } });
          if (exists) {
            result.skipped++;
            continue;
          }
          await db.fuelLog.create({
            data: {
              vehicleId: vehicle.id,
              date: recordDate,
              km,
              amount,
              pricePerGallon,
              gallons: Math.round(gallons * 1000) / 1000,
              isFullTank: boolean(row, "tanque_lleno"),
              station: text(row, "estacion") || null,
              notes: text(row, "notas") || null,
            },
          });
          maxKm.set(vehicle.id, Math.max(maxKm.get(vehicle.id) || 0, km));
          result.created++;
          result.fuelLogs++;
        }
      } else if (sheetKey === "mantenimientos") {
        for (const [index, row] of rows.entries()) {
          result.total++;
          const vehicle = vehicleFor(row, sheetName, index);
          const recordDate = date(row, "fecha");
          const km = number(row, "kilometraje");
          const cost = number(row, "costo_total");
          const description = text(row, "descripcion") || text(row, "tipo");
          const type = text(row, "tipo") || "other";
          if (!vehicle || !recordDate || km < 0 || cost < 0 || !description) {
            result.skipped++;
            if (vehicle) result.errors.push(message(sheetName, index, "revisa fecha, kilometraje, costo y descripción"));
            continue;
          }
          const exists = await db.maintenanceRecord.findFirst({
            where: { vehicleId: vehicle.id, date: recordDate, km, description },
          });
          if (exists) {
            result.skipped++;
            continue;
          }
          await db.maintenanceRecord.create({
            data: {
              vehicleId: vehicle.id,
              date: recordDate,
              km,
              cost,
              type,
              description,
              nextDueKm: number(row, "proximo_km") || null,
              nextDueDate: date(row, "proxima_fecha"),
              reminderEnabled: boolean(row, "recordatorio_activo", false),
            },
          });
          maxKm.set(vehicle.id, Math.max(maxKm.get(vehicle.id) || 0, km));
          result.created++;
          result.maintenanceRecords++;
        }
      } else if (sheetKey === "documentos") {
        for (const [index, row] of rows.entries()) {
          result.total++;
          const vehicle = vehicleFor(row, sheetName, index);
          const issueDate = date(row, "fecha_emision");
          const expiryDate = date(row, "fecha_vencimiento");
          const type = text(row, "tipo") || "otro";
          if (!vehicle || !issueDate || !expiryDate) {
            result.skipped++;
            if (vehicle) result.errors.push(message(sheetName, index, "revisa fecha de emisión y vencimiento"));
            continue;
          }
          const exists = await db.vehicleDocument.findFirst({ where: { vehicleId: vehicle.id, type, issueDate } });
          if (exists) {
            result.skipped++;
            continue;
          }
          await db.vehicleDocument.create({
            data: {
              vehicleId: vehicle.id,
              type,
              documentNumber: text(row, "numero_documento") || null,
              issueDate,
              expiryDate,
              cost: number(row, "costo_total"),
              reminderDays: number(row, "recordar_dias_antes") || 30,
              reminderEnabled: boolean(row, "recordatorio_activo"),
              notes: text(row, "notas") || null,
            },
          });
          result.created++;
          result.documents++;
        }
      } else {
        result.errors.push(`Hoja "${sheetName}": no reconocida. Usa la plantilla descargada desde QUID.`);
      }
    }

    for (const [vehicleId, currentKm] of maxKm) {
      await db.vehicle.update({ where: { id: vehicleId }, data: { currentKm } });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Transport history import error:", error);
    return NextResponse.json({ error: "No se pudo importar el historial de transporte" }, { status: 500 });
  }
}
