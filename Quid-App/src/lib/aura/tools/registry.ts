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

export const CONSULTAR_CUOTAS: ToolDefinition = {
  name: "consultar_cuotas",
  kind: "read",
  implemented: true,
  description: "Lista las cuotas pendientes de tarjetas y créditos con su fecha de pago.",
  parameters: [],
};

export const CONSULTAR_ABONOS: ToolDefinition = {
  name: "consultar_abonos",
  kind: "read",
  implemented: true,
  description: "Historial de abonos hechos a deudas.",
  parameters: [],
};

export const CONSULTAR_NOMINA: ToolDefinition = {
  name: "consultar_nomina",
  kind: "read",
  implemented: true,
  description: "Nómina configurada (sueldo y periodicidad).",
  parameters: [],
};

export const CONSULTAR_APORTES: ToolDefinition = {
  name: "consultar_aportes",
  kind: "read",
  implemented: true,
  description: "Aportes hechos a las metas de ahorro.",
  parameters: [],
};

export const CONSULTAR_INVERSIONES: ToolDefinition = {
  name: "consultar_inversiones",
  kind: "read",
  implemented: true,
  description: "CDT y rendimientos de cuentas, con tasa y vencimiento.",
  parameters: [],
};

export const CONSULTAR_TANQUEOS: ToolDefinition = {
  name: "consultar_tanqueos",
  kind: "read",
  implemented: true,
  description: "Historial de tanqueos con galones, kilómetros y consumo estimado.",
  parameters: [
    { name: "limit", type: "number", required: false, defaultValue: 10, description: "Cuántos devolver (1 a 50)." },
  ],
};

export const CONSULTAR_MANTENIMIENTOS: ToolDefinition = {
  name: "consultar_mantenimientos",
  kind: "read",
  implemented: true,
  description: "Historial de mantenimientos por vehículo con costo y próximo vencimiento.",
  parameters: [
    { name: "limit", type: "number", required: false, defaultValue: 10, description: "Cuántos devolver (1 a 30)." },
  ],
};

export const CONSULTAR_CATEGORIAS: ToolDefinition = {
  name: "consultar_categorias",
  kind: "read",
  implemented: true,
  description: "Categorías propias, grupos de categorías y cuántas reglas automáticas hay.",
  parameters: [],
};

export const CONSULTAR_CAPTURAS: ToolDefinition = {
  name: "consultar_capturas",
  kind: "read",
  implemented: true,
  description: "Capturas por clasificar de la bandeja (SMS, correo, pegadas).",
  parameters: [
    { name: "onlyPending", type: "boolean", required: false, defaultValue: true, description: "Solo las pendientes." },
  ],
};

export const CONSULTAR_ORDENES_MEDICAS: ToolDefinition = {
  name: "consultar_ordenes_medicas",
  kind: "read",
  implemented: true,
  description: "Órdenes médicas pendientes o con entrega parcial.",
  parameters: [],
};

export const CREAR_CUENTA: ToolDefinition = {
  name: "crear_cuenta",
  kind: "write",
  implemented: true,
  description: "Crea una cuenta o billetera nueva con su saldo inicial.",
  parameters: [
    { name: "name", type: "string", required: true, description: "Nombre de la cuenta." },
    { name: "type", type: "enum", required: false, values: ["checking", "savings", "cash", "digital_wallet", "credit_card", "other"], defaultValue: "checking", description: "Tipo de cuenta." },
    { name: "balance", type: "number", required: false, defaultValue: 0, description: "Saldo inicial en pesos." },
  ],
};

export const CREAR_DEUDA: ToolDefinition = {
  name: "crear_deuda",
  kind: "write",
  implemented: true,
  description: "Registra una deuda, tarjeta de crédito o préstamo.",
  parameters: [
    { name: "name", type: "string", required: true, description: "Nombre de la deuda." },
    { name: "type", type: "enum", required: false, values: ["credit_card", "loan", "other"], defaultValue: "credit_card", description: "Tipo de deuda." },
    { name: "totalAmount", type: "number", required: true, description: "Monto total, en pesos." },
    { name: "currentBalance", type: "number", required: false, description: "Saldo actual si difiere del total." },
    { name: "bank", type: "string", required: false, description: "Banco o emisor." },
    { name: "monthlyPayment", type: "number", required: false, description: "Cuota mensual." },
    { name: "cutoffDate", type: "number", required: false, description: "Día de corte (1 a 31)." },
    { name: "paymentDate", type: "number", required: false, description: "Día de pago (1 a 31)." },
  ],
};

export const CREAR_META: ToolDefinition = {
  name: "crear_meta",
  kind: "write",
  implemented: true,
  description: "Crea una meta de ahorro con su monto objetivo y, si se quiere, fecha límite.",
  parameters: [
    { name: "name", type: "string", required: true, description: "Nombre de la meta." },
    { name: "targetAmount", type: "number", required: true, description: "Monto objetivo, en pesos." },
    { name: "deadline", type: "date", required: false, description: "Fecha límite en formato AAAA-MM-DD." },
  ],
};

export const CREAR_CDT: ToolDefinition = {
  name: "crear_cdt",
  kind: "write",
  implemented: true,
  description: "Registra un CDT con banco, monto, tasa efectiva anual y plazo.",
  parameters: [
    { name: "bank", type: "string", required: true, description: "Banco emisor." },
    { name: "amount", type: "number", required: true, description: "Monto invertido, en pesos." },
    { name: "effectiveRate", type: "number", required: true, description: "Tasa efectiva anual (% EA)." },
    { name: "termDays", type: "number", required: true, description: "Plazo en días." },
  ],
};

export const REGISTRAR_ABONO: ToolDefinition = {
  name: "registrar_abono",
  kind: "write",
  implemented: true,
  description:
    "Registra un abono a una deuda: descuenta el saldo de la deuda y de la cuenta, y reparte el pago en las cuotas pendientes.",
  parameters: [
    { name: "debtName", type: "string", required: true, description: "Nombre de la deuda o tarjeta." },
    { name: "amount", type: "number", required: true, description: "Valor del abono, en pesos." },
    { name: "accountName", type: "string", required: true, description: "Cuenta o bolsillo de donde sale el dinero." },
    { name: "dateText", type: "string", required: false, description: 'Fecha en lenguaje natural: "hoy", "ayer".' },
  ],
};

export const REGISTRAR_APORTE_META: ToolDefinition = {
  name: "registrar_aporte_meta",
  kind: "write",
  implemented: true,
  description:
    "Aporta a una meta de ahorro. Si se indica cuenta, además registra el gasto y descuenta el saldo.",
  parameters: [
    { name: "goalName", type: "string", required: true, description: "Nombre de la meta." },
    { name: "amount", type: "number", required: true, description: "Valor del aporte, en pesos." },
    { name: "accountName", type: "string", required: false, description: "Cuenta desde la que se aporta." },
    { name: "dateText", type: "string", required: false, description: 'Fecha en lenguaje natural: "hoy", "ayer".' },
  ],
};

export const CREAR_RECURRENTE: ToolDefinition = {
  name: "crear_recurrente",
  kind: "write",
  implemented: true,
  description:
    "Crea un pago recurrente mensual (gasto, ingreso o transferencia) con su día de cobro.",
  parameters: [
    { name: "description", type: "string", required: true, description: "Nombre del pago." },
    { name: "amount", type: "number", required: true, description: "Valor, en pesos." },
    { name: "type", type: "enum", required: false, values: ["expense", "income", "transfer"], defaultValue: "expense", description: "Si es gasto, ingreso o transferencia." },
    { name: "day", type: "number", required: false, description: "Día del mes (1 a 31)." },
    { name: "frequency", type: "enum", required: false, values: ["monthly", "weekly", "yearly"], defaultValue: "monthly", description: "Periodicidad." },
    { name: "fromAccountName", type: "string", required: false, description: "Cuenta de origen (obligatoria si es transferencia)." },
    { name: "toAccountName", type: "string", required: false, description: "Cuenta de destino (obligatoria si es transferencia)." },
    { name: "category", type: "string", required: false, description: "Categoría del pago." },
  ],
};

export const CREAR_CATEGORIA: ToolDefinition = {
  name: "crear_categoria",
  kind: "write",
  implemented: true,
  description: "Crea una categoría de gasto o de ingreso.",
  parameters: [
    { name: "name", type: "string", required: true, description: "Nombre de la categoría." },
    { name: "type", type: "enum", required: false, values: ["expense", "income"], defaultValue: "expense", description: "Si es de gasto o de ingreso." },
  ],
};

export const CREAR_RECORDATORIO: ToolDefinition = {
  name: "crear_recordatorio",
  kind: "write",
  implemented: true,
  description: "Crea un recordatorio para un vehículo, por fecha, por kilometraje o ambos.",
  parameters: [
    { name: "title", type: "string", required: true, description: "Qué hay que recordar." },
    { name: "vehicleName", type: "string", required: false, description: "Vehículo o placa." },
    { name: "dueDate", type: "date", required: false, description: "Fecha límite (AAAA-MM-DD)." },
    { name: "dueKm", type: "number", required: false, description: "Kilometraje objetivo." },
    { name: "warningDays", type: "number", required: false, defaultValue: 7, description: "Días de aviso antes." },
    { name: "warningKm", type: "number", required: false, defaultValue: 500, description: "Kilómetros de aviso antes." },
  ],
};

export const REGISTRAR_MANTENIMIENTO: ToolDefinition = {
  name: "registrar_mantenimiento",
  kind: "write",
  implemented: true,
  description: "Registra un mantenimiento hecho a un vehículo, con costo y kilometraje.",
  parameters: [
    { name: "description", type: "string", required: true, description: "Qué se hizo." },
    { name: "vehicleName", type: "string", required: false, description: "Vehículo o placa." },
    { name: "type", type: "string", required: false, description: "Tipo: oil_change, tire_change, general, etc." },
    { name: "cost", type: "number", required: false, defaultValue: 0, description: "Costo en pesos." },
    { name: "km", type: "number", required: false, description: "Odómetro al momento." },
    { name: "nextDueKm", type: "number", required: false, description: "Kilometraje del próximo servicio." },
    { name: "dateText", type: "string", required: false, description: 'Fecha en lenguaje natural: "hoy", "ayer".' },
  ],
};

export const CREAR_CITA: ToolDefinition = {
  name: "crear_cita",
  kind: "write",
  implemented: true,
  description: "Agenda una cita médica con fecha y hora.",
  parameters: [
    { name: "date", type: "date", required: true, description: "Fecha de la cita (AAAA-MM-DD)." },
    { name: "time", type: "string", required: false, defaultValue: "09:00", description: "Hora en formato HH:MM." },
    { name: "specialty", type: "string", required: false, description: "Especialidad." },
    { name: "doctorName", type: "string", required: false, description: "Nombre del doctor." },
    { name: "location", type: "string", required: false, description: "Lugar de la cita." },
  ],
};

export const CREAR_MEDICAMENTO: ToolDefinition = {
  name: "crear_medicamento",
  kind: "write",
  implemented: true,
  description: "Registra un medicamento con su dosis y horarios de recordatorio.",
  parameters: [
    { name: "name", type: "string", required: true, description: "Nombre del medicamento." },
    { name: "dosage", type: "string", required: true, description: "Dosis, por ejemplo '1 tableta'." },
    { name: "times", type: "string", required: false, description: 'Horarios separados por coma: "08:00,20:00".' },
    { name: "disease", type: "string", required: false, description: "Para qué es." },
  ],
};

export const CREAR_NOMINA: ToolDefinition = {
  name: "crear_nomina",
  kind: "write",
  implemented: true,
  description: "Configura la nómina: monto, periodicidad, cuenta donde entra y los días de pago.",
  parameters: [
    { name: "totalAmount", type: "number", required: true, description: "Monto de la nómina, en pesos." },
    { name: "accountName", type: "string", required: true, description: "Cuenta donde se recibe." },
    { name: "description", type: "string", required: false, defaultValue: "Sueldo", description: "Nombre de la nómina." },
    { name: "frequency", type: "enum", required: false, values: ["monthly", "biweekly", "weekly"], defaultValue: "monthly", description: "Periodicidad." },
    { name: "days", type: "string", required: false, description: 'Días de pago separados por coma: "15,30".' },
    { name: "category", type: "string", required: false, description: "Categoría del ingreso." },
  ],
};

export const AGREGAR_ITEM_DESPENSA: ToolDefinition = {
  name: "agregar_item_despensa",
  kind: "write",
  implemented: true,
  description: "Agrega un producto a la despensa; si ya existe, suma la cantidad.",
  parameters: [
    { name: "name", type: "string", required: true, description: "Nombre del producto." },
    { name: "quantity", type: "number", required: false, defaultValue: 1, description: "Cantidad." },
    { name: "unit", type: "string", required: false, defaultValue: "unit", description: "Unidad: unit, kg, l, lb..." },
    { name: "category", type: "string", required: false, description: "Categoría del producto." },
    { name: "minStock", type: "number", required: false, description: "Mínimo para avisar stock bajo." },
  ],
};

export const CREAR_LISTA_COMPRAS: ToolDefinition = {
  name: "crear_lista_compras",
  kind: "write",
  implemented: true,
  description: "Crea una lista de compras con sus productos.",
  parameters: [
    { name: "name", type: "string", required: false, description: "Nombre de la lista." },
    { name: "items", type: "string", required: false, description: 'Productos separados por coma: "leche, pan, huevos".' },
  ],
};

export const CREAR_RECETA: ToolDefinition = {
  name: "crear_receta",
  kind: "write",
  implemented: true,
  description: "Guarda una receta con porciones, ingredientes y preparación.",
  parameters: [
    { name: "name", type: "string", required: true, description: "Nombre de la receta." },
    { name: "servings", type: "number", required: false, defaultValue: 1, description: "Porciones." },
    { name: "ingredients", type: "string", required: false, description: "Ingredientes separados por coma." },
    { name: "instructions", type: "string", required: false, description: "Pasos, separados por salto de línea." },
  ],
};

export const CREAR_DOCUMENTO_VEHICULO: ToolDefinition = {
  name: "crear_documento_vehiculo",
  kind: "write",
  implemented: true,
  description: "Registra un documento del vehículo (SOAT, tecnomecánica, seguro, impuesto).",
  parameters: [
    { name: "type", type: "string", required: true, description: "soat, tecnomecanica, seguro, impuesto u otro." },
    { name: "expiryDate", type: "date", required: true, description: "Vencimiento (AAAA-MM-DD)." },
    { name: "vehicleName", type: "string", required: false, description: "Vehículo o placa." },
    { name: "issueDate", type: "date", required: false, description: "Fecha de expedición (AAAA-MM-DD)." },
    { name: "cost", type: "number", required: false, defaultValue: 0, description: "Costo, en pesos." },
  ],
};

export const CREAR_ORDEN_MEDICA: ToolDefinition = {
  name: "crear_orden_medica",
  kind: "write",
  implemented: true,
  description: "Registra una orden médica pendiente de reclamar.",
  parameters: [
    { name: "title", type: "string", required: true, description: "Qué ordena (exámenes, medicamentos...)." },
    { name: "orderNumber", type: "string", required: false, description: "Número de la orden." },
    { name: "notes", type: "string", required: false, description: "Notas." },
  ],
};

export const CREAR_GRUPO_CATEGORIA: ToolDefinition = {
  name: "crear_grupo_categoria",
  kind: "write",
  implemented: true,
  description: "Crea un grupo de categorías (por ejemplo Vivienda) y le agrega categorías.",
  parameters: [
    { name: "name", type: "string", required: true, description: "Nombre del grupo." },
    { name: "categories", type: "string", required: false, description: "Categorías separadas por coma." },
    { name: "type", type: "enum", required: false, values: ["expense", "income"], defaultValue: "expense", description: "Gasto o ingreso." },
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
  CREAR_CUENTA,
  CREAR_DEUDA,
  CREAR_META,
  CREAR_CDT,
  REGISTRAR_ABONO,
  REGISTRAR_APORTE_META,
  CREAR_RECURRENTE,
  CREAR_CATEGORIA,
  CREAR_RECORDATORIO,
  REGISTRAR_MANTENIMIENTO,
  CREAR_CITA,
  CREAR_MEDICAMENTO,
  CREAR_NOMINA,
  AGREGAR_ITEM_DESPENSA,
  CREAR_LISTA_COMPRAS,
  CREAR_RECETA,
  CREAR_DOCUMENTO_VEHICULO,
  CREAR_ORDEN_MEDICA,
  CREAR_GRUPO_CATEGORIA,
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
  CONSULTAR_CUOTAS,
  CONSULTAR_ABONOS,
  CONSULTAR_NOMINA,
  CONSULTAR_APORTES,
  CONSULTAR_INVERSIONES,
  CONSULTAR_TANQUEOS,
  CONSULTAR_MANTENIMIENTOS,
  CONSULTAR_CATEGORIAS,
  CONSULTAR_CAPTURAS,
  CONSULTAR_ORDENES_MEDICAS,
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
