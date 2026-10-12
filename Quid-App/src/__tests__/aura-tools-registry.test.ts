import { describe, expect, it } from "vitest";
import {
  TOOL_REGISTRY,
  getTool,
  getToolsByKind,
  getWriteToolNames,
  isImplemented,
  isWriteTool,
} from "@/lib/aura/tools/registry";
import { getReadExecutor } from "@/lib/aura/tools/executors";
import { hasWriteExecutor } from "@/lib/aura/tools/execute-confirmed";

/**
 * El registro declara qué puede hacer Aura. Antes esa lista no existía en ningún
 * lado: había que leer 1800 líneas de `index.ts` para saberlo, y agregar una
 * herramienta obligaba a tocar el despachador, el parser de la propuesta, el
 * ejecutor y los botones por separado.
 *
 * Estos tests protegen las invariantes que hacen segura la separación entre
 * lectura y escritura.
 */

describe("registro de herramientas — integridad", () => {
  it("no tiene nombres duplicados", () => {
    const names = TOOL_REGISTRY.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("cada herramienta tiene descripción y parámetros bien formados", () => {
    for (const tool of TOOL_REGISTRY) {
      expect(tool.description.trim().length, `${tool.name} sin descripción`).toBeGreaterThan(10);

      const parameterNames = tool.parameters.map((p) => p.name);
      expect(new Set(parameterNames).size, `${tool.name} tiene parámetros duplicados`).toBe(
        parameterNames.length
      );

      for (const parameter of tool.parameters) {
        expect(parameter.description.trim().length, `${tool.name}.${parameter.name} sin descripción`)
          .toBeGreaterThan(3);

        // Un enum sin valores no se puede validar nunca.
        if (parameter.type === "enum") {
          expect(parameter.values?.length, `${tool.name}.${parameter.name} es enum sin valores`)
            .toBeGreaterThan(0);
        }
      }
    }
  });

  it("ninguna herramienta de escritura carece de parámetros", () => {
    // Una escritura sin parámetros no tiene nada que confirmar: sería una acción
    // que se ejecuta sin que el usuario pueda revisar nada.
    for (const tool of getToolsByKind("write")) {
      expect(tool.parameters.length, `${tool.name} es de escritura pero no declara parámetros`)
        .toBeGreaterThan(0);
    }
  });

  it("las herramientas en uso están marcadas como implementadas", () => {
    expect(isImplemented("registrar_transaccion")).toBe(true);
    expect(isImplemented("registrar_tanqueo")).toBe(true);
  });

  it("distingue lectura de escritura", () => {
    expect(isWriteTool("registrar_transaccion")).toBe(true);
    expect(isWriteTool("registrar_tanqueo")).toBe(true);
    expect(isWriteTool("consultar_saldo")).toBe(false);
    expect(isWriteTool("no_existe")).toBe(false);
  });

  it("getWriteToolNames devuelve exactamente las herramientas de escritura", () => {
    const writes = getWriteToolNames();
    expect(writes).toContain("registrar_transaccion");
    expect(writes).toContain("registrar_tanqueo");
    expect(writes).not.toContain("consultar_saldo");
    expect(writes).toHaveLength(getToolsByKind("write").length);
  });

  it("getTool devuelve undefined para nombres inexistentes", () => {
    expect(getTool("inventada")).toBeUndefined();
    expect(getTool("registrar_transaccion")?.kind).toBe("write");
  });

  it("declara al menos una herramienta de cada tipo", () => {
    // Si alguna quedara en cero, el gateway anunciaría una capacidad vacía.
    expect(getToolsByKind("read").length).toBeGreaterThan(0);
    expect(getToolsByKind("write").length).toBeGreaterThan(0);
  });

  it("toda herramienta marcada como implementada TIENE un ejecutor", () => {
    // Este test existe por un error real: al escribir los ejecutores de lectura
    // dejé `implemented: false` en el registro, y el gateway respondía 501
    // "todavía no puedo hacer eso" a pesar de que el código ya funcionaba.
    // Los tests de ejecución pasaban por llamar al ejecutor directamente, así que
    // nada detectaba la incoherencia hasta probar por HTTP.
    const sinEjecutor: string[] = [];

    for (const tool of TOOL_REGISTRY) {
      if (!tool.implemented) continue;
      const hasExecutor =
        tool.kind === "read" ? Boolean(getReadExecutor(tool.name)) : hasWriteExecutor(tool.name);
      if (!hasExecutor) sinEjecutor.push(`${tool.name} (${tool.kind})`);
    }

    expect(
      sinEjecutor,
      sinEjecutor.length === 0
        ? ""
        : `Declaradas como implementadas pero sin ejecutor registrado: ${sinEjecutor.join(
            ", "
          )}. El gateway respondería 501 aunque el código exista.`
    ).toEqual([]);
  });

  it("toda herramienta con ejecutor está marcada como implementada", () => {
    // La inversa: un ejecutor que no se anuncia es código muerto.
    const noAnunciadas: string[] = [];

    for (const tool of TOOL_REGISTRY) {
      const hasExecutor =
        tool.kind === "read" ? Boolean(getReadExecutor(tool.name)) : hasWriteExecutor(tool.name);
      if (hasExecutor && !tool.implemented) noAnunciadas.push(tool.name);
    }

    expect(
      noAnunciadas,
      noAnunciadas.length === 0
        ? ""
        : `Tienen ejecutor pero no se anuncian como implementadas: ${noAnunciadas.join(", ")}.`
    ).toEqual([]);
  });
});
