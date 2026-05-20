import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, vehicleDocumentUpdateSchema } from "@/lib/validations";
import {
  createFinanceEntry,
  getTransportDescription,
  getTransportSubCategory,
} from "@/lib/transport-finance";
import { DOCUMENT_TYPES } from "@/lib/types/transport";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: vehicleId, documentId } = await params;
    const body = await validateBody(req, vehicleDocumentUpdateSchema);
    const {
      type, documentNumber, issueDate, expiryDate, cost,
      skipFinanceEntry,
      reminderDays, reminderEnabled,
      paymentType, accountId, subAccountId, debtId, installmentCount, notes,
    } = body;

    // Verify vehicle ownership
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    // Verify document exists and belongs to vehicle
    const existing = await db.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (type !== undefined) updateData.type = type;
    if (documentNumber !== undefined) updateData.documentNumber = documentNumber || null;
    if (issueDate !== undefined) updateData.issueDate = new Date(issueDate.split("T")[0] + "T00:00:00");
    if (expiryDate !== undefined) updateData.expiryDate = new Date(expiryDate.split("T")[0] + "T00:00:00");
    if (cost !== undefined) updateData.cost = cost;
    if (reminderDays !== undefined) updateData.reminderDays = reminderDays;
    if (reminderEnabled !== undefined) updateData.reminderEnabled = reminderEnabled;
    if (notes !== undefined) updateData.notes = notes || null;

    // Handle finance fields — if skipping, clear them
    if (skipFinanceEntry) {
      updateData.accountId = null;
      updateData.subAccountId = null;
      updateData.debtId = null;
      updateData.installmentCount = null;
      updateData.cost = 0;
    } else {
      if (accountId !== undefined) updateData.accountId = accountId || null;
      if (subAccountId !== undefined) updateData.subAccountId = subAccountId || null;
      if (debtId !== undefined) updateData.debtId = debtId || null;
      if (installmentCount !== undefined) updateData.installmentCount = installmentCount || null;
    }

    const document = await db.vehicleDocument.update({
      where: { id: documentId },
      data: updateData,
    });

    return NextResponse.json(document);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update vehicle document error:", error);
    return NextResponse.json({ error: "Error al actualizar documento del vehículo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: vehicleId, documentId } = await params;

    // Verify vehicle ownership
    const vehicle = await db.vehicle.findFirst({
      where: { id: vehicleId, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    // Verify document exists and belongs to vehicle
    const existing = await db.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }

    // Reverse finance entry if one exists (cost > 0 and has accountId or debtId)
    if (Number(existing.cost) > 0 && (existing.accountId || existing.debtId)) {
      try {
        const { reverseFinanceEntry } = await import("@/lib/transport-finance");
        await reverseFinanceEntry(documentId, session.user.id);
      } catch (reverseError) {
        console.error("Error reversing finance entry for document:", reverseError);
        // Continue with deletion even if reverse fails
      }
    }

    // Delete the document
    await db.vehicleDocument.delete({
      where: { id: documentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete vehicle document error:", error);
    return NextResponse.json({ error: "Error al eliminar documento del vehículo" }, { status: 500 });
  }
}
