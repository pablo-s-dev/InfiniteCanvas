import { CanvasDocument, CanvasDrawingData } from "./document";

export type CanvasPreferences = {
  pencilDrawsFingerPans: boolean;
  scribbleEraseEnabled: boolean;
  scribbleEraseSensitivity: number;
};

export type CanvasHostMessage =
  | {
      type: "INIT";
      initData: CanvasDrawingData | CanvasDocument;
    }
  | {
      type: "CONFIG";
      config: Partial<CanvasPreferences>;
    }
  | {
      type: "OPEN_DOCUMENT";
      documentId: string;
    };

export type CanvasClientMessage =
  | {
      type: "UPDATES";
      updatedData: CanvasDrawingData;
    }
  | {
      type: "READY";
      protocolVersion: 1;
    }
  | {
      type: "DOCUMENT_SAVED";
      document: CanvasDocument;
    };

export const CANVAS_EMBED_PROTOCOL_VERSION = 1;

export const defaultCanvasPreferences: CanvasPreferences = {
  pencilDrawsFingerPans: false,
  scribbleEraseEnabled: true,
  scribbleEraseSensitivity: 1,
};

export const isCanvasHostMessage = (
  message: unknown,
): message is CanvasHostMessage => {
  const candidate = message as Partial<CanvasHostMessage>;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.type === "string" &&
    ["INIT", "CONFIG", "OPEN_DOCUMENT"].includes(candidate.type)
  );
};

