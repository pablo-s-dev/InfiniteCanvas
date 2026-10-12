import { HttpError, readBoundedText } from "./http";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const APP_MARKER = "infinitecanvas";

type JsonRecord = Record<string, unknown>;

export type DriveFile = {
  id: string;
  name: string;
  headRevisionId?: string;
  modifiedTime?: string;
  drawingId?: string;
  parents?: string[];
  appProperties: Record<string, string>;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function driveId(value: string): string {
  if (!/^[A-Za-z0-9_-]{5,256}$/.test(value)) {
    throw new HttpError(400, "invalid_drive_id", "The Drive file identifier is invalid.");
  }
  return value;
}

async function parseJson(response: Response, action: string): Promise<JsonRecord> {
  const text = await readBoundedText(response.body, 128 * 1024);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new HttpError(502, "drive_invalid_response", `Google Drive returned malformed data while ${action}.`);
  }
  if (!isRecord(payload)) {
    throw new HttpError(502, "drive_invalid_response", `Google Drive returned an invalid response while ${action}.`);
  }
  return payload;
}

async function assertDriveResponse(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const status = response.status;
  const detail = await readBoundedText(response.body, 8 * 1024).catch(() => "");
  if (status === 412 || status === 409) throw new HttpError(409, "drawing_conflict", "The Drive copy changed before the write completed.");
  if (status === 429 || (status === 403 && /quota|rateLimit|storageQuota/i.test(detail)))
    throw new HttpError(503, "drive_rate_limited", "Google Drive is temporarily unavailable. Try again later.");
  if (status === 401 || status === 403) {
    throw new HttpError(401, "drive_reauthorization_required", "Reconnect Google Drive to continue syncing.");
  }
  if (status === 404) {
    throw new HttpError(404, "drive_file_not_found", "The Drive file no longer exists.");
  }
  throw new HttpError(502, "drive_request_failed", `Google Drive could not ${action}.`);
}

function recordToFile(value: unknown): DriveFile | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const rawProperties = isRecord(value.appProperties) ? value.appProperties : {};
  const appProperties: Record<string, string> = {};
  for (const [key, entry] of Object.entries(rawProperties)) {
    if (typeof entry === "string" && entry.length <= 256) appProperties[key] = entry;
  }
  return {
    id: value.id,
    name: value.name,
    ...(typeof value.headRevisionId === "string"
      ? { headRevisionId: value.headRevisionId }
      : {}),
    ...(typeof value.modifiedTime === "string"
      ? { modifiedTime: value.modifiedTime }
      : {}),
    ...(Array.isArray(value.parents)
      ? { parents: value.parents.filter((parent): parent is string => typeof parent === "string") }
      : {}),
    ...(typeof appProperties.drawingId === "string"
      ? { drawingId: appProperties.drawingId }
      : {}),
    appProperties,
  };
}

export async function listVisibleFiles(
  accessToken: string,
  folderId: string,
  accountHash: string,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      pageSize: "100",
      orderBy: "name",
      fields: "nextPageToken,files(id,name,headRevisionId,modifiedTime,appProperties,parents)",
      q: `'${driveId(folderId)}' in parents and trashed = false and appProperties has { key='app' and value='${APP_MARKER}' } and appProperties has { key='account' and value='${accountHash}' }`,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    await assertDriveResponse(response, "list the InfiniteCanvas folder");
    const result = await parseJson(response, "listing files");
    const pageFiles = Array.isArray(result.files) ? result.files : [];
    for (const item of pageFiles) {
      const file = recordToFile(item);
      if (file && file.appProperties.app === APP_MARKER && file.appProperties.account === accountHash) {
        files.push(file);
      }
    }
    if (files.length > 1_000) {
      throw new HttpError(413, "drive_file_limit", "This Drive folder has too many InfiniteCanvas files to sync.");
    }
    pageToken = typeof result.nextPageToken === "string" ? result.nextPageToken : undefined;
    if (!pageToken) return files;
  }
  throw new HttpError(413, "drive_page_limit", "This Drive folder exceeds the supported sync limit.");
}

export async function listLegacyAppDataFiles(accessToken: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      pageSize: "100",
      fields: "nextPageToken,files(id,name,headRevisionId,modifiedTime,appProperties,parents)",
      q: "name contains '.infinitecanvas.json' and trashed = false",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    await assertDriveResponse(response, "list legacy app data");
    const result = await parseJson(response, "listing legacy app data");
    for (const item of Array.isArray(result.files) ? result.files : []) {
      const file = recordToFile(item);
      if (file && file.name.endsWith(".infinitecanvas.json")) files.push(file);
    }
    if (files.length > 1_000) {
      throw new HttpError(413, "legacy_file_limit", "Too many legacy drawings were found to migrate safely.");
    }
    pageToken = typeof result.nextPageToken === "string" ? result.nextPageToken : undefined;
    if (!pageToken) return files;
  }
  throw new HttpError(413, "legacy_page_limit", "The legacy app data folder exceeds the migration limit.");
}

export async function getDriveFile(
  accessToken: string,
  id: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: "id,name,headRevisionId,modifiedTime,appProperties,parents",
  });
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId(id))}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  await assertDriveResponse(response, "read the Drive file details");
  const file = recordToFile(await parseJson(response, "reading file details"));
  if (!file) throw new HttpError(502, "drive_invalid_response", "Google Drive returned incomplete file metadata.");
  return file;
}

export async function downloadDriveFile(accessToken: string, id: string): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId(id))}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  await assertDriveResponse(response, "download the drawing");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_DOCUMENT_BYTES) {
    throw new HttpError(413, "remote_document_too_large", "The Drive drawing exceeds the supported size.");
  }
  return readBoundedText(response.body, MAX_DOCUMENT_BYTES);
}

function documentAppProperties(accountHash: string, drawingId: string) {
  return {
    app: APP_MARKER,
    account: accountHash,
    drawingId,
    schema: "2",
  };
}

export async function ensureVisibleFolder(
  accessToken: string,
  accountHash: string,
  existingFolderId?: string | null,
): Promise<string> {
  if (existingFolderId) {
    const file = await getDriveFile(accessToken, existingFolderId);
    if (
      file.appProperties.app === APP_MARKER &&
      file.appProperties.account === accountHash
    ) {
      return file.id;
    }
  }

  const params = new URLSearchParams({
    pageSize: "100",
    fields: "files(id,name,mimeType,parents,appProperties)",
    q: "'root' in parents and mimeType = 'application/vnd.google-apps.folder' and name = 'InfiniteCanvas' and trashed = false",
  });
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  await assertDriveResponse(response, "find the InfiniteCanvas folder");
  const result = await parseJson(response, "finding the sync folder");
  const candidates = (Array.isArray(result.files) ? result.files : [])
    .map(recordToFile)
    .filter(
      (file): file is DriveFile =>
        file !== null &&
        file.appProperties.app === APP_MARKER &&
        file.appProperties.account === accountHash,
    );
  if (candidates.length > 1) {
    throw new HttpError(409, "duplicate_sync_folder", "More than one app sync folder was found; no folder was changed.");
  }
  if (candidates[0]) return candidates[0].id;

  const create = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "InfiniteCanvas",
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
      appProperties: documentAppProperties(accountHash, "folder"),
    }),
  });
  await assertDriveResponse(create, "create the InfiniteCanvas folder");
  const created = await parseJson(create, "creating the sync folder");
  if (typeof created.id !== "string") {
    throw new HttpError(502, "drive_folder_creation_failed", "Google Drive did not return a folder identifier.");
  }
  return created.id;
}

export async function createDriveDocument(
  accessToken: string,
  folderId: string,
  accountHash: string,
  drawingId: string,
  content: string,
  reservedId?: string,
): Promise<DriveFile> {
  if (new TextEncoder().encode(content).byteLength > MAX_DOCUMENT_BYTES) {
    throw new HttpError(413, "document_too_large", "The drawing exceeds the supported size.");
  }
  const boundary = `infinitecanvas_${crypto.randomUUID()}`;
  const metadata = {
    ...(reservedId ? { id: driveId(reservedId) } : {}),
    name: `${drawingId}.infinitecanvas.json`,
    mimeType: "application/json",
    parents: [driveId(folderId)],
    appProperties: documentAppProperties(accountHash, drawingId),
  };
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${content}\r\n`,
    `--${boundary}--`,
  ].join("");
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,headRevisionId,modifiedTime,appProperties",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  await assertDriveResponse(response, "save the drawing");
  const file = recordToFile(await parseJson(response, "saving the drawing"));
  if (!file) throw new HttpError(502, "drive_invalid_response", "Google Drive did not return the saved drawing.");
  return file;
}

export async function updateDriveDocument(
  accessToken: string,
  fileId: string,
  content: string,
  expectedRevision: string,
): Promise<DriveFile> {
  if (new TextEncoder().encode(content).byteLength > MAX_DOCUMENT_BYTES) {
    throw new HttpError(413, "document_too_large", "The drawing exceeds the supported size.");
  }
  const etag = await driveWritePrecondition(accessToken, fileId, expectedRevision);
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v2/files/${encodeURIComponent(driveId(fileId))}?uploadType=media&newRevision=true&fields=id`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "If-Match": etag,
      },
      body: content,
    },
  );
  await assertDriveResponse(response, "update the drawing");
  await parseJson(response, "updating the drawing");
  return getDriveFile(accessToken, fileId);
}

// Drive v2 exposes an ETag. Pair the observed revision with an If-Match
// write so a manual edit between our read and write cannot be overwritten.
export async function driveWritePrecondition(accessToken: string, fileId: string, expectedRevision: string): Promise<string> {
  const response = await fetch(`https://www.googleapis.com/drive/v2/files/${encodeURIComponent(driveId(fileId))}?fields=etag,headRevisionId`,
    {headers: {Authorization: `Bearer ${accessToken}`}});
  await assertDriveResponse(response, "check the drawing version");
  const value = await parseJson(response, "checking the drawing version");
  if (!expectedRevision || value.headRevisionId !== expectedRevision) throw new HttpError(409, "drawing_conflict", "The Drive copy changed.");
  if (typeof value.etag !== "string" || !value.etag || value.etag.startsWith("W/"))
    throw new HttpError(503, "drive_precondition_unavailable", "Drive did not provide a safe write precondition. Nothing was overwritten.");
  return value.etag;
}

export async function retainDriveRevision(accessToken: string, fileId: string, revision: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId(fileId))}/revisions/${encodeURIComponent(revision)}`,
    {method: "PATCH", headers: {Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json"}, body: JSON.stringify({keepForever: true})});
  await assertDriveResponse(response, "preserve the previous drawing version");
}

export async function generateDriveFileId(accessToken: string): Promise<string> {
  const response = await fetch("https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files", {headers: {Authorization: `Bearer ${accessToken}`}});
  await assertDriveResponse(response, "reserve the drawing identifier");
  const value = await parseJson(response, "reserving the drawing identifier");
  if (!Array.isArray(value.ids) || typeof value.ids[0] !== "string") throw new HttpError(502, "drive_invalid_response", "Drive did not return a reserved identifier.");
  return driveId(value.ids[0]);
}

export async function deleteDriveFile(accessToken: string, fileId: string, expectedRevision?: string): Promise<void> {
  const etag = expectedRevision ? await driveWritePrecondition(accessToken, fileId, expectedRevision) : undefined;
  const response = await fetch(
    `https://www.googleapis.com/drive/${etag ? "v2" : "v3"}/files/${encodeURIComponent(driveId(fileId))}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}`, ...(etag ? {"If-Match": etag} : {}) } },
  );
  if (response.status === 404) return;
  await assertDriveResponse(response, "delete the drawing");
}
