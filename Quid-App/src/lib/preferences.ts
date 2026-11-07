/**
 * F-51 · Preferencias de presentación.
 *
 * `formatCurrency` se usa en 44 lugares. Pasarlo por props en cada uno sería
 * ruido y una fuente de inconsistencias, así que la preferencia vive en un
 * módulo: la app la carga una vez desde los ajustes y el formateador la lee.
 *
 * Se mantiene deliberadamente simple y sin React: así también funciona en
 * cualquier helper que formatee dinero fuera de un componente.
 */

let showDecimals = true;

/** ¿Se muestran los centavos? Por defecto sí. */
export function getShowDecimals(): boolean {
  return showDecimals;
}

/**
 * Actualiza la preferencia. La llama el sincronizador de ajustes; no se debe
 * invocar desde componentes sueltos.
 */
export function setShowDecimals(value: boolean): void {
  showDecimals = value === true;
}
