/**
 * F-45 · Saldo corrido por cuenta.
 *
 * Calcula el saldo que queda en la cuenta DESPUÉS de cada movimiento, para
 * mostrarlo en el listado de transacciones.
 *
 * Cómo funciona:
 *   Los saldos de las cuentas/bolsillos son valores materializados (el saldo
 *   actual). Si recorremos la lista de movimientos de MÁS NUEVO a MÁS VIEJO,
 *   el primer movimiento deja la cuenta en el saldo actual, y cada paso atrás
 *   deshace el efecto del movimiento: `saldoAnterior = saldoActual - delta`.
 *
 *   Por eso el cálculo es exacto incluso si el listado está paginado: la página
 *   más reciente contiene todos los movimientos posteriores a los que muestra.
 *
 * Convención de signos (debe coincidir con `getTransactionBalanceDelta` en
 * `src/lib/finance-ledger.ts`):
 *   income   → +amount
 *   expense  → -amount
 *   transfer → -amount   (la pata de destino se guarda como `income`)
 */

export type RunningBalanceTransaction = {
  id: string;
  type: string;
  amount: number | string;
  accountId?: string | null;
  subAccountId?: string | null;
};

export type RunningBalanceAccount = {
  id: string;
  balance: number | string;
  subAccounts?: Array<{ id: string; balance: number | string }>;
};

/** Efecto de un movimiento sobre el saldo de su cuenta. */
export function transactionDelta(type: string, amount: number): number {
  if (type === "income") return amount;
  if (type === "expense" || type === "transfer") return -amount;
  return 0;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Devuelve un mapa `transactionId → saldo después del movimiento`.
 *
 * @param transactions Movimientos en el MISMO orden en que se muestran
 *                     (más reciente primero).
 * @param accounts     Cuentas con su saldo actual y sus bolsillos.
 *
 * Los movimientos cuya cuenta no esté en `accounts` se omiten del mapa: es
 * preferible no mostrar nada antes que un saldo inventado.
 */
export function computeRunningBalances(
  transactions: RunningBalanceTransaction[],
  accounts: RunningBalanceAccount[]
): Map<string, number> {
  const balances = new Map<string, number>();

  for (const account of accounts) {
    balances.set(`acc:${account.id}`, toNumber(account.balance));
    for (const sub of account.subAccounts ?? []) {
      balances.set(`sub:${sub.id}`, toNumber(sub.balance));
    }
  }

  const result = new Map<string, number>();

  for (const tx of transactions) {
    const key = tx.subAccountId
      ? `sub:${tx.subAccountId}`
      : tx.accountId
        ? `acc:${tx.accountId}`
        : null;

    if (!key) continue;

    const current = balances.get(key);
    if (current === undefined) continue;

    result.set(tx.id, round2(current));
    balances.set(key, current - transactionDelta(tx.type, toNumber(tx.amount)));
  }

  return result;
}
