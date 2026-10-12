import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonStorage } from "../../shared/storage/jsonStorage";
import { DrawingSyncQueue } from "./syncQueue";

vi.mock("react-native", () => ({
  Platform: { OS: "test" },
}));

describe("DrawingSyncQueue", () => {
  let queue: DrawingSyncQueue;

  beforeEach(async () => {
    await jsonStorage.clear();
    queue = new DrawingSyncQueue();
  });

  it("persists queued uploads in FIFO order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T10:00:00.000Z"));
    await queue.enqueue("older", "upload");

    vi.setSystemTime(new Date("2026-08-23T10:01:00.000Z"));
    await queue.enqueue("newer", "delete");

    await expect(queue.list()).resolves.toMatchObject([
      { drawingId: "older", operation: "upload", status: "pending" },
      { drawingId: "newer", operation: "delete", status: "pending" },
    ]);

    vi.useRealTimers();
  });

  it("records attempts and delays failed retries", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T10:00:00.000Z"));

    await queue.enqueue("drawing-1");
    await queue.recordAttempt("drawing-1");
    const failed = await queue.markFailed("drawing-1", "Network down");

    expect(failed).toMatchObject({
      drawingId: "drawing-1",
      attempts: 1,
      status: "failed",
      lastError: "Network down",
    });
    await expect(queue.listReady()).resolves.toEqual([]);

    vi.setSystemTime(new Date("2026-08-23T10:00:30.000Z"));
    await expect(queue.listReady()).resolves.toHaveLength(1);

    vi.useRealTimers();
  });

  it("removes synced items", async () => {
    await queue.enqueue("drawing-1");
    await queue.markSynced("drawing-1");

    await expect(queue.list()).resolves.toEqual([]);
  });
});
