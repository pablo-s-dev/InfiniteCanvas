import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANVAS_DOCUMENT_VERSION,
  createCanvasDocument,
} from "../canvas/document";
import { DrawingRepository } from "./drawingRepository";
import { jsonStorage } from "../../shared/storage/jsonStorage";
import { CompositeTag } from "../tags/tagModel";
import { drawingSyncQueue } from "../sync/syncQueue";

vi.mock("react-native", () => ({
  Platform: { OS: "test" },
}));

describe("DrawingRepository", () => {
  let repository: DrawingRepository;

  beforeEach(async () => {
    await jsonStorage.clear();
    repository = new DrawingRepository();
  });

  it("creates, retrieves, and lists drawings newest first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T10:00:00.000Z"));
    const older = await repository.create("Older");

    vi.setSystemTime(new Date("2026-08-23T11:00:00.000Z"));
    const newer = await repository.create("Newer");

    await expect(repository.get(older.metadata.id)).resolves.toMatchObject({
      metadata: { title: "Older", syncStatus: "pending" },
    });

    const drawings = await repository.list();

    expect(drawings.map((drawing) => drawing.id)).toEqual([
      newer.metadata.id,
      older.metadata.id,
    ]);

    vi.useRealTimers();
  });

  it("creates a drawing with the canvas data from an unsaved draft", async () => {
    const document = await repository.create("Saved draft", [], {
      version: CANVAS_DOCUMENT_VERSION,
      items: [
        {
          id: "draft-path",
          type: "path",
          data: "M 0 0 L 10 10",
          color: "#000000",
          width: 4,
        },
      ],
      historyCursor: 0,
      viewport: { x: 12, y: 24, scale: 2 },
    });

    await expect(repository.get(document.metadata.id)).resolves.toMatchObject({
      metadata: { title: "Saved draft" },
      items: [{ id: "draft-path" }],
      historyCursor: 0,
      viewport: { x: 12, y: 24, scale: 2 },
    });
  });

  it("renames drawings and updates tags", async () => {
    const document = await repository.create("Original");

    const renamed = await repository.rename(document.metadata.id, "  Updated  ");
    const tagged = await repository.updateTags(document.metadata.id, [
      new CompositeTag({
        name: "Project",
        value: [new CompositeTag({ name: "Client" })],
      }),
    ]);

    expect(renamed?.metadata.title).toBe("Updated");
    expect(tagged?.metadata.flatTags).toEqual(["Project", "Client"]);
  });

  it("duplicates drawing data without reusing document identity", async () => {
    const document = createCanvasDocument("Source");
    const saved = await repository.save({
      ...document,
      historyCursor: 0,
      items: [
        {
          id: "path-1",
          type: "path",
          data: "M 0 0",
          color: "#000",
          width: 4,
        },
      ],
      metadata: {
        ...document.metadata,
        flatTags: ["Copied"],
        tags: [{ name: "Copied", flatValues: ["Copied"] }],
        thumbnailUri: "thumb://source",
      },
    });

    const duplicate = await repository.duplicate(saved.metadata.id);

    expect(duplicate?.metadata.id).not.toBe(saved.metadata.id);
    expect(duplicate?.metadata.title).toBe("Source copy");
    expect(duplicate?.items).toEqual(saved.items);
    expect(duplicate?.historyCursor).toBe(0);
    expect(duplicate?.metadata.thumbnailUri).toBe("thumb://source");
  });

  it("imports drawings with a new local identity", async () => {
    const source = createCanvasDocument("Imported");
    const imported = await repository.importDocument({
      ...source,
      historyCursor: 3,
      viewport: { x: 4, y: 5, scale: 2 },
    });

    expect(imported.metadata.id).not.toBe(source.metadata.id);
    expect(imported.metadata.title).toBe("Imported");
    expect(imported.historyCursor).toBe(3);
    expect(imported.viewport).toEqual({ x: 4, y: 5, scale: 2 });
  });

  it("soft deletes drawings from the visible list", async () => {
    const document = await repository.create("Delete me");

    await repository.delete(document.metadata.id);

    await expect(repository.get(document.metadata.id)).resolves.toMatchObject({
      metadata: { deletedAt: expect.any(String) },
    });
    await expect(repository.list()).resolves.toEqual([]);
  });

  it("queues local changes and clears the queue after sync saves", async () => {
    const document = await repository.create("Queued");

    await expect(drawingSyncQueue.list()).resolves.toMatchObject([
      { drawingId: document.metadata.id, operation: "upload", status: "pending" },
    ]);

    await repository.save(
      {
        ...document,
        metadata: {
          ...document.metadata,
          driveFileId: "drive-file",
          driveRevisionId: "rev-1",
        },
      },
      { sync: "synced" },
    );

    await expect(repository.get(document.metadata.id)).resolves.toMatchObject({
      metadata: {
        driveFileId: "drive-file",
        driveRevisionId: "rev-1",
        syncStatus: "synced",
      },
    });
    await expect(drawingSyncQueue.list()).resolves.toEqual([]);
  });

  it("clears conflict metadata after a synced save", async () => {
    const document = await repository.create("Conflict");

    await repository.save(
      {
        ...document,
        metadata: {
          ...document.metadata,
          driveFileId: "drive-file",
          driveRevisionId: "local-rev",
          syncConflict: true,
          syncConflictRemoteRevisionId: "remote-rev",
          syncConflictRemoteUpdatedAt: "2026-08-23T12:00:00.000Z",
        },
      },
      { sync: "synced" },
    );

    const syncedDocument = await repository.get(document.metadata.id);

    expect(syncedDocument).toMatchObject({
      metadata: {
        driveFileId: "drive-file",
        driveRevisionId: "local-rev",
        syncStatus: "synced",
        syncConflict: false,
      },
    });
    expect(syncedDocument?.metadata.syncConflictRemoteRevisionId).toBeUndefined();
    expect(syncedDocument?.metadata.syncConflictRemoteUpdatedAt).toBeUndefined();
  });
});
