import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Find notification and verify ownership
    const notification = await db.appNotification.findUnique({
      where: { id },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notificación no encontrada" },
        { status: 404 }
      );
    }

    if (notification.userId !== session.user.id) {
      return NextResponse.json(
        { error: "No tienes permiso para modificar esta notificación" },
        { status: 403 }
      );
    }

    // Mark as read
    const updated = await db.appNotification.update({
      where: { id },
      data: { read: true },
    });

    // Parse the `data` JSON field before returning
    const parsed = {
      id: updated.id,
      type: updated.type,
      title: updated.title,
      message: updated.message,
      read: updated.read,
      data: updated.data ? JSON.parse(updated.data) : null,
      createdAt: updated.createdAt,
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Mark notification as read error:", error);
    return NextResponse.json(
      { error: "Error al marcar notificación como leída" },
      { status: 500 }
    );
  }
}
