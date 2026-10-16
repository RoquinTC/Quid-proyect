/**
 * Normalización de nombres de producto — lógica pura.
 *
 * Portado del algoritmo de SoftList 2.8.3 (`AbstractC5743x.m27548K`), que es lo
 * único de su modelo de catálogo que conviene copiar **con una corrección**:
 *
 *   SoftList normaliza el nombre pero luego **deduplica por el nombre crudo**
 *   (`WHERE NOME = ?`), así que "Leche" y "leche" crean DOS productos.
 *   Aquí el normalizado ES la clave de deduplicación.
 *
 * Algoritmo: NFD → quitar marcas diacríticas → minúsculas → quitar espacios.
 *
 * Módulo puro: sin Prisma, sin `@/lib/db`.
 */

/** Marcas diacríticas Unicode (el `\p{M}` de la implementación original). */
const COMBINING_MARKS = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;

/** Todo lo que no sea letra o dígito, para la clave de búsqueda. */
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

/**
 * Normaliza un nombre de producto a su clave canónica.
 *
 * ```ts
 * normalizeName("Leche Entera  x1L")  // "lecheenterax1l"
 * normalizeName("  Café  Molido  ")   // "cafemolido"
 * normalizeName("Aguardiente")        // "aguardiente"
 * ```
 *
 * Devuelve `""` para entradas vacías o solo-espacios. Si tras normalizar queda
 * vacío (p. ej. el nombre eran solo símbolos) devuelve el original recortado,
 * replicando el "guard" de la implementación original.
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  const original = name.trim();
  if (!original) return "";

  const normalized = original
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/\s+/g, "");

  return normalized || original;
}

/**
 * Clave de comparación más tolerante que `normalizeName`: además de normalizar,
 * colapsa todo lo que no sea letra o dígito.
 *
 * Se usa para *sugerencias* y búsqueda difusa, NO para la restricción única
 * (esa usa `normalizeName`, que es determinista y estable).
 *
 * ```ts
 * searchKey("Leche en polvo, 1kg")  // "lecheenpolvo1kg"
 * searchKey("Café-Molido")          // "cafemolido"
 * ```
 */
export function searchKey(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, "");
}

/**
 * ¿Dos nombres se refieren al mismo producto?
 * Compara por `normalizeName`, que es la misma clave de la restricción única.
 */
export function isSameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na !== "" && na === nb;
}

/**
 * Busca el producto existente más probable dado un nombre, dentro de una lista
 * de candidatos.
 *
 * Orden de preferencia:
 *  1. Coincidencia exacta por `normalizeName` (la clave única).
 *  2. Coincidencia por `searchKey` (ignora puntuación).
 *  3. Prefijo por `searchKey`, eligiendo el candidato más corto (el más
 *     específico de los genéricos).
 *
 * Devuelve `undefined` si nada es razonablemente equivalente. Esto reemplaza la
 * comparación por nombre crudo del endpoint actual, que duplica productos.
 */
export function matchExistingProduct<T>(
  name: string,
  candidates: readonly T[],
  getName: (candidate: T) => string
): T | undefined {
  const target = normalizeName(name);
  if (!target) return undefined;

  for (const candidate of candidates) {
    if (normalizeName(getName(candidate)) === target) return candidate;
  }

  const key = searchKey(name);
  if (!key) return undefined;

  for (const candidate of candidates) {
    if (searchKey(getName(candidate)) === key) return candidate;
  }

  let best: T | undefined;
  let bestLength = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateKey = searchKey(getName(candidate));
    if (!candidateKey.startsWith(key)) continue;
    if (candidateKey.length < bestLength) {
      best = candidate;
      bestLength = candidateKey.length;
    }
  }
  return best;
}
