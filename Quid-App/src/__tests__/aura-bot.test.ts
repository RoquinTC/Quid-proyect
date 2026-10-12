import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_AURA_BOT_URL, getAuraBotUrl } from "@/lib/aura-bot";

/**
 * El enlace al bot de Aura estaba hardcodeado en tres componentes, así que en
 * local los enlaces "Abrir Aura" abrían el bot de PRODUCCIÓN: cualquier prueba
 * terminaba escribiéndole al bot real, y por tanto a los datos reales.
 *
 * Ahora se configura con NEXT_PUBLIC_AURA_BOT_URL. Estos tests fijan que:
 *  - sin configurar se usa el bot de producción (no rompe despliegues actuales);
 *  - se acepta tanto una URL completa como sólo el nombre del bot, porque es
 *    fácil escribir una u otra forma en un .env.
 */

const KEY = "NEXT_PUBLIC_AURA_BOT_URL";
const original = process.env[KEY];

beforeEach(() => {
  delete process.env[KEY];
});

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("getAuraBotUrl", () => {
  it("usa el bot de producción cuando no hay configuración", () => {
    expect(getAuraBotUrl()).toBe(DEFAULT_AURA_BOT_URL);
    expect(DEFAULT_AURA_BOT_URL).toBe("https://t.me/Aura_RQC_Bot");
  });

  it("usa la URL configurada cuando es completa", () => {
    process.env[KEY] = "https://t.me/AuritaIA_bot";
    expect(getAuraBotUrl()).toBe("https://t.me/AuritaIA_bot");
  });

  it("construye la URL cuando sólo se da el nombre del bot", () => {
    process.env[KEY] = "AuritaIA_bot";
    expect(getAuraBotUrl()).toBe("https://t.me/AuritaIA_bot");
  });

  it("acepta el nombre con arroba inicial", () => {
    process.env[KEY] = "@AuritaIA_bot";
    expect(getAuraBotUrl()).toBe("https://t.me/AuritaIA_bot");
  });

  it("ignora espacios sobrantes", () => {
    process.env[KEY] = "  https://t.me/AuritaIA_bot  ";
    expect(getAuraBotUrl()).toBe("https://t.me/AuritaIA_bot");
  });

  it("trata una cadena vacía como no configurada", () => {
    // Un .env con la variable vacía no debe generar un enlace roto a "https://t.me/".
    process.env[KEY] = "   ";
    expect(getAuraBotUrl()).toBe(DEFAULT_AURA_BOT_URL);
  });

  it("no duplica el esquema si ya viene con https", () => {
    process.env[KEY] = "https://t.me/AuritaIA_bot";
    expect(getAuraBotUrl().match(/https:\/\//g)).toHaveLength(1);
  });
});
