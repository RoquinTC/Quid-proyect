import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runServerReminders, runServerRemindersForUser } from "@/lib/server-reminders";

function hasCronAccess(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.get("authorization");
  const token = req.nextUrl.searchParams.get("token");

  return authHeader === `Bearer ${secret}` || token === secret;
}

async function handleReminders(req: NextRequest) {
  try {
    // El cron procesa a todos; una sesión normal solo puede disparar los suyos.
    if (hasCronAccess(req)) {
      const result = await runServerReminders();
      return NextResponse.json({ success: true, scope: "all", ...result });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const result = await runServerRemindersForUser(session.user.id);
    return NextResponse.json({ success: true, scope: "user", ...result });
  } catch (error) {
    console.error("Server reminders error:", error);
    return NextResponse.json(
      { error: "Error al procesar recordatorios" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleReminders(req);
}

export async function POST(req: NextRequest) {
  return handleReminders(req);
}
