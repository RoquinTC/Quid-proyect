import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const AURA_MODEL = process.env.AURA_MODEL || "hermes3:8b";
const OLLAMA_API_BASE = process.env.OLLAMA_URL || "http://localhost:11434/api";

interface FoodRestriction {
  food: string;
  reason: string;
  level: string;
  relatedDisease: string;
}

const DISEASE_FALLBACKS: Record<string, FoodRestriction[]> = {
  "diabetes tipo 2": [
    {
      food: "Azúcares refinados y dulces",
      reason: "Provoca picos elevados y rápidos de glucosa en sangre.",
      level: "evitar",
      relatedDisease: "Diabetes tipo 2",
    },
    {
      food: "Bebidas azucaradas y gaseosas",
      reason: "Contenido altísimo de azúcares libres de rápida absorción.",
      level: "evitar",
      relatedDisease: "Diabetes tipo 2",
    },
    {
      food: "Harinas refinadas (pan blanco, pastas)",
      reason: "Carbohidratos simples con alto índice glucémico y baja fibra.",
      level: "moderar",
      relatedDisease: "Diabetes tipo 2",
    },
  ],
  hipertension: [
    {
      food: "Sal de mesa y condimentos altos en sodio",
      reason: "Eleva directamente la retención de líquidos y la presión arterial.",
      level: "evitar",
      relatedDisease: "Hipertensión",
    },
    {
      food: "Embutidos y carnes curadas",
      reason: "Altísimo contenido de sodio y conservantes perjudiciales.",
      level: "evitar",
      relatedDisease: "Hipertensión",
    },
    {
      food: "Comida ultraprocesada / snacks de paquete",
      reason: "Contienen exceso de sodio y grasas saturadas trans.",
      level: "evitar",
      relatedDisease: "Hipertensión",
    },
  ],
  celiaca: [
    {
      food: "Trigo, cebada, centeno y derivados (Gluten)",
      reason: "Produce inflamación y destrucción autoinmune de la mucosa intestinal.",
      level: "evitar",
      relatedDisease: "Celiaca",
    },
  ],
  "intolerancia a la lactosa": [
    {
      food: "Leche entera y derivados con lactosa",
      reason: "La ausencia de lactasa provoca fermentación, gases y dolor abdominal.",
      level: "evitar",
      relatedDisease: "Intolerancia a la lactosa",
    },
    {
      food: "Quesos frescos o blandos no curados",
      reason: "Retienen alta cantidad de lactosa.",
      level: "moderar",
      relatedDisease: "Intolerancia a la lactosa",
    },
  ],
  gota: [
    {
      food: "Carnes rojas y vísceras",
      reason: "Altísimo contenido en purinas, elevando el ácido úrico.",
      level: "evitar",
      relatedDisease: "Gota",
    },
    {
      food: "Mariscos",
      reason: "Contienen altos niveles de purinas que precipitan crisis de gota.",
      level: "evitar",
      relatedDisease: "Gota",
    },
    {
      food: "Cerveza y bebidas alcohólicas",
      reason: "Disminuye la excreción renal de ácido úrico.",
      level: "evitar",
      relatedDisease: "Gota",
    },
  ],
  "colesterol alto": [
    {
      food: "Frituras y grasas trans",
      reason: "Aumenta drásticamente el colesterol LDL (malo) y reduce el HDL.",
      level: "evitar",
      relatedDisease: "Colesterol alto",
    },
    {
      food: "Carnes grasas y embutidos",
      reason: "Exceso de grasas saturadas que elevan el perfil lipídico.",
      level: "evitar",
      relatedDisease: "Colesterol alto",
    },
  ],
};

function getLocalRestrictions(diseases: string[]): FoodRestriction[] {
  const list: FoodRestriction[] = [];
  const normalized = diseases.map(d => d.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());

  for (const normDisease of normalized) {
    for (const [key, val] of Object.entries(DISEASE_FALLBACKS)) {
      if (normDisease.includes(key) || key.includes(normDisease)) {
        list.push(...val);
      }
    }
  }
  return list;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { diseases } = await req.json();
    if (!diseases || !Array.isArray(diseases) || diseases.length === 0) {
      return NextResponse.json({ error: "Lista de enfermedades no válida" }, { status: 400 });
    }

    // 1. Intentar matching local para velocidad y robustez
    const localMatches = getLocalRestrictions(diseases);
    if (localMatches.length > 0) {
      return NextResponse.json({
        restrictions: localMatches,
        summary: `Se detectaron restricciones importantes basadas en tus condiciones: ${diseases.join(", ")}.`,
      });
    }

    // 2. Intentar llamar a Ollama
    try {
      const systemPrompt = `Eres un nutricionista y médico experto. Analiza la lista de condiciones de salud del usuario: "${diseases.join(", ")}" y responde con un objeto JSON en español con la estructura detallada abajo.
REGLA CRÍTICA: Responde exclusivamente con el bloque JSON. Sin preámbulos ni código markdown.

Estructura requerida:
{
  "restrictions": [
    {
      "food": "nombre del alimento o grupo de alimentos",
      "reason": "razón fisiológica breve en español",
      "level": "evitar" | "moderar",
      "relatedDisease": "la condición relacionada de la lista proporcionada"
    }
  ],
  "summary": "Breve resumen nutricional aconsejando al usuario"
}`;

      const response = await fetch(`${OLLAMA_API_BASE.replace(/\/$/, "")}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AURA_MODEL,
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analiza las enfermedades: ${diseases.join(", ")}` }
          ],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const content = result.message?.content?.trim() || "";

        let cleanJson = content;
        if (cleanJson.startsWith("```json")) {
          cleanJson = cleanJson.substring(7);
        }
        if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.substring(3);
        }
        if (cleanJson.endsWith("```")) {
          cleanJson = cleanJson.substring(0, cleanJson.length - 3);
        }
        cleanJson = cleanJson.trim();

        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed.restrictions)) {
          return NextResponse.json(parsed);
        }
      }
    } catch (ollamaErr) {
      console.error("Error llamando a Ollama para restricciones alimenticias:", ollamaErr);
    }

    // 3. Fallback genérico final si no se encontró nada
    return NextResponse.json({
      restrictions: [
        {
          food: "Alimentos ultraprocesados",
          reason: "En cualquier condición de salud es aconsejable evitar conservantes y grasas hidrogenadas.",
          level: "evitar",
          relatedDisease: diseases[0] || "General",
        }
      ],
      summary: "Por favor consulte a su nutricionista para un plan dietario adecuado a su historial completo.",
    });

  } catch (error: any) {
    console.error("Error en api/ai/food-restrictions:", error);
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 });
  }
}
