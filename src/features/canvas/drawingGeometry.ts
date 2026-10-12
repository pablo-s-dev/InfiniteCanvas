import type { CanvasDocument, CanvasImageItem, CanvasPathItem } from "./document";

export type DrawingRenderItem = CanvasPathItem | CanvasImageItem;

export type DrawingBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type Point = [number, number];

export const visibleDrawingItemsFromHistory = (
  items: CanvasDocument["items"],
  historyCursor = items.length - 1,
): DrawingRenderItem[] => {
  const visible: DrawingRenderItem[] = [];

  items.slice(0, historyCursor + 1).forEach((item) => {
    if (item.type !== "erase") {
      visible.push(item);
      return;
    }

    item.pointEraseReplacements?.forEach((replacement) => {
      const targetIndex = visible.findIndex(
        (visibleItem) =>
          visibleItem.type === "path" &&
          visibleItem.id === replacement.targetItemId,
      );
      if (targetIndex >= 0) {
        visible.splice(targetIndex, 1, ...replacement.items);
      }
    });

    if (item.erasedItemIds.length > 0) {
      const erasedIds = new Set(item.erasedItemIds);
      for (let index = visible.length - 1; index >= 0; index -= 1) {
        if (erasedIds.has(visible[index].id)) visible.splice(index, 1);
      }
    }
  });

  return visible;
};

const pointsFromPath = (pathData: string): Point[] => {
  const tokens = pathData.match(/[MLQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const points: Point[] = [];
  let index = 0;
  let command = "";
  let current: Point = [0, 0];
  let subpathStart: Point = [0, 0];

  const readNumber = () => Number(tokens[index++]);
  const addPoint = (point: Point) => {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
    points.push(point);
    current = point;
  };

  while (index < tokens.length) {
    const token = tokens[index++];
    if (/^[MLQAZ]$/i.test(token)) {
      command = token.toUpperCase();
      if (command === "Z") {
        addPoint(subpathStart);
        continue;
      }
    } else {
      index -= 1;
    }

    if (command === "M" || command === "L") {
      if (index + 1 >= tokens.length) break;
      const point: Point = [readNumber(), readNumber()];
      addPoint(point);
      if (command === "M") {
        subpathStart = point;
        command = "L";
      }
      continue;
    }

    if (command === "Q") {
      if (index + 3 >= tokens.length) break;
      const control: Point = [readNumber(), readNumber()];
      const end: Point = [readNumber(), readNumber()];
      points.push(control);
      addPoint(end);
      continue;
    }

    if (command === "A") {
      if (index + 6 >= tokens.length) break;
      const radiusX = Math.abs(readNumber());
      const radiusY = Math.abs(readNumber());
      readNumber(); // rotation
      readNumber(); // large-arc flag
      readNumber(); // sweep flag
      const end: Point = [readNumber(), readNumber()];
      const centerX = (current[0] + end[0]) / 2;
      const centerY = (current[1] + end[1]) / 2;
      points.push(
        [centerX - radiusX, centerY - radiusY],
        [centerX + radiusX, centerY + radiusY],
      );
      addPoint(end);
    }
  }

  return points;
};

export const visibleDrawingItems = (
  drawing: CanvasDocument,
): DrawingRenderItem[] =>
  visibleDrawingItemsFromHistory(drawing.items, drawing.historyCursor);

export const boundsForDrawingItems = (
  items: DrawingRenderItem[],
): DrawingBounds | null => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasBounds = false;
  let strokePadding = 0;

  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    hasBounds = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  items.forEach((item) => {
    if (item.type === "path") {
      strokePadding = Math.max(strokePadding, item.width / 2);
      pointsFromPath(item.data).forEach(([x, y]) => include(x, y));
      return;
    }

    const x = item.x ?? 0;
    const y = item.y ?? 0;
    const width = item.widthPx ?? 0;
    const height = item.heightPx ?? 0;
    include(x, y);
    include(x + width, y + height);
  });

  if (!hasBounds) return null;
  const padding = Math.max(4, strokePadding + 4);
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
};
