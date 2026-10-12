import type { CanvasDocument } from "../canvas/document";
import { drawingRepository } from "../documents/drawingRepository";
import { googleDriveSync, CloudSyncApiError, type CloudSyncAccount } from "./googleDriveSync";
import { syncBindings, type SyncBinding } from "./syncBindings";
import { compareSyncVersions, syncContentHash } from "./syncContent";
import { drawingSyncQueue } from "./syncQueue";

let work: Promise<unknown> = Promise.resolve();
export function withSyncLock<T>(operation: () => Promise<T>): Promise<T> {
  const task = work.then(operation); work = task.catch(() => undefined); return task;
}
export function assertSyncAccount(account: CloudSyncAccount): void {
  if (googleDriveSync.getAccountBindingIfKnown() !== account.accountBinding) throw new CloudSyncApiError("Account changed.", "account_changed", 409);
  if (!account.entitlement.active) throw new CloudSyncApiError("Cloud Sync access is inactive.", "cloud_sync_locked", 402);
  if (account.drive !== "ready") throw new CloudSyncApiError("Reconnect Drive.", "drive_reauthorization_required", 401);
}

const baseline = (account: string, document: CanvasDocument): SyncBinding => ({
  accountBinding: account, drawingId: document.metadata.id, baseHash: syncContentHash(document),
  baseRevision: document.metadata.driveRevisionId, driveFileId: document.metadata.driveFileId,
});
export async function adoptRemote(account: string, snapshot: CanvasDocument, remote: CanvasDocument, guard: () => void): Promise<void> {
  guard();
  // Compare again under the repository write lock, since drawing can continue during downloads.
  const expected = syncContentHash(snapshot);
  await drawingRepository.update(snapshot.metadata.id, current => {
    guard(); if (syncContentHash(current) !== expected) return null;
    return {...remote, viewport: current.viewport, metadata: {...remote.metadata, thumbnailUri: undefined}};
  }, {sync: "remote", preserveQueue: true});
  guard();
  const latest = await drawingRepository.get(snapshot.metadata.id);
  if (latest && syncContentHash(latest) === syncContentHash(remote)) {
    await syncBindings.set(baseline(account, remote));
    const queued = (await drawingSyncQueue.list()).find(item => item.drawingId === snapshot.metadata.id);
    if (queued) await drawingSyncQueue.markSynced(queued.drawingId, queued.generation ?? 0);
  }
}
export async function uploadSnapshot(account: string, snapshot: CanvasDocument, guard: () => void, observedRevision?: string): Promise<void> {
  guard();
  const queued = (await drawingSyncQueue.list()).find(item => item.drawingId === snapshot.metadata.id);
  const remote = await googleDriveSync.uploadDocument(snapshot, observedRevision ? {force: true, observedRevision} : {});
  guard();
  await syncBindings.set(baseline(account, remote));
  guard(); await drawingRepository.acceptUpload(snapshot, remote, guard);
  const latest = await drawingRepository.get(snapshot.metadata.id);
  if (queued && latest && syncContentHash(latest) === syncContentHash(snapshot)) {
    guard(); await drawingSyncQueue.markSynced(snapshot.metadata.id, queued.generation ?? 0);
  }
}

export async function deleteSnapshot(account: string, snapshot: CanvasDocument, guard: () => void, revision?: string, exists = true): Promise<void> {
  guard();
  const queued = (await drawingSyncQueue.list()).find(item => item.drawingId === snapshot.metadata.id);
  if (exists) await googleDriveSync.deleteDocument(snapshot.metadata.id, revision);
  guard();
  await syncBindings.set({...baseline(account, snapshot), baseRevision: undefined, driveFileId: undefined});
  await drawingRepository.update(snapshot.metadata.id, current => {
    guard();
    if (syncContentHash(current) !== syncContentHash(snapshot)) return null;
    return {...current, metadata: {...current.metadata, syncStatus: "synced", syncConflict: false, syncError: undefined}};
  }, {sync: "preserve", preserveQueue: true});
  const current = await drawingRepository.get(snapshot.metadata.id);
  if (queued && current && syncContentHash(current) === syncContentHash(snapshot)) {
    guard(); await drawingSyncQueue.markSynced(snapshot.metadata.id, queued.generation ?? 0);
  }
}

export async function runCloudSync(account: CloudSyncAccount, guard: () => void = () => assertSyncAccount(account), onlyDrawingId?: string) {
  return withSyncLock(async () => {
    guard(); assertSyncAccount(account);
    const migration = await googleDriveSync.migrateLegacyDocuments(); guard();
    const files = await googleDriveSync.listDocuments(); guard();
    const byId = new Map(files.map(file => [file.documentId, file]));
    const blocked = new Set<string>();
    let failures = migration.rejected;
    for (const summary of await drawingRepository.listIncludingDeleted()) {
      if (onlyDrawingId && summary.id !== onlyDrawingId) continue;
      guard();
      let binding = await syncBindings.get(summary.id);
      if (binding && binding.accountBinding !== account.accountBinding) { blocked.add(summary.id); continue; }
      const local = await drawingRepository.get(summary.id); if (!local) continue;
      const file = byId.get(summary.id);
      if (!file) {
        if (local.metadata.deletedAt && local.metadata.syncStatus === "synced") continue;
        // Legacy links have no proven owner. Never send them into a new account.
        if (!binding && local.metadata.driveFileId) { blocked.add(summary.id); continue; }
        if (!binding) { binding = {drawingId: summary.id, accountBinding: account.accountBinding}; await syncBindings.set(binding); }
        if (!local.metadata.deletedAt && (local.metadata.syncConflict || local.metadata.driveRevisionId)) {
          await drawingRepository.update(summary.id, current => ({...current, metadata: {...current.metadata, driveFileId: undefined, driveRevisionId: undefined, syncConflict: false}}));
        }
        if (!(await drawingSyncQueue.list()).some(item => item.drawingId === summary.id)) await drawingSyncQueue.enqueue(summary.id, local.metadata.deletedAt ? "delete" : "upload", account.accountBinding);
        continue;
      }
      try {
        const remote = await googleDriveSync.downloadDocument(summary.id); guard();
        if (!binding && local.metadata.driveFileId && local.metadata.driveFileId !== remote.metadata.driveFileId) { blocked.add(summary.id); continue; }
        if (!binding) {
          binding = {drawingId: summary.id, accountBinding: account.accountBinding};
          // The legacy base revision can be recovered only from this account's verified file.
          if (local.metadata.driveFileId === remote.metadata.driveFileId && local.metadata.driveRevisionId === remote.metadata.driveRevisionId) binding = baseline(account.accountBinding, remote);
          await syncBindings.set(binding);
        }
        const decision = compareSyncVersions(syncContentHash(local), syncContentHash(remote), binding.baseHash);
        if (decision === "equal") {
          await syncBindings.set(baseline(account.accountBinding, remote));
          guard(); await drawingRepository.acceptUpload(local, remote, guard);
          const queued = (await drawingSyncQueue.list()).find(item => item.drawingId === summary.id);
          const current = await drawingRepository.get(summary.id);
          if (queued && current && syncContentHash(current) === syncContentHash(remote)) await drawingSyncQueue.markSynced(summary.id, queued.generation ?? 0);
        } else if (decision === "download") {
          await adoptRemote(account.accountBinding, local, remote, guard);
        } else if (decision === "upload") {
          await drawingRepository.update(summary.id, current => ({...current, metadata: {...current.metadata, driveRevisionId: remote.metadata.driveRevisionId, syncConflict: false, syncError: undefined}}));
          if (!(await drawingSyncQueue.list()).some(item => item.drawingId === summary.id)) await drawingSyncQueue.enqueue(summary.id, local.metadata.deletedAt ? "delete" : "upload", account.accountBinding);
        } else {
          blocked.add(summary.id);
          await syncBindings.set({...binding, conflictKind: decision === "unbased" ? "unbased" : "diverged"});
          guard(); await drawingRepository.update(summary.id, current => ({...current, metadata: {...current.metadata, syncConflict: true,
            syncConflictRemoteRevisionId: remote.metadata.driveRevisionId, syncConflictRemoteUpdatedAt: remote.metadata.updatedAt}}));
        }
      } catch (error) {
        guard(); blocked.add(summary.id); failures += 1;
        await drawingRepository.update(summary.id, current => ({...current, metadata: {...current.metadata,
          syncConflict: false, syncStatus: "failed", syncError: error instanceof Error ? error.message : "Invalid remote drawing."}}));
      }
    }
    for (const item of await drawingSyncQueue.listReady()) {
      if (onlyDrawingId && item.drawingId !== onlyDrawingId) continue;
      guard();
      if (blocked.has(item.drawingId)) continue;
      const binding = await syncBindings.get(item.drawingId);
      if (!binding || binding.accountBinding !== account.accountBinding || (item.accountBinding && item.accountBinding !== account.accountBinding)) continue;
      const snapshot = await drawingRepository.get(item.drawingId); if (!snapshot || snapshot.metadata.syncConflict) continue;
      try {
        await drawingSyncQueue.recordAttempt(item.drawingId); guard();
        if (snapshot.metadata.deletedAt) {
          await deleteSnapshot(account.accountBinding, snapshot, guard, binding.baseRevision, byId.has(item.drawingId));
        } else {
          await uploadSnapshot(account.accountBinding, {...snapshot, metadata: {...snapshot.metadata, driveRevisionId: binding.baseRevision}}, guard);
        }
      } catch (error) {
        guard(); failures += 1;
        const message = error instanceof Error ? error.message : "Cloud Sync failed.";
        await drawingSyncQueue.markFailed(item.drawingId, message, item.generation ?? 0);
        if (error instanceof CloudSyncApiError && error.code === "drawing_conflict") {
          await drawingRepository.update(item.drawingId, current => ({...current, metadata: {...current.metadata, syncConflict: true}}));
        } else await drawingRepository.markSyncFailed(item.drawingId, message);
      }
    }
    for (const file of files) {
      if (onlyDrawingId && file.documentId !== onlyDrawingId) continue;
      guard(); if (await drawingRepository.get(file.documentId)) continue;
      const owner = await syncBindings.get(file.documentId);
      if (owner && owner.accountBinding !== account.accountBinding) continue;
      try {
        const remote = await googleDriveSync.downloadDocument(file.documentId); guard();
        await syncBindings.set(baseline(account.accountBinding, remote));
        guard(); await drawingRepository.save(remote, {sync: "remote"});
      } catch { guard(); failures += 1; }
    }
    return {failures};
  });
}
