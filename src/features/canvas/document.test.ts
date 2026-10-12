import { describe, expect, it, vi } from "vitest";
import { CANVAS_DOCUMENT_VERSION, createCanvasDocument, isCanvasDocument, isCanvasDrawingData, touchCanvasDocument } from "./document";
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

  it("rejects executable path data and unsafe image protocols", () => {
    const document = createCanvasDocument("Untrusted");
    const scriptPath = {
      id: "path-1",
      type: "path" as const,
      data: 'M0 0 L1 1 <script>alert(1)</script>',
      color: "#ffffff",
      width: 2,
    };
    expect(isCanvasDocument({ ...document, items: [scriptPath] })).toBe(false);

    const unsafeImage = {
      id: "image-1",
      type: "image" as const,
      uri: "javascript:alert(1)",
    };
    expect(isCanvasDocument({ ...document, items: [unsafeImage] })).toBe(false);
  });

  it("rejects local-only and SVG data URIs for cloud documents", () => {
    const document = createCanvasDocument("Untrusted");
    const localImage = {
      id: "image-1",
      type: "image" as const,
      uri: "file:///data/user/0/app/files/photo.png",
    };
    const svgImage = {
      id: "image-2",
      type: "image" as const,
      uri: "data:image/svg+xml;base64,PHN2Zy8+",
    };

    expect(isCanvasDocument({ ...document, items: [localImage] })).toBe(true);
    expect(
      isCanvasDocument({ ...document, items: [localImage] }, { allowLocalImageUris: false }),
    ).toBe(false);
    expect(
      isCanvasDocument({ ...document, items: [svgImage] }, { allowLocalImageUris: false }),
    ).toBe(false);
  });

  it("rejects invalid numeric values and unknown document fields", () => {
    const document = createCanvasDocument("Untrusted");
    const invalidPath = {
      id: "path-1",
      type: "path" as const,
      data: "M0 0 L1 1",
      color: "#ffffff",
      width: Number.POSITIVE_INFINITY,
    };

    expect(isCanvasDocument({ ...document, items: [invalidPath] })).toBe(false);
    expect(isCanvasDocument({ ...document, injectedHtml: "<img onerror=alert(1)>" })).toBe(false);
    expect(
      isCanvasDocument({
        ...document,
        items: [
          {
            ...invalidPath,
            width: 2,
            color: "rgb(999, 0, 0)",
          },
        ],
      }),
    ).toBe(false);
  });
});
