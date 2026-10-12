import { CompositeTag, CompositeTagJson, flattenCompositeTags } from "../tags/tagModel";

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
  pointEraseReplacements?: Array<{
    targetItemId: string;
    items: CanvasPathItem[];
  }>;
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

export type CanvasDocumentValidationOptions = {
  /** Cloud copies must not contain device-local file/content URIs. */
  allowLocalImageUris?: boolean;
};

const MAX_DOCUMENT_JSON_CHARS = 5 * 1024 * 1024;
const MAX_ITEMS = 20_000;
const MAX_POINTS_PER_PATH = 100_000;
const MAX_TOTAL_POINTS = 500_000;
const MAX_PATH_CHARS = 1_000_000;
const MAX_FIELD_CHARS = 4_096;
const MAX_COORDINATE = 10_000_000;
const MAX_STROKE_WIDTH = 10_000;
const MAX_TAG_DEPTH = 8;
const MAX_TAGS = 1_000;
const MAX_TAG_NAME_CHARS = 128;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const isBoundedString = (
  value: unknown,
  maximum = MAX_FIELD_CHARS,
  allowEmpty = false,
): value is string =>
  typeof value === "string" &&
  value.length <= maximum &&
  (allowEmpty || value.trim().length > 0);

const isFiniteInRange = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const isOptionalTimestamp = (value: unknown) =>
  value === undefined ||
  (typeof value === "string" &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value)));

const isSafeImageUri = (
  value: unknown,
  allowLocalImageUris: boolean,
) => {
  if (typeof value !== "string" || value.length > 4 * 1024 * 1024) return false;
  if (
    /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=_-]+$/i.test(value)
  ) {
    return true;
  }
  if (!allowLocalImageUris) return false;
  if (value.length > MAX_FIELD_CHARS) return false;

  try {
    const uri = new URL(value);
    return (
      (uri.protocol === "file:" ||
        uri.protocol === "content:" ||
        (uri.protocol === "thumb:" && allowLocalImageUris)) &&
      !uri.href.includes("..")
    );
  } catch {
    return false;
  }
};

const isSafePathData = (value: unknown) =>
  isBoundedString(value, MAX_PATH_CHARS) &&
  /^[\sMmLlHhVvCcSsQqTtAaZz0-9eE+.,-]+$/.test(value);

const isSafeColor = (value: unknown) => {
  if (typeof value !== "string") return false;
  if (/^(?:#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|transparent|black|white)$/i.test(value)) {
    return true;
  }
  const match = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (!match) return false;
  const channels = match[1].split(",").map((channel) => channel.trim());
  if (channels.length !== 3 && channels.length !== 4) return false;
  const rgb = channels.slice(0, 3).map(Number);
  const validRgb = rgb.every(
    (channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255,
  );
  const alpha = channels.length === 4 ? Number(channels[3]) : 1;
  return validRgb && Number.isFinite(alpha) && alpha >= 0 && alpha <= 1;
};

const isValidPoint = (value: unknown): value is CanvasPoint => {
  if (!isRecord(value) || !hasOnlyKeys(value, ["x", "y", "pressure", "time"])) {
    return false;
  }
  return (
    isFiniteInRange(value.x, -MAX_COORDINATE, MAX_COORDINATE) &&
    isFiniteInRange(value.y, -MAX_COORDINATE, MAX_COORDINATE) &&
    (value.pressure === undefined || isFiniteInRange(value.pressure, 0, 1)) &&
    (value.time === undefined || isFiniteInRange(value.time, 0, 1_000_000_000_000_000))
  );
};

const isValidPathItem = (value: unknown): value is CanvasPathItem => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "type",
      "data",
      "points",
      "color",
      "width",
      "createdAt",
      "updatedAt",
    ])
  ) {
    return false;
  }
  return (
    isBoundedString(value.id, 128) &&
    value.type === "path" &&
    isSafePathData(value.data) &&
    isSafeColor(value.color) &&
    isFiniteInRange(value.width, 0.01, MAX_STROKE_WIDTH) &&
    (value.points === undefined ||
      (Array.isArray(value.points) &&
        value.points.length <= MAX_POINTS_PER_PATH &&
        value.points.every(isValidPoint))) &&
    isOptionalTimestamp(value.createdAt) &&
    isOptionalTimestamp(value.updatedAt)
  );
};

const isValidImageItem = (
  value: unknown,
  allowLocalImageUris: boolean,
): value is CanvasImageItem => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "type",
      "uri",
      "x",
      "y",
      "widthPx",
      "heightPx",
      "createdAt",
      "updatedAt",
    ])
  ) {
    return false;
  }
  return (
    isBoundedString(value.id, 128) &&
    value.type === "image" &&
    isSafeImageUri(value.uri, allowLocalImageUris) &&
    (value.x === undefined ||
      isFiniteInRange(value.x, -MAX_COORDINATE, MAX_COORDINATE)) &&
    (value.y === undefined ||
      isFiniteInRange(value.y, -MAX_COORDINATE, MAX_COORDINATE)) &&
    (value.widthPx === undefined ||
      isFiniteInRange(value.widthPx, 0.01, MAX_COORDINATE)) &&
    (value.heightPx === undefined ||
      isFiniteInRange(value.heightPx, 0.01, MAX_COORDINATE)) &&
    isOptionalTimestamp(value.createdAt) &&
    isOptionalTimestamp(value.updatedAt)
  );
};

const isValidEraseItem = (value: unknown): value is CanvasEraseItem => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "type",
      "erasedItemIds",
      "pointEraseReplacements",
      "createdAt",
      "updatedAt",
    ])
  ) {
    return false;
  }
  const replacements = value.pointEraseReplacements;
  return (
    isBoundedString(value.id, 128) &&
    value.type === "erase" &&
    Array.isArray(value.erasedItemIds) &&
    value.erasedItemIds.length <= MAX_ITEMS &&
    value.erasedItemIds.every((id) => isBoundedString(id, 128)) &&
    (replacements === undefined ||
      (Array.isArray(replacements) &&
        replacements.length <= MAX_ITEMS &&
        replacements.every(
          (replacement) =>
            isRecord(replacement) &&
            hasOnlyKeys(replacement, ["targetItemId", "items"]) &&
            isBoundedString(replacement.targetItemId, 128) &&
            Array.isArray(replacement.items) &&
            replacement.items.length <= MAX_ITEMS &&
            replacement.items.every(isValidPathItem),
        ))) &&
    isOptionalTimestamp(value.createdAt) &&
    isOptionalTimestamp(value.updatedAt)
  );
};

const isValidTag = (value: unknown, depth: number): value is CompositeTagJson => {
  if (
    depth > MAX_TAG_DEPTH ||
    !isRecord(value) ||
    !hasOnlyKeys(value, ["name", "value", "flatValues"])
  ) {
    return false;
  }
  return (
    isBoundedString(value.name, MAX_TAG_NAME_CHARS) &&
    (value.value === undefined ||
      (Array.isArray(value.value) &&
        value.value.length <= MAX_TAGS &&
        value.value.every((tag) => isValidTag(tag, depth + 1)))) &&
    (value.flatValues === undefined ||
      (Array.isArray(value.flatValues) &&
        value.flatValues.length <= MAX_TAGS &&
        value.flatValues.every((entry) =>
          isBoundedString(entry, MAX_TAG_NAME_CHARS),
        )))
  );
};

const isValidMetadata = (
  value: unknown,
  allowLocalImageUris: boolean,
): value is CanvasDocumentMetadata => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "title",
      "createdAt",
      "updatedAt",
      "tags",
      "flatTags",
      "thumbnailUri",
      "driveFileId",
      "driveRevisionId",
      "syncStatus",
      "syncError",
      "syncQueuedAt",
      "syncLastAttemptAt",
      "syncConflict",
      "syncConflictRemoteRevisionId",
      "syncConflictRemoteUpdatedAt",
      "deletedAt",
    ])
  ) {
    return false;
  }

  return (
    isBoundedString(value.id, 128) &&
    isBoundedString(value.title, 512) &&
    isBoundedString(value.createdAt, 64) &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    isBoundedString(value.updatedAt, 64) &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    Array.isArray(value.tags) &&
    value.tags.length <= MAX_TAGS &&
    value.tags.every((tag) => isValidTag(tag, 0)) &&
    Array.isArray(value.flatTags) &&
    value.flatTags.length <= MAX_TAGS &&
    value.flatTags.every((entry) => isBoundedString(entry, MAX_TAG_NAME_CHARS)) &&
    (value.thumbnailUri === undefined ||
      isSafeImageUri(value.thumbnailUri, allowLocalImageUris)) &&
    (value.driveFileId === undefined || isBoundedString(value.driveFileId, 256)) &&
    (value.driveRevisionId === undefined ||
      isBoundedString(value.driveRevisionId, 256)) &&
    (value.syncStatus === undefined ||
      value.syncStatus === "pending" ||
      value.syncStatus === "synced" ||
      value.syncStatus === "failed") &&
    (value.syncError === undefined || isBoundedString(value.syncError, 512, true)) &&
    isOptionalTimestamp(value.syncQueuedAt) &&
    isOptionalTimestamp(value.syncLastAttemptAt) &&
    (value.syncConflict === undefined || typeof value.syncConflict === "boolean") &&
    (value.syncConflictRemoteRevisionId === undefined ||
      isBoundedString(value.syncConflictRemoteRevisionId, 256)) &&
    isOptionalTimestamp(value.syncConflictRemoteUpdatedAt) &&
    isOptionalTimestamp(value.deletedAt)
  );
};

export const isCanvasDocument = (
  value: unknown,
  options: CanvasDocumentValidationOptions = {},
): value is CanvasDocument => {
  if (!isRecord(value)) return false;
  let serializedLength: number;
  try {
    serializedLength = JSON.stringify(value).length;
  } catch {
    return false;
  }
  const metadata = value.metadata;
  return (
    serializedLength <= MAX_DOCUMENT_JSON_CHARS &&
    hasOnlyKeys(value, ["version", "items", "historyCursor", "viewport", "metadata"]) &&
    isCanvasDrawingData(value, options) &&
    isValidMetadata(metadata, options.allowLocalImageUris ?? true)
  );
};

export const isCanvasDrawingData = (
  value: unknown,
  options: CanvasDocumentValidationOptions = {},
): value is CanvasDrawingData => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["version", "items", "historyCursor", "viewport", "metadata"])
  ) {
    return false;
  }
  const allowLocalImageUris = options.allowLocalImageUris ?? true;
  if (
    value.version !== CANVAS_DOCUMENT_VERSION ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_ITEMS ||
    !Number.isInteger(value.historyCursor) ||
    !isFiniteInRange(value.historyCursor, -1, MAX_ITEMS)
  ) {
    return false;
  }

  let totalPoints = 0;
  const validItems = value.items.every((item) => {
    if (isValidPathItem(item)) {
      totalPoints += item.points?.length ?? 0;
      return totalPoints <= MAX_TOTAL_POINTS;
    }
    if (isValidImageItem(item, allowLocalImageUris)) return true;
    if (!isValidEraseItem(item)) return false;
    const replacementPoints = item.pointEraseReplacements?.reduce(
      (sum, replacement) =>
        sum + replacement.items.reduce((itemSum, path) => itemSum + (path.points?.length ?? 0), 0),
      0,
    ) ?? 0;
    totalPoints += replacementPoints;
    return totalPoints <= MAX_TOTAL_POINTS;
  });
  if (!validItems) return false;

  const viewport = value.viewport;
  return (
    viewport === undefined ||
    (isRecord(viewport) &&
      hasOnlyKeys(viewport, ["x", "y", "scale"]) &&
      isFiniteInRange(viewport.x, -MAX_COORDINATE, MAX_COORDINATE) &&
      isFiniteInRange(viewport.y, -MAX_COORDINATE, MAX_COORDINATE) &&
      isFiniteInRange(viewport.scale, 0.01, 100))
  );
};
