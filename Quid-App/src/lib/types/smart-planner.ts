export type RadarEventSource = "finance" | "transport" | "health" | "pantry";

export type RadarEventKind =
  | "recurring-payment"
  | "scheduled-income"
  | "fuel-refill"
  | "vehicle-document"
  | "maintenance"
  | "medical-appointment"
  | "pantry-expiration"
  | "pantry-low-stock";

export type RadarEventSeverity = "info" | "success" | "warning" | "critical";

export type RadarEventStatus = "pending" | "confirmed" | "dismissed";

export interface RadarEventAction {
  label: string;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  body?: Record<string, unknown>;
}

export interface RadarEvent {
  id: string;
  source: RadarEventSource;
  kind: RadarEventKind;
  title: string;
  description?: string;
  date: string;
  amount?: number;
  severity: RadarEventSeverity;
  status: RadarEventStatus;
  action?: RadarEventAction;
}
