import type { SyncBinding } from "./syncBindings";
import type { DrawingSummary } from "../documents/drawingRepository";

export function hasPendingDrawingState(drawings: readonly Pick<DrawingSummary, "deletedAt" | "syncStatus" | "driveFileId" | "syncConflict">[]) {
  return drawings.some(drawing => !drawing.deletedAt &&
    (drawing.syncStatus !== "synced" || !drawing.driveFileId || drawing.syncConflict === true));
}

// Legacy Drive ids do not establish which Google account owns a drawing.
export function unverifiedDrawingIds(
  drawings: readonly { id: string; deletedAt?: string }[],
  bindings: readonly Pick<SyncBinding, "drawingId" | "accountBinding">[],
  accountBinding?: string,
) {
  const owners = new Map(bindings.map(binding => [binding.drawingId, binding.accountBinding]));
  return drawings.filter(drawing => !drawing.deletedAt &&
    (!accountBinding || owners.get(drawing.id) !== accountBinding)).map(drawing => drawing.id);
}
