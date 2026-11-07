/**
 * F-41 · Proyección del saldo día a día.
 *
 * Responde la pregunta que de verdad importa: "¿me alcanza para el 15?".
 *
 * Toma el saldo disponible de hoy y le aplica los pagos e ingresos ya
 * programados (recurrentes, nómina, cuotas) en orden de fecha, día por día.
 * El dato clave no es el saldo final sino el **punto más bajo**: si el saldo
 * se hunde el día 12 y se recupera el 20, lo que importa es el 12.
 *
 * Es puro y sin dependencias para poder probarlo con casos concretos.
 */

export type ProjectionEvent = {
  /** Fecha en formato YYYY-MM-DD. */
  date: string;
  amount: number;
  /** expense | transfer | income */
  type: string;
  description: string;
};

export type ProjectionDay = {
  date: string;
  /** Saldo al terminar el día. */
  balance: number;
  /** Movimientos de ese día (puede estar vacío). */
  events: ProjectionEvent[];
};

export type ProjectionResult = {
  days: ProjectionDay[];
  /** Saldo desde el que se proyecta. */
  startBalance: number;
  /** Saldo al final del periodo. */
  endBalance: number;
  /** El día más ajustado: el de menor saldo. */
  lowest: ProjectionDay | null;
  /** Días en que el saldo queda por debajo de cero. */
  daysInRed: number;
  /** Total que entra y sale en el periodo. */
  totalIn: number;
  totalOut: number;
};

/** Suma los días: la fecha de entrada no se modifica. */
function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Clave YYYY-MM-DD en hora local (no UTC, para no correr el día). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Convierte "YYYY-MM-DD" a fecha local (evita el corrimiento de UTC). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Construye la proyección.
 *
 * @param startBalance saldo disponible hoy (sin tarjetas de crédito)
 * @param events       movimientos programados; se ignoran los que no caen en el rango
 * @param today        fecha de arranque
 * @param days         cuántos días proyectar
 */
export function buildProjection(
  startBalance: number,
  events: ProjectionEvent[],
  today: Date,
  days: number
): ProjectionResult {
  const safeDays = Math.max(1, Math.min(Math.floor(days), 366));
  const startKey = toDateKey(today);

  // Se agrupan por fecha para no recorrer el arreglo en cada día.
  const byDate = new Map<string, ProjectionEvent[]>();
  for (const event of events) {
    // Los movimientos de hoy sí cuentan: todavía no han salido del saldo si
    // están programados para hoy.
    if (event.date < startKey) continue;
    const list = byDate.get(event.date);
    if (list) list.push(event);
    else byDate.set(event.date, [event]);
  }

  const result: ProjectionDay[] = [];
  let balance = startBalance;
  let totalIn = 0;
  let totalOut = 0;

  for (let i = 0; i < safeDays; i += 1) {
    const date = addDays(today, i);
    const key = toDateKey(date);
    const dayEvents = byDate.get(key) ?? [];

    for (const event of dayEvents) {
      // Solo los ingresos suman; gastos y transferencias restan.
      if (event.type === "income") {
        balance += event.amount;
        totalIn += event.amount;
      } else {
        balance -= event.amount;
        totalOut += event.amount;
      }
    }

    result.push({ date: key, balance: Math.round(balance * 100) / 100, events: dayEvents });
  }

  let lowest = result[0] ?? null;
  let daysInRed = 0;
  for (const day of result) {
    if (lowest === null || day.balance < lowest.balance) lowest = day;
    if (day.balance < 0) daysInRed += 1;
  }

  return {
    days: result,
    startBalance: Math.round(startBalance * 100) / 100,
    endBalance: result.length ? result[result.length - 1].balance : startBalance,
    lowest,
    daysInRed,
    totalIn: Math.round(totalIn * 100) / 100,
    totalOut: Math.round(totalOut * 100) / 100,
  };
}
