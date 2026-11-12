/**
 * Catálogo de tipos de deuda.
 *
 * Antes el código comparaba `type === "credit_card"` y todo lo demás caía en
 * "préstamo", así que una deuda "otra" se comportaba como tarjeta y un préstamo
 * hipotecario como uno personal. Aquí cada tipo declara **cómo se comporta**, y
 * el resto del código pregunta por el comportamiento, no por el nombre.
 *
 * Los valores guardados en la base son texto libre (`debt.type`), así que se
 * pueden agregar tipos sin migración. Los históricos (`loan`, `other`) siguen
 * funcionando mediante alias.
 */

export type DebtBehavior = "revolving" | "installment" | "open_balance";

export interface DebtTypeDefinition {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  /** Cómo se paga y cómo se mide el pendiente. */
  behavior: DebtBehavior;
  /** Tiene fecha de corte además de fecha de pago (tarjetas). */
  hasCutoff: boolean;
  /** Se define cuota mensual y número de cuotas. */
  hasTerm: boolean;
  /** Se cobra interés y se registra por cuota. */
  hasInterest: boolean;
  /**
   * Al pagar, ¿cuenta como gasto del presupuesto?
   * - Préstamo: sí, el pago es el gasto.
   * - Tarjeta: no, el gasto ya se registró en la compra (el pago es transferencia).
   */
  paymentCountsAsExpense: boolean;
  /** Alias históricos que se guardaron con este comportamiento. */
  aliases?: string[];
}

export const DEBT_TYPES: DebtTypeDefinition[] = [
  {
    id: "credit_card",
    label: "Tarjeta de crédito",
    shortLabel: "Tarjeta",
    description: "Cupo rotativo con corte y fecha de pago. El pago es una transferencia.",
    behavior: "revolving",
    hasCutoff: true,
    hasTerm: false,
    hasInterest: false,
    paymentCountsAsExpense: false,
  },
  {
    id: "store_card",
    label: "Tarjeta de tienda",
    shortLabel: "Tienda",
    description: "Cupo de una tienda (Éxito, Falabella…). Igual que una tarjeta, con su corte.",
    behavior: "revolving",
    hasCutoff: true,
    hasTerm: false,
    hasInterest: false,
    paymentCountsAsExpense: false,
  },
  {
    id: "personal_loan",
    label: "Préstamo personal / libre inversión",
    shortLabel: "Personal",
    description: "Cuotas fijas con interés. El pago cuenta como gasto del mes.",
    behavior: "installment",
    hasCutoff: false,
    hasTerm: true,
    hasInterest: true,
    paymentCountsAsExpense: true,
    aliases: ["loan"],
  },
  {
    id: "auto_loan",
    label: "Crédito de vehículo",
    shortLabel: "Vehículo",
    description: "Cuotas con interés atadas a un vehículo. El pago cuenta como gasto.",
    behavior: "installment",
    hasCutoff: false,
    hasTerm: true,
    hasInterest: true,
    paymentCountsAsExpense: true,
  },
  {
    id: "mortgage",
    label: "Crédito hipotecario",
    shortLabel: "Hipoteca",
    description: "Cuotas a muchos años, con seguro e intereses propios. El pago es gasto.",
    behavior: "installment",
    hasCutoff: false,
    hasTerm: true,
    hasInterest: true,
    paymentCountsAsExpense: true,
  },
  {
    id: "student_loan",
    label: "Crédito educativo",
    shortLabel: "Educativo",
    description: "Cuotas con interés para estudios (ICETEX y similares).",
    behavior: "installment",
    hasCutoff: false,
    hasTerm: true,
    hasInterest: true,
    paymentCountsAsExpense: true,
  },
  {
    id: "informal_loan",
    label: "Préstamo informal",
    shortLabel: "Informal",
    description: "Gota a gota, familiar o amigo: acuerdas cuotas sin banco de por medio.",
    behavior: "installment",
    hasCutoff: false,
    hasTerm: true,
    hasInterest: true,
    paymentCountsAsExpense: true,
  },
  {
    id: "other",
    label: "Otra deuda",
    shortLabel: "Otra",
    description: "Un saldo que debes pagar sin cuotas definidas (servicios, favores).",
    behavior: "open_balance",
    hasCutoff: false,
    hasTerm: false,
    hasInterest: false,
    paymentCountsAsExpense: false,
  },
];

const BY_ID = new Map<string, DebtTypeDefinition>();
for (const definition of DEBT_TYPES) {
  BY_ID.set(definition.id, definition);
  for (const alias of definition.aliases ?? []) BY_ID.set(alias, definition);
}

/** Fallback para valores desconocidos: se trata como saldo abierto, sin cuotas. */
const FALLBACK = BY_ID.get("other")!;

export function debtTypeOf(type: string | null | undefined): DebtTypeDefinition {
  if (!type) return FALLBACK;
  return BY_ID.get(type) ?? FALLBACK;
}

/** Deuda que se paga en cuotas sobre un capital (préstamos en todas sus formas). */
export function isInstallmentDebt(type: string | null | undefined): boolean {
  return debtTypeOf(type).behavior === "installment";
}

/** Deuda con cupo rotativo y corte (tarjetas). */
export function isRevolvingDebt(type: string | null | undefined): boolean {
  return debtTypeOf(type).behavior === "revolving";
}

/** Opciones para el formulario, con su explicación. */
export const DEBT_TYPE_OPTIONS = DEBT_TYPES.map((definition) => ({
  value: definition.id,
  label: definition.label,
  description: definition.description,
}));
