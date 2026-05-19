import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, vehicleDocumentCreateSchema } from "@/lib/validations";
import {
  createFinanceEntry,
  getTransportDescription,
  getTransportSubCategory,
} from "@/lib/transport-finance";
import { DOCUMENT_TYPES } from "@/lib/types/transport";

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

    const documents = await db.vehicleDocument.findMany({
      where: { vehicleId: id },
      orderBy: { expiryDate: "desc" },
    });

    // Enrich with status info
    const now = new Date();
    const enriched = documents.map(doc => {
      const expiryDate = doc.expiryDate ? new Date(doc.expiryDate) : null;
      const daysUntilExpiry = expiryDate
        ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 9999;
      const isExpired = daysUntilExpiry < 0;
      const isExpiringSoon = !isExpired && daysUntilExpiry <= 30;
      const status = isExpired ? "expired" : isExpiringSoon ? "expiring_soon" : "valid";

      return {
        ...doc,
        _status: status,
        _daysUntilExpiry: daysUntilExpiry,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Get vehicle documents error:", error);
    return NextResponse.json({ error: "Error al obtener documentos del vehículo" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, vehicleDocumentCreateSchema);
    const {
      type, documentNumber, issueDate, expiryDate, cost,
      reminderDays, reminderEnabled,
      paymentType, accountId, subAccountId, debtId, installmentCount, notes,
    } = body;

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    // Deactivate previous documents of the same type (only one active per type per vehicle)
    // We keep the old ones for history but they're no longer "current"
    const docTypeLabel = DOCUMENT_TYPES.find(d => d.value === type)?.label || type;

    const document = await db.vehicleDocument.create({
      data: {
        vehicleId: id,
        type,
        documentNumber: documentNumber || null,
        issueDate: createColombiaDate(issueDate.split("T")[0]),
        expiryDate: createColombiaDate(expiryDate.split("T")[0]),
        cost,
        reminderDays: reminderDays || 30,
        reminderEnabled: reminderEnabled ?? true,
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        debtId: debtId || null,
        installmentCount: installmentCount || null,
        notes,
      },
    });

    // Create finance entry with full integration
    const subCategory = getTransportSubCategory("document", type);
    const financeResult = await createFinanceEntry({
      userId: session.user.id,
      amount: cost,
      description: getTransportDescription("document", vehicle.name, vehicle.type, docTypeLabel),
      category: "Transporte",
      subCategory,
      date: createColombiaDate(issueDate.split("T")[0]),
      sourceModule: "transport",
      sourceId: document.id,
      paymentType: paymentType || "account",
      accountId,
      subAccountId,
      debtId,
      installmentCount,
      notes: documentNumber ? `Documento #: ${documentNumber}` : notes,
      vehicleName: vehicle.name,
    });

    return NextResponse.json({
      ...document,
      _finance: financeResult,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create vehicle document error:", error);
    return NextResponse.json({ error: "Error al crear documento del vehículo" }, { status: 500 });
  }
}
