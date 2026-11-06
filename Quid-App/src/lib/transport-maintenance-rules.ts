import { MAINTENANCE_TYPES } from "@/lib/types/transport";

export type MaintenanceRuleInput = {
  typeKey: string;
  name: string;
};

export type MaintenanceRuleResolved = MaintenanceRuleInput & {
  intervalKm: number;
  intervalMonths: number;
  intervalDays: number;
  warningKm: number;
  isActive: boolean;
  source: "user" | "default" | "none";
};

export function normalizeMaintenanceTypeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getDefaultMaintenanceRules() {
  return MAINTENANCE_TYPES.map((type) => ({
    typeKey: type.value,
    name: type.label,
    intervalKm: type.nextKmInterval || null,
    intervalMonths: type.nextMonthInterval || null,
    warningKm: type.nextKmInterval > 0
      ? Math.min(500, Math.max(100, Math.round(type.nextKmInterval * 0.2)))
      : 500,
    isActive: type.nextKmInterval > 0 || type.nextMonthInterval > 0,
    isDefault: true,
  }));
}

export function resolveMaintenanceRule(
  item: MaintenanceRuleInput,
  userRules: Array<{
    typeKey: string;
    name: string;
    intervalKm: number | null;
    intervalMonths: number | null;
    warningKm: number | null;
    isActive: boolean;
  }>
): MaintenanceRuleResolved {
  const normalizedName = normalizeMaintenanceTypeKey(item.name);
  const typeKey = item.typeKey || normalizedName;
  const typeConfig = MAINTENANCE_TYPES.find(
    (type) => type.value === typeKey || normalizeMaintenanceTypeKey(type.label) === normalizedName
  );

  const userRule = userRules.find(
    (rule) =>
      rule.typeKey === typeKey ||
      normalizeMaintenanceTypeKey(rule.name) === normalizedName ||
      (typeConfig && rule.typeKey === typeConfig.value)
  );

  if (userRule) {
    const intervalKm = userRule.intervalKm ?? 0;
    const intervalMonths = userRule.intervalMonths ?? 0;
    return {
      typeKey: userRule.typeKey,
      name: userRule.name || item.name,
      intervalKm,
      intervalMonths,
      intervalDays: intervalMonths * 30,
      warningKm: userRule.warningKm ?? Math.min(500, Math.max(100, Math.round(intervalKm * 0.2))),
      isActive: userRule.isActive,
      source: "user",
    };
  }

  if (typeConfig) {
    const intervalKm = typeConfig.nextKmInterval || 0;
    const intervalMonths = typeConfig.nextMonthInterval || 0;
    return {
      typeKey: typeConfig.value,
      name: typeConfig.label,
      intervalKm,
      intervalMonths,
      intervalDays: intervalMonths * 30,
      warningKm: intervalKm > 0 ? Math.min(500, Math.max(100, Math.round(intervalKm * 0.2))) : 500,
      isActive: intervalKm > 0 || intervalMonths > 0,
      source: "default",
    };
  }

  return {
    typeKey,
    name: item.name,
    intervalKm: 0,
    intervalMonths: 0,
    intervalDays: 0,
    warningKm: 500,
    isActive: false,
    source: "none",
  };
}

/**
 * The display name a maintenance reminder must carry for a given service type.
 *
 * This is a single shared resolver on purpose. Reminders are deactivated by
 * matching their TITLE, so if the create path and the edit path ever disagree on
 * the name of a service, editing a record leaves the old reminder active and
 * creates a second one — an orphan the user cannot turn off.
 *
 * Resolution order: the built-in catalog label, then the user's own rule (which
 * is where a custom service name is stored), then any name supplied by the
 * caller, and only then a generic fallback.
 */
export function resolveMaintenanceDisplayName(
  type: string,
  userRules: Array<{ typeKey: string; name: string }> = [],
  fallbackNames: Array<string | null | undefined> = []
): string {
  const config = MAINTENANCE_TYPES.find((item) => item.value === type);
  if (config) return config.label;

  const userRule = userRules.find((rule) => rule.typeKey === type);
  if (userRule?.name?.trim()) return userRule.name.trim();

  const fromCaller = fallbackNames.map((name) => name?.trim()).find((name) => Boolean(name));
  return fromCaller || "Mantenimiento";
}

/**
 * Decide whether registering a maintenance item should create its reminder.
 *
 * A service rule supplies a DEFAULT interval, so `isActive` answers "should this
 * service nag me at all?". When the driver explicitly types an interval while
 * registering the work, that request is more specific than the default and wins.
 *
 * This is not cosmetic. In production the oil-change rule was inactive, so an
 * explicit "remind me in 2.500 km" was discarded by a bare
 * `if (!rule.isActive) continue`: the reminder never appeared and nothing
 * explained why.
 */
export function shouldCreateServiceReminder(params: {
  scheduleReminder?: boolean | null;
  reminderIntervalKm?: number | null;
  reminderIntervalDays?: number | null;
  ruleIsActive: boolean;
}): boolean {
  if (params.scheduleReminder === false) return false;

  const askedExplicitly =
    (params.reminderIntervalKm != null && Number(params.reminderIntervalKm) > 0) ||
    (params.reminderIntervalDays != null && Number(params.reminderIntervalDays) > 0);

  return params.ruleIsActive || askedExplicitly;
}
