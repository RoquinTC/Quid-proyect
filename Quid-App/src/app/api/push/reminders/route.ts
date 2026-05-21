import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runServerReminders } from "@/lib/server-reminders";

function hasCronAccess(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = req.headers.get("authorization");
  const token = req.nextUrl.searchParams.get("token");

  return authHeader === `Bearer ${secret}` || token === secret;
}

async function canRun(req: NextRequest) {
  if (hasCronAccess(req)) return true;

  const session = await getServerSession(authOptions);
  return !!session?.user?.id;
}

async function handleReminders(req: NextRequest) {
  try {
    const allowed = await canRun(req);
    if (!allowed) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const result = await runServerReminders();
    return NextResponse.json({ success: true, ...result });
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
