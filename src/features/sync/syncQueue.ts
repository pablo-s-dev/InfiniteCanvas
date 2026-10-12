import { jsonStorage } from "../../shared/storage/jsonStorage";

const SYNC_QUEUE_KEY = "infinite-canvas:sync-queue";
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

export type SyncQueueOperation = "upload" | "delete";
export type SyncQueueStatus = "pending" | "failed";

export type SyncQueueItem = {
  drawingId: string;
  accountBinding?: string;
  generation: number;
  operation: SyncQueueOperation;
  status: SyncQueueStatus;
  attempts: number;
  queuedAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  lastError?: string;
  nextRetryAt?: string;
};

const sortQueue = (items: SyncQueueItem[]) =>
  [...items].sort(
    (a, b) =>
      new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime(),
  );

const retryDelayForAttempt = (attempts: number) =>
  Math.min(MAX_RETRY_DELAY_MS, 30 * 1000 * 2 ** Math.max(0, attempts - 1));

export class DrawingSyncQueue {
  private writes: Promise<unknown> = Promise.resolve();
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.writes.then(operation); this.writes = task.catch(() => undefined); return task;
  }
  async list(): Promise<SyncQueueItem[]> {
    const stored = await jsonStorage.get<unknown>(SYNC_QUEUE_KEY);
    return sortQueue(Array.isArray(stored) ? stored.filter(item => item && typeof item.drawingId === "string" &&
      ["upload", "delete"].includes(item.operation) && ["pending", "failed"].includes(item.status) &&
      Number.isFinite(item.attempts) && Number.isFinite(Date.parse(item.queuedAt)) &&
      (item.accountBinding === undefined || typeof item.accountBinding === "string"))
      .map(item => ({...item, generation: Number.isSafeInteger(item.generation) && item.generation >= 0 ? item.generation : 0})) : []);
  }

  async listReady(now = new Date()): Promise<SyncQueueItem[]> {
    const nowTime = now.getTime();
    return (await this.list()).filter((item) => {
      if (item.status === "pending") return true;
      if (!item.nextRetryAt) return true;
      return new Date(item.nextRetryAt).getTime() <= nowTime;
    });
  }

  async enqueue(
    drawingId: string,
    operation: SyncQueueOperation = "upload",
    accountBinding?: string,
  ): Promise<SyncQueueItem> {
    return this.mutate(async () => {
    const now = new Date().toISOString();
    const items = await this.list();
    const existing = items.find((item) => item.drawingId === drawingId);
    const nextItem: SyncQueueItem = existing
      ? {
          ...existing,
          accountBinding: accountBinding ?? existing.accountBinding,
          generation: (existing.generation ?? 0) + 1,
          operation,
          status: "pending",
          updatedAt: now,
          nextRetryAt: undefined,
        }
      : {
          drawingId,
          accountBinding,
          generation: 1,
          operation,
          status: "pending",
          attempts: 0,
          queuedAt: now,
          updatedAt: now,
        };

    await this.saveItems([
      ...items.filter((item) => item.drawingId !== drawingId),
      nextItem,
    ]);
    return nextItem;
    });
  }

  async recordAttempt(drawingId: string): Promise<SyncQueueItem | null> {
    return this.mutate(async () => {
    const now = new Date().toISOString();
    const items = await this.list();
    const existing = items.find((item) => item.drawingId === drawingId);
    if (!existing) return null;

    const nextItem: SyncQueueItem = {
      ...existing,
      attempts: existing.attempts + 1,
      lastAttemptAt: now,
      updatedAt: now,
    };

    await this.saveItems([
      ...items.filter((item) => item.drawingId !== drawingId),
      nextItem,
    ]);
    return nextItem;
    });
  }

  async markFailed(drawingId: string, error: string, generation?: number): Promise<SyncQueueItem | null> {
    return this.mutate(async () => {
    const now = new Date();
    const items = await this.list();
    const existing = items.find((item) => item.drawingId === drawingId);
    if (!existing || (generation !== undefined && (existing.generation ?? 0) !== generation)) return null;

    const nextRetryAt = new Date(
      now.getTime() + retryDelayForAttempt(existing.attempts),
    ).toISOString();
    const nextItem: SyncQueueItem = {
      ...existing,
      status: "failed",
      lastError: error,
      nextRetryAt,
      updatedAt: now.toISOString(),
    };

    await this.saveItems([
      ...items.filter((item) => item.drawingId !== drawingId),
      nextItem,
    ]);
    return nextItem;
    });
  }

  async markSynced(drawingId: string, generation?: number): Promise<void> {
    await this.mutate(async () => this.saveItems((await this.list()).filter(item =>
      item.drawingId !== drawingId || (generation !== undefined && (item.generation ?? 0) !== generation))));
  }

  async clear(): Promise<void> { await this.mutate(() => jsonStorage.remove(SYNC_QUEUE_KEY)); }

  private async saveItems(items: SyncQueueItem[]) {
    await jsonStorage.set(SYNC_QUEUE_KEY, sortQueue(items));
  }
}

export const drawingSyncQueue = new DrawingSyncQueue();
