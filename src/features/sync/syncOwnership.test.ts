import { describe, expect, it } from "vitest";
import { unverifiedDrawingIds } from "./syncOwnership";

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
