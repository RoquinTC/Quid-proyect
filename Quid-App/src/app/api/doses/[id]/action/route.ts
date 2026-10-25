import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  dismissDose,
  reopenDose,
  skipDose,
  snoozeDose,
  takeDose,
} from "@/lib/health/dose-actions";
import { validateBody, doseActionSchema } from "@/lib/validations";

/**
 * POST /api/doses/[id]/action
 *
 * Única puerta de entrada para las acciones de una toma. La usan la UI y la
 * notificación nativa (botones Tomar / Omitir / +5 min), de modo que ambos
 * caminos comparten exactamente la misma lógica y el mismo registro.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, doseActionSchema);
    const userId = session.user.id;
    const at = body.at ? new Date(body.at) : undefined;

    switch (body.action) {
      case "take": {
        const dose = await takeDose({ userId, occurrenceId: id, dose: body.dose, at });
        return NextResponse.json({ success: true, dose });
      }
      case "skip": {
        const dose = await skipDose({ userId, occurrenceId: id, note: body.note, at });
        return NextResponse.json({ success: true, dose });
      }
      case "dismiss": {
        const dose = await dismissDose({ userId, occurrenceId: id, at });
        return NextResponse.json({ success: true, dose });
      }
      case "snooze": {
        const dose = await snoozeDose({ userId, occurrenceId: id, minutes: body.minutes, at });
        return NextResponse.json({ success: true, dose });
      }
      case "reopen": {
        const dose = await reopenDose({ userId, occurrenceId: id });
        return NextResponse.json({ success: true, dose });
      }
      default:
        return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Error aplicando la acción";
    console.error("Dose action error:", error);
    // Errores de negocio (toma cerrada, máximo de snoozes) → 409, no 500.
    const status = /no encontrada|ya está cerrada|no permitida|pospuso|inválida/i.test(message)
      ? 409
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
