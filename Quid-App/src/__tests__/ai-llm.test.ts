import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AI_MODEL,
  extractJsonFromAiText,
  getAiModel,
  requestAiCompletion,
  resolveAiEndpoint,
} from "@/lib/ai/llm";

/**
 * Tests del cliente de IA unificado.
 *
 * CONTEXTO: Quid hablaba con Ollama por su API nativa (`/api/chat`), que
 * responde `{ message: { content } }`. Al migrar a un router OpenAI-compatible
 * (`/v1/chat/completions`, `{ choices: [{ message: { content } }] }`) el riesgo
 * real era leer una forma de respuesta con el parser de la otra: el resultado
 * sería texto vacío sin ningún error visible, y tres funciones de Salud más el
 * chat de Aura quedarían mudas.
 *
 * Estos tests fijan ambas formas de respuesta y la detección de protocolo por
 * URL, que es lo único que decide cuál se usa.
 */

const ENV_KEYS = ["AI_BASE_URL", "AI_MODEL", "AI_API_KEY", "OLLAMA_URL", "AURA_MODEL", "AURA_API_KEY"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveAiEndpoint — detección de protocolo", () => {
  it("trata una URL terminada en /api como la API nativa de Ollama", () => {
    process.env.AI_BASE_URL = "http://quid-ollama:11434/api";
    expect(resolveAiEndpoint()).toEqual({
      baseUrl: "http://quid-ollama:11434/api",
      protocol: "ollama",
    });
  });

  it("trata una URL terminada en /v1 como OpenAI-compatible", () => {
    process.env.AI_BASE_URL = "http://freellmapi:3001/v1";
    expect(resolveAiEndpoint()).toEqual({
      baseUrl: "http://freellmapi:3001/v1",
      protocol: "openai",
    });
  });

  it("normaliza barras finales para no construir rutas con //", () => {
    process.env.AI_BASE_URL = "http://freellmapi:3001/v1///";
    expect(resolveAiEndpoint().baseUrl).toBe("http://freellmapi:3001/v1");
  });

  it("cae al backend local por defecto cuando no hay configuración", () => {
    // Sin variables debe asumir Ollama local: es el comportamiento histórico
    // y evita apuntar a un servicio inexistente en un entorno sin configurar.
    expect(resolveAiEndpoint().protocol).toBe("ollama");
  });

  it("acepta los nombres antiguos de variables durante la migración", () => {
    process.env.OLLAMA_URL = "http://freellmapi:3001/v1";
    process.env.AURA_MODEL = "gemini-2.5-flash";
    expect(resolveAiEndpoint().protocol).toBe("openai");
    expect(getAiModel()).toBe("gemini-2.5-flash");
  });

  it("prefiere AI_BASE_URL sobre OLLAMA_URL cuando ambos existen", () => {
    process.env.OLLAMA_URL = "http://quid-ollama:11434/api";
    process.env.AI_BASE_URL = "http://freellmapi:3001/v1";
    expect(resolveAiEndpoint().protocol).toBe("openai");
  });
});

describe("getAiModel", () => {
  it("prefiere AI_MODEL sobre AURA_MODEL", () => {
    process.env.AURA_MODEL = "hermes3:8b";
    process.env.AI_MODEL = "auto";
    expect(getAiModel()).toBe("auto");
  });

  it("usa el modelo por defecto cuando no hay configuración", () => {
    expect(getAiModel()).toBe(DEFAULT_AI_MODEL);
  });
});

describe("requestAiCompletion — normalización de ambos protocolos", () => {
  it("lee la respuesta de Ollama y traduce sus contadores de tokens", async () => {
    process.env.AI_BASE_URL = "http://quid-ollama:11434/api";
    process.env.AI_MODEL = "hermes3:8b";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: "  Hola desde Ollama  " },
        prompt_eval_count: 11,
        eval_count: 7,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestAiCompletion({ user: "hola" });

    expect(result.text).toBe("Hola desde Ollama");
    expect(result.protocol).toBe("ollama");
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 });

    // Debe llamar al endpoint nativo y no al de OpenAI
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://quid-ollama:11434/api/chat");
    expect(JSON.parse(init.body)).toMatchObject({ model: "hermes3:8b", stream: false, keep_alive: -1 });
  });

  it("lee la respuesta OpenAI-compatible y usa el modelo que realmente respondió", async () => {
    process.env.AI_BASE_URL = "http://freellmapi:3001/v1";
    process.env.AI_MODEL = "auto";
    process.env.AI_API_KEY = "freellmapi-test";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        // El router hizo failover: pedimos "auto" y contestó qwen
        model: "qwen/qwen3.8-27b",
        choices: [{ message: { content: "Hola desde el router" } }],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestAiCompletion({ user: "hola" });

    expect(result.text).toBe("Hola desde el router");
    expect(result.protocol).toBe("openai");
    // Reportar el modelo real importa para depurar fallos de enrutado
    expect(result.model).toBe("qwen/qwen3.8-27b");
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 3, totalTokens: 8 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://freellmapi:3001/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer freellmapi-test");
  });

  it("envía el prompt de sistema cuando se proporciona", async () => {
    process.env.AI_BASE_URL = "http://freellmapi:3001/v1";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestAiCompletion({ system: "Eres un nutricionista", user: "analiza esto" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: "system", content: "Eres un nutricionista" },
      { role: "user", content: "analiza esto" },
    ]);
  });

  it("lanza un error legible cuando el backend rechaza la petición", async () => {
    process.env.AI_BASE_URL = "http://freellmapi:3001/v1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"error":{"message":"Invalid API key"}}',
      })
    );

    await expect(requestAiCompletion({ user: "hola" })).rejects.toThrow(/401/);
  });

  it("devuelve texto vacío en vez de fallar si la respuesta no trae contenido", async () => {
    // Un router puede contestar 200 con choices vacío. No debe reventar: quien
    // llama decide si el texto vacío es aceptable o si usa su respaldo local.
    process.env.AI_BASE_URL = "http://freellmapi:3001/v1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) })
    );

    const result = await requestAiCompletion({ user: "hola" });
    expect(result.text).toBe("");
  });
});

describe("extractJsonFromAiText", () => {
  it("parsea JSON limpio", () => {
    expect(extractJsonFromAiText('{"a":1}')).toEqual({ a: 1 });
  });

  it("quita las cercas de markdown ```json", () => {
    const raw = '```json\n{"restrictions":[{"food":"lácteos"}]}\n```';
    expect(extractJsonFromAiText(raw)).toEqual({ restrictions: [{ food: "lácteos" }] });
  });

  it("quita las cercas sin lenguaje", () => {
    expect(extractJsonFromAiText('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("rescata el JSON aunque el modelo agregue texto alrededor", () => {
    // Caso real: los modelos añaden preámbulos pese a que se les pide sólo JSON.
    const raw = 'Claro, aquí está el análisis:\n{"diseases":["hipertensión"]}\nEspero que ayude.';
    expect(extractJsonFromAiText(raw)).toEqual({ diseases: ["hipertensión"] });
  });

  it("devuelve null cuando no hay JSON, en vez de lanzar", () => {
    // Devolver null permite que quien llama caiga a su respaldo local.
    expect(extractJsonFromAiText("No pude analizar eso, lo siento.")).toBeNull();
    expect(extractJsonFromAiText("")).toBeNull();
  });

  it("devuelve null ante JSON malformado", () => {
    expect(extractJsonFromAiText("{esto no es json}")).toBeNull();
  });

  it("parsea arreglos JSON", () => {
    expect(extractJsonFromAiText('[1,2,3]')).toEqual([1, 2, 3]);
  });
});
