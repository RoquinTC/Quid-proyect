import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const AURA_MODEL = process.env.AURA_MODEL || "hermes3:8b";
const OLLAMA_API_BASE = process.env.OLLAMA_URL || "http://localhost:11434/api";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Obtener los medicamentos activos de la base de datos
    const medications = await db.medication.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: { name: "asc" },
    });

    if (medications.length === 0) {
      return NextResponse.json({
        summary: "Actualmente no tienes medicamentos registrados. Añade tus medicamentos para obtener recomendaciones personalizadas.",
      });
    }

    // 1. Crear un fallback local inteligente en caso de que Ollama no esté disponible
    const createLocalSummary = () => {
      let text = `Basado en tu perfil clínico, tienes registrados **${medications.length} medicamentos activos**. \n\n`;

      const morningMeds = medications.filter(m => m.howToTake === "morning" || m.howToTake === "without_food");
      const nightMeds = medications.filter(m => m.howToTake === "night");
      const foodMeds = medications.filter(m => m.howToTake === "with_food");

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

      text += `\n*Nota: Este informe ha sido compilado por el asistente clínico local Aura basándose en las mejores prácticas de dosificación.*`;
      return text;
    };

    // 2. Intentar consultar a Ollama para un reporte de nivel profesional y personalizado
    try {
      const medListString = medications
        .map(
          (m, idx) =>
            `${idx + 1}. **${m.name}** (${m.dosage}) - Frecuencia: ${m.frequency}, Tomar: ${
              m.howToTake || "No especificado"
            }, Enfermedad: ${m.disease || "No especificada"}`
        )
        .join("\n");

      const systemPrompt = `Eres Aura, un asistente médico inteligente de élite y farmacéutico clínico.
El usuario tiene registrados los siguientes medicamentos activos:
${medListString}

Tu objetivo es generar una guía de adherencia clínica personalizada, cálida y profesional en formato Markdown.
Por favor estructura tu respuesta en los siguientes puntos en español:
1. **Resumen de tu Tratamiento**: Breve introducción felicitando al usuario por mantener su control.
2. **Cronograma Diario Recomendado**: Cómo organizar las tomas (ej. mañana en ayunas, tarde, noche) para evitar que coincidan e interfieran entre sí.
3. **Pautas Críticas de Consumo & Alimentos**: Qué medicamentos se toman en ayunas, cuáles con comida, qué alimentos evitar (ej: lácteos con ciertos antibióticos, cafeína).
4. **Advertencias de Seguridad e Interacciones**: Comenta sobre efectos secundarios comunes que debe vigilar o combinaciones de su lista que requieran cuidado.

Sé conciso, empático y estructurado. No utilices jerga excesivamente técnica. Deja claro al final que es una sugerencia informativa y debe validarse con su médico de cabecera.`;

      const response = await fetch(`${OLLAMA_API_BASE.replace(/\/$/, "")}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AURA_MODEL,
          stream: false,
          messages: [{ role: "user", content: systemPrompt }],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const content = result.message?.content?.trim() || "";
        if (content && content.length > 100) {
          return NextResponse.json({ summary: content });
        }
      }
    } catch (err) {
      console.error("Error llamando a Ollama para reporte clínico:", err);
    }

    // 3. Fallback en caso de que falle el LLM
    return NextResponse.json({
      summary: createLocalSummary(),
    });

  } catch (error: any) {
    console.error("Error en api/ai/health-summary:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
