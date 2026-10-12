import { describe, expect, it } from "vitest";
import { createCanvasDocument } from "../canvas/document";
import { compareSyncVersions, syncContentHash } from "./syncContent";

describe("common sync base", () => {
  it("excludes viewing state and transport metadata", () => {
    const base = createCanvasDocument("Sketch");
    const viewed = {...base, viewport: {x: 50, y: -100, scale: 4}, metadata: {...base.metadata,
      updatedAt: new Date().toISOString(), driveRevisionId: "new", syncConflict: true, syncStatus: "failed" as const}};
    expect(syncContentHash(viewed)).toBe(syncContentHash(base));
  });
  it.each([
    ["same", "same", "old", "equal"],
    ["edit", "base", "base", "upload"],
    ["base", "edit", "base", "download"],
    ["left", "right", "base", "conflict"],
    ["left", "right", undefined, "unbased"],
  ] as const)("compares %s / %s against %s", (local, remote, base, decision) => {
    expect(compareSyncVersions(local, remote, base)).toBe(decision);
  });
});
