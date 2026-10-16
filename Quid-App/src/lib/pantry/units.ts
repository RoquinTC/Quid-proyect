/**
 * Unidades de medida — lógica pura.
 *
 * Decisiones de diseño (ver docs/MODULO_NEVERA_ESPECIFICACION.md §6.2):
 *
 *  - `g` y `ml` NO multiplican cantidad × precio por defecto. En granel ya
 *    pesaste y pagaste: el valor capturado ES el total de la línea.
 *    El resto de unidades sí multiplican (valor = precio unitario).
 *
 *  - Este módulo es deliberadamente PURO: no importa Prisma ni `@/lib/db`,
 *    para que pueda testearse sin efectos secundarios (igual que
 *    `fuel-efficiency.ts`).
 *
 *  - El catálogo es el de la semilla de SoftList traducido a es-CO. No se
 *    importan los 316 productos: el catálogo de productos crece por uso.
 */

/** Dimensión física de una unidad. `count` = unidades discretas. */
export type UnitDimension = "mass" | "volume" | "count" | "unknown";

export interface UnitDefinition {
  /** Código canónico, estable, el que se persiste. */
  code: string;
  /** Etiqueta corta en español para la UI. */
  label: string;
  /** Plural, para textos. */
  plural: string;
  dimension: UnitDimension;
  /** Factor a la unidad base de su dimensión (kg para masa, l para volumen). */
  factorToBase: number;
  /** ¿Multiplica cantidad × precio por defecto? Ver §6.2. */
  defaultMultiplyQuantity: boolean;
}

/**
 * Catálogo de unidades. Los `code` de masa/volumen siguen el estándar
 * (`kg`, `g`, `lb`, `oz`, `l`, `ml`) porque SoftList usa JSR-385 sobre nombres
 * reconocidos; mantener los códigos estándar deja la puerta abierta a
 * interoperar sin conversiones ad-hoc.
 */
export const UNITS: readonly UnitDefinition[] = [
  // ── Masa (base: kg) ──
  { code: "kg", label: "kg", plural: "kg", dimension: "mass", factorToBase: 1, defaultMultiplyQuantity: true },
  { code: "g", label: "g", plural: "g", dimension: "mass", factorToBase: 0.001, defaultMultiplyQuantity: false },
  { code: "lb", label: "lb", plural: "lb", dimension: "mass", factorToBase: 0.45359237, defaultMultiplyQuantity: true },
  { code: "oz", label: "oz", plural: "oz", dimension: "mass", factorToBase: 0.028349523125, defaultMultiplyQuantity: true },

  // ── Volumen (base: l) ──
  { code: "l", label: "L", plural: "L", dimension: "volume", factorToBase: 1, defaultMultiplyQuantity: true },
  { code: "ml", label: "ml", plural: "ml", dimension: "volume", factorToBase: 0.001, defaultMultiplyQuantity: false },
  { code: "gal", label: "gal", plural: "gal", dimension: "volume", factorToBase: 3.785411784, defaultMultiplyQuantity: true },

  // ── Conteo (unidades discretas) ──
  { code: "unit", label: "un", plural: "un", dimension: "count", factorToBase: 1, defaultMultiplyQuantity: true },
  { code: "dozen", label: "dz", plural: "dz", dimension: "count", factorToBase: 12, defaultMultiplyQuantity: true },
  { code: "package", label: "paquete", plural: "paquetes", dimension: "count", factorToBase: 1, defaultMultiplyQuantity: true },
  { code: "box", label: "caja", plural: "cajas", dimension: "count", factorToBase: 1, defaultMultiplyQuantity: true },
  { code: "bottle", label: "botella", plural: "botellas", dimension: "count", factorToBase: 1, defaultMultiplyQuantity: true },
  { code: "can", label: "lata", plural: "latas", dimension: "count", factorToBase: 1, defaultMultiplyQuantity: true },
  { code: "bag", label: "bolsa", plural: "bolsas", dimension: "count", factorToBase: 1, defaultMultiplyQuantity: true },
] as const;

const BY_CODE: ReadonlyMap<string, UnitDefinition> = new Map(
  UNITS.map((u) => [u.code.toLowerCase(), u])
);

/** Unidad usada cuando no se reconoce el código. */
export const FALLBACK_UNIT_CODE = "unit";

/**
 * Busca una unidad por código, sin distinguir mayúsculas.
 *
 * Los usuarios de SoftList crean unidades propias con nombre libre, así que
 * un código desconocido NO es un error: devuelve `undefined` y quien llama
 * decide (normalmente tratarlo como conteo).
 */
export function findUnit(code: string | null | undefined): UnitDefinition | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.trim().toLowerCase());
}

/** ¿Se reconoce esta unidad en el catálogo? */
export function isKnownUnit(code: string | null | undefined): boolean {
  return findUnit(code) !== undefined;
}

/** Dimensión de una unidad. Unidad desconocida ⇒ `"unknown"`. */
export function unitDimension(code: string | null | undefined): UnitDimension {
  return findUnit(code)?.dimension ?? "unknown";
}

/**
 * ¿La línea multiplica cantidad × precio para esta unidad?
 *
 * Es el `MULTIPLICAR_VALOR` de SoftList, pero explícito y por producto en lugar
 * de escondido en la tabla de unidades. Si la unidad no se reconoce, se asume
 * que sí multiplica (comportamiento de SoftList: solo `g` y `ml` no lo hacen).
 */
export function defaultMultiplyQuantity(code: string | null | undefined): boolean {
  return findUnit(code)?.defaultMultiplyQuantity ?? true;
}

/** ¿Se pueden convertir cantidades entre estas dos unidades? */
export function areUnitsCompatible(
  from: string | null | undefined,
  to: string | null | undefined
): boolean {
  const a = findUnit(from);
  const b = findUnit(to);
  if (!a || !b) return false;
  return a.dimension === b.dimension;
}

/**
 * Convierte una cantidad entre unidades de la misma dimensión.
 *
 * Cuando las unidades son incompatibles (kg → unidad, o un código
 * desconocido) **no se lanza error**: devuelve la cantidad original con
 * `converted: false`. Es el mismo criterio que SoftList, donde una unidad
 * incompatible hace que el valor se trate como total de la línea en vez de
 * romper el cálculo.
 *
 * @param unitWeightFactor Factor opcional propio del producto, para unidades
 *   que el catálogo no conoce (equivale al `unitWeightFactor` de `PantryItem`).
 */
export function convertQuantity(
  quantity: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
  unitWeightFactor?: number | null
): { quantity: number; converted: boolean } {
  if (!Number.isFinite(quantity)) return { quantity: 0, converted: false };

  const from = fromUnit?.trim().toLowerCase();
  const to = toUnit?.trim().toLowerCase();

  if (!from || !to || from === to) return { quantity, converted: true };

  const a = findUnit(from);
  const b = findUnit(to);

  // Ambas conocidas y de la misma dimensión: conversión exacta.
  if (a && b && a.dimension === b.dimension) {
    return {
      quantity: (quantity * a.factorToBase) / b.factorToBase,
      converted: true,
    };
  }

  // Unidad de destino desconocida pero con factor declarado en el producto:
  // se usa ese factor como peso en la unidad base de la unidad de origen.
  if (a && !b && unitWeightFactor && unitWeightFactor > 0) {
    return {
      quantity: quantity * a.factorToBase * unitWeightFactor,
      converted: true,
    };
  }

  // Incompatibles o desconocidas: se deja la cantidad intacta y se informa.
  return { quantity, converted: false };
}

/**
 * Redondea una cantidad para mostrarla sin ruido de coma flotante.
 * Las cantidades NO son dinero: se redondean a 3 decimales (§6.3 de la
 * especificación mantiene el dinero en Decimal aparte).
 */
export function roundQuantity(quantity: number): number {
  return Math.round((quantity + Number.EPSILON) * 1000) / 1000;
}

/** Etiqueta legible de una unidad, con plural según la cantidad. */
export function unitLabel(
  code: string | null | undefined,
  quantity?: number
): string {
  const unit = findUnit(code);
  if (!unit) return code?.trim() || "";
  if (quantity !== undefined && Math.abs(quantity) !== 1) return unit.plural;
  return unit.label;
}

/**
 * Precio **real de la línea** cuando la tienda cobra en una unidad distinta a la
 * que compraste.
 *
 * El caso que resuelve (§6.2 de la especificación): la tienda cobra el kilo a
 * 12.000, pero tú compras 400 g o 1 libra. Hay que convertir la cantidad
 * comprada a la unidad de precio antes de multiplicar.
 *
 * | Compra      | Precio        | Cálculo                        | Total    |
 * |-------------|---------------|--------------------------------|----------|
 * | 400 g       | 12.000 / kg   | 0,4 × 12.000                   | 4.800    |
 * | 1 lb        | 12.000 / kg   | 0,45359237 × 12.000            | 5.443,11 |
 * | 2 kg        | 12.000 / kg   | 2 × 12.000                     | 24.000   |
 *
 * Reglas, en orden:
 *  1. **Unidad de precio distinta** → el precio es intrínsecamente unitario: se
 *     convierte la cantidad comprada a la unidad de precio y SIEMPRE se
 *     multiplica. El default de `g`/`ml` (no multiplicar) NO aplica aquí, porque
 *     ese default describe el caso de granel ya pesado, donde no hay precio por
 *     unidad de referencia.
 *  2. **Unidades incompatibles** (la tienda cobra por kg y compraste "unidad") →
 *     no se inventa conversión: el valor capturado pasa a ser el total de la
 *     línea (criterio de SoftList). Multiplicar por una cantidad no convertible
 *     daría un precio falso.
 *  3. **Sin unidad de precio distinta** → multiplicación directa, y ahí sí manda
 *     el override o el default de la unidad (`g`/`ml` ⇒ el valor es el total).
 */
export function resolveLinePrice(input: {
  quantity: number;
  /** Precio capturado, en la unidad de `priceUnitCode`. */
  value: number;
  /** Unidad en que compraste. */
  unit: string | null | undefined;
  /** Unidad en que la tienda cobra. `null` ⇒ la misma que `unit`. */
  priceUnitCode?: string | null;
  /** Override explícito. Si se omite, se usa el default de la unidad. */
  multiplyQuantity?: boolean;
  /** Factor propio del producto, para unidades que el catálogo no conoce. */
  unitWeightFactor?: number | null;
}): {
  /** Cantidad ya expresada en la unidad de precio. */
  quantityInPriceUnit: number;
  /** ¿Hubo conversión de unidad? */
  converted: boolean;
  /** ¿Se multiplicó cantidad × precio? */
  multiplied: boolean;
  /** Precio real de la línea, redondeado a 2 decimales. */
  total: number;
  /** Total sin redondear, para inspección o depuración. */
  rawTotal: number;
} {
  const quantity = Number.isFinite(input.quantity) ? input.quantity : 0;
  const value = Number.isFinite(input.value) ? input.value : 0;
  const roundedValue = Math.round((value + Number.EPSILON) * 100) / 100;

  /** El valor capturado ES el total de la línea. */
  const asLineTotal = (
    extra?: Partial<{
      quantityInPriceUnit: number;
      converted: boolean;
      multiplied: boolean;
    }>
  ) => ({
    quantityInPriceUnit: quantity,
    converted: false,
    multiplied: false,
    total: roundedValue,
    rawTotal: value,
    ...extra,
  });

  const hasDistinctPriceUnit = Boolean(
    input.priceUnitCode && input.unit && input.priceUnitCode !== input.unit
  );

  // ── Regla 1: la tienda cobra en otra unidad ⇒ convertir y multiplicar ──
  if (hasDistinctPriceUnit) {
    const { quantity: convertedQuantity, converted } = convertQuantity(
      quantity,
      input.unit,
      input.priceUnitCode,
      input.unitWeightFactor
    );

    // Regla 2: no se pudo convertir.
    if (!converted) return asLineTotal();

    const rawTotal = value * convertedQuantity;
    return {
      quantityInPriceUnit: roundQuantity(convertedQuantity),
      converted: true,
      multiplied: true,
      total: Math.round((rawTotal + Number.EPSILON) * 100) / 100,
      rawTotal,
    };
  }

  // ── Regla 3: misma unidad o sin unidad de precio ──
  const wantsMultiply = input.multiplyQuantity ?? defaultMultiplyQuantity(input.unit);
  if (!wantsMultiply) return asLineTotal();

  const rawTotal = value * quantity;
  return {
    quantityInPriceUnit: roundQuantity(quantity),
    converted: false,
    multiplied: true,
    total: Math.round((rawTotal + Number.EPSILON) * 100) / 100,
    rawTotal,
  };
}
