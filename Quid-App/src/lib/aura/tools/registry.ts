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

export const CONSULTAR_MOVIMIENTOS: ToolDefinition = {
  name: "consultar_movimientos",
  kind: "read",
  implemented: true,
  description:
    "Lista los movimientos más recientes (ingresos, gastos y transferencias) con cuenta, categoría y fecha.",
  parameters: [
    { name: "period", type: "enum", required: false, values: ["hoy", "semana", "mes", "año", "todo"], defaultValue: "mes", description: "Período a consultar." },
    { name: "type", type: "enum", required: false, values: ["todos", "income", "expense", "transfer"], defaultValue: "todos", description: "Tipo de movimiento." },
    { name: "category", type: "string", required: false, description: "Limita a una categoría." },
    { name: "search", type: "string", required: false, description: "Texto a buscar en la descripción." },
    { name: "limit", type: "number", required: false, defaultValue: 15, description: "Cuántos devolver (1 a 50)." },
  ],
};

export const CONSULTAR_PRESUPUESTOS: ToolDefinition = {
  name: "consultar_presupuestos",
  kind: "read",
  implemented: true,
  description: "Devuelve cada presupuesto con lo ejecutado, el límite y cuánto queda.",
  parameters: [],
};

export const CONSULTAR_DEUDAS: ToolDefinition = {
  name: "consultar_deudas",
  kind: "read",
  implemented: true,
  description: "Lista las deudas con saldo, cuota mensual y días de corte y pago.",
  parameters: [],
};

export const CONSULTAR_METAS: ToolDefinition = {
  name: "consultar_metas",
  kind: "read",
  implemented: true,
  description: "Lista las metas de ahorro activas con su progreso y fecha límite.",
  parameters: [],
};

export const CONSULTAR_PAGOS_RECURRENTES: ToolDefinition = {
  name: "consultar_pagos_recurrentes",
  kind: "read",
  implemented: true,
  description: "Lista los pagos recurrentes pendientes de los próximos días con sus totales.",
  parameters: [
    { name: "days", type: "number", required: false, defaultValue: 30, description: "Ventana en días (1 a 365)." },
    { name: "type", type: "enum", required: false, values: ["todos", "expense", "income", "transfer"], defaultValue: "todos", description: "Tipo de pago." },
  ],
};

export const CONSULTAR_VEHICULOS: ToolDefinition = {
  name: "consultar_vehiculos",
  kind: "read",
  implemented: true,
  description: "Lista los vehículos con odómetro, recordatorios activos y documentos por vencer.",
  parameters: [],
};

export const CONSULTAR_DESPENSA: ToolDefinition = {
  name: "consultar_despensa",
  kind: "read",
  implemented: true,
  description: "Lista los productos de la despensa y marca los que están por debajo del mínimo.",
  parameters: [
    { name: "onlyLow", type: "boolean", required: false, defaultValue: false, description: "Solo los que están bajo el mínimo." },
  ],
};

export const CONSULTAR_RESUMEN: ToolDefinition = {
  name: "consultar_resumen",
  kind: "read",
  implemented: true,
  description: "Devuelve ingresos, gastos y balance por mes de los últimos meses.",
  parameters: [
    { name: "months", type: "number", required: false, defaultValue: 6, description: "Cuántos meses hacia atrás (1 a 12)." },
  ],
};

export const REGISTRAR_TRANSFERENCIA: ToolDefinition = {
  name: "registrar_transferencia",
  kind: "write",
  implemented: true,
  description:
    "Mueve plata entre dos cuentas o bolsillos del usuario. Los saldos y el movimiento se registran juntos.",
  parameters: [
    { name: "fromAccountName", type: "string", required: true, description: "Cuenta o bolsillo de origen." },
    { name: "toAccountName", type: "string", required: true, description: "Cuenta o bolsillo de destino." },
    { name: "amount", type: "number", required: true, description: "Valor a transferir, en pesos." },
    { name: "dateText", type: "string", required: false, description: 'Fecha en lenguaje natural: "hoy", "ayer".' },
    { name: "notes", type: "string", required: false, description: "Nota opcional del movimiento." },
  ],
};

export const CREAR_PRESUPUESTO: ToolDefinition = {
  name: "crear_presupuesto",
  kind: "write",
  implemented: true,
  description:
    "Crea o actualiza el presupuesto de una categoría. Si ya existe, cambia el límite sin tocar lo ejecutado.",
  parameters: [
    { name: "category", type: "string", required: true, description: "Categoría del presupuesto." },
    { name: "amount", type: "number", required: true, description: "Límite mensual, en pesos." },
    { name: "type", type: "enum", required: false, values: ["expense", "income"], defaultValue: "expense", description: "Si el presupuesto es de gasto o de ingreso." },
    { name: "period", type: "enum", required: false, values: ["monthly", "weekly", "yearly"], defaultValue: "monthly", description: "Periodicidad del presupuesto." },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Índice
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  // Escritura
  REGISTRAR_TRANSACCION,
  REGISTRAR_TANQUEO,
  REGISTRAR_TRANSFERENCIA,
  CREAR_PRESUPUESTO,
  // Lectura
  CONSULTAR_GASTOS,
  CONSULTAR_SALDO,
  CONSULTAR_MOVIMIENTOS,
  CONSULTAR_PRESUPUESTOS,
  CONSULTAR_DEUDAS,
  CONSULTAR_METAS,
  CONSULTAR_PAGOS_RECURRENTES,
  CONSULTAR_VEHICULOS,
  CONSULTAR_DESPENSA,
  CONSULTAR_RESUMEN,
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
