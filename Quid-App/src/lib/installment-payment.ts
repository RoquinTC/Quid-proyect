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
  return Math.min(getScheduledCapital(values), getRemainingCapital(values));
}

export function getNextInstallmentCapital(values: InstallmentPaymentValues, remainingCapital: number) {
  return Math.min(getStandardInstallmentCapital(values), Math.max(0, remainingCapital));
}
