import { describe, expect, it, vi } from "vitest";
import { createCanvasDocument } from "../canvas/document";
import {
  DrawingImportError,
  parseDrawingImport,
  pickDrawingJson,
} from "./drawingImport";

vi.mock("react-native", () => ({
  Platform: { OS: "test" },
}));

describe("parseDrawingImport", () => {
  it("accepts a single drawing document", () => {
    const document = createCanvasDocument("Single");

    expect(parseDrawingImport(document)).toEqual([document]);
  });

  it("accepts a bundle with valid drawing documents", () => {
    const first = createCanvasDocument("First");
    const second = createCanvasDocument("Second");

    expect(
      parseDrawingImport({
        type: "infinitecanvas.bundle",
        drawings: [first, { invalid: true }, second],
      }),
    ).toEqual([first, second]);
  });

  it("rejects invalid payloads", () => {
    expect(() => parseDrawingImport({ drawings: [] })).toThrow(DrawingImportError);
    try {
      parseDrawingImport({ drawings: [] });
    } catch (error) {
      expect(error).toMatchObject({ code: "unsupported_file" });
    }
  });

  it("rejects empty bundles with a specific error code", () => {
    expect(() =>
      parseDrawingImport({
        type: "infinitecanvas.bundle",
        drawings: [{ invalid: true }],
      }),
    ).toThrow(DrawingImportError);

    try {
      parseDrawingImport({
        type: "infinitecanvas.bundle",
        drawings: [{ invalid: true }],
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "empty_bundle" });
    }
  });

  it("reports unavailable native file picker outside web", async () => {
    await expect(pickDrawingJson()).rejects.toMatchObject({
      code: "native_picker_unavailable",
    });
  });
});
