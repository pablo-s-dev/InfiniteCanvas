import { jsonStorage } from "../../shared/storage/jsonStorage";

const SYNC_QUEUE_KEY = "infinite-canvas:sync-queue";
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;

export type SyncQueueOperation = "upload" | "delete";
export type SyncQueueStatus = "pending" | "failed";

export type SyncQueueItem = {
  drawingId: string;
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
  async list(): Promise<SyncQueueItem[]> {
    return sortQueue((await jsonStorage.get<SyncQueueItem[]>(SYNC_QUEUE_KEY)) ?? []);
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
  ): Promise<SyncQueueItem> {
    const now = new Date().toISOString();
    const items = await this.list();
    const existing = items.find((item) => item.drawingId === drawingId);
    const nextItem: SyncQueueItem = existing
      ? {
          ...existing,
          operation,
          status: "pending",
          updatedAt: now,
          nextRetryAt: undefined,
        }
      : {
          drawingId,
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
  }

  async recordAttempt(drawingId: string): Promise<SyncQueueItem | null> {
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
  }

  async markFailed(drawingId: string, error: string): Promise<SyncQueueItem | null> {
    const now = new Date();
    const items = await this.list();
    const existing = items.find((item) => item.drawingId === drawingId);
    if (!existing) return null;

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
  }

  async markSynced(drawingId: string): Promise<void> {
    await this.saveItems(
      (await this.list()).filter((item) => item.drawingId !== drawingId),
    );
  }

  async clear(): Promise<void> {
    await jsonStorage.remove(SYNC_QUEUE_KEY);
  }

  private async saveItems(items: SyncQueueItem[]) {
    await jsonStorage.set(SYNC_QUEUE_KEY, sortQueue(items));
  }
}

export const drawingSyncQueue = new DrawingSyncQueue();
