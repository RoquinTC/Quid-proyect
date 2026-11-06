import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { classifyCapture, isMovement } from "@/lib/inbox/classify";
import { parseCapture } from "@/lib/inbox/parse";

/**
 * F-22 · Puerta de entrada por correo.
 *
 * No guarda contraseñas de correo ni habla IMAP: recibe el mensaje ya
 * extraído, por HTTP y con un token propio por usuario. Así funciona con
 * Gmail, Outlook o con cualquier cosa que sepa hacer un POST (un filtro de
 * Gmail, un script con `himalaya`, Zapier, un cron propio).
 *
 *   POST /api/inbox/email
 *   x-inbox-token: <token del usuario>
 *   { "subject": "...", "from": "...", "text": "...", "receivedAt": "..." }
 *
 * Reutiliza el mismo pipeline que los SMS: clasificador, parser, deduplicación
 * y reglas. La bandeja no distingue de dónde vino, solo lo muestra.
 */

/** Tope de tamaño: un correo de banco nunca pasa de aquí. */
const MAX_TEXT_LENGTH = 20_000;

/** Quita etiquetas y espacios repetidos cuando solo llega HTML. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    // El token viaja en cabecera (preferido) o en la URL, para los servicios
    // que solo permiten configurar una URL.
    const headerToken = req.headers.get("x-inbox-token");
    const queryToken = new URL(req.url).searchParams.get("token");
    const token = headerToken || queryToken;

    if (!token) {
      return NextResponse.json({ error: "Falta el token" }, { status: 401 });
    }

    const settings = await db.userSettings.findFirst({
      where: { inboxEmailToken: token },
      select: { userId: true, inboxEmailEnabled: true },
    });

    if (!settings) {
      return NextResponse.json({ error: "Token no válido" }, { status: 401 });
    }

    if (!settings.inboxEmailEnabled) {
      return NextResponse.json(
        { error: "La captura por correo está desactivada" },
        { status: 403 }
      );
    }

    let body: {
      subject?: string;
      from?: string;
      text?: string;
      html?: string;
      receivedAt?: string | number;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
    }

    const from = String(body.subject || "").trim();
    const sender = String(body.from || "").trim();
    const rawBody = body.text
      ? String(body.text)
      : body.html
        ? htmlToText(String(body.html))
        : "";

    // El asunto suele traer el dato clave ("Pago tarjeta", "Factura Movistar"),
    // así que se analiza junto con el cuerpo.
    const rawText = [from, sender && `De: ${sender}`, rawBody.trim()]
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_TEXT_LENGTH);

    if (!rawText.trim()) {
      return NextResponse.json({ error: "El correo llegó vacío" }, { status: 400 });
    }

    const capturedAt = body.receivedAt ? new Date(body.receivedAt) : new Date();
    const reference = Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt;

    const classification = classifyCapture(rawText);
    if (!isMovement(classification)) {
      return NextResponse.json(
        { skipped: true, reason: classification.reason, noiseReason: classification.noiseReason ?? null },
        { status: 200 }
      );
    }

    const already = await db.inboxItem.findFirst({
      where: { userId: settings.userId, rawText },
      select: { id: true },
    });
    if (already) {
      return NextResponse.json({ duplicate: true, itemId: already.id }, { status: 200 });
    }

    const parsed = parseCapture(rawText, reference);

    const item = await db.inboxItem.create({
      data: {
        userId: settings.userId,
        source: "email",
        rawText,
        parsedAmount: parsed.amount,
        parsedType: classification.kind,
        parsedDate: parsed.date ? new Date(`${parsed.date}T12:00:00`) : null,
        parsedMerchant: parsed.merchant,
        confidence: parsed.confidence,
        notes: classification.cashWithdrawal ? "retiro_efectivo" : null,
        status: "pending",
        receivedAt: reference,
      },
      select: { id: true },
    });

    return NextResponse.json({ created: true, itemId: item.id, amount: parsed.amount }, { status: 201 });
  } catch (error) {
    console.error("Inbox email error:", error);
    return NextResponse.json({ error: "Error al recibir el correo" }, { status: 500 });
  }
}

/**
 * Genera (o devuelve) el token del usuario para la captura por correo.
 * Solo desde la app con sesión: el token no se puede adivinar.
 */
export async function GET() {
  try {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("@/lib/auth");
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const settings = await db.userSettings.findUnique({
      where: { userId: session.user.id },
      select: { inboxEmailToken: true, inboxEmailEnabled: true },
    });

    if (settings?.inboxEmailToken) {
      return NextResponse.json({
        token: settings.inboxEmailToken,
        enabled: settings.inboxEmailEnabled,
      });
    }

    // Se crea una sola vez por usuario.
    const token = randomBytes(24).toString("hex");
    await db.userSettings.update({
      where: { userId: session.user.id },
      data: { inboxEmailToken: token },
    });

    return NextResponse.json({ token, enabled: settings?.inboxEmailEnabled ?? false });
  } catch (error) {
    console.error("Inbox email token error:", error);
    return NextResponse.json({ error: "Error al generar el token" }, { status: 500 });
  }
}
