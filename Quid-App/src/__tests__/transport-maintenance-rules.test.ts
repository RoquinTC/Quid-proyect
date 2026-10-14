import { describe, it, expect } from "vitest";
import {
  normalizeMaintenanceTypeKey,
  resolveMaintenanceDisplayName,
} from "@/lib/transport-maintenance-rules";

describe("normalizeMaintenanceTypeKey", () => {
  it("slugs a human label into a stable key", () => {
    expect(normalizeMaintenanceTypeKey("Cambio de Bujías")).toBe("cambio_de_bujias");
    expect(normalizeMaintenanceTypeKey("  Aceite / Filtro  ")).toBe("aceite_filtro");
  });

  it("is stable across accents so the same service cannot fork into two keys", () => {
    expect(normalizeMaintenanceTypeKey("Bujías")).toBe(normalizeMaintenanceTypeKey("Bujias"));
  });
});

describe("resolveMaintenanceDisplayName", () => {
  const BUILT_IN = "oil_change";
  const CUSTOM = "cambio_de_bujias";
  const rules = [{ typeKey: CUSTOM, name: "Cambio de bujías" }];

  it("uses the catalog label for a built-in service", () => {
    const name = resolveMaintenanceDisplayName(BUILT_IN, [], ["whatever"]);
    expect(name).not.toBe("Mantenimiento");
    expect(name.length).toBeGreaterThan(0);
  });

  it("prefers the user's own name for a custom service", () => {
    expect(resolveMaintenanceDisplayName(CUSTOM, rules)).toBe("Cambio de bujías");
  });

  it("falls back to a caller-supplied name", () => {
    expect(resolveMaintenanceDisplayName(CUSTOM, [], [null, "Cambio de bujías"])).toBe("Cambio de bujías");
  });

  it("falls back to a generic name only as a last resort", () => {
    expect(resolveMaintenanceDisplayName(CUSTOM)).toBe("Mantenimiento");
    expect(resolveMaintenanceDisplayName(CUSTOM, [], ["   "])).toBe("Mantenimiento");
  });

  it("ignores a blank rule name and keeps looking", () => {
    const blank = [{ typeKey: CUSTOM, name: "   " }];
    expect(resolveMaintenanceDisplayName(CUSTOM, blank, ["Bujías"])).toBe("Bujías");
  });

  /**
   * The reason this resolver is shared.
   *
   * Reminders are deactivated by matching their title. The create path knows the
   * item names; the edit path does not. If the rule did not win over the caller
   * fallback, the two would title the same service differently — and editing a
   * record would leave the first reminder active forever while creating a twin.
   */
  it("gives both the create and the edit path the same title", () => {
    const fromCreate = resolveMaintenanceDisplayName(CUSTOM, rules, ["Cambio de bujías"]);
    const fromEdit = resolveMaintenanceDisplayName(CUSTOM, rules);

    expect(fromCreate).toBe(fromEdit);
    expect(fromCreate).toBe("Cambio de bujías");
  });

  it("shows why the create path must persist the rule", () => {
    // With no stored rule there is nothing for the edit path to read, and the
    // two paths genuinely disagree. Persisting on create is what prevents it.
    const fromCreate = resolveMaintenanceDisplayName(CUSTOM, [], ["Cambio de bujías"]);
    const fromEdit = resolveMaintenanceDisplayName(CUSTOM, []);

    expect(fromCreate).toBe("Cambio de bujías");
    expect(fromEdit).toBe("Mantenimiento");
    expect(fromCreate).not.toBe(fromEdit);
  });
});
