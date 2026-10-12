import { syncBindings } from "../sync/syncBindings";
import { syncContentHash } from "../sync/syncContent";
import {
  CanvasDocument,
  CanvasDrawingData,
  CanvasDocumentMetadata,
  createCanvasDocument,
  isCanvasDocument,
  touchCanvasDocument,
} from "../canvas/document";
import { CompositeTag, flattenCompositeTags } from "../tags/tagModel";
import { jsonStorage } from "../../shared/storage/jsonStorage";
import {
  drawingSyncQueue,
  SyncQueueOperation,
} from "../sync/syncQueue";

const DRAWING_INDEX_KEY = "infinite-canvas:drawings:index";
const drawingKey = (id: string) => `infinite-canvas:drawings:${id}`;

export type DrawingSummary = CanvasDocumentMetadata;

type SaveOptions = {
  sync?: "local" | "remote" | "synced" | "preserve";
  operation?: SyncQueueOperation;
  syncError?: string;
  preserveQueue?: boolean;
};

const sortByUpdatedAtDesc = (drawings: DrawingSummary[]) =>
  [...drawings].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

export class DrawingRepository {
  private writes: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(localEdit: boolean) => void>();
  subscribe(listener: (localEdit: boolean) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private transact<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.writes.then(operation); this.writes = task.catch(() => undefined); return task;
  }
  async update(id: string, change: (current: CanvasDocument) => CanvasDocument | null, options: SaveOptions = {sync: "preserve"}) {
    return this.transact(async () => { const current = await this.get(id); if (!current) return null;
      const next = change(current); return next ? this.write(next, options) : current; });
  }
  async acceptUpload(snapshot: CanvasDocument, remote: CanvasDocument, guard: () => void = () => {}): Promise<CanvasDocument | null> {
    return this.transact(async () => {
      guard(); const current = await this.get(snapshot.metadata.id); guard(); if (!current) return null;
      const unchanged = syncContentHash(current) === syncContentHash(snapshot);
      return this.write({...current, metadata: {...current.metadata,
        driveFileId: remote.metadata.driveFileId, driveRevisionId: remote.metadata.driveRevisionId,
        syncConflict: false, syncError: undefined}}, {sync: unchanged ? "synced" : "preserve", preserveQueue: true});
    });
  }

  async list(): Promise<DrawingSummary[]> {
    const drawings = await jsonStorage.get<DrawingSummary[]>(DRAWING_INDEX_KEY);
    return sortByUpdatedAtDesc(
      (Array.isArray(drawings) ? drawings : []).filter(
        (drawing): drawing is DrawingSummary =>
          Boolean(
            drawing &&
              typeof drawing === "object" &&
              typeof drawing.id === "string" &&
              typeof drawing.title === "string" &&
              typeof drawing.createdAt === "string" &&
              Number.isFinite(Date.parse(drawing.createdAt)) &&
              typeof drawing.updatedAt === "string" &&
              Number.isFinite(Date.parse(drawing.updatedAt)) &&
              Array.isArray(drawing.tags) &&
              Array.isArray(drawing.flatTags),
          ),
      ).filter((drawing) => !drawing.deletedAt),
    );
  }

  async get(id: string): Promise<CanvasDocument | null> {
    const value = await jsonStorage.get<unknown>(drawingKey(id));
    return isCanvasDocument(value) ? value : null;
  }

  async create(
    title = "Untitled drawing",
    tags: CompositeTag[] = [],
    drawingData?: CanvasDrawingData,
  ): Promise<CanvasDocument> {
    const document = createCanvasDocument(title, tags);
    return this.save(drawingData ? { ...document, ...drawingData } : document);
  }

  async save(
    document: CanvasDocument,
    options: SaveOptions = {},
  ): Promise<CanvasDocument> {
    return this.transact(() => this.write(document, options));
  }

  private async write(document: CanvasDocument, options: SaveOptions): Promise<CanvasDocument> {
    const syncMode = options.sync ?? "local";
    const now = new Date().toISOString();
    const nextDocument = touchCanvasDocument(document, {
      metadata: {
        ...document.metadata,
        ...(syncMode === "local"
          ? {
              syncStatus: "pending",
              syncError: undefined,
              syncQueuedAt: document.metadata.syncQueuedAt ?? now,
            }
          : syncMode === "remote" || syncMode === "synced"
            ? {
                syncStatus: "synced",
                syncError: undefined,
                syncQueuedAt: undefined,
                syncLastAttemptAt: undefined,
                syncConflict: false,
                syncConflictRemoteRevisionId: undefined,
                syncConflictRemoteUpdatedAt: undefined,
              }
            : {}),
      },
    });
    // Transport bookkeeping must not count as an edit to the drawing.
    if (syncMode !== "local") nextDocument.metadata.updatedAt = document.metadata.updatedAt;
    const index = await this.listIncludingDeleted();
    const existingIndex = index.findIndex(
      (drawing) => drawing.id === nextDocument.metadata.id,
    );

    const nextIndex =
      existingIndex >= 0
        ? index.map((drawing) =>
            drawing.id === nextDocument.metadata.id
              ? nextDocument.metadata
              : drawing,
          )
        : [...index, nextDocument.metadata];

    await jsonStorage.set(drawingKey(nextDocument.metadata.id), nextDocument);
    await jsonStorage.set(DRAWING_INDEX_KEY, sortByUpdatedAtDesc(nextIndex));

    if (syncMode === "local") {
      await drawingSyncQueue.enqueue(
        nextDocument.metadata.id,
        options.operation ?? "upload",
        (await syncBindings.get(nextDocument.metadata.id))?.accountBinding,
      );
    }

    if (!options.preserveQueue && (syncMode === "remote" || syncMode === "synced")) {
      await drawingSyncQueue.markSynced(nextDocument.metadata.id);
    }

    for (const listener of this.listeners) listener(syncMode === "local");
    return nextDocument;
  }

  async rename(id: string, title: string): Promise<CanvasDocument | null> {
    return this.update(id, document =>
      touchCanvasDocument(document, {
        metadata: {
          ...document.metadata,
          title: title.trim() || document.metadata.title,
        },
      }),
      {sync: "local"},
    );
  }

  async updateTags(
    id: string,
    tags: CompositeTag[],
  ): Promise<CanvasDocument | null> {
    return this.update(id, document =>
      touchCanvasDocument(document, {
        metadata: {
          ...document.metadata,
          tags: tags.map((tag) => tag.toJSON()),
          flatTags: flattenCompositeTags(tags),
        },
      }),
      {sync: "local"},
    );
  }

  async duplicate(id: string): Promise<CanvasDocument | null> {
    const document = await this.get(id);
    if (!document) return null;

    const duplicate = createCanvasDocument(`${document.metadata.title} copy`);
    return this.save({
      ...duplicate,
      items: document.items,
      historyCursor: document.historyCursor,
      viewport: document.viewport,
      metadata: {
        ...duplicate.metadata,
        tags: document.metadata.tags,
        flatTags: document.metadata.flatTags,
        thumbnailUri: document.metadata.thumbnailUri,
      },
    });
  }

  async importDocument(document: CanvasDocument): Promise<CanvasDocument> {
    const imported = createCanvasDocument(
      document.metadata.title || "Imported drawing",
    );

    return this.save({
      ...document,
      metadata: {
        ...imported.metadata,
        title: document.metadata.title || imported.metadata.title,
        tags: document.metadata.tags ?? imported.metadata.tags,
        flatTags: document.metadata.flatTags ?? imported.metadata.flatTags,
        thumbnailUri: document.metadata.thumbnailUri,
      },
      items: document.items,
      historyCursor: document.historyCursor,
      viewport: document.viewport,
    });
  }

  async delete(id: string): Promise<void> {
    const document = await this.get(id);
    if (!document) return;

    const deletedDocument = touchCanvasDocument(document, {
      metadata: {
        ...document.metadata,
        deletedAt: new Date().toISOString(),
        syncStatus: document.metadata.driveFileId ? "pending" : "synced",
        syncError: undefined,
      },
    });

    await this.save(deletedDocument, {
      sync: document.metadata.driveFileId ? "local" : "synced",
      operation: "delete",
    });
  }

  async markSyncFailed(id: string, message: string): Promise<CanvasDocument | null> {
    return this.update(id, document => ({
        ...document,
        metadata: {
          ...document.metadata,
          syncStatus: "failed",
          syncError: message,
          syncLastAttemptAt: new Date().toISOString(),
        },
      }),
      { sync: "preserve" },
    );
  }

  async listIncludingDeleted(): Promise<DrawingSummary[]> {
    return (await jsonStorage.get<DrawingSummary[]>(DRAWING_INDEX_KEY)) ?? [];
  }
}

export const drawingRepository = new DrawingRepository();
