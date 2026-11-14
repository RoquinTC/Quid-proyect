/**
 * F-24 · Patrimonio neto.
 *
 * Lo que tienes menos lo que debes. Es una foto del momento, no un flujo:
 * - Activos: saldo de cuentas + ahorros apartados + CDT (capital + interés).
 * - Pasivos: saldo actual de cada deuda.
 *
 * Regla: nunca se suman dos veces. Los ahorros que salen de una cuenta ya
 * bajaron ese saldo cuando se apartaron, así que se suman como activo propio.
 */

export interface NetWorthEntry {
  label: string;
  value: number;
  kind: "asset" | "liability";
}

export interface NetWorthInput {
  accounts: Array<{ name: string; balance: number }>;
  savings: Array<{ name: string; amount: number }>;
  cdts: Array<{ name: string; amount: number }>;
  debts: Array<{ name: string; balance: number }>;
}

export interface NetWorthResult {
  assets: number;
  liabilities: number;
  net: number;
  entries: NetWorthEntry[];
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function computeNetWorth(input: NetWorthInput): NetWorthResult {
  const entries: NetWorthEntry[] = [];

  for (const account of input.accounts) {
    const value = positive(account.balance);
    if (value > 0) entries.push({ label: account.name, value, kind: "asset" });
  }
  for (const goal of input.savings) {
    const value = positive(goal.amount);
    if (value > 0) entries.push({ label: goal.name, value, kind: "asset" });
  }
  for (const cdt of input.cdts) {
    const value = positive(cdt.amount);
    if (value > 0) entries.push({ label: cdt.name, value, kind: "asset" });
  }
  for (const debt of input.debts) {
    const value = positive(debt.balance);
    if (value > 0) entries.push({ label: debt.name, value, kind: "liability" });
  }

  const assets = entries
    .filter((entry) => entry.kind === "asset")
    .reduce((sum, entry) => sum + entry.value, 0);
  const liabilities = entries
    .filter((entry) => entry.kind === "liability")
    .reduce((sum, entry) => sum + entry.value, 0);

  return {
    assets: Math.round(assets * 100) / 100,
    liabilities: Math.round(liabilities * 100) / 100,
    net: Math.round((assets - liabilities) * 100) / 100,
    entries: entries.sort((a, b) => b.value - a.value),
  };
}
