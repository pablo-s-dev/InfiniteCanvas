import { describe, expect, it } from "vitest";
import { countUnsyncedDrawings } from "./syncSummary";

describe("countUnsyncedDrawings", () => {
  it("counts local, pending, failed, conflicted, and other-account drawings once each", () => {
    const drawings = [
      { id: "synced", driveFileId: "drive-synced", syncStatus: "synced" as const, syncConflict: false },
      { id: "local", syncStatus: "synced" as const, syncConflict: false },
      { id: "pending", driveFileId: "drive-pending", syncStatus: "pending" as const, syncConflict: false },
      { id: "failed", driveFileId: "drive-failed", syncStatus: "failed" as const, syncConflict: false },
      { id: "conflict", driveFileId: "drive-conflict", syncStatus: "synced" as const, syncConflict: true },
      { id: "foreign", driveFileId: "drive-foreign", syncStatus: "synced" as const, syncConflict: false },
      { id: "failed-conflict", driveFileId: "drive-failed-conflict", syncStatus: "failed" as const, syncConflict: true },
    ];

    expect(countUnsyncedDrawings(drawings, ["foreign"])).toBe(6);
  });

  it("returns zero when every drawing has a synced Drive copy", () => {
    expect(countUnsyncedDrawings([
      { id: "synced", driveFileId: "drive-synced", syncStatus: "synced" as const, syncConflict: false },
    ], [])).toBe(0);
    expect(countUnsyncedDrawings([], [])).toBe(0);
  });
});
