import type { DrawingItem, VisibleDrawingItem } from "./canvasTypes";
import type { CanvasPathItem } from "./document";
import { visibleDrawingItemsFromHistory } from "./drawingGeometry";
export const createCanvasItemId = (prefix = "item") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const getPanOffsetDelta = (screenDelta: number, zoom: number) => {
    const safeZoom = Math.max(zoom, 0.1);
    return screenDelta / safeZoom;
};
export const getVisibleCanvasItems = (items: DrawingItem[]): VisibleDrawingItem[] => {
    return visibleDrawingItemsFromHistory(items);
};
export const mapCanvasItemPaths = (item: DrawingItem, mapPath: (path: CanvasPathItem) => CanvasPathItem): DrawingItem => {
    if (item.type === "path")
        return mapPath(item);
    if (item.type !== "erase" || !item.pointEraseReplacements)
        return item;
    return {
        ...item,
        pointEraseReplacements: item.pointEraseReplacements.map((replacement) => ({
            ...replacement,
            items: replacement.items.map(mapPath),
        })),
    };
};
