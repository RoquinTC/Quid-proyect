/**
 * Validación de parámetros de herramientas de Aura.
 *
 * POR QUÉ NO SE USA EL ESQUEMA ZOD DIRECTO
 *
 * `validations.ts` ya usa Zod para las rutas HTTP, pero aquí la entrada no viene
 * de un formulario: viene de un modelo de lenguaje, o de un `callback_data` de
 * Telegram. En ambos casos el valor puede ser un número como texto ("15000"), un
 * booleano como "true", o basura directamente.
 *
 * Este validador normaliza esos casos y devuelve errores legibles en español,
 * porque el mensaje de error se le muestra al usuario final a través de Aura.
 *
 * Decisión clave: NO se descartan en silencio los parámetros desconocidos ni los
 * valores inválidos. Si algo falta o está mal, se devuelve el error y la
 * herramienta no se ejecuta. Fallar ruidosamente es preferible a registrar un
 * gasto con el monto equivocado.
 */

import type { ToolDefinition, ToolParameter } from "./registry";

export interface ValidationSuccess {
  ok: true;
  value: Record<string, unknown>;
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
  /** Nombres de los parámetros requeridos que faltan. */
  missingRequired: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/** Quita tildes y colapsa espacios, para comparar texto de forma tolerante. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convierte un valor crudo al tipo declarado.
 * Devuelve `undefined` cuando no es convertible, para que el llamador decida si
 * eso es un error (requerido) o simplemente se omite (opcional).
 */
function coerce(raw: unknown, parameter: ToolParameter): unknown {
  if (raw === null || raw === undefined || raw === "") return undefined;

  switch (parameter.type) {
    case "number": {
      if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
      if (typeof raw !== "string") return undefined;

      // Un texto sin ningún dígito NO es un monto válido. Sin esta guarda,
      // "mucho" se limpiaba a "" y `Number("")` daba 0, así que un monto basura
      // se registraba como cero: el fallo más peligroso posible en una app de
      // finanzas, porque la transacción queda guardada con un valor falso.
      if (!/\d/.test(raw)) return undefined;

      // Acepta "15000", "15.000", "15,000", "$15.000".
      const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
      if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === ",") return undefined;

      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    case "boolean": {
      if (typeof raw === "boolean") return raw;
      if (typeof raw !== "string") return undefined;
      const value = normalize(raw);
      if (["true", "si", "sí", "1", "yes"].includes(value)) return true;
      if (["false", "no", "0"].includes(value)) return false;
      return undefined;
    }

    case "enum": {
      if (typeof raw !== "string") return undefined;
      const value = normalize(raw);
      const match = parameter.values?.find((candidate) => normalize(candidate) === value);
      return match;
    }

    case "date": {
      // Se acepta una fecha ISO o texto en lenguaje natural que el llamador
      // resuelva después ("hoy", "ayer"). Acá sólo se garantiza que sea texto.
      return typeof raw === "string" ? raw.trim() : undefined;
    }

    case "string":
    default: {
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
      if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
      return undefined;
    }
  }
}

/** Valida y normaliza los parámetros de una herramienta. */
export function validateToolParameters(
  tool: ToolDefinition,
  input: unknown
): ValidationResult {
  if (input !== null && input !== undefined && (typeof input !== "object" || Array.isArray(input))) {
    return {
      ok: false,
      errors: [`Los parámetros de ${tool.name} deben ser un objeto.`],
      missingRequired: [],
    };
  }

  const source = (input ?? {}) as Record<string, unknown>;
  const value: Record<string, unknown> = {};
  const errors: string[] = [];
  const missingRequired: string[] = [];

  // Sólo se consideran los parámetros declarados: un campo extra no se propaga,
  // así que el modelo no puede inyectar columnas que la herramienta no declara.
  for (const parameter of tool.parameters) {
    const rawValue = source[parameter.name];
    const isAbsent = rawValue === null || rawValue === undefined || rawValue === "";
    const coerced = coerce(rawValue, parameter);

    if (coerced === undefined) {
      // Distinguir "ausente" de "inválido" importa: decirle al usuario que falta
      // un campo cuando en realidad mandó un valor que no entendemos lo deja
      // reintentando lo mismo. Y al modelo, que se autocorrija, peor.
      if (!isAbsent) {
        const expected =
          parameter.type === "enum" && parameter.values
            ? ` Debe ser uno de: ${parameter.values.join(", ")}.`
            : parameter.type === "number"
              ? " Debe ser un número."
              : "";
        errors.push(
          `El campo "${parameter.name}" tiene un valor que no entiendo: ${JSON.stringify(
            rawValue
          )}.${expected}`
        );
        continue;
      }

      if (parameter.defaultValue !== undefined) {
        value[parameter.name] = parameter.defaultValue;
        continue;
      }

      if (parameter.required) {
        missingRequired.push(parameter.name);
        errors.push(`Falta el campo "${parameter.name}" (${parameter.description}).`);
      }
      // Un opcional ausente simplemente no aparece en el resultado.
      continue;
    }

    if (parameter.type === "enum" && parameter.values) {
      const asText = String(coerced);
      if (!parameter.values.includes(asText)) {
        errors.push(
          `El campo "${parameter.name}" debe ser uno de: ${parameter.values.join(", ")}. Recibí "${String(
            rawValue
          )}".`
        );
        continue;
      }
    }

    value[parameter.name] = coerced;
  }

  if (errors.length > 0) {
    return { ok: false, errors, missingRequired };
  }

  return { ok: true, value };
}
