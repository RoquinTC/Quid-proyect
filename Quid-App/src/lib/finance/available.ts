/**
 * F-53 · "Disponible" versus "apartado".
 *
 * Una cuenta puede estar marcada `excludeFromAvailable`: es plata tuya, pero no
 * la cuentas para gastar. Si una tarjeta dice "tienes 4 millones" cuando 3
 * están apartados, el número miente.
 *
 * Este módulo es la única fuente de esa cuenta: la usan el tablero, el resumen
 * de finanzas y las cuentas.
 */

export type BalanceLike = number | string;

export interface AccountLike {
  balance: BalanceLike;
  excludeFromAvailable?: boolean;
  subAccounts?: Array<{ balance: BalanceLike; excludeFromAvailable?: boolean }>;
}

export interface BalanceBreakdown {
  /** Todo el dinero, incluido lo apartado. */
  total: number;
  /** Solo lo que se puede usar. */
  available: number;
  /** Lo que está marcado como apartado. */
  apartado: number;
}

function toNumber(value: BalanceLike | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function balanceBreakdown(accounts: AccountLike[]): BalanceBreakdown {
  let total = 0;
  let available = 0;

  for (const account of accounts) {
    const main = toNumber(account.balance);
    total += main;
    if (!account.excludeFromAvailable) available += main;

    for (const sub of account.subAccounts ?? []) {
      const value = toNumber(sub.balance);
      total += value;
      if (!sub.excludeFromAvailable) available += value;
    }
  }

  return {
    total: round2(total),
    available: round2(available),
    apartado: round2(total - available),
  };
}
