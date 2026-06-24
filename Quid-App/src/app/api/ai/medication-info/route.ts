import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const AURA_MODEL = process.env.AURA_MODEL || "hermes3:8b";
const OLLAMA_API_BASE = process.env.OLLAMA_URL || "http://localhost:11434/api";
const ODYSSEUS_ENABLED = (process.env.ODYSSEUS_ENABLED || "false").toLowerCase() === "true";
const ODYSSEUS_API_URL = process.env.ODYSSEUS_API_URL || "";
const ODYSSEUS_API_TOKEN = process.env.ODYSSEUS_API_TOKEN || "";
const ODYSSEUS_SESSION_ID = process.env.ODYSSEUS_SESSION_ID || "";

type MedicationInfo = {
  diseases: string[];
  recommendedDosage: string;
  howToTake: string;
  sideEffects: string[];
};

const VALID_HOW_TO_TAKE = ["with_food", "without_food", "morning", "night", "custom"];

// Diccionario de Fallback Clínico para medicamentos comunes
const CLINICAL_FALLBACKS: Record<string, { diseases: string[]; recommendedDosage: string; howToTake: string; sideEffects: string[] }> = {
  acetaminofen: {
    diseases: ["Fiebre", "Dolor de cabeza", "Dolor leve a moderado"],
    recommendedDosage: "500mg - 1g cada 6 horas (máximo 4g al día)",
    howToTake: "with_food",
    sideEffects: ["Náuseas", "Reacciones alérgicas", "Toxicidad hepática si se excede la dosis"],
  },
  paracetamol: {
    diseases: ["Fiebre", "Dolor leve a moderado", "Malestar general"],
    recommendedDosage: "500mg - 1g cada 6 horas",
    howToTake: "with_food",
    sideEffects: ["Náuseas", "Alergia cutánea", "Riesgo de daño hepático en sobredosis"],
  },
  ibuprofeno: {
    diseases: ["Inflamación", "Dolor articular", "Fiebre", "Dolor menstrual"],
    recommendedDosage: "400mg - 600mg cada 8 horas con alimentos",
    howToTake: "with_food",
    sideEffects: ["Acidez estomacal", "Irritación gástrica", "Náuseas", "Riesgo renal a largo plazo"],
  },
  omeprazol: {
    diseases: ["Gastritis", "Reflujo gastroesofágico", "Úlcera duodenal"],
    recommendedDosage: "20mg una vez al día, preferiblemente 30 minutos antes del desayuno",
    howToTake: "without_food",
    sideEffects: ["Dolor de cabeza", "Gases", "Diarrea leve", "Estreñimiento"],
  },
  amoxicilina: {
    diseases: ["Infecciones bacterianas respiratorias", "Otitis", "Infección urinaria"],
    recommendedDosage: "500mg cada 8 horas o 875mg cada 12 horas",
    howToTake: "with_food",
    sideEffects: ["Diarrea", "Náuseas", "Candidiasis oral", "Erupción cutánea por alergia"],
  },
  losartan: {
    diseases: ["Hipertensión arterial", "Protección renal en diabetes"],
    recommendedDosage: "50mg una vez al día por la mañana",
    howToTake: "morning",
    sideEffects: ["Mareo", "Presión baja al levantarse", "Fatiga", "Tos seca leve"],
  },
  atorvastatina: {
    diseases: ["Hipercolesterolemia (Colesterol alto)", "Prevención cardiovascular"],
    recommendedDosage: "10mg - 40mg una vez al día, preferiblemente por la noche",
    howToTake: "night",
    sideEffects: ["Dolor muscular (mialgia)", "Dolor de cabeza", "Leve aumento de enzimas hepáticas"],
  },
  metformina: {
    diseases: ["Diabetes Mellitus Tipo 2", "Resistencia a la insulina"],
    recommendedDosage: "850mg - 1000mg con o inmediatamente después de las comidas principales",
    howToTake: "with_food",
    sideEffects: ["Sabor metálico", "Gases", "Diarrea", "Dolor de estómago al inicio del tratamiento"],
  },
  aspirina: {
    diseases: ["Prevención de infartos (antiagregante)", "Dolor", "Fiebre"],
    recommendedDosage: "100mg al día (preventivo) o 500mg cada 8 horas (analgésico)",
    howToTake: "with_food",
    sideEffects: ["Sangrado estomacal", "Acidez", "Zumbido en los oídos en dosis altas"],
  },
  levotiroxina: {
    diseases: ["Hipotiroidismo"],
    recommendedDosage: "25mcg - 150mcg al día, 30 minutos antes del desayuno",
    howToTake: "without_food",
    sideEffects: ["Palpitaciones", "Dolor de cabeza", "Nerviosismo", "Pérdida de peso si la dosis es alta"],
  },
  pilocarpina: {
    diseases: ["Glaucoma de ángulo abierto", "Hipertensión ocular", "Xerostomía (boca seca)"],
    recommendedDosage: "1 gota en el ojo afectado cada 8-12 horas, o 5mg por vía oral cada 8 horas",
    howToTake: "custom",
    sideEffects: ["Visión borrosa temporal", "Cefalea frontal", "Sudoración", "Aumento de salivación"],
  },
  esomeprazol: {
    diseases: ["Gastritis aguda", "Reflujo gastroesofágico", "Erradicación de H. Pylori"],
    recommendedDosage: "20mg o 40mg al día en ayunas",
    howToTake: "without_food",
    sideEffects: ["Dolor de cabeza", "Estreñimiento o diarrea leve", "Gases", "Sequedad de boca"],
  },
  prednisona: {
    diseases: ["Inflamación", "Artritis reumatoide", "Alergias graves"],
    recommendedDosage: "5mg a 60mg al día con el desayuno",
    howToTake: "morning",
    sideEffects: ["Aumento de apetito", "Retención de líquidos", "Subida de presión arterial", "Insomnio"],
  },
  tramadol: {
    diseases: ["Dolor moderado a severo"],
    recommendedDosage: "50mg a 100mg según dolor (máximo 400mg al día)",
    howToTake: "with_food",
    sideEffects: ["Náuseas", "Mareo", "Somnolencia", "Estreñimiento", "Sequedad de boca"],
  },
  hidrocodona: {
    diseases: ["Dolor moderado a severo", "Dolor agudo bajo control médico"],
    recommendedDosage: "Opioide de prescripción. La dosis depende de la presentación y debe seguir exactamente la receta médica; no ajuste la dosis sin consultar a un profesional.",
    howToTake: "with_food",
    sideEffects: ["Somnolencia", "Mareo", "Náuseas", "Estreñimiento", "Depresión respiratoria", "Riesgo de dependencia"],
  },
  hydrocodone: {
    diseases: ["Dolor moderado a severo", "Dolor agudo bajo control médico"],
    recommendedDosage: "Opioide de prescripción. La dosis depende de la presentación y debe seguir exactamente la receta médica; no ajuste la dosis sin consultar a un profesional.",
    howToTake: "with_food",
    sideEffects: ["Somnolencia", "Mareo", "Náuseas", "Estreñimiento", "Depresión respiratoria", "Riesgo de dependencia"],
  },
  sertralina: {
    diseases: ["Depresión", "Trastorno de pánico", "Ansiedad social"],
    recommendedDosage: "50mg una vez al día por la mañana o la noche",
    howToTake: "morning",
    sideEffects: ["Náuseas", "Insomnio", "Somnolencia", "Disfunción sexual", "Cefalea"],
  },
  fluoxetina: {
    diseases: ["Depresión", "Trastorno obsesivo compulsivo", "Bulimia"],
    recommendedDosage: "20mg una vez al día por la mañana",
    howToTake: "morning",
    sideEffects: ["Náuseas", "Pérdida de apetito", "Ansiedad leve al inicio", "Fatiga", "Insomnio"],
  },
  enalapril: {
    diseases: ["Hipertensión arterial", "Insuficiencia cardíaca"],
    recommendedDosage: "10mg a 20mg al día",
    howToTake: "morning",
    sideEffects: ["Tos seca persistente", "Mareos", "Fatiga", "Baja de presión arterial"],
  },
  rosuvastatina: {
    diseases: ["Hipercolesterolemia (Colesterol alto)", "Prevención cardiovascular"],
    recommendedDosage: "10mg o 20mg una vez al día por la noche",
    howToTake: "night",
    sideEffects: ["Dolor muscular (mialgia)", "Dolor de cabeza", "Náuseas", "Debilidad muscular"],
  },
  espironolactona: {
    diseases: ["Hipertensión arterial", "Insuficiencia cardíaca", "Edema"],
    recommendedDosage: "25mg a 100mg una vez al día con desayuno",
    howToTake: "morning",
    sideEffects: ["Aumento de potasio en sangre", "Mareos", "Ginecomastia leve", "Calambres"],
  },
  azitromicina: {
    diseases: ["Infecciones respiratorias", "Infecciones de piel"],
    recommendedDosage: "500mg una vez al día durante 3 o 5 días",
    howToTake: "without_food",
    sideEffects: ["Diarrea", "Náuseas", "Dolor abdominal", "Pérdida temporal del gusto"],
  },
};

function getLocalFallback(name: string) {
  const clean = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  for (const [key, value] of Object.entries(CLINICAL_FALLBACKS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return value;
    }
  }
  return null;
}

function cleanJsonResponse(content: string) {
  let cleanJson = content.trim();
  if (cleanJson.startsWith("```json")) {
    cleanJson = cleanJson.substring(7);
  }
  if (cleanJson.startsWith("```")) {
    cleanJson = cleanJson.substring(3);
  }
  if (cleanJson.endsWith("```")) {
    cleanJson = cleanJson.substring(0, cleanJson.length - 3);
  }

  const firstBrace = cleanJson.indexOf("{");
  const lastBrace = cleanJson.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
  }

  return cleanJson.trim();
}

function normalizeMedicationInfo(parsed: unknown): MedicationInfo | null {
  if (!parsed || typeof parsed !== "object") return null;
  const data = parsed as Partial<MedicationInfo>;
  if (
    !Array.isArray(data.diseases) ||
    typeof data.recommendedDosage !== "string" ||
    typeof data.howToTake !== "string" ||
    !Array.isArray(data.sideEffects)
  ) {
    return null;
  }

  return {
    diseases: data.diseases.filter((item): item is string => typeof item === "string").slice(0, 6),
    recommendedDosage: data.recommendedDosage,
    howToTake: VALID_HOW_TO_TAKE.includes(data.howToTake) ? data.howToTake : "custom",
    sideEffects: data.sideEffects.filter((item): item is string => typeof item === "string").slice(0, 8),
  };
}

async function askOdysseusForMedication(medicationName: string): Promise<MedicationInfo | null> {
  if (!ODYSSEUS_ENABLED || !ODYSSEUS_API_URL || !ODYSSEUS_API_TOKEN || !ODYSSEUS_SESSION_ID) {
    return null;
  }

  const prompt = `Eres Aura, asistente de salud educativa dentro de Quid. Investiga y resume el medicamento "${medicationName}" para ayudar al usuario a entender qué está registrando.
No reemplazas a un médico. No diagnostiques al usuario, no ajustes tratamientos y no afirmes que una dosis aplica a su caso personal.

Responde únicamente con JSON válido, sin markdown ni texto adicional:
{
  "diseases": ["enfermedad o condición que suele tratar", "otra condición"],
  "recommendedDosage": "referencia educativa de dosis habitual o indicación de seguir exactamente la receta; incluye advertencia breve de consultar profesional",
  "howToTake": "with_food" | "without_food" | "morning" | "night" | "custom",
  "sideEffects": ["efecto secundario frecuente", "señal de alarma si aplica"]
}

Si el nombre no parece un medicamento real o no hay información fiable, devuelve enfermedades como ["No identificado con seguridad"] y recomienda consultar al médico o farmacéutico.`;

  const response = await fetch(`${ODYSSEUS_API_URL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ODYSSEUS_API_TOKEN}`,
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      session: ODYSSEUS_SESSION_ID,
      message: prompt,
      use_web: false,
      use_research: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Odysseus respondió con estado ${response.status}: ${await response.text()}`);
  }

  const result = (await response.json()) as { response?: string };
  const content = result.response?.trim() || "";
  if (!content) return null;

  return normalizeMedicationInfo(JSON.parse(cleanJsonResponse(content)));
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { medicationName } = await req.json();
    if (!medicationName || typeof medicationName !== "string" || medicationName.length < 3) {
      return NextResponse.json({ error: "Nombre de medicamento no válido" }, { status: 400 });
    }

    // 1. Intentar el matching rápido local para evitar peticiones lentas del LLM en medicamentos comunes
    const localMatch = getLocalFallback(medicationName);
    if (localMatch) {
      return NextResponse.json(localMatch);
    }

    // 2. Usar Odysseus como investigador principal para medicamentos no cubiertos por Quid
    try {
      const odysseusInfo = await askOdysseusForMedication(medicationName);
      if (odysseusInfo) {
        return NextResponse.json(odysseusInfo);
      }
    } catch (odysseusErr) {
      console.error("Error llamando a Odysseus para medicamento:", odysseusErr);
    }

    // 3. Intentar llamar a Ollama como respaldo local si Odysseus no está disponible
    try {
      const systemPrompt = `Eres un asistente de salud inteligente. Analiza el medicamento "${medicationName}" y responde estrictamente con un objeto JSON en español con la estructura detallada abajo.
REGLA CRÍTICA: Debes responder únicamente con el bloque JSON. No incluyas explicaciones, saludos ni bloques de código de markdown. Solo el texto JSON limpio.

Estructura requerida:
{
  "diseases": ["enfermedad 1", "enfermedad 2"],
  "recommendedDosage": "dosis sugerida o rango común",
  "howToTake": "with_food" | "without_food" | "morning" | "night" | "custom",
  "sideEffects": ["efecto secundario 1", "efecto secundario 2"]
}`;

      const response = await fetch(`${OLLAMA_API_BASE.replace(/\/$/, "")}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AURA_MODEL,
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analiza el medicamento: ${medicationName}` }
          ],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const content = result.message?.content?.trim() || "";

        const parsed = normalizeMedicationInfo(JSON.parse(cleanJsonResponse(content)));
        if (parsed) {
          return NextResponse.json(parsed);
        }
      }
    } catch (ollamaErr) {
      console.error("Error llamando a Ollama para medicamento:", ollamaErr);
    }

    // 4. Fallback genérico si ningún motor responde con el formato adecuado
    return NextResponse.json({
      diseases: ["Consulte a su médico", "Tratamiento general"],
      recommendedDosage: "Según indicación médica en la receta",
      howToTake: "custom",
      sideEffects: ["Consulte el prospecto para ver efectos secundarios"],
    });

  } catch (error: any) {
    console.error("Error en api/ai/medication-info:", error);
    return NextResponse.json({ error: error.message || "Error interno de servidor" }, { status: 500 });
  }
}
