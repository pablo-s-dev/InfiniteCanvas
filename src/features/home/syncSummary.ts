import type { DrawingSummary } from "../documents/drawingRepository";

type SyncSummaryDrawing = Pick<DrawingSummary, "id" | "driveFileId" | "syncStatus" | "syncConflict">;

export const countUnsyncedDrawings = (
  drawings: readonly SyncSummaryDrawing[],
  foreignDrawingIds: readonly string[],
) => {
  const foreignIds = new Set(foreignDrawingIds);
  return drawings.filter((drawing) =>
    foreignIds.has(drawing.id) ||
    drawing.syncConflict === true ||
    drawing.syncStatus === "pending" ||
    drawing.syncStatus === "failed" ||
    !drawing.driveFileId,
  ).length;
};
