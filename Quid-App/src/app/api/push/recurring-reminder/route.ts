import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runServerRemindersForUser } from "@/lib/server-reminders";

/**
 * GET /api/push/recurring-reminder
 *
 * Respaldo del cron: la app lo llama al abrir para que los recordatorios del
 * usuario salgan aunque el cron no haya corrido.
 *
 * No arma sus propios avisos: delega en el mismo motor que el cron para que
 * un pago no se anuncie dos veces (una por cada productor) ni con la fecha
 * corrida un día.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const result = await runServerRemindersForUser(session.user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Recurring reminder error:", error);
    return NextResponse.json(
      { error: "Error al verificar pagos recurrentes" },
      { status: 500 }
    );
  }
}
