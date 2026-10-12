import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TouchableHighlight,
  StatusBar,
  Text,
  Pressable,
  Dimensions,
  GestureResponderEvent,
  StyleSheet,
  Modal,
  TextInput,
  NativeTouchEvent,
  Platform,
  LayoutChangeEvent,
} from "react-native";
import MCIcon from "@expo/vector-icons/MaterialCommunityIcons";

import Svg, { Circle, G, Path, Rect, Image as SvgImage } from "react-native-svg";

import { Image } from "expo-image";
import ColorPicker, {
  Panel1,
  Swatches,
  PreviewText,
  HueCircular,
} from "reanimated-color-picker";
import type { ColorFormatsObject } from "reanimated-color-picker";

import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  SharedValue,
  useAnimatedReaction,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Gesture, PanGestureHandler } from "react-native-gesture-handler";
import Icon from "@expo/vector-icons/MaterialIcons";
import { GestureDetector } from "react-native-gesture-handler";

import { BlurView } from "expo-blur";
// import { Slider } from 'expo';
import { Slider } from "@miblanchard/react-native-slider";
// import Slider from "@react-native-community/slider";
import * as Clipboard from "expo-clipboard";
import { ViewStyle } from "react-native";
import { drawingRepository } from "./src/features/documents/drawingRepository";
import {
  CANVAS_DOCUMENT_VERSION,
  type CanvasDrawingData,
  type CanvasEraseItem,
  type CanvasImageItem,
  type CanvasItem,
  type CanvasPathItem,
  type CanvasViewport,
  isCanvasDrawingData,
} from "./src/features/canvas/document";
import {
  CANVAS_EMBED_PROTOCOL_VERSION,
  isCanvasHostMessage,
  type CanvasClientMessage,
} from "./src/features/canvas/embedProtocol";
import { canvasToolTheme } from "./src/shared/theme/appPalette";
import { jsonStorage } from "./src/shared/storage/jsonStorage";
import { CopyPlusIcon } from "./src/shared/icons/CopyPlusIcon";

type MaterialCommunityIconName = React.ComponentProps<typeof MCIcon>["name"];
type DrawingItem = CanvasItem;
type VisibleDrawingItem = CanvasPathItem | CanvasImageItem;

type ShapeTool = "freehand" | "line" | "rectangle" | "ellipse";

type CanvasClipboardSelection = {
  items: CanvasPathItem[];
};

type CanvasToolPreferences = {
  smoothingEnabled: boolean;
  shapeTool: ShapeTool;
};

const isShapeTool = (value: unknown): value is ShapeTool =>
  value === "freehand" ||
  value === "line" ||
  value === "rectangle" ||
  value === "ellipse";

type CanvasPreferences = {
  pencilDrawsFingerPans: boolean;
  scribbleEraseEnabled: boolean;
  scribbleEraseSensitivity: number;
};

type WebPointerMode = "draw" | "pan" | "lasso" | "rectangle" | "pointer" | null;
type SelectionMode = "lasso" | "rectangle" | null;
type EraserModeType = "point" | "stroke";
type CanvasToolMenuId = "stroke" | "selection" | "eraser" | "pointer" | "canvas" | null;

type SelectionBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type SelectionResizeState = {
  anchor: [number, number];
  baseItems: DrawingItem[];
  bounds: SelectionBounds;
  selectedPathIds: Set<string>;
};

type CanvasContextMenuState = {
  screenX: number;
  screenY: number;
  canvasPoint: [number, number];
} | null;

type InfiniteCanvasProps = {
  localDrawingId?: string;
  onCanvasDataChange?: (data: CanvasDrawingData) => void;
};

const PASTEL_SWATCHES = [
  "#f9a8d4",
  "#fca5a5",
  "#fdba74",
  "#fde68a",
  "#bbf7d0",
  "#99f6e4",
  "#bfdbfe",
  "#c4b5fd",
];

const createCanvasItemId = (prefix = "item") =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const getVisibleCanvasItems = (items: DrawingItem[]): VisibleDrawingItem[] => {
  const erasedItemIds = items.reduce<Set<string>>((ids, item) => {
    if (item.type === "erase") {
      item.erasedItemIds.forEach((itemId) => ids.add(itemId));
    }
    return ids;
  }, new Set<string>());

  return items.filter(
    (item): item is VisibleDrawingItem =>
      item.type !== "erase" && !erasedItemIds.has(item.id),
  );
};

const InfiniteCanvas = ({
  localDrawingId,
  onCanvasDataChange,
}: InfiniteCanvasProps = {}) => {
  const CANVAS_TOOL_PREFS_KEY = "infinite-canvas:canvas-tool-preferences";
  const canvasRef = useRef<View>(null);
  const svgRef = useRef<Svg>(null);
  const widthRef = useRef<number>(0);
  const heightRef = useRef<number>(0);

  const [canvasItems, setItems] = useState<DrawingItem[]>([]);
  const [curPath, setCurPath] = useState<string>("");
  const currentStrokePointsRef = useRef<[number, number][]>([]);
  const shapeStartRef = useRef<[number, number] | null>(null);
  const lassoPointsRef = useRef<[number, number][]>([]);
  const clipboardSelectionRef = useRef<CanvasClipboardSelection | null>(null);

  const [panningOffset, setPanningOffset] = useState<number[]>([0, 0]);
  const [focusOffset, setFocusOffset] = useState<number[]>([0, 0]);
  const [focusPos, setFocusPos] = useState<number[]>([0, 0]);
  const [curIdx, setCurIdx] = useState<number>(-1);

  const [scale, setScale] = useState<number>(1);

  const [fingerDist, setFingerDist] = useState<number>(1);

  const prevFingersPos = useRef<number[][]>([]);
  const prevTwoFingerDist = useRef<number>(0);

  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [smoothingEnabled, setSmoothingEnabled] = useState<boolean>(true);
  const [shapeTool, setShapeTool] = useState<ShapeTool>("freehand");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const lassoMode = selectionMode === "lasso";
  const rectangleSelectionMode = selectionMode === "rectangle";
  const setLassoMode = (active: boolean) =>
    setSelectionMode((current) => (active ? "lasso" : current === "lasso" ? null : current));
  const setRectangleSelectionMode = (active: boolean) =>
    setSelectionMode((current) =>
      active ? "rectangle" : current === "rectangle" ? null : current,
    );
  const [lassoPath, setLassoPath] = useState<string>("");
  const [selectedPathIndexes, setSelectedPathIndexes] = useState<number[]>([]);
  const rectangleSelectionStartRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    jsonStorage
      .get<Partial<CanvasToolPreferences>>(CANVAS_TOOL_PREFS_KEY)
      .then((preferences) => {
        if (!preferences) return;
        if (typeof preferences.smoothingEnabled === "boolean") {
          setSmoothingEnabled(preferences.smoothingEnabled);
        }
        if (isShapeTool(preferences.shapeTool)) {
          setShapeTool(preferences.shapeTool);
        }
      });
  }, []);

  useEffect(() => {
    jsonStorage.set<CanvasToolPreferences>(CANVAS_TOOL_PREFS_KEY, {
      smoothingEnabled,
      shapeTool,
    });
  }, [smoothingEnabled, shapeTool]);

  // const containerDimensions = useRef({ width: 0, height: 0 });
  const center = useRef<number[]>([0, 0]);

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    // alert("lay")
    const { width, height } = event.nativeEvent.layout;

    widthRef.current = width;
    heightRef.current = height;

    // console.log("new center");
    center.current = [width / 2, height / 2];
    if (
      pseudoPointerPosRef.current[0] === 0 &&
      pseudoPointerPosRef.current[1] === 0
    ) {
      setPointerPos(screenPointToCanvasPoint(width / 2, height / 2, scale));
    }
    // setFocusOffset(center.current);

    // console.log(center.current);
  };

  const [onlyPanningMode, setPanningGesture] = useState<boolean>(false);
  const [shouldBlockDrawing, setShouldBlockDrawing] = useState<boolean>(false);
  const [canvasPreferences, setCanvasPreferences] = useState<CanvasPreferences>(
    {
      pencilDrawsFingerPans: false,
      scribbleEraseEnabled: true,
      scribbleEraseSensitivity: 1,
    },
  );
  const webPointerModeRef = useRef<WebPointerMode>(null);
  const webPointerLastPositionRef = useRef<[number, number] | null>(null);
  const selectionDragLastPositionRef = useRef<[number, number] | null>(null);
  const selectionDragSelectedIdsRef = useRef<Set<string>>(new Set());
  const selectionDragPendingDeltaRef = useRef<[number, number]>([0, 0]);
  const selectionDragFrameRef = useRef<number | null>(null);
  const selectionResizeLastPositionRef = useRef<[number, number] | null>(null);
  const selectionResizeStateRef = useRef<SelectionResizeState | null>(null);
  const [isSelectionDragging, setIsSelectionDragging] = useState(false);
  const [isSelectionResizing, setIsSelectionResizing] = useState(false);
  const [canvasContextMenu, setCanvasContextMenu] =
    useState<CanvasContextMenuState>(null);
  const [clearCanvasDialogOpen, setClearCanvasDialogOpen] = useState(false);

  const [showColorPickerModal, setColorPickerModal] = useState(false);

  const customSwatches = PASTEL_SWATCHES;

  const [strokeColorPreview, setStrokeColorPreview] = useState(customSwatches[0]);
  const strokeColor = useSharedValue<string>(customSwatches[0]);

  const [pseudoPointerMode, setVirtualPointerMode] = useState<boolean>(false);
  const [pseudoLeftClick, setPseudoLeftClick] = useState<boolean>(true);
  const [pointerHintVisible, setPointerHintVisible] = useState(false);

  const [pseudoPointerPos, setPointerPosState] = useState<[number, number]>([0, 0]);
  const pseudoPointerPosRef = useRef<[number, number]>([0, 0]);
  const setPointerPos = (position: [number, number]) => {
    pseudoPointerPosRef.current = position;
    setPointerPosState(position);
  };
  const [cursorCoordinates, setCursorCoordinates] = useState<[number, number]>([
    0, 0,
  ]);

  const buttonsContainerColor = canvasToolTheme.bar;
  const onColorSelect = (color: ColorFormatsObject) => {
    strokeColor.value = color.hex;
    setStrokeColorPreview(color.hex);
  };
  const setStrokeColor = (color: string) => {
    strokeColor.value = color;
    setStrokeColorPreview(color);
  };

  const [eraserMode, setEraserMode] = useState(false);
  const [eraserModeType, setEraserModeType] = useState<EraserModeType>("stroke");
  const [eraserSize, setEraserSize] = useState(24);
  const [eraserPreviewPath, setEraserPreviewPath] = useState("");
  const [pendingEraseItemIds, setPendingEraseItemIds] = useState<string[]>([]);

  const setEraserActive = (active: boolean) => {
    setEraserMode((prev) => {
      if (prev === active) return prev;

      if (active) {
        currentStrokePointsRef.current = [];
        setCurPath("");
        shapeStartRef.current = null;
      }

      return active;
    });
  };

  const toggleEraser = () => setEraserActive(!eraserMode);

  useEffect(() => {
    if (!pointerHintVisible) return;

    const timeout = setTimeout(() => setPointerHintVisible(false), 3200);
    return () => clearTimeout(timeout);
  }, [pointerHintVisible]);

  const getCanvasViewportTransform = (
    currentScale = scale,
  ): [number, number] => {
    const origin = [
      center.current[0] - panningOffset[0] + focusPos[0],
      center.current[1] - panningOffset[1] + focusPos[1],
    ];
    const recenterScalingX = -origin[0] * (currentScale - 1);
    const recenterScalingY = -origin[1] * (currentScale - 1);

    return [
      recenterScalingX + panningOffset[0] + focusOffset[0],
      recenterScalingY + panningOffset[1] + focusOffset[1],
    ];
  };

  const screenPointToCanvasPoint = (
    x: number,
    y: number,
    currentScale: number,
  ): [number, number] => {
    const [translateX, translateY] = getCanvasViewportTransform(currentScale);

    // x = (x - panningOffset[0] - focusOffset[0] - recenterScalingX) / scale;
    // y = (y - panningOffset[1] - focusOffset[1] - recenterScalingY) / scale;

    // We first need to calculate the distance from the current origin.
    // Then, we divide it by the scale, to appear normal on the current scale.
    // It's like we are undoing the scaling, the current scale is like our multiplicative origin.
    // We still need to subtract the panningOffset. Previously we used it to undo the scaling error.
    return [
      (x - translateX) / currentScale,
      (y - translateY) / currentScale,
    ];
  };

  const canvasPointToScreenPoint = (
    point: [number, number],
    currentScale = scale,
  ): [number, number] => {
    const [translateX, translateY] = getCanvasViewportTransform(currentScale);
    return [
      translateX + point[0] * currentScale,
      translateY + point[1] * currentScale,
    ];
  };

  const buildSmoothedPath = (points: [number, number][]) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0][0]} ${points[0][1]} `;

    let path = `M ${points[0][0]} ${points[0][1]} `;
    for (let index = 1; index < points.length - 1; index += 1) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[index + 1];
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      path += `Q ${x1} ${y1} ${midX} ${midY} `;
    }

    const [lastX, lastY] = points[points.length - 1];
    path += `L ${lastX} ${lastY} `;
    return path;
  };

  const buildShapePath = (
    start: [number, number],
    end: [number, number],
    tool: ShapeTool,
  ) => {
    const [x1, y1] = start;
    const [x2, y2] = end;

    if (tool === "line") {
      return `M ${x1} ${y1} L ${x2} ${y2} `;
    }

    if (tool === "rectangle") {
      return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
    }

    if (tool === "ellipse") {
      const centerX = (x1 + x2) / 2;
      const centerY = (y1 + y2) / 2;
      const radiusX = Math.max(Math.abs(x2 - x1) / 2, 0.1);
      const radiusY = Math.max(Math.abs(y2 - y1) / 2, 0.1);
      return `M ${centerX - radiusX} ${centerY} A ${radiusX} ${radiusY} 0 1 0 ${centerX + radiusX} ${centerY} A ${radiusX} ${radiusY} 0 1 0 ${centerX - radiusX} ${centerY} Z`;
    }

    return `M ${x1} ${y1} `;
  };

  const extractPathPoints = (pathData: string): [number, number][] => {
    const matches = pathData.match(/[MLQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    const points: [number, number][] = [];
    let index = 0;
    let command = "";

    const readNumber = () => Number(matches[index++]);

    while (index < matches.length) {
      const token = matches[index++];
      if (/^[MLQAZ]$/i.test(token)) {
        command = token.toUpperCase();
      } else {
        index -= 1;
      }

      if (command === "M" || command === "L") {
        if (index + 1 > matches.length) break;
        points.push([readNumber(), readNumber()]);
        continue;
      }

      if (command === "Q") {
        if (index + 3 > matches.length) break;
        points.push([readNumber(), readNumber()]);
        points.push([readNumber(), readNumber()]);
        continue;
      }

      if (command === "A") {
        if (index + 6 > matches.length) break;
        index += 5;
        points.push([readNumber(), readNumber()]);
        continue;
      }
    }

    return points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  };

  const getBounds = (points: [number, number][]) => {
    if (points.length === 0) return null;

    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };

  const expandBounds = (
    bounds: SelectionBounds | null,
    padding: number,
  ): SelectionBounds | null => {
    if (!bounds) return null;

    return {
      minX: bounds.minX - padding,
      maxX: bounds.maxX + padding,
      minY: bounds.minY - padding,
      maxY: bounds.maxY + padding,
    };
  };

  const getPathItemBounds = (
    item: CanvasPathItem,
    padding = 0,
  ): SelectionBounds | null =>
    expandBounds(getBounds(extractPathPoints(item.data)), padding);

  const boundsIntersect = (
    first: SelectionBounds | null,
    second: SelectionBounds | null,
  ) => {
    if (!first || !second) return false;
    return !(
      first.maxX < second.minX ||
      first.minX > second.maxX ||
      first.maxY < second.minY ||
      first.minY > second.maxY
    );
  };

  const mergeBounds = (
    currentBounds: SelectionBounds | null,
    nextBounds: SelectionBounds | null,
  ): SelectionBounds | null => {
    if (!nextBounds) return currentBounds;
    if (!currentBounds) return nextBounds;

    return {
      minX: Math.min(currentBounds.minX, nextBounds.minX),
      maxX: Math.max(currentBounds.maxX, nextBounds.maxX),
      minY: Math.min(currentBounds.minY, nextBounds.minY),
      maxY: Math.max(currentBounds.maxY, nextBounds.maxY),
    };
  };

  const distanceToSegment = (
    point: [number, number],
    start: [number, number],
    end: [number, number],
  ) => {
    const [px, py] = point;
    const [x1, y1] = start;
    const [x2, y2] = end;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return Math.hypot(px - x1, py - y1);
    }

    const t = Math.max(
      0,
      Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared),
    );
    const projectedX = x1 + t * dx;
    const projectedY = y1 + t * dy;
    return Math.hypot(px - projectedX, py - projectedY);
  };

  const pathPointsIntersectPoint = (
    pathPoints: [number, number][],
    point: [number, number],
    threshold: number,
  ) => {
    if (pathPoints.length === 0) return false;
    if (pathPoints.some((candidate) => Math.hypot(candidate[0] - point[0], candidate[1] - point[1]) <= threshold)) {
      return true;
    }

    for (let index = 1; index < pathPoints.length; index += 1) {
      if (distanceToSegment(point, pathPoints[index - 1], pathPoints[index]) <= threshold) {
        return true;
      }
    }

    return false;
  };

  const pathIntersectsPoint = (
    pathData: string,
    point: [number, number],
    threshold: number,
  ) => pathPointsIntersectPoint(extractPathPoints(pathData), point, threshold);

  const clampScribbleSensitivity = (value: unknown) => {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) return 1;
    return Math.min(1.8, Math.max(0.45, numericValue));
  };

  const erasePathsNearPoint = (point: [number, number]) => {
    erasePathsIntersectingPoints([point], eraserSize);
  };

  const appendEraseHistoryEntry = (erasedItemIds: string[]) => {
    const uniqueErasedItemIds = [...new Set(erasedItemIds)];
    if (uniqueErasedItemIds.length === 0) return false;

    const now = new Date().toISOString();
    const activeItems = canvasItems.slice(0, curIdx + 1);
    const eraseItem: CanvasEraseItem = {
      id: createCanvasItemId("erase"),
      type: "erase",
      erasedItemIds: uniqueErasedItemIds,
      createdAt: now,
      updatedAt: now,
    };

    setItems([...activeItems, eraseItem]);
    setCurIdx(activeItems.length);
    setSelectedPathIndexes([]);
    return true;
  };

  const getEraseTargetIds = (
    points: [number, number][],
    toolScreenSize = eraserSize,
    sensitivity = 1,
    options: { ignorePathData?: string; minHitCount?: number } = {},
  ) => {
    const activeItems = getVisibleCanvasItems(canvasItems.slice(0, curIdx + 1));
    if (activeItems.length === 0 || points.length === 0) return [];

    const erasedItemIds: string[] = [];
    const gestureBounds = getBounds(points);
    if (!gestureBounds) return [];

    const minHitCount = options.minHitCount ?? 1;

    activeItems.forEach((item) => {
      if (item.type !== "path") {
        return;
      }

      if (options.ignorePathData && item.data === options.ignorePathData) {
        return;
      }

      const width = item.width ?? strokeWidth;
      const threshold =
        (Math.max(6, (toolScreenSize + width) / 2) * sensitivity) /
        Math.max(scale, 0.1);
      const pathPoints = extractPathPoints(item.data);
      const itemBounds = expandBounds(getBounds(pathPoints), threshold);

      if (!boundsIntersect(gestureBounds, itemBounds)) {
        return;
      }

      const hitCount = points.reduce(
        (count, point) =>
          count + (pathPointsIntersectPoint(pathPoints, point, threshold) ? 1 : 0),
        0,
      );

      if (hitCount >= minHitCount) {
        erasedItemIds.push(item.id);
      }
    });

    return erasedItemIds;
  };

  const erasePathsIntersectingPoints = (
    points: [number, number][],
    toolScreenSize = eraserSize,
    sensitivity = 1,
    options: { ignorePathData?: string; minHitCount?: number } = {},
  ) => {
    const erasedItemIds = getEraseTargetIds(
      points,
      toolScreenSize,
      sensitivity,
      options,
    );
    return appendEraseHistoryEntry(erasedItemIds);
  };

  const isScribbleEraseGesture = (points: [number, number][]) => {
    if (!canvasPreferences.scribbleEraseEnabled) return false;
    if (points.length < 14) return false;

    const sensitivity = clampScribbleSensitivity(canvasPreferences.scribbleEraseSensitivity);

    const bounds = getBounds(points);
    if (!bounds) return false;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const diagonal = Math.max(Math.hypot(width, height), 1);
    let distance = 0;
    let directionChanges = 0;
    let previousAngle: number | null = null;

    for (let index = 1; index < points.length; index += 1) {
      const [x1, y1] = points[index - 1];
      const [x2, y2] = points[index];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const segmentDistance = Math.hypot(dx, dy);
      if (segmentDistance < 1) continue;

      distance += segmentDistance;
      const angle = Math.atan2(dy, dx);
      if (previousAngle !== null) {
        const delta = Math.abs(Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle)));
        if (delta > 1.25) directionChanges += 1;
      }
      previousAngle = angle;
    }

    return (
      width > 8 / sensitivity &&
      height > 8 / sensitivity &&
      directionChanges >= Math.max(3, Math.round(5 / sensitivity)) &&
      distance / diagonal > 2.6 / sensitivity
    );
  };

  const pointInPolygon = (
    point: [number, number],
    polygon: [number, number][],
  ) => {
    if (polygon.length < 3) return false;

    const [x, y] = point;
    let inside = false;

    for (
      let index = 0, previousIndex = polygon.length - 1;
      index < polygon.length;
      previousIndex = index, index += 1
    ) {
      const [xi, yi] = polygon[index];
      const [xj, yj] = polygon[previousIndex];
      const intersects =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi;

      if (intersects) inside = !inside;
    }

    return inside;
  };

  const translatePathData = (pathData: string, dx: number, dy: number) => {
    const tokens = pathData.match(/[MLQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    const output: string[] = [];
    let index = 0;
    let command = "";

    const readToken = () => tokens[index++];
    const readNumber = () => Number(readToken());
    const pushNumber = (value: number) => output.push(String(value));

    while (index < tokens.length) {
      const token = readToken();
      if (/^[MLQAZ]$/i.test(token)) {
        command = token.toUpperCase();
        output.push(command);
      } else {
        index -= 1;
      }

      if (command === "M" || command === "L") {
        pushNumber(readNumber() + dx);
        pushNumber(readNumber() + dy);
        continue;
      }

      if (command === "Q") {
        pushNumber(readNumber() + dx);
        pushNumber(readNumber() + dy);
        pushNumber(readNumber() + dx);
        pushNumber(readNumber() + dy);
        continue;
      }

      if (command === "A") {
        pushNumber(readNumber());
        pushNumber(readNumber());
        pushNumber(readNumber());
        pushNumber(readNumber());
        pushNumber(readNumber());
        pushNumber(readNumber() + dx);
        pushNumber(readNumber() + dy);
        continue;
      }
    }

    return output.join(" ");
  };

  const scalePathData = (
    pathData: string,
    factor: number,
    origin: [number, number],
  ) => {
    const tokens = pathData.match(/[MLQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    const output: string[] = [];
    let index = 0;
    let command = "";
    const [originX, originY] = origin;

    const scaleX = (value: number) => originX + (value - originX) * factor;
    const scaleY = (value: number) => originY + (value - originY) * factor;
    const readToken = () => tokens[index++];
    const readNumber = () => Number(readToken());
    const pushNumber = (value: number) => output.push(String(value));

    while (index < tokens.length) {
      const token = readToken();
      if (/^[MLQAZ]$/i.test(token)) {
        command = token.toUpperCase();
        output.push(command);
      } else {
        index -= 1;
      }

      if (command === "M" || command === "L") {
        pushNumber(scaleX(readNumber()));
        pushNumber(scaleY(readNumber()));
        continue;
      }

      if (command === "Q") {
        pushNumber(scaleX(readNumber()));
        pushNumber(scaleY(readNumber()));
        pushNumber(scaleX(readNumber()));
        pushNumber(scaleY(readNumber()));
        continue;
      }

      if (command === "A") {
        pushNumber(readNumber() * factor);
        pushNumber(readNumber() * factor);
        pushNumber(readNumber());
        pushNumber(readNumber());
        pushNumber(readNumber());
        pushNumber(scaleX(readNumber()));
        pushNumber(scaleY(readNumber()));
      }
    }

    return output.join(" ");
  };

  const updateLassoPath = (x: number, y: number, scale: number) => {
    const point = screenPointToCanvasPoint(x, y, scale);
    lassoPointsRef.current = [...lassoPointsRef.current, point];
    setLassoPath(buildSmoothedPath(lassoPointsRef.current));
  };

  const updateRectangleSelectionPath = (x: number, y: number, scale: number) => {
    const endPoint = screenPointToCanvasPoint(x, y, scale);
    const startPoint = rectangleSelectionStartRef.current ?? endPoint;
    rectangleSelectionStartRef.current = startPoint;
    const [x1, y1] = startPoint;
    const [x2, y2] = endPoint;
    lassoPointsRef.current = [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ];
    setLassoPath(`M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`);
  };

  const finalizeLassoSelection = () => {
    const polygon = lassoPointsRef.current;
    if (polygon.length < 3) {
      lassoPointsRef.current = [];
      setLassoPath("");
      rectangleSelectionStartRef.current = null;
      setSelectedPathIndexes([]);
      rectangleSelectionStartRef.current = null;
      return;
    }

    const selectedIndexes = svgItems
      .map((item, index) => {
        const points = extractPathPoints(item.data);
        const padding = (item.width ?? strokeWidth) / Math.max(scale, 0.1) / 2;
        const bounds = getPathItemBounds(item, padding);
        if (!bounds) return null;

        const candidates: [number, number][] = [
          [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2],
          [bounds.minX, bounds.minY],
          [bounds.maxX, bounds.minY],
          [bounds.maxX, bounds.maxY],
          [bounds.minX, bounds.maxY],
          ...points,
        ];

        return candidates.some((point) => pointInPolygon(point, polygon))
          ? index
          : null;
      })
      .filter((index): index is number => index !== null);

    setSelectedPathIndexes(selectedIndexes);
    lassoPointsRef.current = [];
    setLassoPath("");
    rectangleSelectionStartRef.current = null;
    rectangleSelectionStartRef.current = null;
  };

  function updatePathAtCanvasPoint(canvasX: number, canvasY: number) {
    if (eraserMode) {
      if (eraserModeType === "point") {
        erasePathsNearPoint([canvasX, canvasY]);
        setEraserPreviewPath("");
        setPendingEraseItemIds([]);
      } else {
        currentStrokePointsRef.current = [
          ...currentStrokePointsRef.current,
          [canvasX, canvasY],
        ];
        setEraserPreviewPath(buildSmoothedPath(currentStrokePointsRef.current));
        setPendingEraseItemIds(
          getEraseTargetIds(currentStrokePointsRef.current, eraserSize, 1, {
            minHitCount: 1,
          }),
        );
      }
      setCurPath("");
      shapeStartRef.current = null;
      return;
    }

    if (shapeTool !== "freehand") {
      if (!shapeStartRef.current) {
        shapeStartRef.current = [canvasX, canvasY];
        setCurPath(`M ${canvasX} ${canvasY} `);
        return;
      }

      setCurPath(buildShapePath(shapeStartRef.current, [canvasX, canvasY], shapeTool));
      return;
    }

    if (currentStrokePointsRef.current.length === 0) {
      currentStrokePointsRef.current = [[canvasX, canvasY]];
      const newPath = `M ${canvasX} ${canvasY} `;
      setCurPath(newPath);
      return;
    }

    currentStrokePointsRef.current = [
      ...currentStrokePointsRef.current,
      [canvasX, canvasY],
    ];

    if (smoothingEnabled) {
      setCurPath(buildSmoothedPath(currentStrokePointsRef.current));
      return;
    }

    setCurPath((prevPath) => `${prevPath} L ${canvasX} ${canvasY} `);
  }

  function updatePath(x: number, y: number, scale: number) {
    const [canvasX, canvasY] = screenPointToCanvasPoint(x, y, scale);
    updatePathAtCanvasPoint(canvasX, canvasY);
  }

  const finalizeStrokeErase = () => {
    if (!eraserMode || eraserModeType !== "stroke") return false;

    const points = currentStrokePointsRef.current;
    const erasedItemIds = getEraseTargetIds(points, eraserSize, 1, {
      minHitCount: 1,
    });
    const didErase = appendEraseHistoryEntry(erasedItemIds);

    setEraserPreviewPath("");
    setPendingEraseItemIds([]);
    currentStrokePointsRef.current = [];
    shapeStartRef.current = null;
    setShouldBlockDrawing(false);

    return didErase;
  };

  const getDeltaPanning = (fingerChange: number[][]): number[] => {
    const x_points = fingerChange.reduce(
      (acc: number[], touchPoint: number[]) => [...acc, touchPoint[0]],
      [],
    );
    const y_points = fingerChange.reduce(
      (acc: number[], touchPoint: number[]) => [...acc, touchPoint[1]],
      [],
    );

    const dx = x_points.reduce((acc, x) => acc + x);
    const dy = y_points.reduce((acc, y) => acc + y);

    return [dx, dy];
  };

  const handleWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();

    const deltaY = e.deltaY;
    const rect = (e.target as Element).getBoundingClientRect();

    // Get mouse position relative to the target element
    const mousePos: [number, number] = [
      e.clientX - rect.left,
      e.clientY - rect.top,
    ];

    // const mousePos: [number, number] = [e.offsetX, e.offsetY];

    // Optionally adjust if you want (0, 0) at the center:
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    const mousePosCentered: [number, number] = [
      mousePos[0] - canvasWidth / 2,
      mousePos[1] - canvasHeight / 2,
    ];

    setScale((prevScale) => {
      const newScale = prevScale * (1 - deltaY / 1000);

      setFocusOffset((prevFocusOffset) => {
        const focusStep = getFocusStep(
          mousePosCentered,
          prevFocusOffset as [number, number],
          newScale,
          prevScale,
        );

        return [
          prevFocusOffset[0] + focusStep[0],
          prevFocusOffset[1] + focusStep[1],
        ];
      });

      // setFocusPos(mousePosCentered);

      return newScale;
    });
  };

  function getFocusStep(
    focusPos: [number, number], // Mouse position in (possibly centered) viewport coordinates
    currentOffset: [number, number], // Current viewport offset
    newScale: number, // New scale after zoom
    oldScale: number, // Previous scale
  ): [number, number] {
    const scaleChange = newScale - oldScale;

    if (scaleChange < 0) {
      const relativeScaleChange = scaleChange / Math.abs(oldScale);

      return [
        currentOffset[0] * relativeScaleChange,
        currentOffset[1] * relativeScaleChange,
      ];
    }

    // Convert mouse position to scene coordinates before zoom
    const mouseSceneX = (focusPos[0] - currentOffset[0]) / oldScale;
    const mouseSceneY = (focusPos[1] - currentOffset[1]) / oldScale;

    // Calculate where this point would end up after applying the new scale
    const scaledX = mouseSceneX * newScale;
    const scaledY = mouseSceneY * newScale;

    // Calculate how far we need to move the viewport to keep the mouse point fixed
    const focusStepX = focusPos[0] - (scaledX + currentOffset[0]);
    const focusStepY = focusPos[1] - (scaledY + currentOffset[1]);

    return [focusStepX, focusStepY];
  }

  // function getFocusStep(
  //   mousePos: [number, number], // Current mouse position in viewport coordinates
  //   currentOffset: [number, number], // Current viewport offset
  //   newScale: number, // New scale after zoom
  //   oldScale: number, // Change in scale (newScale - oldScale)             // Mouse wheel delta
  // ): [number, number] {
  //   // Convert mouse position to scene coordinates before zoom
  //   const mouseSceneX = (mousePos[0] - currentOffset[0]) / oldScale;
  //   const mouseSceneY = (mousePos[1] - currentOffset[1]) / oldScale;

  //   // Calculate where this point would end up after applying the new scale
  //   const scaledX = mouseSceneX * newScale;
  //   const scaledY = mouseSceneY * newScale;

  //   // Calculate how far we need to move the viewport to keep the mouse point fixed
  //   const focusStepX = mousePos[0] - scaledX - currentOffset[0];
  //   const focusStepY = mousePos[1] - scaledY - currentOffset[1];

  //   return [focusStepX, focusStepY];
  // }

  // const getFocusStep = (
  //   focus: number[],
  //   focusOffset: number[],
  //   scale: number,
  //   scaleChange: number,
  //   deltaY: number,
  // ): number[] => {
  //   const scaleRelChange = scaleChange / Math.abs(scale);

  //   // const scaleChangeIsNegative = scaleChange < 0;
  //   // if (scaleChangeIsNegative) {
  //   //   let dx = 0;
  //   //   let dy = 0;

  //   //   const amountLeftX = focusOffset[0];
  //   //   const amountLeftY = focusOffset[1];

  //   //   dx = scaleRelChange * amountLeftX;
  //   //   dy = scaleRelChange * amountLeftY;

  //   //   return [dx, dy];
  //   // }

  //   // center.current[0] - focus[0] is the distance from the focus to the center of the canvas,
  //   // we subtract the focusoffset to get the remaining distance to the center
  //   //
  //   const amountLeftX = -focus[0];
  //   const amountLeftY = -focus[1];

  //   const dx = amountLeftX * scaleRelChange;
  //   const dy = amountLeftY * scaleRelChange;

  //   return [dx, dy];
  // };

  const zoom = () => {};

  const draw = (usingPointer: boolean) => {};

  const updatePanning = () => {};

  const currentViewport: CanvasViewport = {
    x: panningOffset[0],
    y: panningOffset[1],
    scale,
  };

  const currentCanvasData: CanvasDrawingData = {
    version: CANVAS_DOCUMENT_VERSION,
    items: canvasItems,
    historyCursor: curIdx,
    viewport: currentViewport,
  };

  useEffect(() => {
    onCanvasDataChange?.(currentCanvasData);

    if (Platform.OS == "web") {
      notifyDataChange({
        type: "UPDATES",
        updatedData: currentCanvasData,
      });
    }

    if (!localDrawingId) return;

    const timeout = setTimeout(async () => {
      const document = await drawingRepository.get(localDrawingId);
      if (!document) return;

      const savedDocument = await drawingRepository.save({
        ...document,
        items: currentCanvasData.items,
        historyCursor: currentCanvasData.historyCursor,
        viewport: currentCanvasData.viewport,
      });
      notifyDataChange({
        type: "DOCUMENT_SAVED",
        document: savedDocument,
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [
    canvasItems,
    curIdx,
    localDrawingId,
    onCanvasDataChange,
    panningOffset,
    scale,
  ]);

  useEffect(() => {
    if (!localDrawingId) return;

    let cancelled = false;

    drawingRepository.get(localDrawingId).then((document) => {
      if (cancelled || !document) return;

      setItems(document.items ?? []);
      setCurIdx(document.historyCursor ?? -1);
      if (document.viewport) {
        setPanningOffset([document.viewport.x, document.viewport.y]);
        setScale(document.viewport.scale);
      }
      setCurPath("");
    });

    return () => {
      cancelled = true;
    };
  }, [localDrawingId]);

  const calcFocus = (x_points: number[], y_points: number[]) => {
    const avg_x =
      x_points.reduce((sum: number, val: number) => sum + val) /
      x_points.length;
    const avg_y =
      y_points.reduce((sum: number, val: number) => sum + val) /
      y_points.length;

    const focus = [avg_x, avg_y];

    return focus;
  };

  const calcDistance = (x_points: number[], y_points: number[]) => {
    return Math.sqrt(
      Math.pow(x_points[0] - x_points[1], 2) +
        Math.pow(y_points[0] - y_points[1], 2),
    );
  };

  const prepareForNextDrawing = () => {
    if (eraserMode) {
      finalizeStrokeErase();
      setCurPath("");
      return;
    }

    if (curPath != "") {
      if (isScribbleEraseGesture(currentStrokePointsRef.current)) {
        const minScribbleHits = Math.max(
          3,
          Math.ceil(currentStrokePointsRef.current.length * 0.12),
        );
        const scribbleTargets = getEraseTargetIds(
          currentStrokePointsRef.current,
          Math.max(16, strokeWidth + 10),
          clampScribbleSensitivity(canvasPreferences.scribbleEraseSensitivity),
          { ignorePathData: curPath, minHitCount: minScribbleHits },
        );
        const didErase = scribbleTargets.length > 0 && appendEraseHistoryEntry(scribbleTargets);
        if (didErase) {
          setCurPath("");
          currentStrokePointsRef.current = [];
          shapeStartRef.current = null;
          setShouldBlockDrawing(false);
          return;
        }
      }

      const now = new Date().toISOString();
      const curPathItem: CanvasPathItem = {
        id: createCanvasItemId("path"),
        type: "path",
        data: curPath,
        color: strokeColor.value,
        width: strokeWidth,
        createdAt: now,
        updatedAt: now,
      };

      setItems((prev) => [...prev.slice(0, curIdx + 1), curPathItem]);
      setCurIdx((prev) => prev + 1);
      setCurPath("");
    }

    currentStrokePointsRef.current = [];
    shapeStartRef.current = null;
    setShouldBlockDrawing(false);
  };

  const shouldUseConfiguredPointerInput = () => {
    return Platform.OS === "web" && canvasPreferences.pencilDrawsFingerPans;
  };

  const onTouchStartSvg = (e: GestureResponderEvent) => {
    if (shouldUseConfiguredPointerInput()) {
      return;
    }

    // alert("touch start")

    const touches = e.nativeEvent.touches;

    // console.log(touches)

    const fingerPos = touches.map((touchPoint) => [
      touchPoint.locationX,
      touchPoint.locationY,
    ]);
    prevFingersPos.current = fingerPos;

    if (pseudoPointerMode && touches.length === 1) {
      setShouldBlockDrawing(true);
      if (pseudoLeftClick) {
        updatePathAtCanvasPoint(
          pseudoPointerPosRef.current[0],
          pseudoPointerPosRef.current[1],
        );
      }
      return;
    }

    if ((lassoMode || rectangleSelectionMode) && touches.length === 1) {
      setSelectedPathIndexes([]);
      lassoPointsRef.current = [];
      setLassoPath("");
      rectangleSelectionStartRef.current = null;
      rectangleSelectionStartRef.current = null;
      if (rectangleSelectionMode) {
        updateRectangleSelectionPath(touches[0].locationX, touches[0].locationY, scale);
      } else {
        updateLassoPath(touches[0].locationX, touches[0].locationY, scale);
      }
      setShouldBlockDrawing(true);
      return;
    }

    const moreThanOneFinger = e.nativeEvent.touches.length > 1;

    if (onlyPanningMode && !moreThanOneFinger) {
      setShouldBlockDrawing(true);
      return;
    }

    if (moreThanOneFinger == false) return;

    // if you use two fingers you will be unable to draw until all of them get off the screen
    // this avoids acidental drawing caused by touch fails while zooming

    const usingTwoFingers = touches.length === 2;

    const x_points = touches.reduce(
      (acc: number[], touchPoint: NativeTouchEvent) => [
        ...acc,
        touchPoint.locationX,
      ],
      [],
    );
    const y_points = touches.reduce(
      (acc: number[], touchPoint: NativeTouchEvent) => [
        ...acc,
        touchPoint.locationY,
      ],
      [],
    );

    if (usingTwoFingers) {
      const focus = calcFocus(x_points, y_points);

      const finger_distance = calcDistance(x_points, y_points);

      prevTwoFingerDist.current = finger_distance;
      prevFingersPos.current = fingerPos;
      setShouldBlockDrawing(true);
    }

    if (pseudoPointerMode === false) {
      const leftClickMode = !pseudoLeftClick;

      // leftClickMode && prepareForNextDrawing()

      setPseudoLeftClick(leftClickMode);
    }

    return;
  };

  const onTouchMoveSvg = (e: GestureResponderEvent) => {
    if (shouldUseConfiguredPointerInput()) {
      return;
    }

    // console.log("moving ")
    // console.log(e)
    //
    // console.log("moving");

    const moreThanTwoFingers = e.nativeEvent.touches.length > 2;

    if (moreThanTwoFingers) return;

    const oneFinger = e.nativeEvent.touches.length === 1;

    const touches = e.nativeEvent.touches;

    // useful data for most cases
    const fingerPos = touches.map((touchPoint) => [
      touchPoint.locationX,
      touchPoint.locationY,
    ]);
    const x_points = touches.reduce(
      (acc: number[], touchPoint: NativeTouchEvent) => [
        ...acc,
        touchPoint.locationX,
      ],
      [],
    );
    const y_points = touches.reduce(
      (acc: number[], touchPoint: NativeTouchEvent) => [
        ...acc,
        touchPoint.locationY,
      ],
      [],
    );
    const fingerChange = fingerPos.reduce(
      (acc: number[][], touchPoint: number[], index: number) => {
        if (prevFingersPos.current.length === 0) {
          return [...acc, [touchPoint[0], touchPoint[1]]];
        }

        return [
          ...acc,
          [
            touchPoint[0] - prevFingersPos.current[index][0],
            touchPoint[1] - prevFingersPos.current[index][1],
          ],
        ];
      },
      [],
    );

    if (lassoMode || rectangleSelectionMode) {
      if (oneFinger === false) return;
      if (rectangleSelectionMode) {
        updateRectangleSelectionPath(x_points[0], y_points[0], scale);
      } else {
        updateLassoPath(x_points[0], y_points[0], scale);
      }
      prevFingersPos.current = fingerPos;
      return;
    }

    // one finger only
    if (onlyPanningMode) {
      if (oneFinger === false) return;

      const { locationX: x, locationY: y } = e.nativeEvent.touches[0];
      const [prevX, prevY] = prevFingersPos.current[0];

      const fingerChange: number[][] = [
        [x - prevX, y - prevY],
        [0, 0],
      ];

      const deltaPanning: number[] = getDeltaPanning(fingerChange);

      setPanningOffset((prev) => [
        prev[0] + deltaPanning[0],
        prev[1] + deltaPanning[1],
      ]);
      prevFingersPos.current = [[x, y]];

      return;
    }

    // can be two fingers
    if (pseudoPointerMode) {
      if (oneFinger === false) return;

      const currentPointerPos = pseudoPointerPosRef.current;
      const newPointerPos: [number, number] = [
        currentPointerPos[0] + (fingerChange[0]?.[0] ?? 0) / Math.max(scale, 0.1),
        currentPointerPos[1] + (fingerChange[0]?.[1] ?? 0) / Math.max(scale, 0.1),
      ];

      if (pseudoLeftClick && oneFinger) {
        updatePathAtCanvasPoint(newPointerPos[0], newPointerPos[1]);
      }
      setPointerPos(newPointerPos);
      prevFingersPos.current = fingerPos;

      return;
    }

    if (oneFinger) {
      shouldBlockDrawing === false &&
        updatePath(x_points[0], y_points[0], scale);

      prevFingersPos.current = fingerPos;

      return;
    }

    const finger_distance = calcDistance(x_points, y_points);

    const finger_distance_change = finger_distance - prevTwoFingerDist.current;

    prevFingersPos.current = fingerPos;

    const focus = calcFocus(x_points, y_points);

    setFingerDist(finger_distance_change);
    setScale((prevScale) => {
      const newScale = prevScale * (1 + finger_distance_change / 1000);
      const scaleChange = newScale - prevScale;

      // setFocusOffset((prevFocusOffset) => {
      //   const focusStep = getFocusStep(
      //     focus,
      //     prevFocusOffset,
      //     newScale,
      //     scaleChange,
      //   );

      //   let newX = prevFocusOffset[0];
      //   let newY = prevFocusOffset[1];

      //   if (
      //     Math.abs(prevFocusOffset[0] + focusStep[0]) <
      //     Math.abs(center.current[0] - prevFocusOffset[0])
      //   ) {
      //     newX = prevFocusOffset[0] + focusStep[0];
      //   }
      //   if (
      //     Math.abs(prevFocusOffset[1] + focusStep[1]) <
      //     Math.abs(center.current[1] - prevFocusOffset[1])
      //   ) {
      //     newY = prevFocusOffset[1] + focusStep[1];
      //   }

      //   return [newX, newY];
      // });

      return newScale;
    });
    prevFingersPos.current = fingerPos;
    prevTwoFingerDist.current = finger_distance;
  };

  const onTouchEndSvg = (e: GestureResponderEvent) => {
    if (shouldUseConfiguredPointerInput()) {
      return;
    }

    // alert("touch end")

    const notTouching = e.nativeEvent.touches.length === 0;

    if (notTouching === false) return;

    if (lassoMode || rectangleSelectionMode) {
      finalizeLassoSelection();
      setShouldBlockDrawing(false);
      return;
    }

    prepareForNextDrawing();
  };

  // const onMouseDownSvg = (e: any) => {

  //     console.log("down")
  //     console.log(e)

  //     // const pointers = Platform.OS === 'web' ? e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : e.nativeEvent : e.nativeEvent.touches;

  //     // const fingerPos = pointers.map((pointer: any) => [pointer.pageX || pointer.clientX, pointer.pageY || pointer.clientY]);
  //     // setPrevFingersPos(fingerPos);

  //     const fingerPos = [e.pageX || e.clientX, e.pageY || e.clientY]

  //     const x_points = [e.pageX || e.clientX]
  //     const y_points = [e.pageY || e.clientY]

  //     // const moreThanOnePointer = pointers.length > 1;

  //     // if (!moreThanOnePointer) return;

  //     // const hadTwoPointers = pointers.length === 2;

  //     // const x_points = pointers.map((pointer: any) => pointer.pageX || pointer.clientX);
  //     // const y_points = pointers.map((pointer: any) => pointer.pageY || pointer.clientY);

  //     const focus = calcFocus(x_points, y_points);
  //     setPrevFocus(focus);

  //     const pointer_distance = calcDistance(x_points, y_points);
  //     setInitialFingerDistance(pointer_distance);
  //     setPrevScale(scale);
  //     setPrevFingersPos([fingerPos]);
  //     setBlockDrawing(false);

  //     if (!pointerMode) {
  //         const leftClickMode = !leftClick;
  //         leftClickMode && prepareForNextDrawing();
  //         setLeftClick(leftClickMode);
  //     }
  // };

  // const onMouseMoveSvg = (e: any) => {
  //     // const pointers = Platform.OS === 'web' ? e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : e.nativeEvent : e.nativeEvent.touches;
  //     // const moreThanTwoPointers = pointers.length > 2;

  //     // if (moreThanTwoPointers) return;

  //     // const onePointer = pointers.length === 1;

  //     // const fingerPos = pointers.map((pointer: any) => [pointer.pageX || pointer.clientX, pointer.pageY || pointer.clientY]);
  //     // const x_points = pointers.map((pointer: any) => pointer.pageX || pointer.clientX);
  //     // const y_points = pointers.map((pointer: any) => pointer.pageY || pointer.clientY);

  //     const notHoldingLeft = e.buttons !== 1;

  //     if (notHoldingLeft) return;

  //     const x_points = [e.pageX || e.clientX];
  //     const y_points = [e.pageY || e.clientY];

  //     const fingerPos = [[e.pageX || e.clientX, e.pageY || e.clientY]];

  //     // console.log(fingerPos.map)

  //     const fingerChange = fingerPos.map((touchPoint: any, index: number) => {

  //         // console.log("index", index)
  //         // console.log("touchPoint", touchPoint)
  //         // console.log("prevFingersPos", prevFingersPos)

  //         if (prevFingersPos.length === 0) {
  //             return [touchPoint[0], touchPoint[1]]
  //         }

  //         return [
  //             touchPoint[0] - prevFingersPos[index][0],
  //             touchPoint[1] - prevFingersPos[index][1],
  //         ]
  //     });

  //     if (onlyPanningMode) {
  //         const { pageX: x, pageY: y } = e;
  //         const [prevX, prevY] = prevFingersPos[0];

  //         const fingerChange = [
  //             [x - prevX, y - prevY],
  //             [0, 0],
  //         ];

  //         const fingerPanning = getOffsetToMoveDrawing(fingerChange, panningOffset);
  //         setPanningOffset(fingerPanning);
  //         setPrevFingersPos([[x, y]]);
  //         return;
  //     }

  //     if (pointerMode) {
  //         const newPointerPos = [pointerPos[0] + fingerChange[0][0], pointerPos[1] + fingerChange[0][1]];

  //         if (leftClick) {
  //             updatePath(newPointerPos[0], newPointerPos[1], scale);
  //         }
  //         setPointerPos(newPointerPos);
  //         setPrevFingersPos(fingerPos);
  //         return;
  //     }

  //     if (!blockDrawing) {
  //         updatePath(x_points[0], y_points[0], scale);
  //     }
  //     setPrevFingersPos(fingerPos);
  //     return;

  //     // const finger_distance = calcDistance(x_points, y_points);
  //     // const finger_distance_change = finger_distance - prevFingerDist;
  //     // const newScale = prevScale * (1 + finger_distance_change / 1000);
  //     // const scaleChange = newScale - prevScale;

  //     // const focus = calcFocus(x_points, y_points);
  //     // const focusOffset = getOffsetToFocus(focus, scaleChange);
  //     // setFocusOffset(focusOffset);

  //     // setFingerDist(finger_distance_change);
  //     // setScale(newScale);
  //     // setPrevFocus(focus);
  //     // setPrevFingersPos(fingerPos);
  //     // setInitialFingerDistance(finger_distance);
  //     // setPrevScale(newScale);
  // };

  // const onMouseUpSvg = (e: any) => {
  //     // const pointers = Platform.OS === 'web' ? e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : e.nativeEvent : e.nativeEvent.touches;
  //     // const notTouching = pointers.length === 0;

  //     // if (!notTouching) return;

  //     prepareForNextDrawing();
  // };

  const wipeCanvas = () => {
    setItems([]);
    setCurPath("");
    setCurIdx(-1);
    setScale(1);
    setFocusOffset([0, 0]);
    setPanningOffset([0, 0]);
    setShouldBlockDrawing(false);
    currentStrokePointsRef.current = [];
    shapeStartRef.current = null;
    setEraserPreviewPath("");
    setPendingEraseItemIds([]);
    lassoPointsRef.current = [];
    setLassoPath("");
    rectangleSelectionStartRef.current = null;
    setSelectedPathIndexes([]);
    prevFingersPos.current = [];
    prevTwoFingerDist.current = 0;
  };

  const confirmWipeCanvas = () => {
    setClearCanvasDialogOpen(true);
  };

  const getSelectedPathSelection = (): CanvasClipboardSelection | null => {
    if (selectedPathIndexes.length === 0) return null;

    const selected = new Set(selectedPathIndexes);
    const activePathItems = svgItems;
    const items: CanvasPathItem[] = [];

    activePathItems.forEach((item, index) => {
      if (!selected.has(index)) return;
      items.push({ ...item });
    });

    if (items.length === 0) return null;
    return { items };
  };

  const copySelectedPaths = async () => {
    const selection = getSelectedPathSelection();
    if (!selection) return;

    clipboardSelectionRef.current = selection;
    if (Platform.OS === "web") {
      await Clipboard.setStringAsync(
        JSON.stringify({
          type: "infinitecanvas.selection",
          version: CANVAS_DOCUMENT_VERSION,
          ...selection,
        }),
      );
    }
  };

  const deleteSelectedPaths = () => {
    if (selectedPathIndexes.length === 0) return;

    const selected = new Set(selectedPathIndexes);
    const erasedItemIds = svgItems
      .filter((_, index) => selected.has(index))
      .map((item) => item.id);

    appendEraseHistoryEntry(erasedItemIds);
  };

  const cutSelectedPaths = async () => {
    await copySelectedPaths();
    deleteSelectedPaths();
  };

  const pastePathSelection = async (targetCanvasPoint?: [number, number]) => {
    let selection = clipboardSelectionRef.current;

    if (!selection && Platform.OS === "web") {
      try {
        const text = await Clipboard.getStringAsync();
        const parsed = JSON.parse(text) as Partial<CanvasClipboardSelection> & {
          type?: string;
        };
        if (
          parsed.type === "infinitecanvas.selection" &&
          Array.isArray(parsed.items)
        ) {
          selection = {
            items: parsed.items.filter(
              (item): item is CanvasPathItem =>
                item?.type === "path" &&
                typeof item.data === "string" &&
                typeof item.color === "string" &&
                typeof item.width === "number",
            ),
          };
        }
      } catch {
        selection = null;
      }
    }

    if (!selection) return;

    const selectionBounds = selection.items.reduce<SelectionBounds | null>(
      (bounds, item) => mergeBounds(bounds, getPathItemBounds(item)),
      null,
    );
    const selectionWidth = selectionBounds
      ? selectionBounds.maxX - selectionBounds.minX
      : 0;
    const selectionHeight = selectionBounds
      ? selectionBounds.maxY - selectionBounds.minY
      : 0;
    const offset = Math.max(
      42 / Math.max(scale, 0.1),
      Math.min(Math.max(selectionWidth, selectionHeight) * 0.28, 180 / Math.max(scale, 0.1)),
    );
    const dx = targetCanvasPoint && selectionBounds
      ? targetCanvasPoint[0] - selectionBounds.minX
      : offset;
    const dy = targetCanvasPoint && selectionBounds
      ? targetCanvasPoint[1] - selectionBounds.minY
      : offset;
    const now = new Date().toISOString();
    const pastedItems: CanvasPathItem[] = selection.items.map((item) => ({
      ...item,
      id: createCanvasItemId("path"),
      data: translatePathData(item.data, dx, dy),
      createdAt: now,
      updatedAt: now,
    }));
    const activeItems = canvasItems.slice(0, curIdx + 1);
    const nextItems = [...activeItems, ...pastedItems];
    const startIndex = getVisibleCanvasItems(activeItems).filter(
      (item) => item.type === "path",
    ).length;

    setItems(nextItems);
    setCurIdx(nextItems.length - 1);
    setSelectedPathIndexes(pastedItems.map((_, index) => startIndex + index));
    setSelectionMode("lasso");
    setPanningGesture(false);
    setVirtualPointerMode(false);
    setPseudoLeftClick(true);
    setEraserActive(false);
  };

  const duplicateSelectedPaths = async () => {
    await copySelectedPaths();
    await pastePathSelection();
  };

  const resizeSelectedPaths = (factor: number) => {
    if (selectedPathIndexes.length === 0 || !selectedBounds) return;

    const selected = new Set(selectedPathIndexes);
    const selectedPathIds = new Set(
      svgItems
        .filter((_, index) => selected.has(index))
        .map((item) => item.id),
    );
    const origin: [number, number] = [
      (selectedBounds.minX + selectedBounds.maxX) / 2,
      (selectedBounds.minY + selectedBounds.maxY) / 2,
    ];
    const now = new Date().toISOString();
    const activeItems = canvasItems.slice(0, curIdx + 1);

    const nextItems = activeItems.map((item) => {
      if (item.type !== "path" || !selectedPathIds.has(item.id)) return item;
      return {
        ...item,
        data: scalePathData(item.data, factor, origin),
        width: Math.max(1, item.width * factor),
        updatedAt: now,
      };
    });

    setItems(nextItems);
    setCurIdx(nextItems.length - 1);
  };

  const resizeSelectedPathsFromSnapshot = (
    factor: number,
    origin: [number, number],
    baseItems: DrawingItem[],
    selectedPathIds: Set<string>,
  ) => {
    const now = new Date().toISOString();
    const nextItems = baseItems.map((item) => {
      if (item.type !== "path" || !selectedPathIds.has(item.id)) return item;
      return {
        ...item,
        data: scalePathData(item.data, factor, origin),
        width: Math.max(1, item.width * factor),
        updatedAt: now,
      };
    });

    setItems(nextItems);
    setCurIdx(nextItems.length - 1);
  };

  const insertShapeAtCanvasPoint = (point: [number, number]) => {
    const width = 96 / Math.max(scale, 0.1);
    const height = 64 / Math.max(scale, 0.1);
    const [cx, cy] = point;
    const tool = shapeTool === "freehand" ? "rectangle" : shapeTool;
    const now = new Date().toISOString();
    const item: CanvasPathItem = {
      id: createCanvasItemId("path"),
      type: "path",
      data: buildShapePath(
        [cx - width / 2, cy - height / 2],
        [cx + width / 2, cy + height / 2],
        tool,
      ),
      color: strokeColor.value,
      width: Math.max(strokeWidth, 2),
      createdAt: now,
      updatedAt: now,
    };
    const activeItems = canvasItems.slice(0, curIdx + 1);
    const nextItems = [...activeItems, item];
    setItems(nextItems);
    setCurIdx(nextItems.length - 1);
  };

  const pasteSelectionAtContextMenu = async () => {
    const target = canvasContextMenu?.canvasPoint;
    setCanvasContextMenu(null);
    if (!target) return;
    await pastePathSelection(target);
  };

  const insertImageAtContextMenu = async () => {
    const target = canvasContextMenu?.canvasPoint;
    setCanvasContextMenu(null);
    if (!target) return;
    await pickImageAtCanvasPoint(target);
  };

  const insertShapeAtContextMenu = () => {
    const target = canvasContextMenu?.canvasPoint;
    setCanvasContextMenu(null);
    if (!target) return;
    insertShapeAtCanvasPoint(target);
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const selectionKeyHandler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (isTyping) return;

      const hasModifier = event.ctrlKey || event.metaKey;

      if (event.key === "Escape") {
        setSelectedPathIndexes([]);
        setLassoPath("");
        lassoPointsRef.current = [];
        rectangleSelectionStartRef.current = null;
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedPathIndexes.length === 0) return;
        event.preventDefault();
        deleteSelectedPaths();
        return;
      }

      if (!hasModifier) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        copySelectedPaths();
      }
      if (key === "x") {
        event.preventDefault();
        cutSelectedPaths();
      }
      if (key === "v") {
        event.preventDefault();
        pastePathSelection();
      }
      if (key === "d") {
        event.preventDefault();
        duplicateSelectedPaths();
      }
    };

    document.addEventListener("keydown", selectionKeyHandler);
    return () => document.removeEventListener("keydown", selectionKeyHandler);
  }, [selectedPathIndexes, canvasItems, curIdx, scale]);


  // const transformString = ` translateX(${translateX}px) translateY(${translateY}px) scale(${scale}) `;

  // const callbacks = Platform.OS === 'web' ? { onPressIn: onMouseDownSvg, onPointerMove: onMouseMoveSvg, onPressOut: onMouseUpSvg } : { onTouchStart: onTouchStartSvg, onTouchMove: onTouchMoveSvg, onTouchEnd: onTouchEndSvg }

  // const allowedOrigins = [
  //     'http://localhost:1420',      // Development
  //     'tauri://localhost',          // Production (adjust if needed)
  //     // 'http://your-deployed-domain' // If hosted externally
  // ];
  //
  const notifyDataChange = (msg: CanvasClientMessage) => {
    if (
      Platform.OS !== "web" ||
      typeof window === "undefined" ||
      !window.parent
    ) {
      return;
    }

    window.parent.postMessage(msg, "*");
  };

  // const handleWheel = (e: WheelEvent) => {
  //   const ctrlKey = e.ctrlKey;

  //   if (ctrlKey === false) return;

  //   e.preventDefault();

  //   const deltaY = e.deltaY;

  //   const mousePos: [number, number] = [e.offsetX, e.offsetY];
  //   const focus = mousePos;

  //   setScale((prevScale) => {
  //     const newScale = prevScale * (1 - deltaY / 1000);
  //     // const scaleChange = newScale - prevScale;

  //     setFocusOffset((prevFocusOffset) => {
  //       const focusStep = getFocusStep(
  //         mousePos,
  //         prevFocusOffset as [number, number],
  //         newScale,
  //         prevScale,
  //       );

  //       console.log("focusStep", focusStep);

  //       const newX = prevFocusOffset[0] + focusStep[0];
  //       const newY = prevFocusOffset[1] + focusStep[1];

  //       return [newX, newY];
  //     });

  //     return newScale;
  //   });
  // };

  const preventScrollingParent = (e: any) => {
    // alert("scrolling prevented");
    e.preventDefault();
    e.stopPropagation();
  };

  const checkMiddleButtonDown = (e: any) => {
    if (e.button === 1 && Platform.OS === "web") {
      e.preventDefault();
      setPanningGesture(true);

      // change icon of the cursor
      document.body.style.cursor = "grabbing";
    }
  };

  const checkMiddleButtonUp = (e: any) => {
    if (e.button === 1 && Platform.OS === "web") {
      setPanningGesture(false);
      // change icon of the cursor
      document.body.style.cursor = "default";
    }
  };

  const handlePointerMoveSvg = (e: any) => {
    if (Platform.OS === "web") {
      updateCursorCoordinates(getWebPointerPosition(e));
    }

    const isPressingMiddleBtn = e.buttons === 4;

    if (isPressingMiddleBtn) {
      setPanningGesture(true);
      const deltaX = e.movementX / scale;
      const deltaY = e.movementY / scale;

      setPanningOffset((prev) => [prev[0] + deltaX, prev[1] + deltaY]);

      // e.preventDefault();
      // e.stopPropagation();
    }
  };

  const getWebPointerPosition = (e: any): [number, number] => {
    const nativeEvent = e.nativeEvent ?? e;
    const target = e.currentTarget ?? nativeEvent.target;
    const rect = target?.getBoundingClientRect?.();

    if (!rect) {
      return [
        nativeEvent.locationX ?? nativeEvent.clientX ?? nativeEvent.pageX ?? 0,
        nativeEvent.locationY ?? nativeEvent.clientY ?? nativeEvent.pageY ?? 0,
      ];
    }

    return [
      (nativeEvent.clientX ?? nativeEvent.pageX ?? 0) - rect.left,
      (nativeEvent.clientY ?? nativeEvent.pageY ?? 0) - rect.top,
    ];
  };

  const toCanvasCoordinates = (position: [number, number]): [number, number] => {
    return screenPointToCanvasPoint(position[0], position[1], scale);
  };

  const clientPointToCanvasPoint = (
    clientX: number,
    clientY: number,
  ): [number, number] => {
    const node = canvasRef.current as any;
    const rect = node?.getBoundingClientRect?.();
    const screenPoint: [number, number] = rect
      ? [clientX - rect.left, clientY - rect.top]
      : [clientX, clientY];

    return screenPointToCanvasPoint(screenPoint[0], screenPoint[1], scale);
  };

  const updateCursorCoordinates = (position: [number, number]) => {
    const [canvasX, canvasY] = toCanvasCoordinates(position);
    setCursorCoordinates([Math.round(canvasX), Math.round(canvasY)]);
  };

  const openCanvasContextMenu = (event: any) => {
    if (Platform.OS !== "web") return;
    const position = getWebPointerPosition(event);
    event.preventDefault?.();
    event.stopPropagation?.();
    setCanvasContextMenu({
      screenX: position[0],
      screenY: position[1],
      canvasPoint: screenPointToCanvasPoint(position[0], position[1], scale),
    });
  };

  const resetViewportToContent = () => {
    setScale(1);
    setFocusOffset([0, 0]);
    setFocusPos([0, 0]);
    setPanningOffset([0, 0]);
  };

  const deactivateExclusiveTools = () => {
    setPanningGesture(false);
    setVirtualPointerMode(false);
    setPseudoLeftClick(true);
    setPointerHintVisible(false);
    setEraserActive(false);
    setSelectionMode(null);
    setEraserPreviewPath("");
    setPendingEraseItemIds([]);
  };

  const activateStrokeMode = () => {
    deactivateExclusiveTools();
    setShapeTool("freehand");
  };

  const activatePanMode = () => {
    const nextValue = !onlyPanningMode;
    deactivateExclusiveTools();
    setShapeTool("freehand");
    setPanningGesture(nextValue);
  };

  const activateEraserMode = () => {
    const nextValue = !eraserMode;
    deactivateExclusiveTools();
    setShapeTool("freehand");
    if (nextValue) setEraserActive(true);
  };

  const activatePointerMode = () => {
    const nextValue = !pseudoPointerMode;
    deactivateExclusiveTools();
    setShapeTool("freehand");
    setVirtualPointerMode(nextValue);
    setPseudoLeftClick(true);
    setPointerHintVisible(nextValue);
    if (nextValue) {
      setPointerPos(
        screenPointToCanvasPoint(
          widthRef.current / 2,
          heightRef.current / 2,
          scale,
        ),
      );
    }
  };

  const activateLassoMode = () => {
    const nextValue = !lassoMode;
    deactivateExclusiveTools();
    setShapeTool("freehand");
    setLassoMode(nextValue);
  };

  const activateRectangleSelectionMode = () => {
    const nextValue = !rectangleSelectionMode;
    deactivateExclusiveTools();
    setShapeTool("freehand");
    setRectangleSelectionMode(nextValue);
  };

  const activateShapeTool = (tool: ShapeTool) => {
    deactivateExclusiveTools();
    setShapeTool(tool);
  };

  const captureWebPointer = (e: any) => {
    const nativeEvent = e.nativeEvent ?? e;
    const target = e.currentTarget ?? nativeEvent.target;

    if (nativeEvent.pointerId != null) {
      target?.setPointerCapture?.(nativeEvent.pointerId);
    }
  };

  const releaseWebPointer = (e: any) => {
    const nativeEvent = e.nativeEvent ?? e;
    const target = e.currentTarget ?? nativeEvent.target;

    if (nativeEvent.pointerId != null) {
      target?.releasePointerCapture?.(nativeEvent.pointerId);
    }
  };

  const handleConfiguredPointerStart = (e: any) => {
    if (!shouldUseConfiguredPointerInput()) {
      return;
    }

    const nativeEvent = e.nativeEvent ?? e;
    const pointerType = nativeEvent.pointerType ?? "mouse";
    const isPrimaryPointer = nativeEvent.isPrimary ?? true;

    if (nativeEvent.button === 2) {
      return;
    }

    if (!isPrimaryPointer) {
      return;
    }

    if (!["pen", "touch", "mouse"].includes(pointerType)) {
      return;
    }

    e.preventDefault?.();
    e.stopPropagation?.();
    setCanvasContextMenu(null);
    captureWebPointer(e);

    const position = getWebPointerPosition(e);
    updateCursorCoordinates(position);

    if (pseudoPointerMode) {
      webPointerModeRef.current = "pointer";
      webPointerLastPositionRef.current = position;
      setShouldBlockDrawing(true);
      if (pseudoLeftClick) {
        updatePathAtCanvasPoint(
          pseudoPointerPosRef.current[0],
          pseudoPointerPosRef.current[1],
        );
      }
      return;
    }

    if (pointerType === "touch") {
      webPointerModeRef.current = "pan";
      webPointerLastPositionRef.current = position;
      setShouldBlockDrawing(true);
      return;
    }

    if (lassoMode || rectangleSelectionMode) {
      webPointerModeRef.current = rectangleSelectionMode ? "rectangle" : "lasso";
      webPointerLastPositionRef.current = position;
      setSelectedPathIndexes([]);
      lassoPointsRef.current = [];
      setLassoPath("");
      rectangleSelectionStartRef.current = null;
      if (rectangleSelectionMode) {
        updateRectangleSelectionPath(position[0], position[1], scale);
      } else {
        updateLassoPath(position[0], position[1], scale);
      }
      setShouldBlockDrawing(true);
      return;
    }

    if (onlyPanningMode) {
      webPointerModeRef.current = "pan";
      webPointerLastPositionRef.current = position;
      setShouldBlockDrawing(true);
      return;
    }

    if (pointerType === "pen" || nativeEvent.button === 0) {
      webPointerModeRef.current = "draw";
      webPointerLastPositionRef.current = position;
      setShouldBlockDrawing(false);
      updatePath(position[0], position[1], scale);
    }
  };

  const handleConfiguredPointerMove = (e: any) => {
    if (!shouldUseConfiguredPointerInput()) {
      return;
    }

    const mode = webPointerModeRef.current;

    if (!mode) {
      return;
    }

    e.preventDefault?.();
    e.stopPropagation?.();

    const position = getWebPointerPosition(e);
    updateCursorCoordinates(position);

    if (mode === "draw") {
      updatePath(position[0], position[1], scale);
      webPointerLastPositionRef.current = position;
      return;
    }

    if (mode === "lasso" || mode === "rectangle") {
      if (mode === "rectangle") {
        updateRectangleSelectionPath(position[0], position[1], scale);
      } else {
        updateLassoPath(position[0], position[1], scale);
      }
      webPointerLastPositionRef.current = position;
      return;
    }

    const previousPosition = webPointerLastPositionRef.current;

    if (!previousPosition) {
      webPointerLastPositionRef.current = position;
      return;
    }

    const deltaX = position[0] - previousPosition[0];
    const deltaY = position[1] - previousPosition[1];

    if (mode === "pointer") {
      const nextPointerPos: [number, number] = [
        pseudoPointerPosRef.current[0] + deltaX / Math.max(scale, 0.1),
        pseudoPointerPosRef.current[1] + deltaY / Math.max(scale, 0.1),
      ];
      setPointerPos(nextPointerPos);
      if (pseudoLeftClick) {
        updatePathAtCanvasPoint(nextPointerPos[0], nextPointerPos[1]);
      }
      webPointerLastPositionRef.current = position;
      return;
    }

    setPanningOffset((prev) => [prev[0] + deltaX, prev[1] + deltaY]);
    webPointerLastPositionRef.current = position;
  };

  const handleConfiguredPointerEnd = (e: any) => {
    if (!shouldUseConfiguredPointerInput()) {
      return;
    }

    const mode = webPointerModeRef.current;

    if (!mode) {
      return;
    }

    e.preventDefault?.();
    e.stopPropagation?.();
    releaseWebPointer(e);

    if (mode === "draw") {
      prepareForNextDrawing();
    } else if (mode === "lasso" || mode === "rectangle") {
      finalizeLassoSelection();
      setShouldBlockDrawing(false);
    } else if (mode === "pointer") {
      if (pseudoLeftClick) {
        prepareForNextDrawing();
      } else {
        setShouldBlockDrawing(false);
      }
    } else {
      setShouldBlockDrawing(false);
    }

    webPointerModeRef.current = null;
    webPointerLastPositionRef.current = null;
  };

  const ctrlZ_handler = (e: KeyboardEvent) => {
    if (e.key === "z" && e.ctrlKey) {
      setCurIdx((prev) => prev - 1);
    }
  };

  const ctrlY_handler = (e: KeyboardEvent) => {
    if (e.key === "y" && e.ctrlKey) {
      setCurIdx((prev) => prev + 1);
    }
  };

  const getBase64Image = (img: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");

    if (ctx === null) return;

    ctx.drawImage(img, 0, 0);

    const dataURL = canvas.toDataURL("image/png");

    return dataURL;
  };

  const addImageToCanvas = (uri: string, targetCanvasPoint?: [number, number]) => {
    const now = new Date().toISOString();
    const imgItem: CanvasImageItem = {
      id: createCanvasItemId("image"),
      type: "image",
      uri,
      x: targetCanvasPoint?.[0] ?? 0,
      y: targetCanvasPoint?.[1] ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    setItems((prev) => [...prev.slice(0, curIdx + 1), imgItem]);
    setCurIdx((prev) => prev + 1);
  };

  const pickImageAtCanvasPoint = async (targetCanvasPoint?: [number, number]) => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      await getImageFromClipboard(targetCanvasPoint);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";

    input.onchange = () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          addImageToCanvas(reader.result, targetCanvasPoint);
        }
      };
      reader.readAsDataURL(file);
    };

    document.body.appendChild(input);
    input.click();
  };

  const getImageFromClipboard = async (targetCanvasPoint?: [number, number]) => {
    // alert("img");
    const hasImage = await Clipboard.hasImageAsync();
    if (!hasImage) {
      // Alert.alert("No image found in clipboard");
      return;
    }

    try {
      const img = await Clipboard.getImageAsync({ format: "png" });
      if (img) {
        console.log(img);
        const imgPath = `${img.data}`;

        addImageToCanvas(imgPath, targetCanvasPoint);
      }
    } catch (error) {
      console.error("Error fetching image:", error);
    }
  };

  const paste_img_handler = (e: ClipboardEvent) => {
    e.preventDefault();

    getImageFromClipboard();
    // alert("pasting");
    //

    // const clipboardData = e.clipboardData;

    // console.dir(clipboardData);

    // if (clipboardData === null) return;

    // const isImage = clipboardData.types.indexOf("Files") !== -1;
    // if (!isImage) return;

    // const file = clipboardData.files[0];
    // const reader = new FileReader();

    // reader.onload = (e) => {
    //   const img = new Image();

    //   if (e.target === null) return;
    //   img.src = e.target.result as string;

    //   img.onload = () => {
    //     const svg = svgRef.current;

    //     const dataURL = getBase64Image(img);

    //     const imgPath = `data:image/png;base64,${dataURL}`;

    //     const imgItem = {
    //       type: "img",
    //       data: imgPath,
    //     };

    //     setItems((prev) => [...prev, imgItem]);
    //     setCurIdx((prev) => prev + 1);
    //   };
    // };
  };

  useEffect(() => {
    if (Platform.OS === "web") {
      if (!document.getElementById("infinite-canvas-tooltips")) {
        const tooltipStyle = document.createElement("style");
        tooltipStyle.id = "infinite-canvas-tooltips";
        tooltipStyle.textContent = `
          [data-tooltip] { position: relative; }
          [data-tooltip]:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            left: 50%;
            bottom: calc(100% + 8px);
            transform: translateX(-50%);
            z-index: 9999;
            white-space: nowrap;
            max-width: 240px;
            overflow: hidden;
            text-overflow: ellipsis;
            pointer-events: none;
            border: 1px solid ${canvasToolTheme.border};
            border-radius: 6px;
            padding: 5px 7px;
            background: ${canvasToolTheme.bar};
            color: ${canvasToolTheme.text};
            font: 700 11px/1.2 system-ui, sans-serif;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
          }
        `;
        document.head.appendChild(tooltipStyle);
      }
      notifyDataChange({
        type: "READY",
        protocolVersion: CANVAS_EMBED_PROTOCOL_VERSION,
      });
      document.addEventListener("mousedown", checkMiddleButtonDown);
      document.addEventListener("mouseup", checkMiddleButtonUp);
      document.addEventListener("wheel", handleWheel, { passive: false });
      document.addEventListener("touchmove", preventScrollingParent, {
        passive: false,
      });
      document.addEventListener("gesturestart", preventScrollingParent, {
        passive: false,
      });
      document.addEventListener("scroll", preventScrollingParent, {
        passive: false,
      });
      document.addEventListener("keydown", ctrlZ_handler);
      document.addEventListener("keydown", ctrlY_handler);
      document.addEventListener("paste", paste_img_handler);
      // document.addEventListener("wheel", handleScroll, { passive: false });
    }

    // Handle messages from the parent
    const handleMessage = (event: MessageEvent) => {
      const { data } = event;

      if (!isCanvasHostMessage(data)) return;

      // console.log("event from the canvas side", event);
      // console.table(data);

      if (data.type === "INIT" && data.initData) {
        // console.log("initing");
        // Update your app state with initial drawings
        //

        const initData = data.initData;
        if (isCanvasDrawingData(initData)) {
          setItems(initData.items);
          setCurIdx(initData.historyCursor);
          if (initData.viewport) {
            setPanningOffset([initData.viewport.x, initData.viewport.y]);
            setScale(initData.viewport.scale);
          }
        }
      }

      if (data.type === "CONFIG" && data.config) {
        setCanvasPreferences((currentPreferences) => ({
          ...currentPreferences,
          pencilDrawsFingerPans: Boolean(
            data.config.pencilDrawsFingerPans,
          ),
          scribbleEraseEnabled: data.config.scribbleEraseEnabled ??
            currentPreferences.scribbleEraseEnabled,
          scribbleEraseSensitivity: data.config.scribbleEraseSensitivity === undefined
            ? currentPreferences.scribbleEraseSensitivity
            : clampScribbleSensitivity(data.config.scribbleEraseSensitivity),
        }));
      }
    };

    // Add listener (web-only)
    if (Platform.OS === "web") {
      window.addEventListener("message", handleMessage);
    }

    // Cleanup
    return () => {
      if (Platform.OS === "web") {
        window.removeEventListener("message", handleMessage);
      }
      document.removeEventListener("touchmove", preventScrollingParent);
      document.removeEventListener("gesturestart", preventScrollingParent);
      document.removeEventListener("scroll", preventScrollingParent);
      document.removeEventListener("mousedown", checkMiddleButtonDown);
      document.removeEventListener("mouseup", checkMiddleButtonUp);
      document.removeEventListener("wheel", handleWheel);
      document.removeEventListener("keydown", ctrlZ_handler);
      document.removeEventListener("keydown", ctrlY_handler);
      document.removeEventListener("paste", paste_img_handler);
      // document.removeEventListener("wheel", handleScroll);
    };
  }, []);

  // Since we are in the 4th quadrant, when we do scale transformation,
  // we need to recenter the canvas by translating it to the left and up
  // it's as if the focus of the zoom is in the top left corner

  // Subtracting panning offset is like we're moving the canvas in the oposite direction
  // while the drawings stay in place
  const [x, y] = getCanvasViewportTransform(scale);
  // const translateX = panningOffset[0] - center.current[0] * (scale - 1);
  // const translateY = panningOffset[1] - center.current[1] * (scale - 1);
  //

  const activeCanvasItems = getVisibleCanvasItems(canvasItems.slice(0, curIdx + 1));
  const svgItems = activeCanvasItems.filter(
    (item): item is CanvasPathItem => item.type === "path",
  );
  const imgItems = activeCanvasItems.filter(
    (item): item is CanvasImageItem => item.type === "image",
  );
  const selectedBounds = svgItems.reduce<SelectionBounds | null>(
    (bounds, item, index) => {
      if (!selectedPathIndexes.includes(index)) return bounds;
      const padding = (item.width ?? strokeWidth) / Math.max(scale, 0.1) / 2;
      return mergeBounds(bounds, getPathItemBounds(item, padding));
    },
    null,
  );
  const selectionScreenBounds = selectedBounds
    ? {
        left: x + selectedBounds.minX * scale,
        top: y + selectedBounds.minY * scale,
        width: Math.max((selectedBounds.maxX - selectedBounds.minX) * scale, 1),
        height: Math.max((selectedBounds.maxY - selectedBounds.minY) * scale, 1),
      }
    : null;
  const canvasCursor =
    Platform.OS !== "web"
      ? undefined
      : isSelectionResizing
      ? "nwse-resize"
      : isSelectionDragging
      ? "grabbing"
      : lassoMode || rectangleSelectionMode
      ? "crosshair"
      : eraserMode
      ? eraserModeType === "point"
        ? "none"
        : "crosshair"
      : onlyPanningMode
      ? shouldBlockDrawing
        ? "grabbing"
        : "grab"
      : pseudoPointerMode
      ? "none"
      : "crosshair";

  const translateSelectedPathsByCanvasDelta = (
    dx: number,
    dy: number,
    selectedPathIds = selectionDragSelectedIdsRef.current,
  ) => {
    if (selectedPathIds.size === 0) return;

    const now = new Date().toISOString();
    const activeItems = canvasItems.slice(0, curIdx + 1);
    const nextItems = activeItems.map((item) => {
      if (item.type !== "path" || !selectedPathIds.has(item.id)) return item;

      return {
        ...item,
        data: translatePathData(item.data, dx, dy),
        updatedAt: now,
      };
    });

    setItems(nextItems);
    setCurIdx(nextItems.length - 1);
  };

  const flushSelectionDragDelta = () => {
    const [dx, dy] = selectionDragPendingDeltaRef.current;
    selectionDragPendingDeltaRef.current = [0, 0];
    if (dx === 0 && dy === 0) return;
    translateSelectedPathsByCanvasDelta(dx, dy);
  };

  const scheduleSelectionDragDelta = () => {
    if (selectionDragFrameRef.current !== null) return;

    selectionDragFrameRef.current = window.requestAnimationFrame(() => {
      selectionDragFrameRef.current = null;
      flushSelectionDragDelta();
    });
  };

  const startSelectionDrag = (event: any) => {
    if (Platform.OS !== "web" || selectedPathIndexes.length === 0) return;
    const nativeEvent = event.nativeEvent ?? event;
    const selected = new Set(selectedPathIndexes);
    selectionDragSelectedIdsRef.current = new Set(
      svgItems
        .filter((_, index) => selected.has(index))
        .map((item) => item.id),
    );
    selectionDragLastPositionRef.current = [
      nativeEvent.clientX ?? 0,
      nativeEvent.clientY ?? 0,
    ];
    selectionDragPendingDeltaRef.current = [0, 0];
    setIsSelectionDragging(true);
    setCanvasContextMenu(null);
    captureWebPointer(event);
    event.preventDefault?.();
    event.stopPropagation?.();
  };

  const moveSelectionDrag = (event: any) => {
    const previousPosition = selectionDragLastPositionRef.current;
    if (!previousPosition) return;

    const nativeEvent = event.nativeEvent ?? event;
    const position: [number, number] = [
      nativeEvent.clientX ?? previousPosition[0],
      nativeEvent.clientY ?? previousPosition[1],
    ];
    const dx = (position[0] - previousPosition[0]) / Math.max(scale, 0.1);
    const dy = (position[1] - previousPosition[1]) / Math.max(scale, 0.1);
    selectionDragLastPositionRef.current = position;
    selectionDragPendingDeltaRef.current = [
      selectionDragPendingDeltaRef.current[0] + dx,
      selectionDragPendingDeltaRef.current[1] + dy,
    ];
    scheduleSelectionDragDelta();
    event.preventDefault?.();
    event.stopPropagation?.();
  };

  const endSelectionDrag = (event: any) => {
    if (!selectionDragLastPositionRef.current) return;
    selectionDragLastPositionRef.current = null;
    if (selectionDragFrameRef.current !== null) {
      window.cancelAnimationFrame(selectionDragFrameRef.current);
      selectionDragFrameRef.current = null;
    }
    flushSelectionDragDelta();
    selectionDragSelectedIdsRef.current = new Set();
    setIsSelectionDragging(false);
    releaseWebPointer(event);
    event.preventDefault?.();
    event.stopPropagation?.();
  };

  const startSelectionResize = (event: any) => {
    if (
      Platform.OS !== "web" ||
      selectedPathIndexes.length === 0 ||
      !selectedBounds
    ) {
      return;
    }
    const nativeEvent = event.nativeEvent ?? event;
    selectionResizeLastPositionRef.current = [
      nativeEvent.clientX ?? 0,
      nativeEvent.clientY ?? 0,
    ];
    const selected = new Set(selectedPathIndexes);
    const selectedPathIds = new Set(
      svgItems
        .filter((_, index) => selected.has(index))
        .map((item) => item.id),
    );
    selectionResizeStateRef.current = {
      anchor: [selectedBounds.minX, selectedBounds.minY],
      baseItems: canvasItems.slice(0, curIdx + 1),
      bounds: selectedBounds,
      selectedPathIds,
    };
    setIsSelectionResizing(true);
    setCanvasContextMenu(null);
    captureWebPointer(event);
    event.preventDefault?.();
    event.stopPropagation?.();
  };

  const moveSelectionResize = (event: any) => {
    const previousPosition = selectionResizeLastPositionRef.current;
    const resizeState = selectionResizeStateRef.current;
    if (!previousPosition || !resizeState) return;

    const nativeEvent = event.nativeEvent ?? event;
    const position: [number, number] = [
      nativeEvent.clientX ?? previousPosition[0],
      nativeEvent.clientY ?? previousPosition[1],
    ];
    selectionResizeLastPositionRef.current = position;

    const pointerCanvasPoint = clientPointToCanvasPoint(position[0], position[1]);
    const initialVector: [number, number] = [
      resizeState.bounds.maxX - resizeState.anchor[0],
      resizeState.bounds.maxY - resizeState.anchor[1],
    ];
    const currentVector: [number, number] = [
      pointerCanvasPoint[0] - resizeState.anchor[0],
      pointerCanvasPoint[1] - resizeState.anchor[1],
    ];
    const denominator =
      initialVector[0] * initialVector[0] + initialVector[1] * initialVector[1];
    const projectedScale =
      denominator === 0
        ? 1
        : (currentVector[0] * initialVector[0] +
            currentVector[1] * initialVector[1]) /
          denominator;
    const factor = Math.max(0.12, Math.min(projectedScale, 8));

    resizeSelectedPathsFromSnapshot(
      factor,
      resizeState.anchor,
      resizeState.baseItems,
      resizeState.selectedPathIds,
    );
    event.preventDefault?.();
    event.stopPropagation?.();
  };

  const endSelectionResize = (event: any) => {
    if (!selectionResizeLastPositionRef.current) return;
    selectionResizeLastPositionRef.current = null;
    selectionResizeStateRef.current = null;
    setIsSelectionResizing(false);
    releaseWebPointer(event);
    event.preventDefault?.();
    event.stopPropagation?.();
  };

  const [windowHeight, setWindowHeight] = useState(
    Dimensions.get("window").height,
  );
  const webCanvasEventProps =
    Platform.OS === "web"
      ? ({ onContextMenu: openCanvasContextMenu } as any)
      : {};

  useEffect(() => {
    const updateHeight = () => {
      setWindowHeight(Dimensions.get("window").height);
    };

    const subscription = Dimensions.addEventListener("change", updateHeight);

    return () => subscription?.remove(); // Cleanup on unmount
  }, []);

  // At the top of your component
  useEffect(() => {
    console.clear();
    console.log(
      `%c Current Values:
    Scale: ${scale}
    PanningOffset: [${panningOffset[0].toFixed(2)}, ${panningOffset[1].toFixed(2)}]
    Final Transform: translate(${x.toFixed(2)}, ${y.toFixed(2)}) scale(${scale})`,
      "font-family: monospace",
    );
  }, [scale, panningOffset, x, y]);

  return (
    <View
      // disable scroling through the canvas

      style={{
        flex: 1,
        backgroundColor: "#000000ff",
        alignItems: "center",
        justifyContent: "flex-start",
        width: "100%",
        height: "100%",
      }}
    >
      <StatusBar backgroundColor={"#000000"} />

      <TopBtnsBar
        buttonsContainerColor={buttonsContainerColor}
        curIdx={curIdx}
        itemsAmount={canvasItems.length}
        setCurIdx={setCurIdx}
      />

      <View
        style={{
          width: "100%",
          flexGrow: 1,
          zIndex: 40,
          padding: 0,
          margin: 5,
          borderWidth: 0,
          position: "relative",
          maxHeight: windowHeight,
          cursor: canvasCursor as any,
        }}
        ref={canvasRef}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onStartShouldSetResponderCapture={() => true}
        onResponderMove={onTouchMoveSvg}
        onResponderStart={onTouchStartSvg}
        onResponderEnd={onTouchEndSvg}
        onResponderTerminate={onTouchEndSvg}
        // onResponderRelease={onTouchEndSvg}
        onPointerDown={handleConfiguredPointerStart}
        onPointerMove={(e) => {
          handlePointerMoveSvg(e);
          handleConfiguredPointerMove(e);
        }}
        onPointerUp={handleConfiguredPointerEnd}
        onPointerLeave={handleConfiguredPointerEnd}
        {...webCanvasEventProps}
        onLayout={onCanvasLayout}
      >
        <Svg
          ref={svgRef}
          style={{
            // backgroundColor: "#000000ff",
            position: "absolute", // Ensures it overlays images
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            padding: 0,
            margin: 0,
            borderWidth: 0,
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <G transform={`translate(${x}, ${y}) scale(${scale}) `}>
            {svgItems.map((item, i) => {
              // if (item.type != "path") return;
              if (item.type != "path") {
                return <></>;
                // const handleImgDrag = (e: GestureResponderEvent) => {
                //   const touches = e.nativeEvent.touches;

                //   if (touches.length === 1) {
                //     // lets you drag the image
                //     //
                //     const { locationX, locationY } = touches[0];
                //   }
                // };

                // return <DraggableAndResizableImg key={i} uri={item.data} />;
              }

              // const translateX =
              //   panningOffset[0] + recenterScalingX + focusOffset[0];
              // const translateY =
              //   panningOffset[1] + recenterScalingY + focusOffset[1];

              const isSelected = selectedPathIndexes.includes(i);
              const isPendingErase = pendingEraseItemIds.includes(item.id);

              return (
                <React.Fragment key={i}>
                  {isSelected && (
                    <Path
                      stroke={canvasToolTheme.accent}
                      d={item.data}
                      fill={"none"}
                      fillOpacity={0}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeOpacity={0.65}
                      strokeWidth={(item.width + 10) / scale}
                    />
                  )}
                  <Path
                    stroke={item.color}
                    d={item.data}
                    fill={"none"}
                    fillOpacity={0}
                    opacity={isPendingErase ? 0.28 : 1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={item.width / scale}
                    // scale={scale}

                    // translateX={panningOffset[0] - center.current[0] * (scale - 1) + focusOffset[0]}
                    // translateY={panningOffset[1] - center.current[1] * (scale - 1) + focusOffset[1]}
                  />
                </React.Fragment>
              );
            })}
            {selectedBounds && (
              <Rect
                x={selectedBounds.minX}
                y={selectedBounds.minY}
                width={Math.max(selectedBounds.maxX - selectedBounds.minX, 1)}
                height={Math.max(selectedBounds.maxY - selectedBounds.minY, 1)}
                fill="none"
                stroke={canvasToolTheme.accent}
                strokeWidth={1.5 / scale}
                strokeDasharray="10 6"
                rx={3 / scale}
              />
            )}
          </G>
          <Path
            stroke={canvasToolTheme.accent}
            d={lassoPath}
            fill={"none"}
            strokeWidth={1.5 / scale}
            strokeOpacity={0.9}
            strokeDasharray="8 7"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={`translate(${x}, ${y}) scale(${scale})`}
          />
          {eraserPreviewPath !== "" && (
            <Path
              stroke="#ff3b5f"
              d={eraserPreviewPath}
              fill="none"
              strokeWidth={Math.max(eraserSize, 8) / scale}
              strokeOpacity={0.72}
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={`translate(${x}, ${y}) scale(${scale})`}
            />
          )}
          <Path
            stroke={strokeColor.value}
            key={curIdx}
            d={curPath}
            fill={"none"}
            strokeWidth={strokeWidth / scale}
            fillOpacity={0}
            strokeLinecap="round"
            strokeLinejoin="round"
            // scale={scale}
            transform={`translate(${x}, ${y}) scale(${scale})`}
            // translateX={panningOffset[0] - center.current[0] * (scale - 1) + focusOffset[0]}
            // translateY={panningOffset[1] - center.current[1] * (scale - 1) + focusOffset[1]}
          />
          {/* <Circle
                            stroke={'#1fb1ff'}
                            cx={prevFocus[0]}
                            cy={prevFocus[1]}
                            r={2}
                        /> */}
        </Svg>
        {imgItems.map((item, i) => {
          const imgUri = item.uri;

          return (
            <DraggableAndResizableImg
              key={item.id}
              uri={imgUri}
              x={item.x ?? 0}
              y={item.y ?? 0}
              setBlockDrawing={setShouldBlockDrawing}
              scale={scale}
              offset={[x, y]}
            />
          );
        })}
        {selectionScreenBounds && (
          <SelectionOverlay
            bounds={selectionScreenBounds}
            selectedCount={selectedPathIndexes.length}
            isDragging={isSelectionDragging}
            isResizing={isSelectionResizing}
            onPointerDown={startSelectionDrag}
            onPointerMove={moveSelectionDrag}
            onPointerUp={endSelectionDrag}
            onResizePointerDown={startSelectionResize}
            onResizePointerMove={moveSelectionResize}
            onResizePointerUp={endSelectionResize}
            onDuplicate={duplicateSelectedPaths}
            onDelete={deleteSelectedPaths}
          />
        )}
        {canvasContextMenu && (
          <CanvasContextMenu
            menu={canvasContextMenu}
            canPaste={true}
            onPaste={pasteSelectionAtContextMenu}
            onInsertImage={insertImageAtContextMenu}
            onInsertShape={insertShapeAtContextMenu}
            onClose={() => setCanvasContextMenu(null)}
          />
        )}
        {eraserMode &&
          eraserModeType === "point" &&
          (cursorCoordinates[0] !== 0 || cursorCoordinates[1] !== 0) && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left:
                  x +
                  cursorCoordinates[0] * scale -
                  Math.max(eraserSize, 14) / 2,
                top:
                  y +
                  cursorCoordinates[1] * scale -
                  Math.max(eraserSize, 14) / 2,
                width: Math.max(eraserSize, 14),
                height: Math.max(eraserSize, 14),
                borderRadius: Math.max(eraserSize, 14) / 2,
                borderWidth: 2,
                borderColor: canvasToolTheme.accent,
                backgroundColor: "transparent",
                zIndex: 900,
              }}
            />
          )}
      </View>

      {pseudoPointerMode && pointerHintVisible && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 54,
            right: 16,
            maxWidth: 360,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: canvasToolTheme.accent,
            backgroundColor: "rgba(12, 12, 18, 0.92)",
            zIndex: 1200,
          }}
        >
          <Text
            style={{
              color: "#ffffff",
              fontWeight: "700",
              marginBottom: 4,
            }}
          >
            Offset cursor
          </Text>
          <Text
            style={{
              color: "#d7d7df",
              lineHeight: 18,
            }}
          >
            {pseudoLeftClick
              ? "Drawing from the offset pointer."
              : "Moving the offset pointer."}
          </Text>
        </View>
      )}

      <PointerIcon
        pseudoPointerMode={pseudoPointerMode}
        screenPosition={canvasPointToScreenPoint(pseudoPointerPos)}
      />

      <CoordinateHud coordinates={cursorCoordinates} scale={scale} />

      {
        // Todo: Make btn more easier to click
        // onTouchStart={(e) => { setLeftClick(!leftClick) }

        pseudoPointerMode && (
          <PointerModeBtn
            pseudoleftClick={pseudoLeftClick}
            setPseudoLeftClick={setPseudoLeftClick}
          />
        )
      }

      <BottomBarBtns
        buttonsContainerColor={buttonsContainerColor}
        onlyPanningMode={onlyPanningMode}
        pointerMode={pseudoPointerMode}
        pointerDrawMode={pseudoLeftClick}
        setPointerDrawMode={setPseudoLeftClick}
        setColorPickerModal={setColorPickerModal}
        activateStrokeMode={activateStrokeMode}
        activatePanMode={activatePanMode}
        activatePointerMode={activatePointerMode}
        activateEraserMode={activateEraserMode}
        confirmWipeCanvas={confirmWipeCanvas}
        shouldCollapse={false}
        eraserMode={eraserMode}
        resetViewportToContent={resetViewportToContent}
        smoothingEnabled={smoothingEnabled}
        setSmoothingEnabled={setSmoothingEnabled}
        shapeTool={shapeTool}
        activateShapeTool={activateShapeTool}
        lassoMode={lassoMode}
        rectangleSelectionMode={rectangleSelectionMode}
        activateLassoMode={activateLassoMode}
        activateRectangleSelectionMode={activateRectangleSelectionMode}
        selectedCount={selectedPathIndexes.length}
        eraserModeType={eraserModeType}
        setEraserModeType={setEraserModeType}
        eraserSize={eraserSize}
        setEraserSize={setEraserSize}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        strokeColorValue={strokeColorPreview}
        setStrokeColor={setStrokeColor}
      />

      <ClearCanvasDialog
        visible={clearCanvasDialogOpen}
        onCancel={() => setClearCanvasDialogOpen(false)}
        onConfirm={() => {
          setClearCanvasDialogOpen(false);
          wipeCanvas();
        }}
      />

      <ColorPickerModal
        customSwatches={customSwatches}
        onColorSelect={onColorSelect}
        setColorPickerModal={setColorPickerModal}
        showColorPickerModal={showColorPickerModal}
        strokeColor={strokeColor}
      />
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignContent: "center",
    height: "100%",
    width: "100%",
    zIndex: 50,
    backgroundColor: "#42465e97",
  },
  pickerContainer: {
    alignSelf: "center",
    width: "90%",
    maxWidth: 360,
    backgroundColor: "#303030",
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.34,
    shadowRadius: 6.27,

    elevation: 10,
  },
  hueContainer: {
    justifyContent: "center",
  },
  panelStyle: {
    width: "70%",
    height: "70%",
    alignSelf: "center",
    borderRadius: 16,
    zIndex: 50,
  },
  previewTxtContainer: {
    paddingTop: 20,
    marginTop: 20,
    borderTopWidth: 1,
    borderColor: "#bebdbe",
  },
  swatchesContainer: {
    paddingTop: 20,
    marginTop: 20,
    borderTopWidth: 1,
    borderColor: "#bebdbe",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 10,
  },
  swatchStyle: {
    borderRadius: 20,
    height: 30,
    width: 30,
    margin: 0,
    marginBottom: 0,
    marginHorizontal: 0,
    marginVertical: 0,
  },

  closeButton: {
    borderRadius: 8,
    marginTop: 12,
    paddingHorizontal: 40,
    paddingVertical: 10,
    alignSelf: "center",
    backgroundColor: "#303030",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,

    elevation: 5,
  },
});
export default InfiniteCanvas;

interface PointerIconProps {
  pseudoPointerMode: boolean;
  screenPosition: [number, number];
}

function CoordinateHud({
  coordinates,
  scale,
}: {
  coordinates: [number, number];
  scale: number;
}) {
  const zoomPercent = scale * 100;
  const zoomText =
    Math.abs(zoomPercent) >= 100000 || Math.abs(zoomPercent) < 0.01
      ? `${zoomPercent.toExponential(2)}%`
      : `${Math.max(0.01, zoomPercent).toFixed(zoomPercent < 10 ? 2 : 0)}%`;
  const showZoomWarning = scale < 0.05 || scale > 20;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 1200,
        backgroundColor: "rgba(18, 16, 32, 0.86)",
        borderColor: canvasToolTheme.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
    >
      <Text
        style={{
          color: canvasToolTheme.text,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        x {coordinates[0]} / y {coordinates[1]} / {zoomText}
        {showZoomWarning ? " / zoom may glitch" : ""}
      </Text>
    </View>
  );
}

const webTitle = (label: string) =>
  Platform.OS === "web"
    ? ({
        title: label,
        accessibilityLabel: label,
        dataSet: { tooltip: label },
      } as any)
    : {};

function SelectionOverlay({
  bounds,
  selectedCount,
  isDragging,
  isResizing,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onDuplicate,
  onDelete,
}: {
  bounds: { left: number; top: number; width: number; height: number };
  selectedCount: number;
  isDragging: boolean;
  isResizing: boolean;
  onPointerDown: (event: any) => void;
  onPointerMove: (event: any) => void;
  onPointerUp: (event: any) => void;
  onResizePointerDown: (event: any) => void;
  onResizePointerMove: (event: any) => void;
  onResizePointerUp: (event: any) => void;
  onDuplicate: () => void | Promise<void>;
  onDelete: () => void;
}) {
  const actions: Array<{
    label: string;
    icon: MaterialCommunityIconName | "copy-plus";
    action: () => void | Promise<void>;
  }> = [
    { label: "Duplicate", icon: "copy-plus", action: onDuplicate },
    { label: "Delete", icon: "trash-can-outline", action: onDelete },
  ];

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        zIndex: 300,
      }}
    >
      <View
        {...webTitle("Drag selected strokes")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{
          position: "absolute",
          top: -8,
          right: -8,
          bottom: -8,
          left: -8,
          borderColor: canvasToolTheme.accent,
          borderRadius: 6,
          borderStyle: "dashed",
          borderWidth: 1.5,
          cursor: (Platform.OS === "web" ? (isDragging ? "grabbing" : "grab") : undefined) as any,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: -48,
          left: 0,
          flexDirection: "row",
          gap: 6,
          padding: 5,
          borderRadius: 8,
          borderColor: canvasToolTheme.border,
          borderWidth: 1,
          backgroundColor: canvasToolTheme.bar,
          shadowColor: "#000",
          shadowOpacity: 0.28,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <View
          {...webTitle(`Move selection (${selectedCount} selected)`)}
          style={{
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 8,
            backgroundColor: canvasToolTheme.buttonActive,
          }}
        >
          <MCIcon name="cursor-move" size={19} color={canvasToolTheme.foreground} />
        </View>
        {actions.map((actionItem) => {
          return (
            <Pressable
              key={actionItem.label}
              {...webTitle(actionItem.label)}
              accessibilityLabel={actionItem.label}
              onPress={actionItem.action}
              style={{
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: canvasToolTheme.button,
              }}
            >
              {actionItem.icon === "copy-plus" ? (
                <CopyPlusIcon
                  size={19}
                  color={canvasToolTheme.foreground}
                  plusColor={canvasToolTheme.accent}
                />
              ) : (
                <MCIcon
                  name={actionItem.icon}
                  size={19}
                  color={
                    actionItem.label === "Delete"
                      ? "#ff8d9b"
                      : canvasToolTheme.foreground
                  }
                />
              )}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        {...webTitle("Resize selection")}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerLeave={onResizePointerUp}
        style={{
          alignItems: "center",
          justifyContent: "center",
          position: "absolute",
          right: -13,
          bottom: -13,
          width: 26,
          height: 26,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: canvasToolTheme.border,
          backgroundColor: isResizing
            ? canvasToolTheme.buttonActive
            : canvasToolTheme.button,
          cursor: (Platform.OS === "web" ? "nwse-resize" : undefined) as any,
        }}
      >
        <MCIcon name="resize-bottom-right" size={16} color={canvasToolTheme.accent} />
      </Pressable>
    </View>
  );
}

function CanvasContextMenu({
  menu,
  canPaste,
  onPaste,
  onInsertImage,
  onInsertShape,
  onClose,
}: {
  menu: NonNullable<CanvasContextMenuState>;
  canPaste: boolean;
  onPaste: () => void | Promise<void>;
  onInsertImage: () => void | Promise<void>;
  onInsertShape: () => void;
  onClose: () => void;
}) {
  const items: Array<{
    label: string;
    icon: MaterialCommunityIconName;
    action: () => void | Promise<void>;
    disabled: boolean;
  }> = [
    {
      label: "Paste here",
      icon: "content-paste",
      action: onPaste,
      disabled: !canPaste,
    },
    {
      label: "Insert image",
      icon: "image-plus",
      action: onInsertImage,
      disabled: false,
    },
    {
      label: "Insert shape",
      icon: "shape-plus-outline",
      action: onInsertShape,
      disabled: false,
    },
  ];

  return (
    <View
      style={{
        position: "absolute",
        left: menu.screenX,
        top: menu.screenY,
        zIndex: 1600,
      }}
    >
      <Pressable
        {...webTitle("Close canvas menu")}
        onPress={onClose}
        style={
          Platform.OS === "web"
            ? ({
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              } as any)
            : undefined
        }
      />
      <View
        style={{
          backgroundColor: canvasToolTheme.bar,
          borderColor: canvasToolTheme.border,
          borderRadius: 8,
          borderWidth: 1,
          minWidth: 190,
          padding: 6,
          shadowColor: "#000",
          shadowOpacity: 0.28,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        {items.map((item) => (
          <Pressable
            key={item.label}
            {...webTitle(item.label)}
            accessibilityLabel={item.label}
            disabled={item.disabled}
            onPress={item.action}
            style={{
              alignItems: "center",
              borderRadius: 6,
              flexDirection: "row",
              gap: 8,
              minHeight: 36,
              opacity: item.disabled ? 0.45 : 1,
              paddingHorizontal: 10,
            }}
          >
            <MCIcon
              name={item.icon}
              size={18}
              color={canvasToolTheme.foreground}
            />
            <Text
              style={{
                color: canvasToolTheme.text,
                fontSize: 12,
                fontWeight: "800",
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ClearCanvasDialog({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.58)",
          padding: 20,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: canvasToolTheme.border,
            backgroundColor: "rgba(12, 12, 18, 0.96)",
            padding: 16,
            gap: 12,
          }}
        >
          <Text
            style={{
              color: canvasToolTheme.text,
              fontSize: 16,
              fontWeight: "900",
            }}
          >
            Clear canvas?
          </Text>
          <Text
            style={{
              color: canvasToolTheme.muted,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            This removes every stroke and image from this drawing.
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <Pressable
              {...webTitle("Cancel")}
              onPress={onCancel}
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: canvasToolTheme.border,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: canvasToolTheme.button,
              }}
            >
              <Text style={{ color: canvasToolTheme.text, fontWeight: "800" }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              {...webTitle("Clear canvas")}
              onPress={onConfirm}
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "rgba(255, 141, 155, 0.42)",
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: "rgba(112, 16, 32, 0.72)",
              }}
            >
              <Text style={{ color: "#ffd9de", fontWeight: "900" }}>
                Clear
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PointerIcon({
  pseudoPointerMode: pointerMode,
  screenPosition,
}: PointerIconProps) {
  return (
    <View
      style={{
        position: "absolute",
        left: screenPosition[0] - 5,
        top: screenPosition[1] - 5,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: canvasToolTheme.accent,
        backgroundColor: "#ffffff",
        zIndex: 1300,
        display: pointerMode ? "flex" : "none",
        padding: 0,
        margin: 0,
      }}
    />
  );
}

interface PointerModeBtnProps {
  pseudoleftClick: boolean;
  setPseudoLeftClick: React.Dispatch<React.SetStateAction<boolean>>;
}

function PointerModeBtn({
  pseudoleftClick: leftClick,
  setPseudoLeftClick: setLeftClick,
}: PointerModeBtnProps) {
  return (
    <Pressable
      {...webTitle(leftClick ? "Pointer draw mode" : "Pointer move mode")}
      onPress={(e) => {
        setLeftClick((value) => !value);
      }}
    >
      <View
        style={{
          borderWidth: 2,
          paddingHorizontal: 10,
          marginBottom: 4,
          borderRadius: 4,
          borderColor: canvasToolTheme.border,
          backgroundColor: "transparent",
        }}
      >
        <MCIcon
          name={leftClick ? "pencil-outline" : "circle-small"}
          size={24}
          color={leftClick ? canvasToolTheme.foreground : canvasToolTheme.accent}
        />
      </View>
    </Pressable>
  );
}

interface BottomBarBtnsProps {
  buttonsContainerColor: string;
  onlyPanningMode: boolean;
  pointerMode: boolean;
  pointerDrawMode: boolean;
  setPointerDrawMode: React.Dispatch<React.SetStateAction<boolean>>;
  setColorPickerModal: React.Dispatch<React.SetStateAction<boolean>>;
  activateStrokeMode: () => void;
  activatePanMode: () => void;
  activatePointerMode: () => void;
  activateEraserMode: () => void;
  confirmWipeCanvas: () => void;
  shouldCollapse: boolean;
  eraserMode: boolean;
  resetViewportToContent: () => void;
  smoothingEnabled: boolean;
  setSmoothingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  shapeTool: ShapeTool;
  activateShapeTool: (tool: ShapeTool) => void;
  lassoMode: boolean;
  rectangleSelectionMode: boolean;
  activateLassoMode: () => void;
  activateRectangleSelectionMode: () => void;
  selectedCount: number;
  eraserModeType: EraserModeType;
  setEraserModeType: React.Dispatch<React.SetStateAction<EraserModeType>>;
  eraserSize: number;
  setEraserSize: React.Dispatch<React.SetStateAction<number>>;
  strokeWidth: number;
  setStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  strokeColorValue: string;
  setStrokeColor: (color: string) => void;
}

function BottomBarBtns({
  buttonsContainerColor,
  onlyPanningMode,
  pointerMode,
  pointerDrawMode,
  setPointerDrawMode,
  setColorPickerModal,
  activateStrokeMode,
  activatePanMode,
  activatePointerMode,
  activateEraserMode,
  confirmWipeCanvas,
  shouldCollapse,
  eraserMode,
  resetViewportToContent,
  smoothingEnabled,
  setSmoothingEnabled,
  shapeTool,
  activateShapeTool,
  lassoMode,
  rectangleSelectionMode,
  activateLassoMode,
  activateRectangleSelectionMode,
  selectedCount,
  eraserModeType,
  setEraserModeType,
  eraserSize,
  setEraserSize,
  strokeWidth,
  setStrokeWidth,
  strokeColorValue,
  setStrokeColor,
}: BottomBarBtnsProps) {
  const height = useSharedValue(0);
  const [toolMenu, setToolMenu] = useState<CanvasToolMenuId>(null);

  const getHeight = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;

    if (h) {
      height.value = h;
    }
  };

  const collapseAnim = useAnimatedStyle(() => {
    return {
      marginBottom: withSpring(!shouldCollapse ? 0 : -height.value, {
        duration: 500,
      }),
    };
  }, [shouldCollapse, height]);

  const toolButtonStyle = {
    alignItems: "center" as const,
    backgroundColor: canvasToolTheme.button,
    borderColor: canvasToolTheme.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 48,
    justifyContent: "center" as const,
    width: 48,
  };

  const activeToolButtonStyle = {
    backgroundColor: canvasToolTheme.buttonActive,
  };
  const runFromMenu = (action: () => void) => {
    action();
    setToolMenu(null);
  };

  const shapeOptions: Array<{
    label: string;
    tool: ShapeTool;
    icon: MaterialCommunityIconName;
  }> = [
    { label: "Pen", tool: "freehand", icon: "pencil-outline" },
    { label: "Line", tool: "line", icon: "vector-line" },
    { label: "Rect", tool: "rectangle", icon: "rectangle-outline" },
    { label: "Oval", tool: "ellipse", icon: "ellipse-outline" },
  ];

  const openMenu = (menu: Exclude<CanvasToolMenuId, null>) => {
    setToolMenu((current) => (current === menu ? null : menu));
  };

  const menuTriggerProps = (menu: Exclude<CanvasToolMenuId, null>) =>
    ({
      onLongPress: () => setToolMenu(menu),
      ...(Platform.OS === "web"
        ? {
            onContextMenu: (event: any) => {
              event.preventDefault?.();
              event.stopPropagation?.();
              setToolMenu(menu);
            },
          }
        : {}),
    }) as any;

  const menuButtonStyle = {
    alignItems: "center" as const,
    backgroundColor: canvasToolTheme.button,
    borderColor: canvasToolTheme.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 10,
  };

  const menuCategoryTitle = (label: string) => (
    <Text
      style={{
        color: canvasToolTheme.muted,
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 0,
        textTransform: "uppercase",
      }}
    >
      {label}
    </Text>
  );

  const MenuOption = ({
    label,
    icon,
    active,
    onPress,
  }: {
    label: string;
    icon: MaterialCommunityIconName;
    active?: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      {...webTitle(label)}
      onPress={() => runFromMenu(onPress)}
      style={[menuButtonStyle, active && activeToolButtonStyle]}
    >
      <MCIcon
        name={icon}
        size={18}
        color={active ? canvasToolTheme.accent : canvasToolTheme.foreground}
      />
      <Text
        style={{
          color: canvasToolTheme.text,
          fontSize: 12,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const InlineSizeSlider = ({
    label,
    value,
    onChange,
    color,
    minimumValue = 1,
    maximumValue = 56,
  }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    color: string;
    minimumValue?: number;
    maximumValue?: number;
  }) => {
    const previewSize = Math.max(4, Math.min(value, 40));

    return (
      <View
        style={{
          gap: 6,
          minWidth: 220,
          maxWidth: 270,
        }}
      >
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              color: canvasToolTheme.text,
              fontSize: 12,
              fontWeight: "800",
            }}
          >
            {label}: {Math.round(value)}
          </Text>
          <View
            pointerEvents="none"
            style={{
              alignItems: "center",
              height: 42,
              justifyContent: "center",
              width: 42,
            }}
          >
            <View
              style={{
                backgroundColor: color,
                borderColor: "rgba(255,255,255,0.7)",
                borderRadius: previewSize / 2,
                borderWidth: 1,
                height: previewSize,
                width: previewSize,
              }}
            />
          </View>
        </View>
        <Slider
          containerStyle={{
            height: 34,
            width: "100%",
          }}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          step={1}
          value={value}
          onValueChange={(nextValue) => {
            const rawValue = Array.isArray(nextValue) ? nextValue[0] : nextValue;
            onChange(Math.round(Number(rawValue)));
          }}
          minimumTrackTintColor={canvasToolTheme.accent}
          maximumTrackTintColor="rgba(255,255,255,0.32)"
          thumbTintColor={color}
        />
      </View>
    );
  };

  const ColorSwatch = ({
    color,
    label,
    custom,
  }: {
    color: string;
    label: string;
    custom?: boolean;
  }) => (
    <Pressable
      {...webTitle(label)}
      accessibilityLabel={label}
      onPress={() =>
        custom
          ? runFromMenu(() => setColorPickerModal(true))
          : setStrokeColor(color)
      }
      style={{
        alignItems: "center",
        borderColor: "rgba(255,255,255,0.38)",
        borderRadius: 999,
        borderWidth: 1,
        height: 30,
        justifyContent: "center",
        overflow: "hidden",
        width: 30,
        ...(Platform.OS === "web" && custom
          ? ({
              backgroundImage:
                "conic-gradient(#ff4d6d, #ffd166, #06d6a0, #4cc9f0, #7b2cbf, #ff4d6d)",
            } as any)
          : { backgroundColor: color }),
      }}
    >
      {custom && Platform.OS !== "web" && (
        <MCIcon name="palette-outline" size={18} color="#ffffff" />
      )}
    </Pressable>
  );

  const ToolButton = ({
    label,
    icon,
    active,
    onPress,
    menu,
  }: {
    label: string;
    icon: MaterialCommunityIconName;
    active?: boolean;
    onPress: () => void;
    menu?: Exclude<CanvasToolMenuId, null>;
  }) => (
    <Pressable
      {...webTitle(label)}
      {...(menu ? menuTriggerProps(menu) : {})}
      onPress={() => {
        if (menu && active) {
          openMenu(menu);
          return;
        }

        setToolMenu(null);
        onPress();
      }}
      style={[toolButtonStyle, active && activeToolButtonStyle]}
      android_ripple={{ color: "#1c1c1c" }}
    >
      <MCIcon
        name={icon}
        size={23}
        color={active ? canvasToolTheme.accent : canvasToolTheme.foreground}
      />
    </Pressable>
  );

  const renderToolMenu = () => {
    if (!toolMenu) return null;

    return (
      <View
        style={{
          alignSelf: "center",
          backgroundColor: "rgba(10, 10, 16, 0.96)",
          borderColor: canvasToolTheme.border,
          borderRadius: 8,
          borderWidth: 1,
          gap: 10,
          marginBottom: 8,
          maxWidth: 360,
          padding: 10,
          ...(Platform.OS === "web"
            ? ({ backdropFilter: "blur(14px)" } as any)
            : {}),
        }}
      >
        {toolMenu === "stroke" && (
          <>
            {menuCategoryTitle("Stroke")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PASTEL_SWATCHES.map((color, index) => (
                <ColorSwatch
                  key={color}
                  color={color}
                  label={`Pastel color ${index + 1}`}
                />
              ))}
              <ColorSwatch color={strokeColorValue} label="Custom color" custom />
              <MenuOption
                label={smoothingEnabled ? "Smoothing on" : "Smoothing off"}
                icon="chart-bell-curve-cumulative"
                active={smoothingEnabled}
                onPress={() => setSmoothingEnabled((enabled) => !enabled)}
              />
            </View>
            <InlineSizeSlider
              label="Stroke size"
              value={strokeWidth}
              onChange={setStrokeWidth}
              color={strokeColorValue}
              minimumValue={1}
              maximumValue={50}
            />
            {menuCategoryTitle("Shapes")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {shapeOptions.map((option) => (
                <MenuOption
                  key={option.tool}
                  label={option.label}
                  icon={option.icon}
                  active={shapeTool === option.tool}
                  onPress={() => activateShapeTool(option.tool)}
                />
              ))}
            </View>
          </>
        )}

        {toolMenu === "selection" && (
          <>
            {menuCategoryTitle("Selection")}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text
                style={{
                  color: canvasToolTheme.text,
                  fontSize: 12,
                  fontWeight: "800",
                }}
              >
                {selectedCount} selected
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <MenuOption
                label="Lasso"
                icon="select-drag"
                active={lassoMode}
                onPress={activateLassoMode}
              />
              <MenuOption
                label="Rectangle select"
                icon="selection-drag"
                active={rectangleSelectionMode}
                onPress={activateRectangleSelectionMode}
              />
            </View>
          </>
        )}

        {toolMenu === "eraser" && (
          <>
            {menuCategoryTitle("Eraser")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <MenuOption
                label="Erase strokes"
                icon="vector-polyline-remove"
                active={eraserModeType === "stroke"}
                onPress={() => setEraserModeType("stroke")}
              />
              <MenuOption
                label="Erase points"
                icon="eraser"
                active={eraserModeType === "point"}
                onPress={() => setEraserModeType("point")}
              />
            </View>
            <InlineSizeSlider
              label="Eraser size"
              value={eraserSize}
              onChange={setEraserSize}
              color={eraserModeType === "stroke" ? "#ff3b5f" : canvasToolTheme.accent}
              minimumValue={4}
              maximumValue={72}
            />
          </>
        )}

        {toolMenu === "pointer" && (
          <>
            {menuCategoryTitle("Offset Pointer")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <MenuOption
                label="Draw from pointer"
                icon="pencil-outline"
                active={pointerMode && pointerDrawMode}
                onPress={() => {
                  if (!pointerMode) activatePointerMode();
                  setPointerDrawMode(true);
                }}
              />
              <MenuOption
                label="Move pointer"
                icon="circle-small"
                active={pointerMode && !pointerDrawMode}
                onPress={() => {
                  if (!pointerMode) activatePointerMode();
                  setPointerDrawMode(false);
                }}
              />
            </View>
          </>
        )}

        {toolMenu === "canvas" && (
          <>
            {menuCategoryTitle("Canvas")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <MenuOption
                label="Center content"
                icon="crosshairs-gps"
                onPress={resetViewportToContent}
              />
              <MenuOption
                label="Clear canvas"
                icon="trash-can-outline"
                onPress={confirmWipeCanvas}
              />
            </View>
          </>
        )}
      </View>
    );
  };

  return (
    <Animated.View
      onLayout={getHeight}
      style={[
        {
          alignItems: "center",
          position: "relative",
          width: "100%",
          zIndex: 100,
          ...Platform.select({ web: { userSelect: "none" } as any }),
        },
        collapseAnim,
      ]}
    >
      {toolMenu && Platform.OS === "web" && (
        <Pressable
          {...webTitle("Close tool menu")}
          onPress={() => setToolMenu(null)}
          style={
            {
              bottom: 0,
              left: 0,
              position: "fixed",
              right: 0,
              top: 0,
              zIndex: 90,
            } as any
          }
        />
      )}
      {renderToolMenu()}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          alignSelf: "center",
          maxWidth: 430,
          width: "92%",
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(0,0,0,0.78)",
          zIndex: 100,
          position: "relative",
          ...(Platform.OS === "web"
            ? ({ backdropFilter: "blur(14px)" } as any)
            : {}),
        }}
      >
        <ToolButton
          label="Stroke mode"
          icon={
            shapeOptions.find((option) => option.tool === shapeTool)?.icon ??
            "pencil-outline"
          }
          active={
            !onlyPanningMode &&
            !pointerMode &&
            !eraserMode &&
            !lassoMode &&
            !rectangleSelectionMode
          }
          onPress={activateStrokeMode}
          menu="stroke"
        />
        <ToolButton
          label={rectangleSelectionMode ? "Rectangle select" : "Lasso select"}
          icon={rectangleSelectionMode ? "selection-drag" : "select-drag"}
          active={lassoMode || rectangleSelectionMode}
          onPress={activateLassoMode}
          menu="selection"
        />
        <ToolButton
          label="Move canvas"
          icon="hand-back-right-outline"
          active={onlyPanningMode}
          onPress={activatePanMode}
        />
        <ToolButton
          label={eraserModeType === "point" ? "Erase points" : "Erase strokes"}
          icon={eraserModeType === "point" ? "eraser" : "eraser-variant"}
          active={eraserMode}
          onPress={activateEraserMode}
          menu="eraser"
        />
        <ToolButton
          label={pointerDrawMode ? "Pointer draw mode" : "Pointer move mode"}
          icon={pointerDrawMode ? "pencil-outline" : "cursor-default-outline"}
          active={pointerMode}
          onPress={activatePointerMode}
          menu="pointer"
        />
        <ToolButton
          label="Canvas options"
          icon="dots-horizontal"
          active={toolMenu === "canvas"}
          onPress={() => openMenu("canvas")}
          menu="canvas"
        />
      </View>
    </Animated.View>
  );
}

interface ColorPickerModalProps {
  customSwatches: string[];
  onColorSelect: (color: ColorFormatsObject) => void;
  setColorPickerModal: React.Dispatch<React.SetStateAction<boolean>>;
  showColorPickerModal: boolean;
  strokeColor: SharedValue<string>;
}

function ColorPickerModal({
  customSwatches,
  onColorSelect,
  setColorPickerModal,
  showColorPickerModal,
  strokeColor,
}: ColorPickerModalProps) {
  return (
    <Modal
      onRequestClose={() => setColorPickerModal(false)}
      visible={showColorPickerModal}
      animationType="fade"
      transparent={true}
    >
      <BlurView
        intensity={20}
        style={{
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
        }}
      >
        <Animated.View
          style={[styles.container]}
          onPointerUp={() => setColorPickerModal(false)}
        >
          <View
            style={styles.pickerContainer}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <ColorPicker
              value={strokeColor.value}
              sliderThickness={20}
              thumbSize={24}
              onChange={onColorSelect}
              boundedThumb
            >
              <HueCircular
                containerStyle={styles.hueContainer}
                thumbShape="pill"
              >
                <Panel1 style={styles.panelStyle} />
              </HueCircular>
              <Swatches
                style={styles.swatchesContainer}
                swatchStyle={styles.swatchStyle}
                colors={customSwatches}
              />
              <View style={styles.previewTxtContainer}>
                <PreviewText style={{ color: "#707070" }} colorFormat="hsl" />
              </View>
            </ColorPicker>
          </View>

          <Pressable
            {...webTitle("Close color picker")}
            style={styles.closeButton}
            onPress={() => setColorPickerModal(false)}
          >
            <Text style={{ color: "#707070", fontWeight: "bold" }}>Close</Text>
          </Pressable>
        </Animated.View>
      </BlurView>
    </Modal>
  );
}

interface DraggableAndResizableImgProps {
  uri: string;
  x: number;
  y: number;
  setBlockDrawing: React.Dispatch<React.SetStateAction<boolean>>;
  offset: [number, number];
  scale: number;
}

interface WebViewStyle extends ViewStyle {
  resize?: string;
}

const webWrapperStyles: WebViewStyle = {
  overflow: "scroll",
  resize: "both",
};

const DraggableAndResizableImg = ({
  uri,
  x,
  y,
  setBlockDrawing: setShouldBlockDrawing,
  offset,
  scale,
}: DraggableAndResizableImgProps) => {
  const imgRef = useRef<Image>(null);
  const wrapperRef = useRef<View>(null);

  const [canDrag, setCanDrag] = useState(true);

  const styles = StyleSheet.create({
    draggableContainer: {
      position: "absolute",
      width: 100,
      height: 100,
      zIndex: 1,
      transformOrigin: "top left",
      ...Platform.select({
        web: {
          overflow: "hidden",
          resize: "both",
        },
      }),
    },
    image: {
      width: "100%",
      height: "100%",
      ...(Platform.OS === "web" ? { touchAction: "none" } : {}),
    },
  });

  // const ranOnce = useRef(false);

  const observedElements = new Set<Element>();

  var ro: ResizeObserver;

  const width = useSharedValue(0);
  const height = useSharedValue(0);

  const onImgLoad = (e: any) => {
    const el = imgRef.current?.nativeViewRef?.current as unknown as HTMLImageElement | null;

    if (Platform.OS == "web") {
      if (el) {

      }
      ro = new ResizeObserver((entries) => {
        for (let entry of entries) {
          const el = entry.target as HTMLImageElement;

          if (el.width !== width.value || el.height !== height.value) {
            width.value = el.width;
            height.value = el.height;
          }

          if (!observedElements.has(el)) {
            observedElements.add(el);
            // Skip the initial observation
            continue;
          }

          setCanDrag(false);

          // console.log("resize");

          // const cr = entry.contentRect;
          // if (!ranOnce.current) {
          //   ranOnce.current = true;
          //   return;
          // }

          // console.log("Element:", entry.target);
          // console.log(`Element size: ${cr.width}px x ${cr.height}px`);
          // console.log(`Element padding: ${cr.top}px ; ${cr.left}px`);
        }
      });

      // console.log("el", el);
      if (el) {
        ro.observe(el);
      }
    }

    return () => {
      const el = imgRef.current?.nativeViewRef?.current as unknown as HTMLImageElement | null;

      if (Platform.OS == "web") {
        if (el) {
          ro.unobserve(el);
        }

        ro.disconnect();
      }
    };
  };

  const handlePointerStart = (e: any) => {
    e.preventDefault();
    setShouldBlockDrawing(true);
  };

  const handlePointerEnd = (e: any) => {
    setShouldBlockDrawing(false);

    setCanDrag((prev) => !prev);
  };

  // Store translation values
  const translationX = useSharedValue(x);
  const translationY = useSharedValue(y);
  const lastTranslationX = useSharedValue(x);
  const lastTranslationY = useSharedValue(y);

  // const origin = [
  //   translationX.value,
  //   translationY.value
  // ]

  // const recenterScalingX = -origin[0] * (scale - 1);
  // const recenterScalingY = -origin[1] * (scale - 1);

  // const x = translationX.value + recenterScalingX;
  // const y = translationY.value + recenterScalingY;

  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: offset[0] + translationX.value * scale,
      },
      {
        translateY: offset[1] + translationY.value * scale,
      },
      { scale: scale },
    ],
  }));

  const panGesture = Gesture.Pan()
    .onStart(() => {
      // Initialize the gesture at the last known position
      translationX.value = lastTranslationX.value;
      translationY.value = lastTranslationY.value;
    })
    .onUpdate((event) => {
      // Update the translation dynamically
      translationX.value = lastTranslationX.value + event.translationX / scale;
      translationY.value = lastTranslationY.value + event.translationY / scale;
    })
    .onEnd(() => {
      // Store the final position so it doesn't reset
      lastTranslationX.value = translationX.value;
      lastTranslationY.value = translationY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      setShouldBlockDrawing(true);
    });

  const activeGesture = canDrag ? panGesture : panGesture.enabled(false);

  const composedGesture = Gesture.Simultaneous(activeGesture, doubleTapGesture);

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[styles.draggableContainer, dragStyle]}
        onPointerDown={(e) => {
          setShouldBlockDrawing(true);
        }}
        onPointerUp={(e) => {
          setShouldBlockDrawing(false);
          setCanDrag(true);
        }}
        onPointerLeave={(e) => {
          setShouldBlockDrawing(false);
          setCanDrag(true);
        }}
      >
        <Image
          source={{ uri }}
          style={styles.image}
          ref={imgRef}
          draggable={false}
          // onLoadEnd={handleImgLoad}
          onLoad={(e) => {
            onImgLoad(e);
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
};

interface TopBtnsBarProps {
  buttonsContainerColor: string;
  curIdx: number;
  itemsAmount: number;
  setCurIdx: React.Dispatch<React.SetStateAction<number>>;
}

function TopBtnsBar({
  buttonsContainerColor,
  curIdx,
  itemsAmount,
  setCurIdx: setCurIdx,
}: TopBtnsBarProps) {
  const canUndo = curIdx >= 0;
  const canRedo = curIdx < itemsAmount - 1;

  const activeColor = "#ffffff";
  const disabledColor = "#9a9a9a";
  const topButtonStyle = {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.72)",
    zIndex: 1000,
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 0,

        width: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 1000,
        // backgroundColor: buttonsContainerColor,
      }}
    >
      <View></View>

      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 8,
          paddingVertical: 6,
          gap: 8,
          borderColor: "rgba(255,255,255,0.08)",
          borderBottomWidth: 1,
          backgroundColor: "rgba(0,0,0,0.78)",
          zIndex: 1000,
          ...(Platform.OS === "web"
            ? ({ backdropFilter: "blur(16px)" } as any)
            : {}),
        }}
      >
        <Pressable
          {...webTitle("Undo")}
          style={topButtonStyle}
          onPress={() => {
            // const lastPath = savedPaths.pop();
            // setPaths(savedPaths);
            if (canUndo) {
              // setPaths([...savedPaths.slice(0, curIdx - 1)]);
              // setCurPath('');
              setCurIdx(curIdx - 1);
            }
          }}
        >
          <Icon
            name="undo"
            size={24}
            color={canUndo ? activeColor : disabledColor}
          />
        </Pressable>

        <Pressable
          {...webTitle("Redo")}
          style={topButtonStyle}
          onPress={() => {
            if (canRedo) {
              // setPaths([...savedPaths, nextPath]);
              // setCurPath('');
              setCurIdx(curIdx + 1);
            }
          }}
        >
          <Icon
            name="redo"
            size={24}
            color={canRedo ? activeColor : disabledColor}
          />
        </Pressable>
      </View>
    </View>
  );
}




