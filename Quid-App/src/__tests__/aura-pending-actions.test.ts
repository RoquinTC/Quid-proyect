import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  PendingActionError,
  createPendingAction,
  expireStalePendingActions,
  getLatestPendingAction,
  getPendingActionForUser,
  markActionCancelled,
  markActionConfirmed,
} from "@/lib/aura/pending-actions";

/**
 * Ciclo de vida de una propuesta de escritura, contra la base local.
 *
 * ESTO ES LO QUE REEMPLAZA AL PARSEO DE TEXTO
 *
 * Antes, confirmar exigía que el último mensaje del asistente contuviera
 * "resumen para confirmar" y que el usuario escribiera "dale|ok|listo". La
 * propuesta se reconstruía con `line.includes("- Cuenta:")` sobre texto generado
 * por el modelo.
 *
 * Estos tests fijan las garantías que eso no daba:
 *  - la propuesta tiene un id y unos argumentos guardados que no dependen del texto;
 *  - pertenece a un usuario, y otro usuario no puede confirmarla;
 *  - solo se puede confirmar una vez;
 *  - vence, para que una confirmación tardía no ejecute algo pedido hace horas.
 *
 * El usuario se crea y se borra en este archivo, así que no deja basura.
 */

const TEST_EMAIL = "aura-tools-test@quid.local";
let userId: string;
let otherUserId: string;

async function cleanup() {
  // El orden importa por las claves foráneas.
  for (const email of [TEST_EMAIL, `${TEST_EMAIL}.otro`]) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) continue;
    await db.pendingAuraAction.deleteMany({ where: { userId: user.id } });
    await db.transaction.deleteMany({ where: { userId: user.id } });
    await db.fuelLog.deleteMany({ where: { vehicle: { userId: user.id } } });
    await db.vehicle.deleteMany({ where: { userId: user.id } });
    await db.account.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
}

beforeAll(async () => {
  await cleanup();

  const user = await db.user.create({
    data: {
      email: TEST_EMAIL,
      name: "Aura Tools Test",
      password: "no-usar-en-produccion",
    },
  });
  userId = user.id;

  const other = await db.user.create({
    data: {
      email: `${TEST_EMAIL}.otro`,
      name: "Otro Usuario",
      password: "no-usar-en-produccion",
    },
  });
  otherUserId = other.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("createPendingAction", () => {
  it("persiste una propuesta de escritura con argumentos y vencimiento", async () => {
    const pending = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 15000, accountName: "Bold" },
      description: "Voy a registrar este gasto",
    });

    expect(pending.id).toBeTruthy();
    expect(pending.status).toBe("pending");
    expect(pending.args).toEqual({ type: "expense", amount: 15000, accountName: "Bold" });
    expect(pending.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rechaza una herramienta de lectura", async () => {
    // Si un bug intentara confirmar una lectura como si modificara datos, debe
    // fallar acá y no generar una propuesta sin sentido.
    await expect(
      createPendingAction({
        userId,
        tool: "consultar_saldo",
        args: {},
        description: "no debería",
      })
    ).rejects.toThrow(PendingActionError);
  });

  it("rechaza una herramienta inexistente", async () => {
    await expect(
      createPendingAction({ userId, tool: "inventada", args: {}, description: "no" })
    ).rejects.toThrow(PendingActionError);
  });

  it("respeta el TTL indicado", async () => {
    const pending = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 1 },
      description: "corta",
      ttlMinutes: 1,
    });
    const diffMs = pending.expiresAt.getTime() - pending.createdAt.getTime();
    expect(diffMs).toBeLessThanOrEqual(61_000);
    expect(diffMs).toBeGreaterThan(50_000);
  });
});

describe("getPendingActionForUser", () => {
  it("devuelve la propuesta al dueño", async () => {
    const created = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 20000 },
      description: "gasto de prueba",
    });

    const fetched = await getPendingActionForUser(created.id, userId);
    expect(fetched.id).toBe(created.id);
    expect(fetched.args.amount).toBe(20000);
  });

  it("NO permite que otro usuario acceda a la propuesta", async () => {
    // Es la defensa clave: el id es un CUID impredecible, pero si se filtrara,
    // no debe alcanzar para confirmar la acción de otra cuenta.
    const created = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 30000 },
      description: "privada",
    });

    await expect(getPendingActionForUser(created.id, otherUserId)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("falla con un id inexistente", async () => {
    await expect(getPendingActionForUser("no-existe-este-id", userId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("marca como expirada una propuesta vencida y no la devuelve", async () => {
    const created = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 100 },
      description: "vencida",
    });

    // Se fuerza el vencimiento en la base en vez de esperar.
    await db.pendingAuraAction.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(getPendingActionForUser(created.id, userId)).rejects.toMatchObject({
      code: "expired",
    });

    const after = await db.pendingAuraAction.findUnique({ where: { id: created.id } });
    expect(after?.status).toBe("expired");
  });
});

describe("markActionConfirmed y markActionCancelled", () => {
  it("una propuesta confirmada ya no se puede volver a confirmar", async () => {
    // Este es el arreglo de la doble ejecución: antes, un "confirmar" repetido
    // sobre el mismo texto del historial podía registrar el gasto dos veces.
    const created = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 40000 },
      description: "doble",
    });

    await markActionConfirmed(created.id, { transactionId: "tx-1" });

    await expect(getPendingActionForUser(created.id, userId)).rejects.toMatchObject({
      code: "already_resolved",
    });
  });

  it("guarda el resultado de la ejecución", async () => {
    const created = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 5000 },
      description: "con resultado",
    });

    const confirmed = await markActionConfirmed(created.id, { transactionId: "tx-abc" });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.result).toEqual({ transactionId: "tx-abc" });
    expect(confirmed.resolvedAt).toBeInstanceOf(Date);
  });

  it("una propuesta cancelada no se puede confirmar después", async () => {
    const created = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 6000 },
      description: "cancelada",
    });

    const cancelled = await markActionCancelled(created.id);
    expect(cancelled.status).toBe("cancelled");

    await expect(getPendingActionForUser(created.id, userId)).rejects.toMatchObject({
      code: "already_resolved",
    });
  });
});

describe("getLatestPendingAction", () => {
  it("devuelve la propuesta pendiente más reciente y vigente", async () => {
    const first = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 1000 },
      description: "primera",
    });
    const second = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 2000 },
      description: "segunda",
    });

    const latest = await getLatestPendingAction(userId);
    expect(latest?.id).toBe(second.id);

    // Al resolver la más nueva, la anterior vuelve a ser la vigente. Esto es lo
    // que permite escribir "confirmar" en texto y que se aplique a la propuesta
    // correcta, sin mirar el historial de mensajes.
    await markActionCancelled(second.id);
    const next = await getLatestPendingAction(userId);
    expect(next?.id).toBe(first.id);
  });

  it("ignora las propuestas vencidas", async () => {
    const created = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 777 },
      description: "vencida y sola",
      ttlMinutes: 1,
    });
    await db.pendingAuraAction.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const latest = await getLatestPendingAction(userId);
    expect(latest?.id).not.toBe(created.id);
  });
});

describe("expireStalePendingActions", () => {
  it("marca como expiradas las vencidas que seguían pendientes", async () => {
    const created = await createPendingAction({
      userId,
      tool: "registrar_transaccion",
      args: { type: "expense", amount: 999 },
      description: "para expirar",
      ttlMinutes: 1,
    });
    await db.pendingAuraAction.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const count = await expireStalePendingActions();
    expect(count).toBeGreaterThanOrEqual(1);

    const after = await db.pendingAuraAction.findUnique({ where: { id: created.id } });
    expect(after?.status).toBe("expired");
  });
});
