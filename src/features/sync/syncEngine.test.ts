import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({Platform: {OS: "test"}}));
vi.mock("./googleDriveSync", () => ({
  CloudSyncApiError: class extends Error {},
  googleDriveSync: { getAccountBindingIfKnown: vi.fn(() => "account-a"), migrateLegacyDocuments: vi.fn(async () => ({rejected: 0})),
    listDocuments: vi.fn(async () => []), downloadDocument: vi.fn(), uploadDocument: vi.fn(), deleteDocument: vi.fn() },
}));
import { drawingRepository } from "../documents/drawingRepository";
import { jsonStorage } from "../../shared/storage/jsonStorage";
import { googleDriveSync, type CloudSyncAccount } from "./googleDriveSync";
import { syncBindings } from "./syncBindings";
import { syncContentHash } from "./syncContent";
import { drawingSyncQueue } from "./syncQueue";
import { runCloudSync } from "./syncEngine";
import { createCanvasDocument, type CanvasDocument } from "../canvas/document";

const account: CloudSyncAccount = {email: "test@example.com", accountBinding: "account-a", drive: "ready", entitlement: {active: true, status: "active", accountBinding: "account-a"}};
async function baseDocument() {
  const base = createCanvasDocument("Base");
  base.metadata.driveFileId = "drive-file"; base.metadata.driveRevisionId = "revision-1";
  await drawingRepository.save(base, {sync: "remote"});
  await syncBindings.set({drawingId: base.metadata.id, accountBinding: account.accountBinding, baseHash: syncContentHash(base), baseRevision: "revision-1", driveFileId: "drive-file"});
  return base;
}
function remote(document: CanvasDocument) {
  vi.mocked(googleDriveSync.listDocuments).mockResolvedValue([{id: "drive-file", documentId: document.metadata.id, name: "Sketch", headRevisionId: document.metadata.driveRevisionId, migrated: false}]);
  vi.mocked(googleDriveSync.downloadDocument).mockResolvedValue(document);
}
beforeEach(async () => {
  await jsonStorage.clear(); vi.clearAllMocks();
  vi.mocked(googleDriveSync.listDocuments).mockResolvedValue([]);
  vi.mocked(googleDriveSync.getAccountBindingIfKnown).mockReturnValue("account-a");
});
describe("sync engine preserves local drawings", () => {
  it("uploads a local edit from the same base without declaring conflict", async () => {
    const base = await baseDocument(); remote(base);
    await drawingRepository.rename(base.metadata.id, "Local edit");
    vi.mocked(googleDriveSync.uploadDocument).mockImplementation(async doc => ({...doc, metadata: {...doc.metadata, driveRevisionId: "revision-2"}}));
    await runCloudSync(account);
    expect(googleDriveSync.uploadDocument).toHaveBeenCalledOnce();
    expect((await drawingRepository.get(base.metadata.id))?.metadata.syncConflict).toBe(false);
    expect(await drawingSyncQueue.list()).toHaveLength(0);
  });
  it("downloads a remote edit if the local content is still the common base", async () => {
    const base = await baseDocument(); remote({...base, metadata: {...base.metadata, title: "Remote edit", driveRevisionId: "revision-2"}});
    await runCloudSync(account);
    expect((await drawingRepository.get(base.metadata.id))?.metadata.title).toBe("Remote edit");
    expect(googleDriveSync.uploadDocument).not.toHaveBeenCalled();
  });
  it("does not overwrite edits made while an upload is in flight", async () => {
    const base = await baseDocument(); remote(base); await drawingRepository.rename(base.metadata.id, "Uploading");
    vi.mocked(googleDriveSync.uploadDocument).mockImplementation(async doc => {
      await drawingRepository.rename(base.metadata.id, "New edit during upload");
      return {...doc, metadata: {...doc.metadata, driveRevisionId: "revision-2"}};
    });
    await runCloudSync(account);
    const current = await drawingRepository.get(base.metadata.id);
    expect(current?.metadata.title).toBe("New edit during upload");
    expect(current?.metadata.syncStatus).toBe("pending");
    expect(await drawingSyncQueue.list()).toHaveLength(1);
    expect((await syncBindings.get(base.metadata.id))?.baseRevision).toBe("revision-2");
  });
  it("requires a choice when both copies diverge", async () => {
    const base = await baseDocument(); await drawingRepository.rename(base.metadata.id, "Local edit");
    remote({...base, metadata: {...base.metadata, title: "Remote edit", driveRevisionId: "revision-2"}});
    await runCloudSync(account);
    expect((await drawingRepository.get(base.metadata.id))?.metadata.syncConflict).toBe(true);
    expect(googleDriveSync.uploadDocument).not.toHaveBeenCalled();
  });
  it("keeps corrupt remote data from overwriting the valid local copy", async () => {
    const base = await baseDocument(); await drawingRepository.rename(base.metadata.id, "Valid local"); remote(base);
    vi.mocked(googleDriveSync.downloadDocument).mockRejectedValue(new Error("Truncated JSON"));
    expect((await runCloudSync(account)).failures).toBe(1);
    expect((await drawingRepository.get(base.metadata.id))?.metadata.title).toBe("Valid local");
    expect(googleDriveSync.uploadDocument).not.toHaveBeenCalled();
  });
  it("does not upload or delete documents owned by another account", async () => {
    const base = await baseDocument(); await drawingRepository.delete(base.metadata.id);
    vi.mocked(googleDriveSync.getAccountBindingIfKnown).mockReturnValue("account-b");
    await runCloudSync({...account, accountBinding: "account-b"});
    expect(googleDriveSync.uploadDocument).not.toHaveBeenCalled();
    expect(googleDriveSync.deleteDocument).not.toHaveBeenCalled();
    expect(await drawingSyncQueue.list()).toHaveLength(1);
  });
  it("deletes from the known base and does not enqueue the tombstone again", async () => {
    const base = await baseDocument(); remote(base);
    await drawingRepository.delete(base.metadata.id);
    await runCloudSync(account);
    expect(googleDriveSync.deleteDocument).toHaveBeenCalledWith(base.metadata.id, "revision-1");
    expect(await drawingSyncQueue.list()).toHaveLength(0);
    vi.mocked(googleDriveSync.listDocuments).mockResolvedValue([]);
    await runCloudSync(account);
    expect(googleDriveSync.deleteDocument).toHaveBeenCalledOnce();
    expect(await drawingSyncQueue.list()).toHaveLength(0);
  });
});
