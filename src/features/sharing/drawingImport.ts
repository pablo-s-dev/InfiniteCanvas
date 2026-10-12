import { Platform } from "react-native";
import type { CanvasDocument } from "../canvas/document";
import { isCanvasDocument } from "../canvas/document";

export type DrawingImportErrorCode =
  | "read_failed"
  | "invalid_json"
  | "unsupported_file"
  | "empty_bundle"
  | "native_picker_unavailable";

export class DrawingImportError extends Error {
  constructor(
    readonly code: DrawingImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DrawingImportError";
  }
}

const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(
        new DrawingImportError("read_failed", "Could not read drawing file."),
      );
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });

export const parseDrawingImport = (value: unknown): CanvasDocument[] => {
  if (isCanvasDocument(value)) {
    return [value];
  }

  const candidate = value as {
    type?: unknown;
    drawings?: unknown;
  };

  if (
    candidate?.type === "infinitecanvas.bundle" &&
    Array.isArray(candidate.drawings)
  ) {
    const drawings = candidate.drawings.filter((drawing) =>
      isCanvasDocument(drawing),
    );
    if (drawings.length > 0) return drawings;
    throw new DrawingImportError(
      "empty_bundle",
      "This InfiniteCanvas bundle does not contain valid drawings.",
    );
  }

  throw new DrawingImportError(
    "unsupported_file",
    "This file is not an InfiniteCanvas drawing.",
  );
};

export const pickDrawingJson = async (): Promise<CanvasDocument[] | null> => {
  if (
    Platform.OS !== "web" ||
    typeof document === "undefined" ||
    typeof FileReader === "undefined"
  ) {
    throw new DrawingImportError(
      "native_picker_unavailable",
      "File import is not available on this platform yet.",
    );
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.infinitecanvas.json,application/json";
    input.style.display = "none";

    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        document.body.removeChild(input);
        if (!file) {
          resolve(null);
          return;
        }

        const content = await readFileAsText(file);
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new DrawingImportError(
            "invalid_json",
            "This file is not valid JSON.",
          );
        }
        resolve(parseDrawingImport(parsed));
      } catch (error) {
        reject(error);
      }
    };

    input.oncancel = () => {
      document.body.removeChild(input);
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
};
