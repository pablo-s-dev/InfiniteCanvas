import type { AppIconName } from "../../shared/icons/iconData";
import type { CanvasItem, CanvasPathItem, CanvasImageItem, CanvasDrawingData } from "./document";
export type CanvasIconName = AppIconName;
export type DrawingItem = CanvasItem;
export type VisibleDrawingItem = CanvasPathItem | CanvasImageItem;
export type ShapeTool = "freehand" | "line" | "rectangle" | "ellipse";
export type CanvasClipboardSelection = {
    items: CanvasPathItem[];
};
export type CanvasToolPreferences = {
    smoothingEnabled: boolean;
    shapeTool: ShapeTool;
};
export const isShapeTool = (value: unknown): value is ShapeTool => value === "freehand" ||
    value === "line" ||
    value === "rectangle" ||
    value === "ellipse";
export type CanvasPreferences = {
    pencilDrawsFingerPans: boolean;
    scribbleEraseEnabled: boolean;
    scribbleEraseSensitivity: number;
};
export type WebPointerMode = "draw" | "pan" | "lasso" | "rectangle" | "pointer" | null;
export type SelectionMode = "lasso" | "rectangle" | null;
export type EraserModeType = "point" | "stroke";
export type CanvasToolMenuId = "stroke" | "selection" | "eraser" | "pointer" | "canvas" | null;
export type SelectionBounds = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};
export type SelectionResizeState = {
    anchor: [
        number,
        number
    ];
    baseItems: DrawingItem[];
    bounds: SelectionBounds;
    selectedPathIds: Set<string>;
};
export type CanvasContextMenuState = {
    screenX: number;
    screenY: number;
    canvasPoint: [
        number,
        number
    ];
} | null;
export type CanvasEditorProps = {
    localDrawingId?: string;
    onCanvasDataChange?: (data: CanvasDrawingData) => void;
    canvasBackgroundColor?: string;
};
