export type NumericValue = number | string | { toString(): string } | null | undefined;

export interface InstallmentPaymentValues {
  totalAmount: NumericValue;
  totalInstallments: number;
  installmentAmount: NumericValue;
  remainingBalance?: NumericValue;
}

function amount(value: NumericValue) {
  const numeric = Number(value == null ? 0 : value.toString());
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getRemainingCapital({ totalAmount, remainingBalance }: Pick<InstallmentPaymentValues, "totalAmount" | "remainingBalance">) {
  return Math.max(0, amount(remainingBalance ?? totalAmount));
}

export function getScheduledCapital({ totalAmount, totalInstallments, installmentAmount }: Pick<InstallmentPaymentValues, "totalAmount" | "totalInstallments" | "installmentAmount">) {
  const storedAmount = amount(installmentAmount);
  if (storedAmount > 0) return storedAmount;
  return totalInstallments > 0 ? Math.round((amount(totalAmount) / totalInstallments) * 100) / 100 : 0;
}

export function getStandardInstallmentCapital({ totalAmount, totalInstallments }: Pick<InstallmentPaymentValues, "totalAmount" | "totalInstallments">) {
  return totalInstallments > 0 ? Math.round((amount(totalAmount) / totalInstallments) * 100) / 100 : 0;
}

/** Capital actually payable in this cycle. It can never exceed the purchase's remaining capital. */
export function getEffectiveInstallmentCapital(values: InstallmentPaymentValues) {
  const scheduled = getScheduledCapital(values);
  const remaining = getRemainingCapital(values);
  // Filas heredadas con el pendiente en 0 (p. ej. pagadas y luego reversadas)
  // quedaban con capital efectivo 0: el botón de pagar no hacía nada.
  if (remaining <= 0 && scheduled > 0) return scheduled;
  return Math.min(scheduled, remaining);
}

export function getNextInstallmentCapital(values: InstallmentPaymentValues, remainingCapital: number) {
  return Math.min(getStandardInstallmentCapital(values), Math.max(0, remainingCapital));
}
