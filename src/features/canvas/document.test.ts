import { describe, expect, it, vi } from "vitest";
import {
  CANVAS_DOCUMENT_VERSION,
  createCanvasDocument,
  isCanvasDocument,
  isCanvasDrawingData,
  touchCanvasDocument,
} from "./document";
import { CompositeTag } from "../tags/tagModel";

describe("canvas document schema", () => {
  it("creates versioned documents with metadata, tags, and default viewport", () => {
    const document = createCanvasDocument("Sketch", [
      new CompositeTag({
        name: "Project",
        value: [new CompositeTag({ name: "Client" })],
      }),
    ]);

    expect(document.version).toBe(CANVAS_DOCUMENT_VERSION);
    expect(document.metadata.title).toBe("Sketch");
    expect(document.metadata.tags).toHaveLength(1);
    expect(document.metadata.flatTags).toEqual(["Project", "Client"]);
    expect(document.items).toEqual([]);
    expect(document.historyCursor).toBe(-1);
    expect(document.viewport).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("touches metadata while preserving drawing data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));

    const document = createCanvasDocument("Sketch");
    const touched = touchCanvasDocument(document, {
      historyCursor: 2,
      viewport: { x: 10, y: -5, scale: 1.5 },
      metadata: { ...document.metadata, title: "Renamed" },
    });

    expect(touched.metadata.title).toBe("Renamed");
    expect(touched.metadata.updatedAt).toBe("2026-08-23T12:00:00.000Z");
    expect(touched.historyCursor).toBe(2);
    expect(touched.viewport).toEqual({ x: 10, y: -5, scale: 1.5 });

    vi.useRealTimers();
  });

  it("validates drawing data and full documents", () => {
    const document = createCanvasDocument("Valid");

    expect(isCanvasDrawingData(document)).toBe(true);
    expect(isCanvasDocument(document)).toBe(true);
    expect(isCanvasDrawingData({ ...document, version: 1 })).toBe(false);
    expect(isCanvasDocument({ ...document, metadata: undefined })).toBe(false);
  });
});
