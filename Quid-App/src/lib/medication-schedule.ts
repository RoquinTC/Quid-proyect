type SchedulableMedication = {
  frequency?: string | null;
  customSchedule?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string | null;
};

type IntervalSchedule = {
  type?: string;
  everyDays?: number;
};

const startOfLocalDay = (date: Date) => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const parseMedicationCustomSchedule = (value?: string | null): IntervalSchedule | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as IntervalSchedule;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const getMedicationIntervalDays = (value?: string | null) => {
  const schedule = parseMedicationCustomSchedule(value);
  if (schedule?.type !== "interval_days") return null;
  const everyDays = Number(schedule.everyDays);
  return Number.isFinite(everyDays) && everyDays >= 2 ? Math.floor(everyDays) : 2;
};

export const isMedicationDueToday = (medication: SchedulableMedication, today = new Date()) => {
  const todayStart = startOfLocalDay(today);
  const startDate = parseDate(medication.startDate);
  const endDate = parseDate(medication.endDate);

  if (startDate && startOfLocalDay(startDate).getTime() > todayStart.getTime()) return false;
  if (endDate && startOfLocalDay(endDate).getTime() < todayStart.getTime()) return false;

  const frequency = medication.frequency || "daily";
  if (frequency === "every_n_days") {
    const everyDays = getMedicationIntervalDays(medication.customSchedule) || 2;
    const anchor = startOfLocalDay(startDate || parseDate(medication.createdAt) || today);
    const diffDays = Math.floor((todayStart.getTime() - anchor.getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays % everyDays === 0;
  }

  if (frequency === "weekly") {
    const anchor = startDate || parseDate(medication.createdAt);
    return anchor ? anchor.getDay() === today.getDay() : true;
  }

  return true;
};
