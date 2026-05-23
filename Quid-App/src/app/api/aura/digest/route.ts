import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { createAndPushNotification } from "@/lib/push";

export const dynamic = "force-dynamic";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function isTrustedAuraRequest(req: NextRequest) {
  const auraToken = req.headers.get("x-aura-token");
  const authHeader = req.headers.get("authorization");
  return (
    (Boolean(process.env.AURA_API_KEY) && auraToken === process.env.AURA_API_KEY) ||
    (Boolean(process.env.CRON_SECRET) && authHeader === `Bearer ${process.env.CRON_SECRET}`)
  );
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function buildMessage(input: {
  recurring: Array<{ description: string; amount: unknown; type: string }>;
  appointments: Array<{ specialty: string | null; doctorName: string | null; location: string | null }>;
}) {
  const lines = ["Buenos días. Este es tu radar de hoy:"];

  if (input.recurring.length > 0) {
    lines.push("");
    lines.push("Pagos e ingresos:");
    for (const item of input.recurring.slice(0, 6)) {
      const label = item.type === "income" ? "Ingreso" : "Pago";
      lines.push(`- ${label}: ${item.description} por ${COP.format(toNumber(item.amount))}`);
    }
  }

  if (input.appointments.length > 0) {
    lines.push("");
    lines.push("Salud:");
    for (const item of input.appointments.slice(0, 4)) {
      const title = item.specialty || "Cita médica";
      const doctor = item.doctorName ? ` con ${item.doctorName}` : "";
      const location = item.location ? ` en ${item.location}` : "";
      lines.push(`- ${title}${doctor}${location}`);
    }
  }

  lines.push("");
  lines.push("Cuando confirmes algo, dime y lo registro en Quid.");
  return lines.join("\n");
}

async function handleDigest(req: NextRequest) {
  if (!isTrustedAuraRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { start, end } = todayRange();
  const users = await db.user.findMany({
    where: { telegramId: { not: null } },
    select: { id: true, telegramId: true, name: true },
  });

  const digests: Array<{
    userId: string;
    telegramId: string | null;
    name: string;
    message: string;
  }> = [];

  for (const user of users) {
    const [existing, recurring, appointments] = await Promise.all([
      db.appNotification.findFirst({
        where: {
          userId: user.id,
          type: "aura_daily_digest",
          createdAt: { gte: start, lt: end },
        },
      }),
      db.recurringPayment.findMany({
        where: {
          userId: user.id,
          status: "pending",
          scheduledDate: { gte: start, lt: end },
        },
        orderBy: { scheduledDate: "asc" },
        select: { description: true, amount: true, actualAmount: true, type: true },
      }),
      db.medicalAppointment.findMany({
        where: {
          userId: user.id,
          status: "scheduled",
          reminderEnabled: true,
          date: { gte: start, lt: end },
        },
        orderBy: { date: "asc" },
        select: { specialty: true, doctorName: true, location: true },
      }),
    ]);

    if (existing || (recurring.length === 0 && appointments.length === 0)) continue;

    const message = buildMessage({
      recurring: recurring.map((item) => ({
        description: item.description,
        amount: item.actualAmount ?? item.amount,
        type: item.type,
      })),
      appointments,
    });

    await createAndPushNotification({
      userId: user.id,
      type: "aura_daily_digest",
      title: "Aura: radar de hoy",
      message,
      pushBody: "Tienes pendientes para hoy en Quid.",
      url: "/",
      data: { source: "aura_digest" },
    });

    digests.push({
      userId: user.id,
      telegramId: user.telegramId,
      name: user.name,
      message,
    });
  }

  return NextResponse.json({ success: true, count: digests.length, digests });
}

export async function GET(req: NextRequest) {
  return handleDigest(req);
}

export async function POST(req: NextRequest) {
  return handleDigest(req);
}
