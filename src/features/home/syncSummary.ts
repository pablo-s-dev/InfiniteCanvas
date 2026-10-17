import type { DrawingSummary } from "../documents/drawingRepository";

type SyncSummaryDrawing = Pick<DrawingSummary, "id" | "driveFileId" | "syncStatus" | "syncConflict">;

export function getSyncSummaryState(connected: boolean, confirmed: boolean, unsyncedCount: number) {
  if (!connected) return "local";
  if (unsyncedCount > 0) return "pending";
  return confirmed ? "synced" : "local";
}

export const countUnsyncedDrawings = (
  drawings: readonly SyncSummaryDrawing[],
  foreignDrawingIds: readonly string[],
) => {
  const foreignIds = new Set(foreignDrawingIds);
  return drawings.filter((drawing) =>
    foreignIds.has(drawing.id) ||
    drawing.syncConflict === true ||
    drawing.syncStatus !== "synced" ||
    !drawing.driveFileId,
  ).length;
};
