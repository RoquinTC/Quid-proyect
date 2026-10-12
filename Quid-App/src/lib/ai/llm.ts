/**
 * Cliente de IA unificado para Quid.
 *
 * ¿POR QUÉ EXISTE ESTE ARCHIVO?
 *
 * Quid hablaba con Ollama a través de la API nativa de Ollama (`/api/chat`),
 * que responde con `{ message: { content } }` y usa `keep_alive`. Ese código
 * estaba duplicado en cuatro lugares distintos:
 *
 *   - src/lib/aura/index.ts                  → askOllama()
 *   - src/app/api/ai/food-restrictions/route.ts
 *   - src/app/api/ai/health-summary/route.ts
 *   - src/app/api/ai/medication-info/route.ts
 *
 * Ollama consumía demasiada RAM en el servidor y tumbó la máquina, así que se
 * reemplazó por un router OpenAI-compatible (FreeLLMAPI). Pero ese router no
 * implementa `/api/chat`: habla `/v1/chat/completions` con `Bearer` y responde
 * `{ choices: [{ message: { content } }] }`.
 *
 * En vez de reescribir los cuatro sitios con la lógica del nuevo protocolo —y
 * arriesgar que uno quede con el formato viejo y falle en silencio—, este módulo
 * detecta el protocolo a partir de la URL configurada y normaliza la respuesta.
 *
 * CONFIGURACIÓN
 *
 *   AI_BASE_URL      Base de la IA. Acepta ambos formatos:
 *                      - Ollama nativo:  http://host:11434/api
 *                      - OpenAI-compat:  http://host:3001/v1
 *   AI_MODEL         Modelo a usar.
 *   AI_API_KEY       (opcional) Token Bearer para endpoints OpenAI-compatible.
 *
 * Se aceptan también los nombres antiguos `OLLAMA_URL` y `AURA_MODEL` como
 * respaldo, para no romper despliegues existentes durante la migración.
 *
 * La URL de Ollama con `/api` sigue funcionando sin tocar nada, lo que permite
 * migrar sin una ventana de indisponibilidad y revertir con un cambio de
 * variable de entorno.
 */

export type AiProtocol = "ollama" | "openai";

export interface AiCompletionResult {
  text: string;
  model: string;
  protocol: AiProtocol;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AiCompletionOptions {
  system?: string;
  user: string;
  /** Tiempo máximo de espera en milisegundos. Por defecto 30 s. */
  timeoutMs?: number;
  /** Modelo a usar; si se omite, se toma de AURA_MODEL. */
  model?: string;
  /** Temperatura de muestreo. */
  temperature?: number;
  /** Tokens máximos en la respuesta. */
  maxTokens?: number;
  /** Imágenes (URL o data URL) para modelos con visión. */
  images?: string[];
}

export const DEFAULT_AI_MODEL = "hermes3:8b";

/**
 * Determina la base de la IA y su protocolo.
 *
 * Heurística: si la ruta termina en `/api`, es la API nativa de Ollama; si
 * termina en `/v1`, es OpenAI-compatible. Cualquier otra ruta se asume
 * OpenAI-compatible, que es el estándar más común.
 */
export function resolveAiEndpoint(): { baseUrl: string; protocol: AiProtocol } {
  const raw = process.env.AI_BASE_URL || process.env.OLLAMA_URL || "http://localhost:11434/api";
  const baseUrl = raw.replace(/\/+$/, "");

  const protocol: AiProtocol = /\/api$/.test(baseUrl) ? "ollama" : "openai";

  return { baseUrl, protocol };
}

export function getAiModel(): string {
  return process.env.AI_MODEL || process.env.AURA_MODEL || DEFAULT_AI_MODEL;
}

/**
 * Ejecuta una completion contra el backend configurado.
 *
 * Normaliza ambos protocolos a la misma forma, así que quien llama no necesita
 * saber contra qué está hablando.
 *
 * @throws Error si el backend responde con un estado distinto de 2xx o si la
 *         respuesta no tiene contenido reconocible.
 */
export async function requestAiCompletion(
  options: AiCompletionOptions
): Promise<AiCompletionResult> {
  const { baseUrl, protocol } = resolveAiEndpoint();
  const model = options.model || getAiModel();
  const timeoutMs = options.timeoutMs ?? 30_000;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (protocol === "openai") {
    const apiKey = process.env.AI_API_KEY || process.env.AURA_API_KEY;
    // Algunos routers exigen el header aunque el valor sea simbólico.
    headers.Authorization = `Bearer ${apiKey || "quid"}`;
  }

  const messages: Array<{ role: string; content: unknown }> = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  messages.push({ role: "user", content: options.user });

  const response = await fetch(`${baseUrl}${protocol === "ollama" ? "/chat" : "/chat/completions"}`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(
      protocol === "ollama"
        ? {
            model,
            stream: false,
            // Ollama descarga el modelo tras un tiempo de inactividad; -1 lo mantiene
            // caliente. Con un router remoto este campo se ignora.
            keep_alive: -1,
            messages,
            options: {
              ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
              ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {}),
            },
          }
        : {
            model,
            stream: false,
            messages,
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
          }
    ),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `La IA respondió ${response.status} (${protocol === "ollama" ? "Ollama" : "OpenAI-compatible"}): ${detail.slice(0, 300)}`
    );
  }

  const payload = (await response.json()) as Record<string, any>;

  if (protocol === "ollama") {
    return {
      text: String(payload.message?.content ?? "").trim(),
      model,
      protocol,
      usage: {
        promptTokens: payload.prompt_eval_count,
        completionTokens: payload.eval_count,
        totalTokens:
          typeof payload.prompt_eval_count === "number" && typeof payload.eval_count === "number"
            ? payload.prompt_eval_count + payload.eval_count
            : undefined,
      },
    };
  }

  const choice = payload.choices?.[0];
  return {
    text: String(choice?.message?.content ?? "").trim(),
    // El router puede contestar con un modelo distinto al pedido (failover),
    // así que reportamos el que realmente respondió.
    model: payload.model || model,
    protocol,
    usage: {
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      totalTokens: payload.usage?.total_tokens,
    },
  };
}

/**
 * Extrae un objeto JSON de una respuesta de IA.
 *
 * Los modelos suelen envolver el JSON en bloques markdown (```json ... ```) o
 * agregar texto alrededor, aunque se les pida responder sólo con JSON.
 * Devuelve `null` cuando no hay JSON parseable, para que quien llama pueda caer
 * a su siguiente estrategia sin una excepción.
 */
export function extractJsonFromAiText<T = unknown>(text: string): T | null {
  if (!text) return null;

  let candidate = text.trim();

  // Quitar cercas de código markdown
  if (candidate.startsWith("```")) {
    candidate = candidate.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  candidate = candidate.trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Segundo intento: recortar desde la primera llave hasta la última.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
