import { describe, expect, it } from "vitest";
import {
  daysUntilDate,
  needsAttention,
  resolveAuthorizationState,
  type AuthorizationLike,
} from "@/lib/health/authorization-status";

const now = new Date(2026, 10, 3, 10, 0, 0); // 03/11/2026

function iso(daysFromNow: number): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromNow, 8, 0, 0);
  return date.toISOString();
}

function auth(partial: Partial<AuthorizationLike>): AuthorizationLike {
  return { status: "authorized", expirationDate: iso(30), appointment: null, ...partial };
}

describe("autorización con cita cumplida", () => {
  it("no alarma aunque esté vencida", () => {
    const state = resolveAuthorizationState(
      auth({
        status: "authorized",
        expirationDate: iso(-5),
        appointment: { status: "completed", date: iso(-10) },
      }),
      now,
    );
    expect(state.view).toBe("fulfilled");
    expect(state.alarm).toBe(false);
    expect(needsAttention(auth({ appointment: { status: "completed" } }), now)).toBe(false);
  });

  it("no alarma aunque venza mañana", () => {
    const state = resolveAuthorizationState(
      auth({ expirationDate: iso(1), appointment: { status: "completed", date: iso(-3) } }),
      now,
    );
    expect(state.alarm).toBe(false);
    expect(state.label).toBe("Cumplida");
  });
});

describe("autorización sin usar", () => {
  it("alarma si vence en 3 días y no tiene cita", () => {
    const state = resolveAuthorizationState(auth({ expirationDate: iso(3) }), now);
    expect(state.view).toBe("available");
    expect(state.alarm).toBe(true);
  });

  it("alarma si ya venció", () => {
    const state = resolveAuthorizationState(auth({ expirationDate: iso(-1) }), now);
    expect(state.view).toBe("expired");
    expect(state.alarm).toBe(true);
  });

  it("no alarma si faltan 20 días", () => {
    expect(resolveAuthorizationState(auth({ expirationDate: iso(20) }), now).alarm).toBe(false);
  });

  it("vence hoy: mensaje propio", () => {
    const state = resolveAuthorizationState(auth({ expirationDate: iso(0) }), now);
    expect(state.hint).toContain("Vence hoy");
  });
});

describe("cita programada", () => {
  it("no alarma si la cita es antes del vencimiento", () => {
    const state = resolveAuthorizationState(
      auth({ expirationDate: iso(20), appointment: { status: "scheduled", date: iso(10) } }),
      now,
    );
    expect(state.view).toBe("scheduled");
    expect(state.alarm).toBe(false);
  });

  it("alarma si la autorización vence antes de la cita", () => {
    const state = resolveAuthorizationState(
      auth({ expirationDate: iso(5), appointment: { status: "scheduled", date: iso(20) } }),
      now,
    );
    expect(state.alarm).toBe(true);
    expect(state.hint).toContain("antes de la cita");
  });
});

describe("otros estados", () => {
  it("pendiente no alarma ni aunque la fecha esté cerca", () => {
    const state = resolveAuthorizationState(
      auth({ status: "pending_authorization", expirationDate: iso(2) }),
      now,
    );
    expect(state.view).toBe("pending");
    expect(state.alarm).toBe(false);
  });

  it("cancelada no alarma", () => {
    const state = resolveAuthorizationState(
      auth({ status: "authorized", appointment: { status: "cancelled" } }),
      now,
    );
    expect(state.view).toBe("cancelled");
    expect(state.alarm).toBe(false);
  });

  it("calcula días completos", () => {
    expect(daysUntilDate(new Date(2026, 10, 10, 23, 0, 0), now)).toBe(7);
  });
});
