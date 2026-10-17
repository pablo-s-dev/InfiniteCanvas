import { useCanvasSelectionInteractions } from "./useCanvasSelectionInteractions";
import { useScribbleEraseFreeze } from "./useScribbleEraseFreeze";
import { pathIntersectsPolygon } from "../selectionGeometry";
import { translatePathData, scalePathData } from "../pathTransforms";
import { isShapeTool } from "../pathGeometry";
import { useState, useEffect, useRef } from "react";
import { View, Dimensions, GestureResponderEvent, NativeTouchEvent, Platform, LayoutChangeEvent } from "react-native";
import Svg from "react-native-svg";
import type { ColorFormatsObject } from "reanimated-color-picker";
import { useSharedValue } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import { Image as NativeImage } from "react-native";
import * as Clipboard from "expo-clipboard";
import { drawingRepository } from "../../documents/drawingRepository";
import { CANVAS_DOCUMENT_VERSION, type CanvasDrawingData, type CanvasEraseItem, type CanvasImageItem, type CanvasPathItem, type CanvasViewport, isCanvasDrawingData } from "../document";
import { splitPolylineByErasePath } from "../pointEraser";
import { CANVAS_EMBED_PROTOCOL_VERSION, isCanvasHostMessage, type CanvasClientMessage } from "../embedProtocol";
import { ERASER_TRAIL_DURATION_MS, ERASER_TRAIL_SIZE_PX, eraserTrailPath, eraserTrailPointsAtTime, type EraserTrailPoint } from "../eraserTrail";
import { useCanvasToolTheme } from "../../../shared/theme/ThemeContext";
import { zIndexCssVariables } from "../../../shared/theme/zIndex";
import { jsonStorage } from "../../../shared/storage/jsonStorage";
import { PASTEL_SWATCHES } from "../canvasConstants";
import type { DrawingItem, ShapeTool, CanvasClipboardSelection, CanvasToolPreferences, CanvasPreferences, WebPointerMode, SelectionMode, EraserModeType, SelectionBounds, CanvasContextMenuState, CanvasEditorProps } from "../canvasTypes";
import { createCanvasItemId, getPanOffsetDelta, getVisibleCanvasItems, mapCanvasItemPaths } from "../canvasHistory";
import { buildSmoothedPath, buildShapePath, extractPathPoints, getBounds, expandBounds, getPathItemBounds, boundsIntersect, mergeBounds, pathPointsIntersectPoint, clampScribbleSensitivity } from "../pathGeometry";
export function useCanvasController({ localDrawingId, onCanvasDataChange, canvasBackgroundColor = "#000000", }: CanvasEditorProps = {}) {
 const canvasToolTheme = useCanvasToolTheme();

    const CANVAS_TOOL_PREFS_KEY = "infinite-canvas:canvas-tool-preferences";
    const canvasRef = useRef<View>(null);
    const svgRef = useRef<Svg>(null);
    const canvasOriginRef = useRef<[
        number,
        number
    ] | null>(null);
    const nativeTouchActiveRef = useRef(false);
    const widthRef = useRef<number>(0);
    const heightRef = useRef<number>(0);
    const [canvasItems, setItems] = useState<DrawingItem[]>([]);
    const [curPath, setCurPath] = useState<string>("");
    const currentStrokePointsRef = useRef<[
        number,
        number
    ][]>([]);
    const shapeStartRef = useRef<[
        number,
        number
    ] | null>(null);
    const lassoPointsRef = useRef<[
        number,
        number
    ][]>([]);
    const clipboardSelectionRef = useRef<CanvasClipboardSelection | null>(null);
    const [panningOffset, setPanningOffset] = useState<number[]>([0, 0]);
    const [focusOffset, setFocusOffset] = useState<number[]>([0, 0]);
    const [focusPos, setFocusPos] = useState<number[]>([0, 0]);
    const [curIdx, setCurIdx] = useState<number>(-1);
    const [scale, setScale] = useState<number>(1);
    const prevFingersPos = useRef<number[][]>([]);
    const prevTwoFingerDist = useRef<number>(0);
    const nativeTwoFingerGestureActiveRef = useRef(false);
    const nativeTwoFingerCentroidRef = useRef<[
        number,
        number
    ]>([0, 0]);
    const [strokeWidth, setStrokeWidth] = useState<number>(2);
    const [smoothingEnabled, setSmoothingEnabled] = useState<boolean>(true);
    const [shapeTool, setShapeTool] = useState<ShapeTool>("freehand");
    const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
    const lassoMode = selectionMode === "lasso";
    const rectangleSelectionMode = selectionMode === "rectangle";
    const setLassoMode = (active: boolean) => setSelectionMode((current) => (active ? "lasso" : current === "lasso" ? null : current));
    const setRectangleSelectionMode = (active: boolean) => setSelectionMode((current) => active ? "rectangle" : current === "rectangle" ? null : current);
    const [lassoPath, setLassoPath] = useState<string>("");
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
    const [selectedPathIndexes, setSelectedPathIndexes] = useState<number[]>([]);
    const rectangleSelectionStartRef = useRef<[
        number,
        number
    ] | null>(null);
    useEffect(() => {
        jsonStorage
            .get<Partial<CanvasToolPreferences>>(CANVAS_TOOL_PREFS_KEY)
            .then((preferences) => {
            if (!preferences)
                return;
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
    const center = useRef<number[]>([0, 0]);
    const onCanvasLayout = (event: LayoutChangeEvent) => {
        // alert("lay")
        const { width, height } = event.nativeEvent.layout;
        widthRef.current = width;
        heightRef.current = height;
        canvasRef.current?.measureInWindow?.((x, y) => {
            canvasOriginRef.current = [x, y];
        });
        // console.log("new center");
        center.current = [width / 2, height / 2];
        if (pseudoPointerPosRef.current[0] === 0 &&
            pseudoPointerPosRef.current[1] === 0) {
            setPointerPos(screenPointToCanvasPoint(width / 2, height / 2, scale));
        }
        // setFocusOffset(center.current);
        // console.log(center.current);
    };
    const getCanvasTouchPosition = (touchPoint: NativeTouchEvent): [
        number,
        number
    ] => {
        const origin = canvasOriginRef.current;
        if (origin &&
            Number.isFinite(touchPoint.pageX) &&
            Number.isFinite(touchPoint.pageY)) {
            return [touchPoint.pageX - origin[0], touchPoint.pageY - origin[1]];
        }
        return [touchPoint.locationX, touchPoint.locationY];
    };
    const [onlyPanningMode, setPanningGesture] = useState<boolean>(false);
    const [middlePanning, setMiddlePanning] = useState(false);
    const middlePanRef = useRef<{pointerId?: number; target: HTMLElement; position: [number, number]} | null>(null);
    const [shouldBlockDrawing, setShouldBlockDrawing] = useState<boolean>(false);
    const [canvasPreferences, setCanvasPreferences] = useState<CanvasPreferences>({
        pencilDrawsFingerPans: false,
        scribbleEraseEnabled: true,
        scribbleEraseSensitivity: 1,
    });
    const webPointerModeRef = useRef<WebPointerMode>(null);
    const webPointerLastPositionRef = useRef<[
        number,
        number
    ] | null>(null);
    const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState>(null);
    const [clearCanvasDialogOpen, setClearCanvasDialogOpen] = useState(false);
    const [showColorPickerModal, setColorPickerModal] = useState(false);
    const customSwatches = PASTEL_SWATCHES;
    const [strokeColorPreview, setStrokeColorPreview] = useState(customSwatches[0]);
    const strokeColor = useSharedValue<string>(customSwatches[0]);
    const [pseudoPointerMode, setVirtualPointerMode] = useState<boolean>(false);
    const [pseudoLeftClick, setPseudoLeftClick] = useState<boolean>(true);
    const [pointerHintVisible, setPointerHintVisible] = useState(false);
    const [pseudoPointerPos, setPointerPosState] = useState<[
        number,
        number
    ]>([0, 0]);
    const pseudoPointerPosRef = useRef<[
        number,
        number
    ]>([0, 0]);
    const setPointerPos = (position: [
        number,
        number
    ]) => {
        pseudoPointerPosRef.current = position;
        setPointerPosState(position);
    };
    const [cursorCoordinates, setCursorCoordinates] = useState<[
        number,
        number
    ]>([
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
    const [eraserPreviewOpacity, setEraserPreviewOpacity] = useState(0);
    const [pendingEraseItemIds, setPendingEraseItemIds] = useState<string[]>([]);
    const pendingEraseItemIdsRef = useRef<Set<string>>(new Set());
    const eraserTrailPointsRef = useRef<EraserTrailPoint[]>([]);
    const eraserTrailFrameRef = useRef<number | null>(null);
    const eraserHoveringRef = useRef(false);
    const eraserGestureActiveRef = useRef(false);
    const eraserPointerIdRef = useRef<number | null>(null);
    useEffect(() => () => {
        if (eraserTrailFrameRef.current !== null) {
            cancelAnimationFrame(eraserTrailFrameRef.current);
        }
    }, []);
    const paintEraserTrail = (now: number) => {
        const points = eraserTrailPointsAtTime(eraserTrailPointsRef.current, now);
        const lastPoint = eraserTrailPointsRef.current.at(-1);
        const keepTip = eraserHoveringRef.current || eraserGestureActiveRef.current;
        const opacity = keepTip
            ? 1
            : Math.max(0, 1 - (now - (lastPoint?.time ?? 0)) / ERASER_TRAIL_DURATION_MS);
        if (!points.length || opacity === 0) {
            setEraserPreviewPath("");
            setEraserPreviewOpacity(0);
            eraserTrailPointsRef.current = [];
            return false;
        }
        setEraserPreviewPath(eraserTrailPath(points, ERASER_TRAIL_SIZE_PX));
        setEraserPreviewOpacity(opacity * 0.22);
        return points.length > 1 || !keepTip;
    };
    const scheduleEraserTrailFrame = () => {
        if (eraserTrailFrameRef.current !== null)
            return;
        eraserTrailFrameRef.current = requestAnimationFrame((now) => {
            eraserTrailFrameRef.current = null;
            if (paintEraserTrail(now))
                scheduleEraserTrailFrame();
        });
    };
    const queueEraserTrailPoint = (x: number, y: number, isHovering: boolean, time = performance.now()) => {
        const points = eraserTrailPointsRef.current;
        const previous = points.at(-1);
        const sampleTime = Math.max(time, previous?.time ?? time);
        const point = { x, y, time: sampleTime };
        eraserHoveringRef.current = isHovering;
        if (previous && sampleTime - previous.time > ERASER_TRAIL_DURATION_MS) {
            points.length = 0;
        }
        const currentPrevious = points.at(-1);
        if (currentPrevious &&
            Math.hypot(point.x - currentPrevious.x, point.y - currentPrevious.y) < 0.35) {
            currentPrevious.time = sampleTime;
        }
        else {
            points.push(point);
        }
        if (points.length > 96)
            points.splice(0, points.length - 96);
        scheduleEraserTrailFrame();
    };
    const clearEraserTrail = () => {
        eraserTrailPointsRef.current = [];
        eraserHoveringRef.current = false;
        setEraserPreviewPath("");
        setEraserPreviewOpacity(0);
        if (eraserTrailFrameRef.current !== null) {
            cancelAnimationFrame(eraserTrailFrameRef.current);
            eraserTrailFrameRef.current = null;
        }
    };
    const clearPendingEraserTargets = () => {
        pendingEraseItemIdsRef.current.clear();
        setPendingEraseItemIds([]);
    };
    const addPendingEraserTargets = (itemIds: string[]) => {
        let changed = false;
        itemIds.forEach((itemId) => {
            if (pendingEraseItemIdsRef.current.has(itemId))
                return;
            pendingEraseItemIdsRef.current.add(itemId);
            changed = true;
        });
        if (changed) {
            setPendingEraseItemIds([...pendingEraseItemIdsRef.current]);
        }
    };
    const cancelEraserGesture = () => {
        const pointerId = eraserPointerIdRef.current;
        if (pointerId !== null) {
            try {
                (canvasRef.current as any)?.releasePointerCapture?.(pointerId);
            }
            catch {
                // The browser may have already released the pointer.
            }
        }
        eraserPointerIdRef.current = null;
        eraserGestureActiveRef.current = false;
        currentStrokePointsRef.current = [];
        shapeStartRef.current = null;
        setCurPath("");
        clearPendingEraserTargets();
        eraserHoveringRef.current = false;
        scheduleEraserTrailFrame();
        setShouldBlockDrawing(false);
    };
    const setEraserActive = (active: boolean) => {
        if (eraserMode === active)
            return;
        if (active) {
            currentStrokePointsRef.current = [];
            clearPendingEraserTargets();
            setCurPath("");
            shapeStartRef.current = null;
            clearEraserTrail();
        }
        else {
            cancelEraserGesture();
            clearEraserTrail();
        }
        setEraserMode(active);
    };
    const toggleEraser = () => setEraserActive(!eraserMode);
    useEffect(() => {
        if (!pointerHintVisible)
            return;
        const timeout = setTimeout(() => setPointerHintVisible(false), 3200);
        return () => clearTimeout(timeout);
    }, [pointerHintVisible]);
    const getCanvasViewportTransform = (currentScale = scale): [
        number,
        number
    ] => {
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
    const screenPointToCanvasPoint = (x: number, y: number, currentScale: number): [
        number,
        number
    ] => {
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
    const canvasPointToScreenPoint = (point: [
        number,
        number
    ], currentScale = scale): [
        number,
        number
    ] => {
        const [translateX, translateY] = getCanvasViewportTransform(currentScale);
        return [
            translateX + point[0] * currentScale,
            translateY + point[1] * currentScale,
        ];
    };
    const appendEraseHistoryEntry = (erasedItemIds: string[]) => {
        const uniqueErasedItemIds = [...new Set(erasedItemIds)];
        if (uniqueErasedItemIds.length === 0)
            return false;
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
        setSelectedImageId(null);
        return true;
    };
    const appendPointEraseHistoryEntry = (targetItemIds: string[], erasePoints: [
        number,
        number
    ][]) => {
        const targetIds = new Set(targetItemIds);
        if (targetIds.size === 0 || erasePoints.length === 0)
            return false;
        const now = new Date().toISOString();
        const activeItems = canvasItems.slice(0, curIdx + 1);
        const pointEraseReplacements: NonNullable<CanvasEraseItem["pointEraseReplacements"]> = [];
        getVisibleCanvasItems(activeItems).forEach((item) => {
            if (item.type !== "path" || !targetIds.has(item.id))
                return;
            const radius = Math.max(6, (eraserSize + item.width) / 2) / Math.max(scale, 0.1);
            const fragments = splitPolylineByErasePath(extractPathPoints(item.data), erasePoints, radius);
            if (fragments === null)
                return;
            pointEraseReplacements.push({
                targetItemId: item.id,
                items: fragments.map((data) => ({
                    id: createCanvasItemId("path"),
                    type: "path",
                    data,
                    color: item.color,
                    width: item.width,
                    createdAt: now,
                    updatedAt: now,
                })),
            });
        });
        if (pointEraseReplacements.length === 0)
            return false;
        const eraseItem: CanvasEraseItem = {
            id: createCanvasItemId("erase"),
            type: "erase",
            erasedItemIds: [],
            pointEraseReplacements,
            createdAt: now,
            updatedAt: now,
        };
        setItems([...activeItems, eraseItem]);
        setCurIdx(activeItems.length);
        setSelectedPathIndexes([]);
        setSelectedImageId(null);
        return true;
    };
    const getEraseTargetIds = (points: [
        number,
        number
    ][], toolScreenSize = eraserSize, sensitivity = 1, options: {
        ignorePathData?: string;
        minHitCount?: number;
    } = {}) => {
        const activeItems = getVisibleCanvasItems(canvasItems.slice(0, curIdx + 1));
        if (activeItems.length === 0 || points.length === 0)
            return [];
        const erasedItemIds: string[] = [];
        const gestureBounds = getBounds(points);
        if (!gestureBounds)
            return [];
        const minHitCount = options.minHitCount ?? 1;
        activeItems.forEach((item) => {
            if (item.type !== "path") {
                return;
            }
            if (options.ignorePathData && item.data === options.ignorePathData) {
                return;
            }
            const width = item.width ?? strokeWidth;
            const threshold = (Math.max(6, (toolScreenSize + width) / 2) * sensitivity) /
                Math.max(scale, 0.1);
            const pathPoints = extractPathPoints(item.data);
            const itemBounds = expandBounds(getBounds(pathPoints), threshold);
            if (!boundsIntersect(gestureBounds, itemBounds)) {
                return;
            }
            const hitCount = points.reduce((count, point) => count + (pathPointsIntersectPoint(pathPoints, point, threshold) ? 1 : 0), 0);
            if (hitCount >= minHitCount) {
                erasedItemIds.push(item.id);
            }
        });
        return erasedItemIds;
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
        const firstPoint = polygon[0];
        const lastPoint = polygon[polygon.length - 1];
        const scaleForTolerance = Math.max(scale, 0.1);
        const isClosedLasso = !firstPoint ||
            !lastPoint ||
            (polygon.length >= 4 &&
                Math.hypot(lastPoint[0] - firstPoint[0], lastPoint[1] - firstPoint[1]) <=
                    18 / scaleForTolerance);
        const polygonArea = Math.abs(polygon.reduce((area, point, index) => {
            const nextPoint = polygon[(index + 1) % polygon.length];
            return area + point[0] * nextPoint[1] - nextPoint[0] * point[1];
        }, 0) / 2);
        const hasEnoughArea = polygonArea >= 16 / (scaleForTolerance * scaleForTolerance);
        if (polygon.length < 3 ||
            (!rectangleSelectionMode && !isClosedLasso) ||
            !hasEnoughArea) {
            lassoPointsRef.current = [];
            setLassoPath("");
            rectangleSelectionStartRef.current = null;
            setSelectedPathIndexes([]);
        setSelectedImageId(null);
            return;
        }
        const selectedIndexes = svgItems
            .map((item, index) => {
            const points = extractPathPoints(item.data);
            const padding = ((item.width ?? strokeWidth) / 2 + 2) / scaleForTolerance;
            return pathIntersectsPolygon(points, polygon, padding)
                ? index
                : null;
        })
            .filter((index): index is number => index !== null);
        setSelectedPathIndexes(selectedIndexes);
        lassoPointsRef.current = [];
        setLassoPath("");
        rectangleSelectionStartRef.current = null;
    };
    const { schedule: scheduleScribbleFreeze, cancel: cancelScribbleFreeze, consumedRef: scribbleEraseConsumedRef } = useScribbleEraseFreeze({
        pointsRef: currentStrokePointsRef,
        scale,
        preferences: canvasPreferences,
        context: `${eraserMode}/${shapeTool}/${onlyPanningMode}/${pseudoPointerMode}/${selectionMode}`,
        onFreeze: (points) => {
            if (nativeTwoFingerGestureActiveRef.current)
                return false;
            const targets = getEraseTargetIds(points, Math.max(16, strokeWidth + 10), clampScribbleSensitivity(canvasPreferences.scribbleEraseSensitivity), { minHitCount: Math.max(3, Math.ceil(points.length * 0.12)) });
            if (!targets.length || !appendEraseHistoryEntry(targets))
                return false;
            currentStrokePointsRef.current = [];
            setCurPath("");
            return true;
        },
    });
    function updatePathAtCanvasPoint(canvasX: number, canvasY: number) {
        if (scribbleEraseConsumedRef.current)
            return;
        if (eraserMode) {
            const previousPoint = currentStrokePointsRef.current.at(-1);
            const samples: [
                number,
                number
            ][] = [];
            if (!previousPoint) {
                samples.push([canvasX, canvasY]);
            }
            else {
                const distance = Math.hypot((canvasX - previousPoint[0]) * scale, (canvasY - previousPoint[1]) * scale);
                const steps = Math.max(1, Math.ceil(distance / 4));
                for (let step = 1; step <= steps; step += 1) {
                    const progress = step / steps;
                    samples.push([
                        previousPoint[0] + (canvasX - previousPoint[0]) * progress,
                        previousPoint[1] + (canvasY - previousPoint[1]) * progress,
                    ]);
                }
            }
            currentStrokePointsRef.current = [
                ...currentStrokePointsRef.current,
                ...samples,
            ];
            addPendingEraserTargets(getEraseTargetIds(samples, eraserSize, 1, {
                minHitCount: 1,
            }));
            const [screenX, screenY] = canvasPointToScreenPoint([canvasX, canvasY]);
            queueEraserTrailPoint(screenX, screenY, eraserHoveringRef.current);
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
        const lastPoint = currentStrokePointsRef.current[currentStrokePointsRef.current.length - 1];
        if (lastPoint[0] === canvasX && lastPoint[1] === canvasY)
            return;
        currentStrokePointsRef.current = [
            ...currentStrokePointsRef.current,
            [canvasX, canvasY],
        ];
        scheduleScribbleFreeze();
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
        if (!eraserMode)
            return false;
        const erasedItemIds = [...pendingEraseItemIdsRef.current];
        const didErase = eraserModeType === "point"
            ? appendPointEraseHistoryEntry(erasedItemIds, currentStrokePointsRef.current)
            : appendEraseHistoryEntry(erasedItemIds);
        clearPendingEraserTargets();
        currentStrokePointsRef.current = [];
        shapeStartRef.current = null;
        eraserGestureActiveRef.current = false;
        eraserPointerIdRef.current = null;
        scheduleEraserTrailFrame();
        setShouldBlockDrawing(false);
        return didErase;
    };
    const getDeltaPanning = (fingerChange: number[][]): number[] => {
        const x_points = fingerChange.reduce((acc: number[], touchPoint: number[]) => [...acc, touchPoint[0]], []);
        const y_points = fingerChange.reduce((acc: number[], touchPoint: number[]) => [...acc, touchPoint[1]], []);
        const dx = x_points.reduce((acc, x) => acc + x);
        const dy = y_points.reduce((acc, y) => acc + y);
        return [dx, dy];
    };
    const handleWheel = (e: WheelEvent) => {
        if (!e.ctrlKey)
            return;
        e.preventDefault();
        const deltaY = e.deltaY;
        const rect = (e.target as Element).getBoundingClientRect();
        // Get mouse position relative to the target element
        const mousePos: [
            number,
            number
        ] = [
            e.clientX - rect.left,
            e.clientY - rect.top,
        ];
        // const mousePos: [number, number] = [e.offsetX, e.offsetY];
        // Optionally adjust if you want (0, 0) at the center:
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;
        const mousePosCentered: [
            number,
            number
        ] = [
            mousePos[0] - canvasWidth / 2,
            mousePos[1] - canvasHeight / 2,
        ];
        setScale((prevScale) => {
            const newScale = prevScale * (1 - deltaY / 1000);
            setFocusOffset((prevFocusOffset) => {
                const focusStep = getFocusStep(mousePosCentered, prevFocusOffset as [
                    number,
                    number
                ], newScale, prevScale);
                return [
                    prevFocusOffset[0] + focusStep[0],
                    prevFocusOffset[1] + focusStep[1],
                ];
            });
            // setFocusPos(mousePosCentered);
            return newScale;
        });
    };
    function getFocusStep(focusPos: [
        number,
        number
    ], // Mouse position in (possibly centered) viewport coordinates
    currentOffset: [
        number,
        number
    ], // Current viewport offset
    newScale: number, // New scale after zoom
    oldScale: number): [
        number,
        number
    ] {
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
    const zoom = () => { };
    const draw = (usingPointer: boolean) => { };
    const updatePanning = () => { };
    const [loadedDrawingId, setLoadedDrawingId] = useState<string | null>(null);
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
        if (!localDrawingId || loadedDrawingId !== localDrawingId)
            return;
        const timeout = setTimeout(async () => {
            const document = await drawingRepository.get(localDrawingId);
            if (!document)
                return;
            const contentChanged = document.historyCursor !== currentCanvasData.historyCursor ||
                JSON.stringify(document.items) !== JSON.stringify(currentCanvasData.items);
            const viewportChanged = JSON.stringify(document.viewport) !== JSON.stringify(currentCanvasData.viewport);
            if (!contentChanged && !viewportChanged) return;
            const savedDocument = await drawingRepository.save({
                ...document,
                items: currentCanvasData.items,
                historyCursor: currentCanvasData.historyCursor,
                viewport: currentCanvasData.viewport,
            }, { sync: contentChanged ? "local" : "preserve" });
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
        loadedDrawingId,
        onCanvasDataChange,
        panningOffset,
        scale,
    ]);
    useEffect(() => {
        if (!localDrawingId)
            return;
        setLoadedDrawingId(null);
        let cancelled = false;
        drawingRepository.get(localDrawingId).then((document) => {
            if (cancelled || !document)
                return;
            setItems(document.items ?? []);
            setCurIdx(document.historyCursor ?? -1);
            if (document.viewport) {
                setPanningOffset([document.viewport.x, document.viewport.y]);
                setScale(document.viewport.scale);
            }
            setCurPath("");
            setLoadedDrawingId(localDrawingId);
        });
        return () => {
            cancelled = true;
        };
    }, [localDrawingId]);
    const calcFocus = (x_points: number[], y_points: number[]) => {
        const avg_x = x_points.reduce((sum: number, val: number) => sum + val) /
            x_points.length;
        const avg_y = y_points.reduce((sum: number, val: number) => sum + val) /
            y_points.length;
        const focus = [avg_x, avg_y];
        return focus;
    };
    const calcDistance = (x_points: number[], y_points: number[]) => {
        return Math.sqrt(Math.pow(x_points[0] - x_points[1], 2) +
            Math.pow(y_points[0] - y_points[1], 2));
    };
    const prepareForNextDrawing = () => {
        cancelScribbleFreeze();
        scribbleEraseConsumedRef.current = false;
        if (eraserMode) {
            finalizeStrokeErase();
            setCurPath("");
            return;
        }
        if (curPath != "") {
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
    const shouldUseConfiguredPointerInput = (event?: any) => {
        if (Platform.OS !== "web")
            return false;
        if (canvasPreferences.pencilDrawsFingerPans)
            return true;
        if (!event)
            return false;
        const nativeEvent = event.nativeEvent ?? event;
        const pointerType = nativeEvent.pointerType ?? "mouse";
        return pointerType === "mouse" || pointerType === "pen";
    };
    const onTouchStartSvg = (e: GestureResponderEvent) => {
        const touches = e.nativeEvent.touches;
        if (Platform.OS === "web" &&
            eraserMode &&
            touches.length < 2 &&
            !nativeTwoFingerGestureActiveRef.current) {
            return;
        }
        if (shouldUseConfiguredPointerInput() &&
            touches.length < 2 &&
            !nativeTwoFingerGestureActiveRef.current) {
            return;
        }
        // alert("touch start")
        nativeTouchActiveRef.current = touches.length > 0;
        // console.log(touches)
        const fingerPos = touches.map(getCanvasTouchPosition);
        const [touchX, touchY] = fingerPos[0] ?? [0, 0];
        prevFingersPos.current = fingerPos;
        if (touches.length >= 2) {
            cancelScribbleFreeze();
            scribbleEraseConsumedRef.current = false;
            if (eraserMode) {
                cancelEraserGesture();
            }
            else if (curPath !== "") {
                const now = new Date().toISOString();
                const pathItem: CanvasPathItem = {
                    id: createCanvasItemId("path"),
                    type: "path",
                    data: curPath,
                    color: strokeColor.value,
                    width: strokeWidth,
                    createdAt: now,
                    updatedAt: now,
                };
                const activeItems = canvasItems.slice(0, curIdx + 1);
                setItems([...activeItems, pathItem]);
                setCurIdx(activeItems.length);
            }
            currentStrokePointsRef.current = [];
            shapeStartRef.current = null;
            setCurPath("");
            lassoPointsRef.current = [];
            setLassoPath("");
            rectangleSelectionStartRef.current = null;
            nativeTwoFingerGestureActiveRef.current = true;
            const firstTwoFingers = fingerPos.slice(0, 2);
            const centroid: [
                number,
                number
            ] = [
                (firstTwoFingers[0][0] + firstTwoFingers[1][0]) / 2,
                (firstTwoFingers[0][1] + firstTwoFingers[1][1]) / 2,
            ];
            const distance = calcDistance(firstTwoFingers.map(([x]) => x), firstTwoFingers.map(([, y]) => y));
            nativeTwoFingerCentroidRef.current = centroid;
            prevTwoFingerDist.current = distance;
            prevFingersPos.current = firstTwoFingers;
            setShouldBlockDrawing(true);
            return;
        }
        if (nativeTwoFingerGestureActiveRef.current) {
            setShouldBlockDrawing(true);
            return;
        }
        if (eraserMode && touches.length === 1) {
            if (selectedPathIndexes.length > 0)
                clearSelection();
            currentStrokePointsRef.current = [];
            clearPendingEraserTargets();
            eraserGestureActiveRef.current = true;
            eraserHoveringRef.current = false;
            setShouldBlockDrawing(true);
            updatePath(touchX, touchY, scale);
            return;
        }
        if (pseudoPointerMode && touches.length === 1) {
            setShouldBlockDrawing(true);
            if (pseudoLeftClick) {
                updatePathAtCanvasPoint(pseudoPointerPosRef.current[0], pseudoPointerPosRef.current[1]);
            }
            return;
        }
        if ((lassoMode || rectangleSelectionMode) && touches.length === 1) {
            clearSelection();
            if (rectangleSelectionMode) {
                updateRectangleSelectionPath(touchX, touchY, scale);
            }
            else {
                updateLassoPath(touchX, touchY, scale);
            }
            setShouldBlockDrawing(true);
            return;
        }
        if (onlyPanningMode) {
            setShouldBlockDrawing(true);
            return;
        }
        if (selectedPathIndexes.length > 0) {
            clearSelection();
        }
        return;
    };
    const onTouchMoveSvg = (e: GestureResponderEvent) => {
        const touches = e.nativeEvent.touches;
        if (Platform.OS === "web" &&
            eraserMode &&
            touches.length < 2 &&
            !nativeTwoFingerGestureActiveRef.current) {
            return;
        }
        if (shouldUseConfiguredPointerInput() &&
            touches.length < 2 &&
            !nativeTwoFingerGestureActiveRef.current) {
            return;
        }
        // console.log("moving ")
        // console.log(e)
        //
        // console.log("moving");
        const moreThanTwoFingers = touches.length > 2;
        if (moreThanTwoFingers && !eraserMode)
            return;
        const oneFinger = touches.length === 1;
        // useful data for most cases
        const fingerPos = touches.map(getCanvasTouchPosition);
        const x_points = fingerPos.map(([x]) => x);
        const y_points = fingerPos.map(([, y]) => y);
        if (nativeTwoFingerGestureActiveRef.current) {
            setShouldBlockDrawing(true);
            if (fingerPos.length < 2)
                return;
            const firstTwoFingers = fingerPos.slice(0, 2);
            const centroid: [
                number,
                number
            ] = [
                (firstTwoFingers[0][0] + firstTwoFingers[1][0]) / 2,
                (firstTwoFingers[0][1] + firstTwoFingers[1][1]) / 2,
            ];
            const distance = calcDistance(firstTwoFingers.map(([x]) => x), firstTwoFingers.map(([, y]) => y));
            const previousCentroid = nativeTwoFingerCentroidRef.current;
            const nextScale = scale * (distance / Math.max(prevTwoFingerDist.current, 1));
            const safeNextScale = Math.max(0.1, nextScale);
            const [translateX, translateY] = getCanvasViewportTransform(scale);
            const anchorX = (previousCentroid[0] - translateX) / scale;
            const anchorY = (previousCentroid[1] - translateY) / scale;
            const desiredTranslateX = centroid[0] - anchorX * safeNextScale;
            const desiredTranslateY = centroid[1] - anchorY * safeNextScale;
            const originX = center.current[0] + focusPos[0];
            const originY = center.current[1] + focusPos[1];
            setScale(safeNextScale);
            setPanningOffset([
                (desiredTranslateX +
                    originX * (safeNextScale - 1) -
                    focusOffset[0]) /
                    safeNextScale,
                (desiredTranslateY +
                    originY * (safeNextScale - 1) -
                    focusOffset[1]) /
                    safeNextScale,
            ]);
            nativeTwoFingerCentroidRef.current = centroid;
            prevTwoFingerDist.current = distance;
            prevFingersPos.current = firstTwoFingers;
            return;
        }
        if (eraserMode) {
            if (oneFinger) {
                updatePath(x_points[0], y_points[0], scale);
                prevFingersPos.current = fingerPos;
            }
            else {
                cancelEraserGesture();
                setShouldBlockDrawing(true);
            }
            return;
        }
        const fingerChange = fingerPos.reduce((acc: number[][], touchPoint: number[], index: number) => {
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
        }, []);
        if (lassoMode || rectangleSelectionMode) {
            if (oneFinger === false)
                return;
            if (rectangleSelectionMode) {
                updateRectangleSelectionPath(x_points[0], y_points[0], scale);
            }
            else {
                updateLassoPath(x_points[0], y_points[0], scale);
            }
            prevFingersPos.current = fingerPos;
            return;
        }
        // one finger only
        if (onlyPanningMode) {
            if (oneFinger === false)
                return;
            const [x, y] = fingerPos[0];
            const [prevX, prevY] = prevFingersPos.current[0];
            const fingerChange: number[][] = [
                [x - prevX, y - prevY],
                [0, 0],
            ];
            const deltaPanning: number[] = getDeltaPanning(fingerChange);
            setPanningOffset((prev) => [
                prev[0] + getPanOffsetDelta(deltaPanning[0], scale),
                prev[1] + getPanOffsetDelta(deltaPanning[1], scale),
            ]);
            prevFingersPos.current = [[x, y]];
            return;
        }
        // can be two fingers
        if (pseudoPointerMode) {
            if (oneFinger === false)
                return;
            const currentPointerPos = pseudoPointerPosRef.current;
            const newPointerPos: [
                number,
                number
            ] = [
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
        prevFingersPos.current = fingerPos;
    };
    const onTouchEndSvg = (e: GestureResponderEvent) => {
        if (Platform.OS === "web" &&
            eraserMode &&
            !nativeTwoFingerGestureActiveRef.current) {
            return;
        }
        if (shouldUseConfiguredPointerInput() &&
            !nativeTwoFingerGestureActiveRef.current) {
            return;
        }
        // alert("touch end")
        const notTouching = e.nativeEvent.touches.length === 0;
        if (notTouching === false)
            return;
        nativeTouchActiveRef.current = false;
        if (nativeTwoFingerGestureActiveRef.current) {
            nativeTwoFingerGestureActiveRef.current = false;
            prevFingersPos.current = [];
            prevTwoFingerDist.current = 0;
            setShouldBlockDrawing(false);
            return;
        }
        if (lassoMode || rectangleSelectionMode) {
            finalizeLassoSelection();
            setShouldBlockDrawing(false);
            return;
        }
        if (eraserMode)
            eraserHoveringRef.current = false;
        prepareForNextDrawing();
    };
    const wipeCanvas = () => {
        setItems([]);
        setCurPath("");
        setCurIdx(-1);
        setScale(1);
        setFocusOffset([0, 0]);
        setPanningOffset([0, 0]);
        currentStrokePointsRef.current = [];
        shapeStartRef.current = null;
        cancelEraserGesture();
        clearEraserTrail();
        lassoPointsRef.current = [];
        setLassoPath("");
        rectangleSelectionStartRef.current = null;
        setSelectedPathIndexes([]);
        setSelectedImageId(null);
        prevFingersPos.current = [];
        prevTwoFingerDist.current = 0;
    };
    const confirmWipeCanvas = () => {
        setClearCanvasDialogOpen(true);
    };
    const getSelectedPathSelection = (): CanvasClipboardSelection | null => {
        if (selectedPathIndexes.length === 0)
            return null;
        const selected = new Set(selectedPathIndexes);
        const activePathItems = svgItems;
        const items: CanvasPathItem[] = [];
        activePathItems.forEach((item, index) => {
            if (!selected.has(index))
                return;
            items.push({ ...item });
        });
        if (items.length === 0)
            return null;
        return { items };
    };
    const copySelectedPaths = async () => {
        const selection = getSelectedPathSelection();
        if (!selection)
            return;
        clipboardSelectionRef.current = selection;
        if (Platform.OS === "web") {
            await Clipboard.setStringAsync(JSON.stringify({
                type: "infinitecanvas.selection",
                version: CANVAS_DOCUMENT_VERSION,
                ...selection,
            }));
        }
    };
    const deleteSelectedPaths = () => {
        if (selectedImageId) { appendEraseHistoryEntry([selectedImageId]); return; }
        if (selectedPathIndexes.length === 0)
            return;
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
    const pastePathSelection = async (targetCanvasPoint?: [
        number,
        number
    ]) => {
        let selection = clipboardSelectionRef.current;
        if (!selection && Platform.OS === "web") {
            try {
                const text = await Clipboard.getStringAsync();
                const parsed = JSON.parse(text) as Partial<CanvasClipboardSelection> & {
                    type?: string;
                };
                if (parsed.type === "infinitecanvas.selection" &&
                    Array.isArray(parsed.items)) {
                    selection = {
                        items: parsed.items.filter((item): item is CanvasPathItem => item?.type === "path" &&
                            typeof item.data === "string" &&
                            typeof item.color === "string" &&
                            typeof item.width === "number"),
                    };
                }
            }
            catch {
                selection = null;
            }
        }
        if (!selection)
            return;
        const selectionBounds = selection.items.reduce<SelectionBounds | null>((bounds, item) => mergeBounds(bounds, getPathItemBounds(item)), null);
        const selectionWidth = selectionBounds
            ? selectionBounds.maxX - selectionBounds.minX
            : 0;
        const selectionHeight = selectionBounds
            ? selectionBounds.maxY - selectionBounds.minY
            : 0;
        const offset = Math.max(42 / Math.max(scale, 0.1), Math.min(Math.max(selectionWidth, selectionHeight) * 0.28, 180 / Math.max(scale, 0.1)));
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
        const startIndex = getVisibleCanvasItems(activeItems).filter((item) => item.type === "path").length;
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
        if (selectedImageId) {
            const image = getVisibleCanvasItems(canvasItems.slice(0, curIdx + 1)).find(item => item.id === selectedImageId);
            if (image?.type === "image") {
                const now = new Date().toISOString();
                const copy = {...image, id: createCanvasItemId("image"), x: (image.x ?? 0) + 32 / scale, y: (image.y ?? 0) + 32 / scale, createdAt: now, updatedAt: now};
                const next = [...canvasItems.slice(0, curIdx + 1), copy];
                setItems(next); setCurIdx(next.length - 1); setSelectedImageId(copy.id);
            }
            return;
        }

        await copySelectedPaths();
        await pastePathSelection();
    };
    const resizeSelectedPaths = (factor: number) => {
        if (selectedPathIndexes.length === 0 || !selectedBounds)
            return;
        const selected = new Set(selectedPathIndexes);
        const selectedPathIds = new Set(svgItems
            .filter((_, index) => selected.has(index))
            .map((item) => item.id));
        const origin: [
            number,
            number
        ] = [
            (selectedBounds.minX + selectedBounds.maxX) / 2,
            (selectedBounds.minY + selectedBounds.maxY) / 2,
        ];
        const now = new Date().toISOString();
        const activeItems = canvasItems.slice(0, curIdx + 1);
        const nextItems = activeItems.map((item) => mapCanvasItemPaths(item, (path) => {
            if (!selectedPathIds.has(path.id))
                return path;
            return {
                ...path,
                data: scalePathData(path.data, factor, origin),
                width: Math.max(1, path.width * factor),
                updatedAt: now,
            };
        }));
        setItems(nextItems);
        setCurIdx(nextItems.length - 1);
    };
    const resizeSelectedPathsFromSnapshot = (factor: number, origin: [
        number,
        number
    ], baseItems: DrawingItem[], selectedPathIds: Set<string>) => {
        const now = new Date().toISOString();
        const nextItems = baseItems.map((item) => mapCanvasItemPaths(item, (path) => {
            if (!selectedPathIds.has(path.id))
                return path;
            return {
                ...path,
                data: scalePathData(path.data, factor, origin),
                width: Math.max(1, path.width * factor),
                updatedAt: now,
            };
        }));
        setItems(nextItems);
        setCurIdx(nextItems.length - 1);
    };
    const enterInsertedItemSelection = () => {
        setSelectionMode("lasso"); setPanningGesture(false); setVirtualPointerMode(false);
        setPseudoLeftClick(true); setEraserActive(false); setLassoPath("");
    };
    const insertionCenter = (): [number, number] => screenPointToCanvasPoint(widthRef.current / 2, heightRef.current / 2, scale);
    const insertShapeAtCanvasPoint = (point: [
        number,
        number
    ], tool: Exclude<ShapeTool, "freehand"> = "rectangle") => {
        const width = 160 / Math.max(scale, 0.1);
        const height = 110 / Math.max(scale, 0.1);
        const [cx, cy] = point;
        const now = new Date().toISOString();
        const item: CanvasPathItem = {
            id: createCanvasItemId("path"),
            type: "path",
            data: buildShapePath([cx - width / 2, cy - height / 2], [cx + width / 2, cy + height / 2], tool),
            color: strokeColor.value,
            width: Math.max(strokeWidth, 2),
            createdAt: now,
            updatedAt: now,
        };
        const activeItems = canvasItems.slice(0, curIdx + 1);
        const nextItems = [...activeItems, item];
        enterInsertedItemSelection();
        setSelectedImageId(null);
        setSelectedPathIndexes([getVisibleCanvasItems(activeItems).filter(item => item.type === "path").length]);
        setItems(nextItems);
        setCurIdx(nextItems.length - 1);
    };
    const pasteSelectionAtContextMenu = async () => {
        const target = canvasContextMenu?.canvasPoint;
        setCanvasContextMenu(null);
        if (!target)
            return;
        await pastePathSelection(target);
    };
    const insertImageAtContextMenu = async () => {
        const target = canvasContextMenu?.canvasPoint;
        setCanvasContextMenu(null);
        if (!target)
            return;
        await pickImageAtCanvasPoint(target);
    };
    const insertShapeAtContextMenu = (tool: Exclude<ShapeTool, "freehand">) => {
        const target = canvasContextMenu?.canvasPoint;
        setCanvasContextMenu(null);
        if (!target)
            return;
        insertShapeAtCanvasPoint(target, tool);
    };
    useEffect(() => {
        if (Platform.OS !== "web")
            return;
        const selectionKeyHandler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isTyping = target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                target?.isContentEditable;
            if (isTyping)
                return;
            const hasModifier = event.ctrlKey || event.metaKey;
            if (event.key === "Escape") {
                setSelectedPathIndexes([]);
        setSelectedImageId(null);
                setLassoPath("");
                lassoPointsRef.current = [];
                rectangleSelectionStartRef.current = null;
                return;
            }
            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedPathIndexes.length === 0)
                    return;
                event.preventDefault();
                deleteSelectedPaths();
                return;
            }
            if (!hasModifier)
                return;
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
    const notifyDataChange = (msg: CanvasClientMessage) => {
        if (Platform.OS !== "web" ||
            typeof window === "undefined" ||
            !window.parent) {
            return;
        }
        window.parent.postMessage(msg, "*");
    };
    const preventScrollingParent = (e: any) => {
        // alert("scrolling prevented");
        e.preventDefault();
        e.stopPropagation();
    };
    const startMiddlePan = (event: any) => {
        const nativeEvent = event.nativeEvent ?? event;
        const target = canvasRef.current as unknown as HTMLElement | null;
        if (Platform.OS !== "web" || nativeEvent.button !== 1 ||
            !target?.contains(nativeEvent.target ?? event.target)) return false;
        event.preventDefault?.();
        event.stopPropagation?.();
        if (middlePanRef.current) return true;
        middlePanRef.current = {
            pointerId: nativeEvent.pointerId,
            target,
            position: [nativeEvent.clientX, nativeEvent.clientY],
        };
        if (nativeEvent.pointerId != null) target.setPointerCapture?.(nativeEvent.pointerId);
        setCanvasContextMenu(null);
        setMiddlePanning(true);
        return true;
    };
    const finishMiddlePan = (event?: any) => {
        const gesture = middlePanRef.current;
        const nativeEvent = event?.nativeEvent ?? event;
        if (!gesture || (nativeEvent?.pointerId != null && gesture.pointerId != null &&
            nativeEvent.pointerId !== gesture.pointerId)) return false;
        middlePanRef.current = null;
        setMiddlePanning(false);
        if (gesture.pointerId != null && gesture.target.hasPointerCapture?.(gesture.pointerId)) {
            gesture.target.releasePointerCapture(gesture.pointerId);
        }
        return true;
    };
    const checkMiddleButtonUp = (event: MouseEvent) => {
        if (event.button === 1) finishMiddlePan();
    };
    const cancelMiddlePan = () => { finishMiddlePan(); };
    const handlePointerMoveSvg = (e: any) => {
        if (Platform.OS === "web") {
            const nativeEvent = e.nativeEvent ?? e;
            const position = getWebPointerPosition(e);
            updateCursorCoordinates(position);
            const gesture = middlePanRef.current;
            if (gesture) {
                if ((nativeEvent.buttons & 4) === 0) {
                    finishMiddlePan(e);
                    return;
                }
                if (gesture.pointerId != null && nativeEvent.pointerId !== gesture.pointerId) return;
                e.preventDefault?.();
                e.stopPropagation?.();
                const nextPosition: [number, number] = [nativeEvent.clientX, nativeEvent.clientY];
                const deltaX = getPanOffsetDelta(nextPosition[0] - gesture.position[0], scale);
                const deltaY = getPanOffsetDelta(nextPosition[1] - gesture.position[1], scale);
                gesture.position = nextPosition;
                setPanningOffset(prev => [prev[0] + deltaX, prev[1] + deltaY]);
                return;
            }
            if (eraserMode) {
                const node = e.currentTarget ?? e.nativeEvent?.target;
                const rect = node?.getBoundingClientRect?.();
                const isHovering = rect
                    ? position[0] >= 0 && position[1] >= 0 &&
                        position[0] <= rect.width && position[1] <= rect.height
                    : false;
                queueEraserTrailPoint(position[0], position[1], isHovering);
            }
        }
    };
    const getWebPointerPosition = (e: any): [
        number,
        number
    ] => {
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
    const isSelectionResizePointerEvent = (event: any) => {
        const nativeEvent = event.nativeEvent ?? event;
        const hasResizeHandleAncestor = (startTarget: any) => {
            let target = startTarget;
            while (target) {
                if (target.id === "canvas-selection-resize-handle")
                    return true;
                target = target.parentElement ?? target.parentNode;
            }
            return false;
        };
        return (hasResizeHandleAncestor(nativeEvent.target) ||
            hasResizeHandleAncestor(event.target));
    };
    const toCanvasCoordinates = (position: [
        number,
        number
    ]): [
        number,
        number
    ] => {
        return screenPointToCanvasPoint(position[0], position[1], scale);
    };
    const clientPointToCanvasPoint = (clientX: number, clientY: number): [
        number,
        number
    ] => {
        const node = canvasRef.current as any;
        const rect = node?.getBoundingClientRect?.();
        const screenPoint: [
            number,
            number
        ] = rect
            ? [clientX - rect.left, clientY - rect.top]
            : [clientX, clientY];
        return screenPointToCanvasPoint(screenPoint[0], screenPoint[1], scale);
    };
    const updateCursorCoordinates = (position: [
        number,
        number
    ]) => {
        const [canvasX, canvasY] = toCanvasCoordinates(position);
        setCursorCoordinates([Math.round(canvasX), Math.round(canvasY)]);
    };
    const openCanvasContextMenu = (event: any) => {
        if (Platform.OS !== "web")
            return;
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
    const clearSelection = () => {
        setSelectedImageId(null);
        setSelectedPathIndexes((current) => (current.length === 0 ? current : []));
        lassoPointsRef.current = [];
        setLassoPath("");
        rectangleSelectionStartRef.current = null;
        cancelSelectionInteraction();
    };
    const deactivateExclusiveTools = () => {
        cancelScribbleFreeze();
        scribbleEraseConsumedRef.current = false;
        setPanningGesture(false);
        setVirtualPointerMode(false);
        setPseudoLeftClick(true);
        setPointerHintVisible(false);
        setEraserActive(false);
        setSelectionMode(null);
        clearEraserTrail();
        clearPendingEraserTargets();
        clearSelection();
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
        if (nextValue)
            setEraserActive(true);
    };
    const activatePointerMode = () => {
        const nextValue = !pseudoPointerMode;
        deactivateExclusiveTools();
        setShapeTool("freehand");
        setVirtualPointerMode(nextValue);
        setPseudoLeftClick(true);
        setPointerHintVisible(nextValue);
        if (nextValue) {
            setPointerPos(screenPointToCanvasPoint(widthRef.current / 2, heightRef.current / 2, scale));
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
    const startWebEraserPointer = (e: any) => {
        const nativeEvent = e.nativeEvent ?? e;
        const pointerType = nativeEvent.pointerType ?? "mouse";
        if (nativeEvent.button === 2 ||
            nativeEvent.isPrimary === false ||
            !["pen", "touch", "mouse"].includes(pointerType)) {
            return;
        }
        e.preventDefault?.();
        e.stopPropagation?.();
        setCanvasContextMenu(null);
        captureWebPointer(e);
        eraserPointerIdRef.current = nativeEvent.pointerId ?? null;
        eraserGestureActiveRef.current = true;
        eraserHoveringRef.current = true;
        currentStrokePointsRef.current = [];
        clearPendingEraserTargets();
        setShouldBlockDrawing(true);
        const position = getWebPointerPosition(e);
        updateCursorCoordinates(position);
        updatePath(position[0], position[1], scale);
    };
    const finishWebEraserPointer = (e: any, cancelled = false) => {
        const nativeEvent = e.nativeEvent ?? e;
        if (eraserPointerIdRef.current === null ||
            eraserPointerIdRef.current !== nativeEvent.pointerId) {
            return;
        }
        e.preventDefault?.();
        e.stopPropagation?.();
        releaseWebPointer(e);
        if (cancelled || nativeEvent.type === "pointercancel") {
            cancelEraserGesture();
            return;
        }
        const position = getWebPointerPosition(e);
        updatePath(position[0], position[1], scale);
        updateCursorCoordinates(position);
        const target = e.currentTarget ?? nativeEvent.target;
        const rect = target?.getBoundingClientRect?.();
        eraserGestureActiveRef.current = false;
        eraserPointerIdRef.current = null;
        eraserHoveringRef.current =
            nativeEvent.pointerType === "mouse" &&
                Boolean(rect &&
                    position[0] >= 0 &&
                    position[1] >= 0 &&
                    position[0] <= rect.width &&
                    position[1] <= rect.height);
        finalizeStrokeErase();
    };
    const handleConfiguredPointerStart = (e: any) => {
        if (isSelectionResizePointerEvent(e) || !shouldUseConfiguredPointerInput(e)) {
            return;
        }
        const nativeEvent = e.nativeEvent ?? e;
        if (nativeTwoFingerGestureActiveRef.current &&
            nativeEvent.pointerType === "touch") {
            return;
        }
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
                updatePathAtCanvasPoint(pseudoPointerPosRef.current[0], pseudoPointerPosRef.current[1]);
            }
            return;
        }
        if (selectedPathIndexes.length > 0) {
            clearSelection();
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
            clearSelection();
            if (rectangleSelectionMode) {
                updateRectangleSelectionPath(position[0], position[1], scale);
            }
            else {
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
        if (middlePanRef.current) return;
        const nativeEvent = e.nativeEvent ?? e;
        if (nativeTwoFingerGestureActiveRef.current &&
            nativeEvent.pointerType === "touch") {
            e.preventDefault?.();
            e.stopPropagation?.();
            return;
        }
        if (eraserMode &&
            eraserPointerIdRef.current !== null &&
            eraserPointerIdRef.current === nativeEvent.pointerId) {
            e.preventDefault?.();
            e.stopPropagation?.();
            const position = getWebPointerPosition(e);
            updateCursorCoordinates(position);
            updatePath(position[0], position[1], scale);
            return;
        }
        if (!shouldUseConfiguredPointerInput(e)) {
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
            }
            else {
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
            const nextPointerPos: [
                number,
                number
            ] = [
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
        setPanningOffset((prev) => [
            prev[0] + getPanOffsetDelta(deltaX, scale),
            prev[1] + getPanOffsetDelta(deltaY, scale),
        ]);
        webPointerLastPositionRef.current = position;
    };
    const handleConfiguredPointerEnd = (e: any) => {
        if (!shouldUseConfiguredPointerInput(e)) {
            return;
        }
        const nativeEvent = e.nativeEvent ?? e;
        if (nativeTwoFingerGestureActiveRef.current &&
            nativeEvent.pointerType === "touch") {
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
        }
        else if (mode === "lasso" || mode === "rectangle") {
            finalizeLassoSelection();
            setShouldBlockDrawing(false);
        }
        else if (mode === "pointer") {
            if (pseudoLeftClick) {
                prepareForNextDrawing();
            }
            else {
                setShouldBlockDrawing(false);
            }
        }
        else {
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
        if (ctx === null)
            return;
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL("image/png");
        return dataURL;
    };
    const updateCanvasImage = (id: string, changes: Partial<CanvasImageItem>) => {
        setItems(prev => prev.slice(0, curIdx + 1).map(item => item.type === "image" && item.id === id
            ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item));
    };
    const selectCanvasImage = (id: string) => {
        enterInsertedItemSelection(); setSelectedPathIndexes([]); setSelectedImageId(id);
    };
    const addImageToCanvas = async (uri: string, targetCanvasPoint?: [number, number]) => {
        const dimensions = await new Promise<{width: number; height: number}>((resolve, reject) =>
            NativeImage.getSize(uri, (width, height) => resolve({width, height}), reject));
        const factor = 220 / Math.max(dimensions.width, dimensions.height) / Math.max(scale, 0.1);
        const widthPx = dimensions.width * factor, heightPx = dimensions.height * factor;
        const point = targetCanvasPoint ?? insertionCenter();
        const now = new Date().toISOString();
        const imgItem: CanvasImageItem = {
            id: createCanvasItemId("image"), type: "image", uri,
            x: point[0] - widthPx / 2, y: point[1] - heightPx / 2, widthPx, heightPx,
            createdAt: now, updatedAt: now,
        };
        const next = [...canvasItems.slice(0, curIdx + 1), imgItem];
        setItems(next); setCurIdx(next.length - 1); selectCanvasImage(imgItem.id);
    };
    const pickImageAtCanvasPoint = async (targetCanvasPoint?: [
        number,
        number
    ]) => {
        if (Platform.OS !== "web" || typeof document === "undefined") {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true });
            const asset = result.assets?.[0];
            if (!result.canceled && asset) await addImageToCanvas(asset.base64 ? `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}` : asset.uri, targetCanvasPoint);
            return;
        }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.style.display = "none";
        input.onchange = () => {
            const file = input.files?.[0];
            document.body.removeChild(input);
            if (!file)
                return;
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
    const getImageFromClipboard = async (targetCanvasPoint?: [
        number,
        number
    ]) => {
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
        }
        catch (error) {
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
        const hasDom = Platform.OS === "web" && typeof document !== "undefined";
        if (hasDom) {
            document.getElementById("infinite-canvas-tooltips")?.remove();
            let zIndexStyle = document.getElementById("infinite-canvas-z-index-variables") as HTMLStyleElement | null;
            if (!zIndexStyle) {
                zIndexStyle = document.createElement("style");
                zIndexStyle.id = "infinite-canvas-z-index-variables";
                document.head.appendChild(zIndexStyle);
            }
            zIndexStyle.textContent = `:root {\n${zIndexCssVariables}\n}`;
            notifyDataChange({
                type: "READY",
                protocolVersion: CANVAS_EMBED_PROTOCOL_VERSION,
            });
            document.addEventListener("pointerdown", startMiddlePan, true);
            document.addEventListener("mousedown", startMiddlePan, true);
            document.addEventListener("mouseup", checkMiddleButtonUp);
            document.addEventListener("pointercancel", finishMiddlePan);
            window.addEventListener("blur", cancelMiddlePan);
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
            if (!isCanvasHostMessage(data))
                return;
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
                    pencilDrawsFingerPans: Boolean(data.config.pencilDrawsFingerPans),
                    scribbleEraseEnabled: data.config.scribbleEraseEnabled ??
                        currentPreferences.scribbleEraseEnabled,
                    scribbleEraseSensitivity: data.config.scribbleEraseSensitivity === undefined
                        ? currentPreferences.scribbleEraseSensitivity
                        : clampScribbleSensitivity(data.config.scribbleEraseSensitivity),
                }));
            }
        };
        // Add listener (web-only)
        if (hasDom && typeof window !== "undefined") {
            window.addEventListener("message", handleMessage);
        }
        // Cleanup
        return () => {
            if (!hasDom)
                return;
            if (typeof window !== "undefined") {
                window.removeEventListener("message", handleMessage);
            }
            document.removeEventListener("touchmove", preventScrollingParent);
            document.removeEventListener("gesturestart", preventScrollingParent);
            document.removeEventListener("scroll", preventScrollingParent);
            document.removeEventListener("pointerdown", startMiddlePan, true);
            document.removeEventListener("mousedown", startMiddlePan, true);
            document.removeEventListener("mouseup", checkMiddleButtonUp);
            document.removeEventListener("pointercancel", finishMiddlePan);
            window.removeEventListener("blur", cancelMiddlePan);
            const gesture = middlePanRef.current;
            middlePanRef.current = null;
            if (gesture?.pointerId != null && gesture.target.hasPointerCapture?.(gesture.pointerId)) {
                gesture.target.releasePointerCapture(gesture.pointerId);
            }
            document.removeEventListener("wheel", handleWheel);
            document.removeEventListener("keydown", ctrlZ_handler);
            document.removeEventListener("keydown", ctrlY_handler);
            document.removeEventListener("paste", paste_img_handler);
            // document.removeEventListener("wheel", handleScroll);
        };
    }, []);
    const [x, y] = getCanvasViewportTransform(scale);
    const activeCanvasItems = getVisibleCanvasItems(canvasItems.slice(0, curIdx + 1));
    const svgItems = activeCanvasItems.filter((item): item is CanvasPathItem => item.type === "path");
    const imgItems = activeCanvasItems.filter((item): item is CanvasImageItem => item.type === "image");
    const selectedBounds = svgItems.reduce<SelectionBounds | null>((bounds, item, index) => {
        if (!selectedPathIndexes.includes(index))
            return bounds;
        const padding = (item.width ?? strokeWidth) / Math.max(scale, 0.1) / 2;
        return mergeBounds(bounds, getPathItemBounds(item, padding));
    }, null);
    const selectionScreenBounds = selectedBounds
        ? {
            left: x + selectedBounds.minX * scale,
            top: y + selectedBounds.minY * scale,
            width: Math.max((selectedBounds.maxX - selectedBounds.minX) * scale, 1),
            height: Math.max((selectedBounds.maxY - selectedBounds.minY) * scale, 1),
        }
        : null;
    const { isSelectionDragging, isSelectionResizing, startSelectionDrag, moveSelectionDrag, endSelectionDrag, startSelectionResize, moveSelectionResize, endSelectionResize, cancelSelectionInteraction } = useCanvasSelectionInteractions({
        canvasItems, curIdx, setItems, setCurIdx, svgItems, selectedPathIndexes, scale, selectedBounds, clientPointToCanvasPoint, resizeSelectedPathsFromSnapshot, captureWebPointer, releaseWebPointer,
        dismissContextMenu: () => setCanvasContextMenu(null),
    });
    const canvasCursor = Platform.OS !== "web"
        ? undefined
        : middlePanning
            ? "grabbing"
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
    const [windowHeight, setWindowHeight] = useState(Dimensions.get("window").height);
    const webCanvasEventProps = Platform.OS === "web"
        ? ({ onContextMenu: openCanvasContextMenu, onLostPointerCapture: finishMiddlePan } as any)
        : {};
    useEffect(() => {
        const updateHeight = () => {
            setWindowHeight(Dimensions.get("window").height);
        };
        const subscription = Dimensions.addEventListener("change", updateHeight);
        return () => subscription?.remove(); // Cleanup on unmount
    }, []);
    return { startMiddlePan, finishMiddlePan, selectedImageId, selectCanvasImage, updateCanvasImage, insertShapeAtCenter: (tool: Exclude<ShapeTool, "freehand">) => insertShapeAtCanvasPoint(insertionCenter(), tool), insertImageAtCenter: () => pickImageAtCanvasPoint(insertionCenter()), canvasBackgroundColor, buttonsContainerColor, curIdx, canvasItems, setCurIdx, windowHeight, canvasCursor, canvasRef, nativeTouchActiveRef, onTouchMoveSvg, onTouchStartSvg, onTouchEndSvg, cancelScribbleFreeze, nativeTwoFingerGestureActiveRef, prevFingersPos, prevTwoFingerDist, setShouldBlockDrawing, eraserMode, cancelEraserGesture, lassoMode, rectangleSelectionMode, finalizeLassoSelection, prepareForNextDrawing, isSelectionResizePointerEvent, selectedPathIndexes, clearSelection, startWebEraserPointer, handleConfiguredPointerStart, handlePointerMoveSvg, handleConfiguredPointerMove, finishWebEraserPointer, handleConfiguredPointerEnd, eraserPointerIdRef, getWebPointerPosition, queueEraserTrailPoint, webCanvasEventProps, onCanvasLayout, svgRef, x, y, scale, svgItems, pendingEraseItemIds, selectedBounds, lassoPath, eraserPreviewPath, eraserPreviewOpacity, strokeColorPreview, curPath, strokeWidth, imgItems, selectionScreenBounds, isSelectionDragging, isSelectionResizing, startSelectionDrag, moveSelectionDrag, endSelectionDrag, startSelectionResize, moveSelectionResize, endSelectionResize, duplicateSelectedPaths, deleteSelectedPaths, canvasContextMenu, pasteSelectionAtContextMenu, insertImageAtContextMenu, insertShapeAtContextMenu, setCanvasContextMenu, pseudoPointerMode, pointerHintVisible, pseudoLeftClick, canvasPointToScreenPoint, pseudoPointerPos, cursorCoordinates, setPseudoLeftClick, onlyPanningMode, setColorPickerModal, activateStrokeMode, activatePanMode, activatePointerMode, activateEraserMode, confirmWipeCanvas, resetViewportToContent, smoothingEnabled, setSmoothingEnabled, shapeTool, activateShapeTool, activateLassoMode, activateRectangleSelectionMode, eraserModeType, setEraserModeType, eraserSize, setEraserSize, setStrokeWidth, setStrokeColor, clearCanvasDialogOpen, setClearCanvasDialogOpen, wipeCanvas, customSwatches, onColorSelect, showColorPickerModal };
}
