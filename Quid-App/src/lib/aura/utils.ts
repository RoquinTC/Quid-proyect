/**
 * F-55 · Ayudantes puros de Aura (fechas y texto).
 *
 * Separados de `index.ts` para que el motor conversacional quede con una
 * responsabilidad clara. No tocan base de datos ni dependen de nada más.
 */

export type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dateOnly(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

export function startOfWeek(value: Date) {
  const date = dateOnly(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

export function parseDateRange(text: string): DateRange {
  const normalized = normalize(text);
  const today = dateOnly(new Date());

  if (/\b(antes de ayer|antier|anteayer)\b/.test(normalized)) {
    const day = addDays(today, -2);
    return { start: day, end: addDays(day, 1), label: "antes de ayer" };
  }

  if (/\bayer\b/.test(normalized)) {
    const day = addDays(today, -1);
    return { start: day, end: addDays(day, 1), label: "ayer" };
  }

  if (/\bhoy\b/.test(normalized)) {
    return { start: today, end: addDays(today, 1), label: "hoy" };
  }

  const lastDays = normalized.match(/\b(?:ultimos|ultimas|últimos|últimas)\s+(\d+)\s+dias\b/);
  if (lastDays) {
    const days = Math.max(1, Number(lastDays[1]));
    return { start: addDays(today, -days + 1), end: addDays(today, 1), label: `los últimos ${days} días` };
  }

  if (/\bsemana pasada\b/.test(normalized)) {
    const thisWeek = startOfWeek(today);
    return { start: addDays(thisWeek, -7), end: thisWeek, label: "la semana pasada" };
  }

  if (/\b(esta semana|semana actual)\b/.test(normalized)) {
    return { start: startOfWeek(today), end: addDays(today, 1), label: "esta semana" };
  }

  if (/\b(mes anterior|mes pasado)\b/.test(normalized)) {
    const startThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { start: startLastMonth, end: startThisMonth, label: "el mes anterior" };
  }

  if (/\b(este mes|mes actual)\b/.test(normalized)) {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1), label: "este mes" };
  }

  return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: addDays(today, 1), label: "este mes" };
}

export function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function daysUntil(date: Date) {
  const today = startOfToday();
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(value);
}

export function formatDateRange(range: DateRange) {
  return `${range.label} (${range.start.toLocaleDateString("es-CO")} - ${addDays(range.end, -1).toLocaleDateString("es-CO")})`;
}

export function daysInMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
}

export function monthsUntil(value: Date) {
  const today = dateOnly(new Date());
  const target = dateOnly(value);
  const years = target.getFullYear() - today.getFullYear();
  const months = years * 12 + target.getMonth() - today.getMonth();
  return Math.max(1, months + (target.getDate() > today.getDate() ? 1 : 0));
}
