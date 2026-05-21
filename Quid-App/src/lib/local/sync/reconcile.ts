import { localDB } from "../db";
import { isTempId } from "./utils";

function replaceExactValue(value: unknown, from: string, to: string): { value: unknown; changed: boolean } {
  if (value === from) {
    return { value: to, changed: true };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = replaceExactValue(item, from, to);
      changed ||= result.changed;
      return result.value;
    });
    return { value: next, changed };
  }

  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const result = replaceExactValue(item, from, to);
      changed ||= result.changed;
      next[key] = result.value;
    }
    return { value: next, changed };
  }

  return { value, changed: false };
}

function replaceInText(value: string | undefined, from: string, to: string): string | undefined {
  return value?.split(from).join(to);
}

export async function reconcileCreatedRecord(
  tableName: string,
  tempId: string,
  serverRecord: Record<string, unknown>,
): Promise<void> {
  const realId = typeof serverRecord.id === "string" ? serverRecord.id : null;
  if (!realId || !isTempId(tempId) || tempId === realId) return;

  const now = Date.now();
  const table = (localDB as any)[tableName];

  if (table) {
    await table.delete(tempId);
    await table.put({
      ...serverRecord,
      _syncStatus: "synced",
      _version: 1,
      _lastModified: now,
    });
  }

  for (const dexieTable of localDB.tables) {
    if (["mutationQueue", "syncMeta", tableName].includes(dexieTable.name)) continue;

    const records = await dexieTable.toArray();
    for (const record of records) {
      if (!record?.id) continue;
      const result = replaceExactValue(record, tempId, realId);
      if (result.changed) {
        await dexieTable.put({
          ...(result.value as Record<string, unknown>),
          _lastModified: now,
        });
      }
    }
  }

  const queued = await localDB.mutationQueue.toArray();
  for (const mutation of queued) {
    if (mutation.status === "completed") continue;

    const patch: Record<string, unknown> = {};
    if (mutation.recordId === tempId) patch.recordId = realId;

    const nextApiRoute = replaceInText(mutation.apiRoute, tempId, realId);
    if (nextApiRoute !== mutation.apiRoute) patch.apiRoute = nextApiRoute;

    const nextPayload = replaceInText(mutation.payload, tempId, realId);
    if (nextPayload !== mutation.payload) patch.payload = nextPayload;

    const nextSnapshot = replaceInText(mutation.snapshot, tempId, realId);
    if (nextSnapshot !== mutation.snapshot) patch.snapshot = nextSnapshot;

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = now;
      await localDB.mutationQueue.update(mutation.id, patch);
    }
  }
}
