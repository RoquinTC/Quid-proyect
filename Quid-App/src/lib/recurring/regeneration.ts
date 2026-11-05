/**
 * Regeneración de pagos programados que RESPETA las ocurrencias eliminadas.
 *
 * El problema que resuelve:
 *   Nómina y metas de ahorro, al editarse, borran sus pagos pendientes y los
 *   vuelven a crear. Si el usuario había eliminado una ocurrencia concreta,
 *   la regeneración la resucitaba: su borrado no quedaba.
 *
 * La solución:
 *   Eliminar ya no borra la fila, la marca `status: "cancelled"`. La
 *   regeneración lee esas fechas canceladas y **no vuelve a crear** una
 *   ocurrencia en ellas.
 *
 * La comparación es por DÍA (YYYY-MM-DD en hora local), no por instante: la
 * fecha de un pago es un día, no un momento.
 */

/** Client mínimo necesario (sirve tanto `db` como un `tx` de transacción). */
type RecurringClient = {
  recurringPayment: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: { scheduledDate: true };
    }) => Promise<Array<{ scheduledDate: Date | string }>>;
  };
};

/** Fecha local en formato YYYY-MM-DD. */
export function recurringDateKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Devuelve el conjunto de días (YYYY-MM-DD) que el usuario eliminó
 * deliberadamente dentro de un ámbito (grupo de nómina, meta de ahorro...).
 *
 * @param where Filtro del ámbito, SIN `status` (se agrega aquí).
 */
export async function getCancelledDateKeys(
  client: RecurringClient,
  where: Record<string, unknown>
): Promise<Set<string>> {
  const rows = await client.recurringPayment.findMany({
    where: { ...where, status: "cancelled" },
    select: { scheduledDate: true },
  });

  const keys = new Set<string>();
  for (const row of rows) {
    const key = recurringDateKey(row.scheduledDate);
    if (key) keys.add(key);
  }
  return keys;
}

/** ¿Esta fecha fue eliminada por el usuario? */
export function isCancelledDate(
  cancelledKeys: Set<string>,
  scheduledDate: Date | string
): boolean {
  return cancelledKeys.has(recurringDateKey(scheduledDate));
}
