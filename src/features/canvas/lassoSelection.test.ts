import { describe, expect, it } from "vitest";
import { buildShapePath, buildSmoothedPath } from "./pathGeometry";
import { buildLassoPath, canvasToViewport, selectPathsInPolygon, viewportToCanvas, type SelectionPoint } from "./lassoSelection";
import type { CanvasPathItem } from "./document";

const centers: SelectionPoint[] = [[120, 100], [280, 100], [120, 240], [280, 240], [120, 380], [280, 380]];
const dice: CanvasPathItem[] = centers.map(([x, y], index) => ({
  id: `pip-${index + 1}`, type: "path", color: "#fff", width: 2,
  data: buildShapePath([x - 14, y - 14], [x + 14, y + 14], "ellipse"),
}));
const loop = ([x, y]: SelectionPoint, irregular = false): SelectionPoint[] => Array.from({ length: 96 }, (_, index) => {
  const angle = index / 95 * Math.PI * 2;
  const radius = irregular ? 38 + 8 * Math.sin(angle * 7) + 4 * Math.cos(angle * 11) : 38;
  return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
});

it("renders the actual hit polygon, including sharp turns and the closing edge", () => {
  const points: SelectionPoint[] = [[12, 10], [43, 19], [21, 13], [40, 35], [8, 30]];
  expect(buildLassoPath(points)).toBe("M 12 10 L 43 19 L 21 13 L 40 35 L 8 30 Z");
  expect(buildLassoPath([])).toBe("");
});

it("inverts the rendered SVG translation and scaling in the correct order", () => {
  expect(viewportToCanvas([340, 180], [100, 60], 2)).toEqual([120, 60]);
  expect(canvasToViewport([120, 60], [100, 60], 2)).toEqual([340, 180]);
});

describe.each([0.1, 0.25, 0.5, 1, 1.12, 2, 4, 8])("lasso at %sx zoom", (scale) => {
  it.each([[0, 0], [-743, 219], [1381, -907]])("selects each of six pips after pan (%s, %s)", (x, y) => {
    const translation: SelectionPoint = [x, y];
    for (let target = 0; target < dice.length; target++) {
      for (const irregular of [false, true]) {
        const polygon = loop(centers[target], irregular).map(point => viewportToCanvas(canvasToViewport(point, translation, scale), translation, scale));
        expect(selectPathsInPolygon(dice, polygon, scale)).toEqual([target]);
        expect(selectPathsInPolygon(dice, [...polygon].reverse(), scale)).toEqual([target]);
      }
    }
  });

  it("closes an unfinished loop on release rather than rejecting it at higher zoom", () => {
    // Same drawing-space contour: the endpoint gap exceeds 18 screen pixels as zoom increases.
    const polygon: SelectionPoint[] = [[80, 60], [160, 60], [160, 140], [80, 140]];
    expect(selectPathsInPolygon(dice, polygon, scale)).toEqual([0]);
  });

  it("selects both lobes of a self-intersecting contour with zero signed area", () => {
    const bowTie: SelectionPoint[] = [[60, 30], [340, 450], [60, 450], [340, 30], [60, 30]];
    expect(selectPathsInPolygon(dice, bowTie, scale)).toEqual([0, 1, 4, 5]);
  });

  it("rejects taps and collinear gestures", () => {
    for (const points of [[], [[120, 100]], [[80, 100], [120, 100], [160, 100], [80, 100]]] as SelectionPoint[][]) {
      expect(selectPathsInPolygon(dice, points, scale)).toEqual([]);
    }
  });

  it("keeps rectangle selection and curved strokes working", () => {
    const curved: CanvasPathItem = { ...dice[0], data: buildSmoothedPath([[105, 100], [120, 80], [135, 100], [120, 120], [105, 100]]) };
    expect(selectPathsInPolygon([curved, ...dice.slice(1)], [[75, 55], [325, 55], [325, 145], [75, 145]], scale)).toEqual([0, 1]);
  });

  it("honors concavity rather than selecting everything in the bounding box", () => {
    const snake: SelectionPoint[] = [[65, 50], [335, 50], [335, 150], [175, 150], [175, 330], [335, 330], [335, 430], [65, 430], [65, 50]];
    expect(selectPathsInPolygon(dice, snake, scale)).toEqual([0, 1, 2, 4, 5]);
  });
});
