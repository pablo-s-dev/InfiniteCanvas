import { Platform, Share } from "react-native";
import type { CanvasDocument } from "../canvas/document";

type DrawingShareResult = {
  filename: string;
  method: "download" | "native-share" | "web-share" | "clipboard";
};

export class DrawingShareError extends Error {
  constructor(
    readonly code: "native_share_unavailable",
    message = "Native sharing is not available on this device.",
  ) {
    super(message);
    this.name = "DrawingShareError";
  }
}

const toSafeFilename = (title: string) => {
  const safeTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${safeTitle || "drawing"}.infinitecanvas.json`;
};

const serializeDocument = (document: CanvasDocument) =>
  JSON.stringify(document, null, 2);

const downloadJsonOnWeb = (filename: string, text: string) => {
  if (typeof document === "undefined") return false;

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
};

const shareNativePayload = async (title: string, message: string) => {
  if (typeof Share.share !== "function") {
    throw new DrawingShareError("native_share_unavailable");
  }

  await Share.share({ title, message });
};

export const exportDrawingJson = async (
  document: CanvasDocument,
): Promise<DrawingShareResult> => {
  const filename = toSafeFilename(document.metadata.title);
  const text = serializeDocument(document);

  if (Platform.OS === "web" && downloadJsonOnWeb(filename, text)) {
    return { filename, method: "download" };
  }

  await shareNativePayload(document.metadata.title, text);

  return { filename, method: "native-share" };
};

export const exportDrawingBundleJson = async (
  documents: CanvasDocument[],
): Promise<DrawingShareResult> => {
  const filename = `infinitecanvas-bundle-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  const text = JSON.stringify(
    {
      type: "infinitecanvas.bundle",
      version: 2,
      exportedAt: new Date().toISOString(),
      drawings: documents,
    },
    null,
    2,
  );

  if (Platform.OS === "web" && downloadJsonOnWeb(filename, text)) {
    return { filename, method: "download" };
  }

  await shareNativePayload("InfiniteCanvas drawings", text);

  return { filename, method: "native-share" };
};

export const shareDrawingJson = async (
  document: CanvasDocument,
): Promise<DrawingShareResult> => {
  const filename = toSafeFilename(document.metadata.title);
  const text = serializeDocument(document);

  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    const shareApi = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    const file = new File([text], filename, { type: "application/json" });
    const shareData: ShareData = {
      files: [file],
      title: document.metadata.title,
      text: "InfiniteCanvas drawing",
    };

    try {
      if (shareApi.canShare?.(shareData) && navigator.share) {
        await navigator.share(shareData);
        return { filename, method: "web-share" };
      }

      if (navigator.share) {
        await navigator.share({
          title: document.metadata.title,
          text,
        });
        return { filename, method: "web-share" };
      }
    } catch {
      if (downloadJsonOnWeb(filename, text)) {
        return { filename, method: "download" };
      }
    }

    if (downloadJsonOnWeb(filename, text)) {
      return { filename, method: "download" };
    }
  }

  await shareNativePayload(document.metadata.title, text);

  return { filename, method: "native-share" };
};
