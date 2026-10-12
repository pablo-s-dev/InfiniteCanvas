import { jsonStorage } from "../../shared/storage/jsonStorage";

const KEY = "infinite-canvas:sync-bindings:v1";
export type SyncBinding = {
  drawingId: string;
  accountBinding: string;
  baseHash?: string;
  baseRevision?: string;
  driveFileId?: string;
  conflictKind?: "diverged" | "unbased";
};
let writes: Promise<unknown> = Promise.resolve();
export const syncBindings = {
  async list(): Promise<SyncBinding[]> {
    const value = await jsonStorage.get<unknown>(KEY);
    return Array.isArray(value) ? value.filter((entry): entry is SyncBinding =>
      entry && typeof entry.drawingId === "string" && typeof entry.accountBinding === "string" &&
      (entry.baseHash === undefined || /^[a-f0-9]{64}$/.test(entry.baseHash)) &&
      (entry.baseRevision === undefined || typeof entry.baseRevision === "string") &&
      (entry.driveFileId === undefined || typeof entry.driveFileId === "string")) : [];
  },
  async get(drawingId: string) { return (await this.list()).find(entry => entry.drawingId === drawingId); },
  async set(binding: SyncBinding): Promise<void> {
    const task = writes.then(async () => {
      const entries = await this.list();
      const existing = entries.find(entry => entry.drawingId === binding.drawingId);
      if (existing && existing.accountBinding !== binding.accountBinding) throw new Error("Drawing belongs to another sync account.");
      await jsonStorage.set(KEY, [...entries.filter(entry => entry.drawingId !== binding.drawingId), binding]);
    });
    writes = task.catch(() => undefined);
    await task;
  },
};
