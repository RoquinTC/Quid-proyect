/**
 * F-43 · Categorías creadas desde los formularios.
 *
 * Antes, escribir una categoría nueva en cualquier formulario (transacción,
 * presupuesto, deuda, cuota, pago) servía SOLO para ese registro: nunca se
 * guardaba, así que al día siguiente había que volver a escribirla.
 *
 * Este helper la persiste en `Category`, que es la tabla de categorías propias
 * del usuario (única por `userId + type + name`). A partir de ahí aparece sola
 * en los selectores de todos los formularios.
 *
 * Reglas:
 *  - **Idempotente**: si ya existe, la API responde 409 y aquí se ignora.
 *  - **Nunca bloquea**: si falla (offline, permiso, lo que sea), el registro
 *    principal se guarda igual con el texto de la categoría.
 */

import { apiFetch } from "@/lib/api";

export type CategoryType = "income" | "expense";

/**
 * Asegura que la categoría exista como opción futura.
 *
 * @returns `true` si quedó creada (o ya existía), `false` si no se pudo.
 */
export async function ensureCategory(
  type: CategoryType,
  name: string | null | undefined
): Promise<boolean> {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;

  try {
    await apiFetch("/api/categories", {
      method: "POST",
      body: JSON.stringify({ type, name: trimmed }),
    });
    return true;
  } catch {
    // 409 (ya existe) y cualquier otro fallo se ignoran a propósito:
    // guardar el movimiento es más importante que registrar la categoría.
    return false;
  }
}
