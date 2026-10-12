import {
  CompositeTag,
  CompositeTagJson,
  flattenCompositeTags,
} from "../tags/tagModel";

export const CANVAS_DOCUMENT_VERSION = 2;

export type CanvasPoint = {
  x: number;
  y: number;
  pressure?: number;
  time?: number;
};

export type CanvasViewport = {
  x: number;
  y: number;
  scale: number;
};

export type CanvasPathItem = {
  id: string;
  type: "path";
  data: string;
  points?: CanvasPoint[];
  color: string;
  width: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CanvasImageItem = {
  id: string;
  type: "image";
  uri: string;
  x?: number;
  y?: number;
  widthPx?: number;
  heightPx?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CanvasEraseItem = {
  id: string;
  type: "erase";
  erasedItemIds: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type CanvasItem = CanvasPathItem | CanvasImageItem | CanvasEraseItem;

export type CanvasDocumentMetadata = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  tags: CompositeTagJson[];
  flatTags: string[];
  thumbnailUri?: string;
  driveFileId?: string;
  driveRevisionId?: string;
  syncStatus?: "pending" | "synced" | "failed";
  syncError?: string;
  syncQueuedAt?: string;
  syncLastAttemptAt?: string;
  syncConflict?: boolean;
  syncConflictRemoteRevisionId?: string;
  syncConflictRemoteUpdatedAt?: string;
  deletedAt?: string;
};

export type CanvasDrawingData = {
  version: typeof CANVAS_DOCUMENT_VERSION;
  items: CanvasItem[];
  historyCursor: number;
  viewport?: CanvasViewport;
};

export type CanvasDocument = CanvasDrawingData & {
  metadata: CanvasDocumentMetadata;
};

const createId = () =>
  `drawing_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const createCanvasDocument = (
  title = "Untitled drawing",
  tags: CompositeTag[] = [],
): CanvasDocument => {
  const now = new Date().toISOString();

  return {
    version: CANVAS_DOCUMENT_VERSION,
    metadata: {
      id: createId(),
      title,
      createdAt: now,
      updatedAt: now,
      tags: tags.map((tag) => tag.toJSON()),
      flatTags: flattenCompositeTags(tags),
    },
    items: [],
    historyCursor: -1,
    viewport: { x: 0, y: 0, scale: 1 },
  };
};

export const touchCanvasDocument = (
  document: CanvasDocument,
  changes: Partial<CanvasDocument>,
): CanvasDocument => ({
  ...document,
  ...changes,
  metadata: {
    ...document.metadata,
    ...changes.metadata,
    updatedAt: new Date().toISOString(),
  },
});

export const isCanvasDocument = (value: unknown): value is CanvasDocument => {
  const candidate = value as Partial<CanvasDocument>;
  return (
    isCanvasDrawingData(value) &&
    typeof candidate.metadata?.id === "string"
  );
};

export const isCanvasDrawingData = (
  value: unknown,
): value is CanvasDrawingData => {
  const candidate = value as Partial<CanvasDrawingData>;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    candidate.version === CANVAS_DOCUMENT_VERSION &&
    Array.isArray(candidate.items) &&
    typeof candidate.historyCursor === "number"
  );
};
