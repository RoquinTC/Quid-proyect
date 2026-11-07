import { describe, it, expect } from "vitest";
import {
  QUID_MODULES,
  APP_SETTINGS_SECTIONS,
  moduleForSettings,
  groupActions,
} from "@/lib/modules/registry";

/**
 * El registro es la fuente única del menú y de los ajustes. Si se rompe,
 * los dos menús se desincronizan otra vez.
 */
describe("registro de módulos", () => {
  it("los ids son únicos", () => {
    const ids = QUID_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada módulo tiene lo mínimo para pintarse", () => {
    for (const module of QUID_MODULES) {
      expect(module.id).toBeTruthy();
      expect(module.label).toBeTruthy();
      expect(module.hint).toBeTruthy();
      expect(module.icon).toBeTruthy();
      expect(module.color).toBeTruthy();
      expect(module.bg).toBeTruthy();
    }
  });

  it("cada acción tiene icono y verbo", () => {
    for (const module of QUID_MODULES) {
      for (const action of module.actions) {
        expect(action.icon).toBeTruthy();
        expect(["crear", "registrar", "gestionar"]).toContain(action.verb);
      }
    }
  });

  it("los ids de acción no se repiten entre módulos", () => {
    const all = QUID_MODULES.flatMap((m) => m.actions.map((a) => a.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it("cada módulo apunta a una sección de ajustes que existe", () => {
    const sections = new Set(APP_SETTINGS_SECTIONS.map((s) => s.id));
    for (const module of QUID_MODULES) {
      if (module.settings) expect(sections.has(module.settings)).toBe(true);
    }
  });

  it("el módulo de finanzas se encuentra desde su sección de ajustes", () => {
    expect(moduleForSettings("finance")?.id).toBe("finance");
    expect(moduleForSettings("admin")).toBeNull();
  });

  it("agrupa las acciones por verbo", () => {
    const finance = QUID_MODULES.find((m) => m.id === "finance")!;
    const groups = groupActions(finance);
    expect(groups.crear.length).toBeGreaterThan(0);
    expect(groups.gestionar[0].label).toBe("Gestionar Categorías");
  });

  it("los grupos de ajustes son solo los tres esperados", () => {
    const groups = new Set(APP_SETTINGS_SECTIONS.map((s) => s.group));
    expect([...groups].sort()).toEqual(["general", "modulos", "sistema"]);
  });
});
