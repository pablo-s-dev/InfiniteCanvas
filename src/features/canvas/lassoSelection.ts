import type { CanvasPathItem } from "./document";
import { extractPathPoints } from "./pathGeometry";
import { pathIntersectsPolygon } from "./selectionGeometry";

export type SelectionPoint = [number, number];

// Keep this inverse paired with the SVG viewport's translate(...) scale(...).
export function viewportToCanvas(point: SelectionPoint, translation: SelectionPoint, scale: number): SelectionPoint {
  return [(point[0] - translation[0]) / scale, (point[1] - translation[1]) / scale];
}

export function canvasToViewport(point: SelectionPoint, translation: SelectionPoint, scale: number): SelectionPoint {
  return [translation[0] + point[0] * scale, translation[1] + point[1] * scale];
}

// The preview and hit test share these exact edges, including the closing edge.
export function buildLassoPath(points: SelectionPoint[]): string {
  if (!points.length) return "";
  return points.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ") + (points.length >= 3 ? " Z" : "");
}

export function selectPathsInPolygon(
  items: CanvasPathItem[],
  polygon: SelectionPoint[],
  scale: number,
): number[] {
  const safeScale = Math.max(scale, 0.1);
  if (polygon.length < 3) return [];
  const first = polygon[0];
  // A signed shoelace sum cancels the lobes of figure-eights. Use unsigned
  // triangles only to reject degenerate gestures; containment uses even-odd.
  // Subtract a local origin to avoid cancellation after panning far from zero.
  const area = polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + Math.abs((point[0] - first[0]) * (next[1] - first[1]) - (next[0] - first[0]) * (point[1] - first[1]));
  }, 0) / 2;
  if (area < 16 / (safeScale * safeScale)) return [];
  return items.flatMap((item, index) => pathIntersectsPolygon(
    extractPathPoints(item.data), polygon, (item.width / 2 + 2) / safeScale,
  ) ? [index] : []);
}
