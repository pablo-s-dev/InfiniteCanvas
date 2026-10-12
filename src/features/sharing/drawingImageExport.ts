import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import {
  ImageManipulator as ImageManipulatorModule,
  SaveFormat,
} from "expo-image-manipulator";
import * as Sharing from "expo-sharing";
import type { CanvasDocument } from "../canvas/document";
import {
  boundsForDrawingItems,
  visibleDrawingItems,
} from "../canvas/drawingGeometry";
import type { DrawingBounds } from "../canvas/drawingGeometry";

export type DrawingImageFormat = "jpeg" | "png" | "svg";

const MAX_EXPORT_EDGE = 2048;

type AndroidDownloadsModule = {
  saveToDownloads: (
    sourceUri: string,
    filename: string,
    mimeType: string,
  ) => Promise<string>;
};

const androidDownloads = NativeModules.AndroidDownloads as
  | AndroidDownloadsModule
  | undefined;

const safeFileBase = (title: string) => {
  const safeTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safeTitle || "drawing";
};

export const drawingImageFilename = (
  title: string,
  format: DrawingImageFormat,
) => `${safeFileBase(title)}.${format}`;

const fallbackBounds: DrawingBounds = {
  minX: 0,
  minY: 0,
  maxX: 1024,
  maxY: 1024,
};

const getExportBounds = (document: CanvasDocument) =>
  boundsForDrawingItems(visibleDrawingItems(document)) ?? fallbackBounds;

export const drawingExportDimensions = (bounds: DrawingBounds) => {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const scale = MAX_EXPORT_EDGE / Math.max(width, height);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const renderDrawingSvg = (
  document: CanvasDocument,
  options: { backgroundColor?: string } = {},
) => {
  const bounds = getExportBounds(document);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const items = visibleDrawingItems(document);
  const background = options.backgroundColor
    ? "<rect x=\"" +
      bounds.minX +
      "\" y=\"" +
      bounds.minY +
      "\" width=\"" +
      width +
      "\" height=\"" +
      height +
      "\" fill=\"" +
      escapeXml(options.backgroundColor) +
      "\"/>"
    : "";
  const content = items
    .map((item) => {
      if (item.type === "path") {
        return `<path d="${escapeXml(item.data)}" fill="none" stroke="${escapeXml(item.color)}" stroke-width="${item.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }

      if (!item.widthPx || !item.heightPx) return "";
      return `<image href="${escapeXml(item.uri)}" x="${item.x ?? 0}" y="${item.y ?? 0}" width="${item.widthPx}" height="${item.heightPx}" preserveAspectRatio="xMidYMid meet"/>`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}">`,
    background,
    content,
    "</svg>",
  ].join("");
};

const rasterizeSvgOnWeb = async (
  svg: string,
  format: Exclude<DrawingImageFormat, "svg">,
  backgroundColor: string,
): Promise<Blob> => {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();

    const bounds = (() => {
      const match = svg.match(/viewBox="[^"]+ ([\d.]+) ([\d.]+)"/);
      return match
        ? { width: Number(match[1]), height: Number(match[2]) }
        : { width: 1024, height: 1024 };
    })();
    const dimensions = drawingExportDimensions({
      minX: 0,
      minY: 0,
      maxX: bounds.width,
      maxY: bounds.height,
    });
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image export is not available in this browser.");

    if (format === "jpeg") {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Could not encode the drawing image.")),
        format === "jpeg" ? "image/jpeg" : "image/png",
        format === "jpeg" ? 0.92 : undefined,
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const downloadBlobOnWeb = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const createWebDrawingBlob = async (
  document: CanvasDocument,
  format: DrawingImageFormat,
  backgroundColor: string,
) => {
  if (format === "svg") {
    return new Blob([renderDrawingSvg(document)], {
      type: "image/svg+xml;charset=utf-8",
    });
  }

  const svg = renderDrawingSvg(document, {
    backgroundColor: format === "jpeg" ? backgroundColor : undefined,
  });
  return rasterizeSvgOnWeb(svg, format, backgroundColor);
};

export const downloadDrawingOnWeb = async (
  document: CanvasDocument,
  format: DrawingImageFormat,
  backgroundColor = "#ffffff",
) => {
  const filename = drawingImageFilename(document.metadata.title, format);
  const blob = await createWebDrawingBlob(document, format, backgroundColor);
  downloadBlobOnWeb(blob, filename);
  return filename;
};

export const shareDrawingPngOnWeb = async (document: CanvasDocument) => {
  const filename = drawingImageFilename(document.metadata.title, "png");
  const blob = await createWebDrawingBlob(document, "png", "#ffffff");
  const file = new File([blob], filename, { type: "image/png" });
  const shareNavigator = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  const shareData: ShareData = {
    files: [file],
    title: document.metadata.title,
  };

  if (
    typeof navigator.share === "function" &&
    shareNavigator.canShare?.(shareData)
  ) {
    await navigator.share(shareData);
    return { filename, method: "web-share" as const };
  }

  downloadBlobOnWeb(blob, filename);
  return { filename, method: "download-fallback" as const };
};

export const encodeDrawingRaster = async (
  pngBase64: string,
  format: Exclude<DrawingImageFormat, "svg">,
) => {
  if (format === "png") return pngBase64;

  const context = ImageManipulatorModule.manipulate(
    `data:image/png;base64,${pngBase64}`,
  );
  try {
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({
        base64: true,
        compress: 0.92,
        format: SaveFormat.JPEG,
      });
      if (!result.base64) {
        throw new Error("Could not encode the drawing as JPEG.");
      }
      return result.base64;
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
};

const mimeTypeForFormat = (format: DrawingImageFormat) => {
  if (format === "svg") return "image/svg+xml";
  return format === "jpeg" ? "image/jpeg" : "image/png";
};

const encodingForFormat = (format: DrawingImageFormat) =>
  format === "svg"
    ? FileSystem.EncodingType.UTF8
    : FileSystem.EncodingType.Base64;

const writeNativeFile = async (
  uri: string,
  format: DrawingImageFormat,
  contents: string,
) => {
  await FileSystem.writeAsStringAsync(uri, contents, {
    encoding: encodingForFormat(format),
  });
};

const saveToAndroidDownloads = async (
  filename: string,
  format: DrawingImageFormat,
  contents: string,
  permissionDeniedMessage: string,
) => {
  if (Number(Platform.Version) < 29) {
    const permission = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    );
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error(permissionDeniedMessage);
    }
  }

  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error("A temporary export folder is unavailable.");

  const sourceUri = `${cacheDirectory}${Date.now()}-${filename}`;
  await writeNativeFile(sourceUri, format, contents);

  try {
    if (!androidDownloads) {
      throw new Error("Android Downloads are unavailable.");
    }
    await androidDownloads.saveToDownloads(
      sourceUri,
      filename,
      mimeTypeForFormat(format),
    );
  } finally {
    await FileSystem.deleteAsync(sourceUri, { idempotent: true });
  }
};

export const saveDrawingImageOnNative = async (
  document: CanvasDocument,
  format: DrawingImageFormat,
  contents: string,
  permissionDeniedMessage = "Storage permission is required to save to Downloads.",
) => {
  const filename = drawingImageFilename(document.metadata.title, format);

  if (Platform.OS === "android") {
    await saveToAndroidDownloads(
      filename,
      format,
      contents,
      permissionDeniedMessage,
    );
    return { filename, cancelled: false };
  }

  const directory = FileSystem.documentDirectory;
  if (!directory) throw new Error("A local export folder is unavailable.");
  const uri = `${directory}${Date.now()}-${filename}`;
  await writeNativeFile(uri, format, contents);
  await Sharing.shareAsync(uri, {
    dialogTitle: filename,
    mimeType: mimeTypeForFormat(format),
    UTI: format === "svg" ? "public.svg-image" : format === "jpeg" ? "public.jpeg" : "public.png",
  });

  return { filename, cancelled: false };
};

export const shareDrawingPngOnNative = async (
  title: string,
  pngBase64: string,
  shareTitle: string,
) => {
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("A temporary export folder is unavailable.");

  const filename = `${Date.now()}-${drawingImageFilename(title, "png")}`;
  const uri = `${directory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, pngBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await Sharing.shareAsync(uri, {
    dialogTitle: shareTitle,
    mimeType: "image/png",
    UTI: "public.png",
  });

  return { filename: drawingImageFilename(title, "png"), method: "native-share" as const };
};

export const getDrawingSvgBounds = (document: CanvasDocument) =>
  getExportBounds(document);
