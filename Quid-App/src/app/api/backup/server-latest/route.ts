import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/backup/server-latest
 *
 * Returns metadata about the latest server-stored backup for the
 * authenticated user. Does NOT return the full backup data (that
 * would be too heavy for a simple status check).
 *
 * Used by:
 * - Auto-backup hook: to check if a backup already exists for today
 * - Backup manager UI: to display "Last backup: ..."
 * - Login restore flow: to detect if there's a server backup available
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    const latest = await db.storedBackup.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        version: true,
        recordCount: true,
        createdAt: true,
      },
    });

    if (!latest) {
      return NextResponse.json({ hasBackup: false });
    }

    return NextResponse.json({
      hasBackup: true,
      id: latest.id,
      version: latest.version,
      recordCount: latest.recordCount,
      createdAt: latest.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Server backup latest error:", error);
    return NextResponse.json(
      { error: "Error al consultar el respaldo" },
      { status: 500 }
    );
  }
}
