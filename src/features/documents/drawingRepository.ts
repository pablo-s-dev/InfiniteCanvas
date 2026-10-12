import {
  CanvasDocument,
  CanvasDrawingData,
  CanvasDocumentMetadata,
  createCanvasDocument,
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
};

const sortByUpdatedAtDesc = (drawings: DrawingSummary[]) =>
  [...drawings].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

export class DrawingRepository {
  async list(): Promise<DrawingSummary[]> {
    const drawings = await jsonStorage.get<DrawingSummary[]>(DRAWING_INDEX_KEY);
    return sortByUpdatedAtDesc(
      (drawings ?? []).filter((drawing) => !drawing.deletedAt),
    );
  }

  async get(id: string): Promise<CanvasDocument | null> {
    return jsonStorage.get<CanvasDocument>(drawingKey(id));
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
      );
    }

    if (syncMode === "remote" || syncMode === "synced") {
      await drawingSyncQueue.markSynced(nextDocument.metadata.id);
    }

    return nextDocument;
  }

  async rename(id: string, title: string): Promise<CanvasDocument | null> {
    const document = await this.get(id);
    if (!document) return null;

    return this.save(
      touchCanvasDocument(document, {
        metadata: {
          ...document.metadata,
          title: title.trim() || document.metadata.title,
        },
      }),
    );
  }

  async updateTags(
    id: string,
    tags: CompositeTag[],
  ): Promise<CanvasDocument | null> {
    const document = await this.get(id);
    if (!document) return null;

    return this.save(
      touchCanvasDocument(document, {
        metadata: {
          ...document.metadata,
          tags: tags.map((tag) => tag.toJSON()),
          flatTags: flattenCompositeTags(tags),
        },
      }),
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
    const document = await this.get(id);
    if (!document) return null;

    return this.save(
      {
        ...document,
        metadata: {
          ...document.metadata,
          syncStatus: "failed",
          syncError: message,
          syncLastAttemptAt: new Date().toISOString(),
        },
      },
      { sync: "preserve" },
    );
  }

  private async listIncludingDeleted(): Promise<DrawingSummary[]> {
    return (await jsonStorage.get<DrawingSummary[]>(DRAWING_INDEX_KEY)) ?? [];
  }
}

export const drawingRepository = new DrawingRepository();
