import { describe, expect, it, vi } from "vitest";
import { Share } from "react-native";
import { createCanvasDocument } from "../canvas/document";
import {
  DrawingShareError,
  exportDrawingBundleJson,
  exportDrawingJson,
  shareDrawingJson,
} from "./drawingSharing";

vi.mock("react-native", () => ({
  Platform: { OS: "test" },
  Share: {
    share: vi.fn().mockResolvedValue({ action: "sharedAction" }),
  },
}));

describe("drawing sharing", () => {
  it("exports a single drawing through native share outside web", async () => {
    const document = createCanvasDocument("My Sketch!");

    const result = await exportDrawingJson(document);

    expect(result).toEqual({
      filename: "my-sketch.infinitecanvas.json",
      method: "native-share",
    });
    expect(Share.share).toHaveBeenCalledWith({
      title: "My Sketch!",
      message: expect.stringContaining('"title": "My Sketch!"'),
    });
  });

  it("exports multiple drawings as a bundle payload", async () => {
    vi.mocked(Share.share).mockClear();
    const first = createCanvasDocument("First");
    const second = createCanvasDocument("Second");

    const result = await exportDrawingBundleJson([first, second]);

    expect(result.method).toBe("native-share");
    const message = vi.mocked(Share.share).mock.calls[0][0].message;
    expect(message).toEqual(expect.any(String));
    const payload = JSON.parse(message as string);
    expect(payload.type).toBe("infinitecanvas.bundle");
    expect(payload.drawings).toHaveLength(2);
  });

  it("shares a drawing through native share outside web", async () => {
    vi.mocked(Share.share).mockClear();
    const document = createCanvasDocument("Native Share");

    const result = await shareDrawingJson(document);

    expect(result).toEqual({
      filename: "native-share.infinitecanvas.json",
      method: "native-share",
    });
    expect(Share.share).toHaveBeenCalledWith({
      title: "Native Share",
      message: expect.stringContaining('"title": "Native Share"'),
    });
  });

  it("reports unavailable native share API", async () => {
    const originalShare = Share.share;
    (Share as unknown as { share?: typeof Share.share }).share = undefined;

    await expect(exportDrawingJson(createCanvasDocument("No Share"))).rejects.toBeInstanceOf(
      DrawingShareError,
    );
    await expect(exportDrawingJson(createCanvasDocument("No Share"))).rejects.toMatchObject({
      code: "native_share_unavailable",
    });

    Share.share = originalShare;
  });
});
