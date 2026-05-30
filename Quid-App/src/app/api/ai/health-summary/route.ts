import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const AURA_MODEL = process.env.AURA_MODEL || "hermes3:8b";
const OLLAMA_API_BASE = process.env.OLLAMA_URL || "http://localhost:11434/api";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const report = await db.healthAiReport.findUnique({
      where: { userId: session.user.id },
    });

    if (!report) {
      return NextResponse.json({ report: null });
    }

    return NextResponse.json({
      report: {
        summary: report.summary,
        source: "ollama",
        model: report.model,
        generatedAt: report.generatedAt.toISOString(),
        cached: true,
      },
    });
  } catch (error) {
    console.error("Error leyendo informe clínico guardado:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({})) as { mode?: "local" | "deep" };
    const mode = body.mode === "deep" ? "deep" : "local";

    const [medications, appointments, authorizations, orders] = await Promise.all([
      db.medication.findMany({
        where: { userId: session.user.id, isActive: true },
        orderBy: { name: "asc" },
      }),
      db.medicalAppointment.findMany({
        where: { userId: session.user.id },
        orderBy: { date: "asc" },
        take: 20,
      }),
      db.medicalAuthorization.findMany({
        where: { userId: session.user.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      db.medicalOrder.findMany({
        where: { userId: session.user.id },
        include: { items: true },
        orderBy: { issueDate: "desc" },
        take: 20,
      }),
    ]);

    const hasHealthContext =
      medications.length > 0 ||
      appointments.length > 0 ||
      authorizations.length > 0 ||
      orders.length > 0;

    // 1. Crear un fallback local inteligente en caso de que Ollama no esté disponible
    const createLocalSummary = () => {
      if (!hasHealthContext) {
        return "Actualmente no tienes datos de salud registrados. Añade medicamentos, citas, autorizaciones u órdenes médicas para obtener un informe personalizado.";
      }

      let text = `### Resumen de salud\n\nTienes registrados **${medications.length} medicamentos activos**, **${appointments.length} citas médicas**, **${authorizations.length} autorizaciones EPS** y **${orders.length} órdenes médicas** recientes.\n\n`;

      const morningMeds = medications.filter(m => m.howToTake === "morning" || m.howToTake === "without_food");
      const nightMeds = medications.filter(m => m.howToTake === "night");
      const foodMeds = medications.filter(m => m.howToTake === "with_food");
      const medsWithoutRoutine = medications.filter((m) => {
        let times: string[] = [];
        try {
          times = m.reminderTimes ? JSON.parse(m.reminderTimes) : [];
        } catch {
          times = [];
        }
        return m.dosage === "Por definir" || (m.reminderEnabled && !["as_needed", "asNeeded"].includes(m.frequency) && times.length === 0);
      });
      const pendingOrders = orders.filter((order) => order.status !== "completed");
      const pendingItems = orders.flatMap((order) => order.items).filter((item) => Number(item.pendingQty) > 0);
      const pendingAuthorizations = authorizations.filter((auth) => auth.status === "pending_authorization");
      const expiringAuthorizations = authorizations.filter((auth) => {
        if (auth.status !== "authorized" || !auth.expirationDate) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiration = new Date(auth.expirationDate);
        expiration.setHours(0, 0, 0, 0);
        const days = Math.ceil((expiration.getTime() - today.getTime()) / 86400000);
        return days <= 7;
      });
      const upcomingAppointments = appointments.filter((appointment) => {
        const date = new Date(appointment.date);
        return appointment.status !== "completed" && appointment.status !== "cancelled" && date >= new Date(Date.now() - 86400000);
      });

      if (medications.length > 0) {
        text += `• **Tratamientos activos:** ${medications.map((m) => `${m.name} (${m.dosage})`).join(", ")}.\n`;
      }

      if (morningMeds.length > 0) {
        text += `• **Rutina de la Mañana:** Es prioritario tomar ${morningMeds.map(m => m.name).join(", ")} al levantarse. `;
        const emptyStomach = morningMeds.filter(m => m.howToTake === "without_food");
        if (emptyStomach.length > 0) {
          text += `Recuerda que ${emptyStomach.map(m => m.name).join(", ")} deben tomarse en **ayunas** (30 minutos antes de alimentos) para garantizar su correcta absorción. `;
        }
        text += `\n`;
      }

      if (foodMeds.length > 0) {
        text += `• **Interacciones con Alimentos:** Medicamentos como ${foodMeds.map(m => m.name).join(", ")} deben administrarse **durante o inmediatamente después de las comidas** para reducir la irritación gástrica.\n`;
      }

      if (nightMeds.length > 0) {
        text += `• **Rutina Nocturna:** Se recomienda tomar ${nightMeds.map(m => m.name).join(", ")} antes de dormir por su efecto sedante o para coincidir con ciclos biológicos.\n`;
      }

      if (medsWithoutRoutine.length > 0) {
        text += `\n• **Medicamentos por configurar:** ${medsWithoutRoutine.map((m) => m.name).join(", ")} necesitan dosis real u horarios para que los recordatorios sean confiables.\n`;
      }

      if (pendingAuthorizations.length > 0) {
        text += `\n• **EPS pendiente:** Tienes ${pendingAuthorizations.length} autorización(es) esperando respuesta. Conviene hacer seguimiento para evitar retrasos en programación.\n`;
      }

      if (expiringAuthorizations.length > 0) {
        text += `\n• **Vencimientos EPS:** ${expiringAuthorizations.map((a) => a.specialty).join(", ")} vencen pronto o ya requieren revisión.\n`;
      }

      if (upcomingAppointments.length > 0) {
        text += `\n• **Citas por atender:** ${upcomingAppointments
          .slice(0, 3)
          .map((a) => `${a.specialty || "Cita médica"} (${a.date.toLocaleDateString("es-CO")})`)
          .join(", ")}.\n`;
      }

      if (pendingOrders.length > 0 || pendingItems.length > 0) {
        text += `\n• **Farmacia:** Hay ${pendingItems.length} medicamento(s) pendiente(s) por reclamar. Revisa entregas parciales y soportes de farmacia.\n`;
      }

      // Advertencias generales basadas en los nombres
      const namesLower = medications.map(m => m.name.toLowerCase());
      const hasAcetaminophen = namesLower.some(n => n.includes("acetaminof") || n.includes("paracetamol"));
      const hasIbuprofen = namesLower.some(n => n.includes("ibuprof") || n.includes("naprox") || n.includes("aspirin"));
      const hasOmeprazole = namesLower.some(n => n.includes("omepraz") || n.includes("pantopraz") || n.includes("esomepraz"));

      if (hasAcetaminophen && hasIbuprofen) {
        text += `\n⚠️ **Alerta de Combinación:** Registras analgésicos concurrentes. Evita duplicar dosis de la misma familia y mantén un intervalo mínimo de 4-6 horas entre tomas para proteger tu hígado y riñones.\n`;
      }
      if (hasIbuprofen && !hasOmeprazole) {
        text += `\n💡 **Recomendación protectora:** Estás tomando antiinflamatorios (AINEs). Considera consultar a tu médico sobre el uso de un protector gástrico si el tratamiento es prolongado.\n`;
      }

      text += `\n*Nota: Este informe fue compilado localmente por Aura con los datos actuales de QUID. Es informativo y no reemplaza criterio médico.*`;
      return text;
    };

    if (mode === "local") {
      return NextResponse.json({
        summary: createLocalSummary(),
        source: "local",
        model: null,
        generatedAt: new Date().toISOString(),
      });
    }

    // 2. Consultar a Ollama solo cuando el usuario solicita un análisis profundo.
    try {
      const medListString = medications.length > 0
        ? medications
          .map(
            (m, idx) =>
              `${idx + 1}. **${m.name}** (${m.dosage}) - Frecuencia: ${m.frequency}, Tomar: ${
                m.howToTake || "No especificado"
              }, Enfermedad: ${m.disease || "No especificada"}`
          )
          .join("\n")
        : "Sin medicamentos activos registrados";
      const appointmentListString = appointments
        .slice(0, 8)
        .map((a, idx) => `${idx + 1}. ${a.specialty || "Cita médica"} - Estado: ${a.status}, Fecha: ${a.date.toISOString()}, Lugar: ${a.location || "No registrado"}`)
        .join("\n") || "Sin citas registradas";
      const authListString = authorizations
        .slice(0, 8)
        .map((a, idx) => `${idx + 1}. ${a.specialty} - Estado: ${a.status}, Vence: ${a.expirationDate?.toISOString() || "Sin vencimiento"}`)
        .join("\n") || "Sin autorizaciones registradas";
      const orderListString = orders
        .slice(0, 8)
        .map((order, idx) => {
          const pending = order.items
            .filter((item) => Number(item.pendingQty) > 0)
            .map((item) => `${item.name}: ${item.pendingQty} ${item.unit}`)
            .join(", ");
          return `${idx + 1}. ${order.title} - Estado: ${order.status}, Pendiente: ${pending || "Nada"}`;
        })
        .join("\n") || "Sin órdenes médicas registradas";

      const systemPrompt = `Eres Aura, un asistente médico inteligente de élite y farmacéutico clínico.
El usuario tiene registrados los siguientes medicamentos activos:
${medListString}

También tiene este contexto operativo en QUID:

Próximas citas / historial:
${appointmentListString}

Autorizaciones EPS:
${authListString}

Órdenes y farmacia:
${orderListString}

Tu objetivo es generar una guía de adherencia clínica personalizada, cálida y profesional en formato Markdown.
Por favor estructura tu respuesta en los siguientes puntos en español:
1. **Resumen de tu Tratamiento**: Breve introducción felicitando al usuario por mantener su control.
2. **Cronograma Diario Recomendado**: Cómo organizar las tomas (ej. mañana en ayunas, tarde, noche) para evitar que coincidan e interfieran entre sí.
3. **Pautas Críticas de Consumo & Alimentos**: Qué medicamentos se toman en ayunas, cuáles con comida, qué alimentos evitar (ej: lácteos con ciertos antibióticos, cafeína).
4. **EPS, Citas y Farmacia**: Señala autorizaciones próximas a vencer, citas que requieren atención y medicamentos pendientes por reclamar.
5. **Advertencias de Seguridad e Interacciones**: Comenta sobre efectos secundarios comunes que debe vigilar o combinaciones de su lista que requieran cuidado.

Sé conciso, empático y estructurado. No utilices jerga excesivamente técnica. Deja claro al final que es una sugerencia informativa y debe validarse con su médico de cabecera.`;

      const response = await fetch(`${OLLAMA_API_BASE.replace(/\/$/, "")}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          model: AURA_MODEL,
          stream: false,
          keep_alive: -1,
          messages: [{ role: "user", content: systemPrompt }],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const content = result.message?.content?.trim() || "";
        if (content && content.length > 100) {
          const report = await db.healthAiReport.upsert({
            where: { userId: session.user.id },
            update: {
              summary: content,
              model: AURA_MODEL,
              generatedAt: new Date(),
            },
            create: {
              userId: session.user.id,
              summary: content,
              model: AURA_MODEL,
            },
          });
          return NextResponse.json({
            summary: content,
            source: "ollama",
            model: AURA_MODEL,
            generatedAt: report.generatedAt.toISOString(),
            cached: false,
          });
        }
      }
    } catch (err) {
      console.error("Error llamando a Ollama para reporte clínico:", err);
    }

    // 3. Fallback en caso de que falle el LLM
    return NextResponse.json({
      summary: createLocalSummary(),
      source: "local",
      model: null,
      generatedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error("Error en api/ai/health-summary:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
