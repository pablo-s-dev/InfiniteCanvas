import { describe, expect, it } from "vitest";
import { hasPendingDrawingState, unverifiedDrawingIds } from "./syncOwnership";

describe("hasPendingDrawingState", () => {
  it("blocks confirmation for a conflict even when the sync operation did not throw", () => {
    expect(hasPendingDrawingState([{syncStatus: "synced", driveFileId: "drive", syncConflict: true}])).toBe(true);
    expect(hasPendingDrawingState([{syncStatus: "pending", driveFileId: "drive"}])).toBe(true);
    expect(hasPendingDrawingState([{syncStatus: "failed", driveFileId: "drive"}])).toBe(true);
    expect(hasPendingDrawingState([{syncStatus: "synced"}])).toBe(true);
  });
  it("allows only confirmed live drawings and ignores completed deletions", () => {
    expect(hasPendingDrawingState([{syncStatus: "synced", driveFileId: "drive"}])).toBe(false);
    expect(hasPendingDrawingState([{deletedAt: "2026-10-17"}])).toBe(false);
    expect(hasPendingDrawingState([])).toBe(false);
  });
});

describe("unverifiedDrawingIds", () => {
  const drawings = [{id: "mine"}, {id: "foreign"}, {id: "legacy"}, {id: "deleted", deletedAt: "2026-10-17"}];
  const bindings = [{drawingId: "mine", accountBinding: "a"}, {drawingId: "foreign", accountBinding: "b"}];
  it("requires a current-account binding even for a legacy drawing", () => {
    expect(unverifiedDrawingIds(drawings, bindings, "a")).toEqual(["foreign", "legacy"]);
    expect(unverifiedDrawingIds(drawings, bindings, "b")).toEqual(["mine", "legacy"]);
  });
  it("does not confirm ownership without an account", () => {
    expect(unverifiedDrawingIds(drawings, bindings)).toEqual(["mine", "foreign", "legacy"]);
  });
});
