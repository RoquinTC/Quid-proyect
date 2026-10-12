/**
 * Registro de herramientas de Aura.
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * Antes, cada capacidad de Aura se programaba a mano dentro de un `index.ts` de
 * más de 1800 líneas, y la lista de acciones que Aura podía ejecutar no existía
 * en ningún lado: había que leer el código para saberlo. Agregar una herramienta
 * nueva obligaba a tocar el despachador, el parser de la propuesta, el ejecutor y
 * los botones por separado.
 *
 * Este registro declara cada herramienta una sola vez, y de esa declaración se
 * derivan: los esquemas de validación, la exigencia (o no) de confirmación, el
 * resumen que se le muestra al usuario y la ejecución.
 *
 * LECTURA vs ESCRITURA
 *
 * - `read`: no modifica nada. Se ejecuta directo, sin confirmación.
 * - `write`: modifica datos del usuario. NO se ejecuta directo nunca: produce una
 *   propuesta que se persiste y requiere confirmación explícita.
 *
 * Esa distinción es de seguridad, no de comodidad. Confundirlas es cómo un chat
 * termina escribiendo en las finanzas de alguien sin que lo haya pedido.
 */

export type ToolKind = "read" | "write";

export type ToolParameterType = "string" | "number" | "date" | "boolean" | "enum";

export interface ToolParameter {
  name: string;
  type: ToolParameterType;
  required: boolean;
  description: string;
  /** Solo para `type: "enum"`. */
  values?: readonly string[];
  /** Valor por defecto cuando no viene informado. */
  defaultValue?: unknown;
}

export interface ToolDefinition {
  /** Identificador estable. Se persiste en la base, así que no cambiarlo a la ligera. */
  name: string;
  kind: ToolKind;
  /** Descripción para el modelo y para la documentación del gateway. */
  description: string;
  parameters: readonly ToolParameter[];
  /**
   * Si existe una implementación real detrás.
   *
   * Se declara explícitamente en vez de deducirse de una lista aparte: una
   * herramienta anunciada pero no implementada debe fallar con un mensaje claro
   * ("todavía no puedo hacer eso") y no intentar ejecutarse.
   */
  implemented: boolean;
  /**
   * Cuántos minutos vive una propuesta antes de expirar. Evita que una
   * confirmación se aplique a algo que el usuario pidió hace horas.
   */
  proposalTtlMinutes?: number;
}

/**
 * Tiempo de vida por defecto de una propuesta de escritura.
 * Una propuesta de hace 15 minutos ya no refleja la intención del usuario.
 */
export const DEFAULT_PROPOSAL_TTL_MINUTES = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Definiciones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Herramienta de escritura, ya implementada y en uso.
 *
 * Sus parámetros son la representación estructurada de lo que antes vivía como
 * `TransactionProposalState`, reconstruido parseando el texto del asistente.
 */
export const REGISTRAR_TRANSACCION: ToolDefinition = {
  name: "registrar_transaccion",
  kind: "write",
  implemented: true,
  description:
    "Registra un ingreso o un gasto en una cuenta, bolsillo o tarjeta de crédito del usuario.",
  parameters: [
    { name: "type", type: "enum", required: true, values: ["income", "expense"], description: "Si es un ingreso o un gasto." },
    { name: "amount", type: "number", required: true, description: "Valor en pesos colombianos, sin decimales." },
    { name: "category", type: "string", required: false, description: "Categoría del movimiento." },
    { name: "subCategory", type: "string", required: false, description: "Subcategoría del movimiento." },
    { name: "accountName", type: "string", required: false, description: "Nombre de la cuenta o bolsillo de origen." },
    { name: "debtName", type: "string", required: false, description: "Nombre de la tarjeta o deuda, si se paga con crédito." },
    { name: "dateText", type: "string", required: false, description: 'Fecha en lenguaje natural: "hoy", "ayer", "antier".' },
  ],
};

export const REGISTRAR_TANQUEO: ToolDefinition = {
  name: "registrar_tanqueo",
  kind: "write",
  implemented: true,
  description:
    "Registra una recarga de combustible para un vehículo del usuario, con odómetro y precio por galón.",
  parameters: [
    { name: "vehicleName", type: "string", required: false, description: "Nombre o placa del vehículo." },
    { name: "amount", type: "number", required: false, description: "Valor total pagado en pesos." },
    { name: "gallons", type: "number", required: false, description: "Galones cargados." },
    { name: "pricePerGallon", type: "number", required: false, description: "Precio por galón." },
    { name: "km", type: "number", required: false, description: "Lectura del odómetro al momento de la recarga." },
    { name: "isFullTank", type: "boolean", required: false, description: "Si el tanque quedó lleno." },
    { name: "dateText", type: "string", required: false, description: 'Fecha en lenguaje natural: "hoy", "ayer".' },
  ],
};

/**
 * Consultas de lectura.
 *
 * No modifican nada, así que se pueden ejecutar sin confirmación. Su valor está
 * en que Aura consulte datos reales por herramienta en vez de recibir un resumen
 * precalculado en el prompt: con un resumen, el modelo no puede filtrar ni
 * profundizar, y el contexto crece sin control.
 */
export const CONSULTAR_GASTOS: ToolDefinition = {
  name: "consultar_gastos",
  kind: "read",
  implemented: true,
  description: "Devuelve el total gastado por categoría en un período.",
  parameters: [
    { name: "period", type: "enum", required: false, values: ["hoy", "semana", "mes", "año"], defaultValue: "mes", description: "Período a consultar." },
    { name: "category", type: "string", required: false, description: "Limita la consulta a una categoría." },
  ],
};

export const CONSULTAR_SALDO: ToolDefinition = {
  name: "consultar_saldo",
  kind: "read",
  implemented: true,
  description: "Devuelve el saldo de las cuentas y bolsillos del usuario.",
  parameters: [
    { name: "accountName", type: "string", required: false, description: "Limita la consulta a una cuenta." },
  ],
};

export const CONSULTAR_MEDICAMENTOS: ToolDefinition = {
  name: "consultar_medicamentos",
  kind: "read",
  implemented: true,
  description: "Lista los medicamentos activos del usuario con su dosis y horarios.",
  parameters: [],
};

export const CONSULTAR_CITAS: ToolDefinition = {
  name: "consultar_citas",
  kind: "read",
  implemented: true,
  description: "Lista las citas médicas programadas del usuario.",
  parameters: [
    { name: "onlyUpcoming", type: "boolean", required: false, defaultValue: true, description: "Solo citas futuras." },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Índice
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  // Escritura
  REGISTRAR_TRANSACCION,
  REGISTRAR_TANQUEO,
  // Lectura
  CONSULTAR_GASTOS,
  CONSULTAR_SALDO,
  CONSULTAR_MEDICAMENTOS,
  CONSULTAR_CITAS,
];

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((tool) => tool.name === name);
}

export function getToolsByKind(kind: ToolKind): ToolDefinition[] {
  return TOOL_REGISTRY.filter((tool) => tool.kind === kind);
}

/** Nombres de las herramientas de escritura — las que exigen confirmación. */
export function getWriteToolNames(): string[] {
  return getToolsByKind("write").map((tool) => tool.name);
}

export function isWriteTool(name: string): boolean {
  return getTool(name)?.kind === "write";
}

export function isImplemented(name: string): boolean {
  return getTool(name)?.implemented === true;
}
