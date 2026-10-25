import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteOverride } from "@/lib/health/dose-overrides";

/** DELETE /api/overrides/[id] — quita la excepción y vuelve al patrón base. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const result = await deleteOverride(session.user.id, id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Error borrando la excepción";
    console.error("Delete override error:", error);
    return NextResponse.json(
      { error: message },
      { status: /no encontrada/i.test(message) ? 404 : 500 },
    );
  }
}
