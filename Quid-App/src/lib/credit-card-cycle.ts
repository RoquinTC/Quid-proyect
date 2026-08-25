export interface CreditCardCycleParams {
  purchaseDate: Date;
  cutoffDate?: number | null;
  paymentDate?: number | null;
}

function nextMonth(year: number, month: number) {
  return month >= 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

function atNoon(year: number, month: number, day: number) {
  const maxDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, maxDay), 12, 0, 0);
}

export function getCreditCardNextPaymentDate({
  purchaseDate,
  cutoffDate,
  paymentDate,
}: CreditCardCycleParams) {
  const date = new Date(purchaseDate);

  if (!paymentDate) {
    const fallback = new Date(date);
    fallback.setMonth(fallback.getMonth() + 1);
    fallback.setHours(12, 0, 0, 0);
    return fallback;
  }

  let cycleYear = date.getFullYear();
  let cycleMonth = date.getMonth();

  if (cutoffDate && date.getDate() >= cutoffDate) {
    const cycle = nextMonth(cycleYear, cycleMonth);
    cycleYear = cycle.year;
    cycleMonth = cycle.month;
  }

  let payYear = cycleYear;
  let payMonth = cycleMonth;

  if (!cutoffDate || paymentDate <= cutoffDate) {
    const payment = nextMonth(payYear, payMonth);
    payYear = payment.year;
    payMonth = payment.month;
  }

  return atNoon(payYear, payMonth, paymentDate);
}
