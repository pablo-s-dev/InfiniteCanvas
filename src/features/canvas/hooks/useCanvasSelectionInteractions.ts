import { useRef, useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { Platform } from "react-native";
import type { CanvasPathItem } from "../document";
import type { DrawingItem, SelectionBounds, SelectionResizeState } from "../canvasTypes";
import { mapCanvasItemPaths } from "../canvasHistory";
import { translatePathData } from "../pathTransforms";
type Options = {
    canvasItems: DrawingItem[];
    curIdx: number;
    setItems: Dispatch<SetStateAction<DrawingItem[]>>;
    setCurIdx: Dispatch<SetStateAction<number>>;
    svgItems: CanvasPathItem[];
    selectedPathIndexes: number[];
    scale: number;
    selectedBounds: SelectionBounds | null;
    clientPointToCanvasPoint: (x: number, y: number) => [
        number,
        number
    ];
    resizeSelectedPathsFromSnapshot: (factor: number, anchor: [
        number,
        number
    ], items: DrawingItem[], ids: Set<string>) => void;
    captureWebPointer: (event: any) => void;
    releaseWebPointer: (event: any) => void;
    dismissContextMenu: () => void;
};
export function useCanvasSelectionInteractions({ canvasItems, curIdx, setItems, setCurIdx, svgItems, selectedPathIndexes, scale, selectedBounds, clientPointToCanvasPoint, resizeSelectedPathsFromSnapshot, captureWebPointer, releaseWebPointer, dismissContextMenu }: Options) {
    const selectionDragLastPositionRef = useRef<[
        number,
        number
    ] | null>(null);
    const selectionDragSelectedIdsRef = useRef<Set<string>>(new Set());
    const selectionDragPendingDeltaRef = useRef<[
        number,
        number
    ]>([0, 0]);
    const selectionDragFrameRef = useRef<number | null>(null);
    const selectionResizeLastPositionRef = useRef<[
        number,
        number
    ] | null>(null);
    const selectionResizeStateRef = useRef<SelectionResizeState | null>(null);
    const [isSelectionDragging, setIsSelectionDragging] = useState(false);
    const [isSelectionResizing, setIsSelectionResizing] = useState(false);
    const translateSelectedPathsByCanvasDelta = (dx: number, dy: number, selectedPathIds = selectionDragSelectedIdsRef.current) => {
        if (selectedPathIds.size === 0)
            return;
        const now = new Date().toISOString();
        const activeItems = canvasItems.slice(0, curIdx + 1);
        const nextItems = activeItems.map((item) => mapCanvasItemPaths(item, (path) => {
            if (!selectedPathIds.has(path.id))
                return path;
            return {
                ...path,
                data: translatePathData(path.data, dx, dy),
                updatedAt: now,
            };
        }));
        setItems(nextItems);
        setCurIdx(nextItems.length - 1);
    };
    const flushSelectionDragDelta = () => {
        const [dx, dy] = selectionDragPendingDeltaRef.current;
        selectionDragPendingDeltaRef.current = [0, 0];
        if (dx === 0 && dy === 0)
            return;
        translateSelectedPathsByCanvasDelta(dx, dy);
    };
    const scheduleSelectionDragDelta = () => {
        if (selectionDragFrameRef.current !== null)
            return;
        selectionDragFrameRef.current = window.requestAnimationFrame(() => {
            selectionDragFrameRef.current = null;
            flushSelectionDragDelta();
        });
    };
    const startSelectionDrag = (event: any) => {
        if (Platform.OS !== "web" || selectedPathIndexes.length === 0)
            return;
        const nativeEvent = event.nativeEvent ?? event;
        const selected = new Set(selectedPathIndexes);
        selectionDragSelectedIdsRef.current = new Set(svgItems
            .filter((_, index) => selected.has(index))
            .map((item) => item.id));
        selectionDragLastPositionRef.current = [
            nativeEvent.clientX ?? 0,
            nativeEvent.clientY ?? 0,
        ];
        selectionDragPendingDeltaRef.current = [0, 0];
        setIsSelectionDragging(true);
        dismissContextMenu();
        captureWebPointer(event);
        event.preventDefault?.();
        event.stopPropagation?.();
    };
    const moveSelectionDrag = (event: any) => {
        const previousPosition = selectionDragLastPositionRef.current;
        if (!previousPosition)
            return;
        const nativeEvent = event.nativeEvent ?? event;
        const position: [
            number,
            number
        ] = [
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
        if (!selectionDragLastPositionRef.current)
            return;
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
        if (Platform.OS !== "web" ||
            selectedPathIndexes.length === 0 ||
            !selectedBounds) {
            return;
        }
        const nativeEvent = event.nativeEvent ?? event;
        selectionResizeLastPositionRef.current = [
            nativeEvent.clientX ?? 0,
            nativeEvent.clientY ?? 0,
        ];
        const selected = new Set(selectedPathIndexes);
        const selectedPathIds = new Set(svgItems
            .filter((_, index) => selected.has(index))
            .map((item) => item.id));
        selectionResizeStateRef.current = {
            anchor: [selectedBounds.minX, selectedBounds.minY],
            baseItems: canvasItems.slice(0, curIdx + 1),
            bounds: selectedBounds,
            selectedPathIds,
        };
        setIsSelectionResizing(true);
        dismissContextMenu();
        captureWebPointer(event);
        event.preventDefault?.();
        event.stopPropagation?.();
    };
    const moveSelectionResize = (event: any) => {
        const previousPosition = selectionResizeLastPositionRef.current;
        const resizeState = selectionResizeStateRef.current;
        if (!previousPosition || !resizeState)
            return;
        const nativeEvent = event.nativeEvent ?? event;
        const position: [
            number,
            number
        ] = [
            nativeEvent.clientX ?? previousPosition[0],
            nativeEvent.clientY ?? previousPosition[1],
        ];
        selectionResizeLastPositionRef.current = position;
        const pointerCanvasPoint = clientPointToCanvasPoint(position[0], position[1]);
        const initialVector: [
            number,
            number
        ] = [
            resizeState.bounds.maxX - resizeState.anchor[0],
            resizeState.bounds.maxY - resizeState.anchor[1],
        ];
        const currentVector: [
            number,
            number
        ] = [
            pointerCanvasPoint[0] - resizeState.anchor[0],
            pointerCanvasPoint[1] - resizeState.anchor[1],
        ];
        const denominator = initialVector[0] * initialVector[0] + initialVector[1] * initialVector[1];
        const projectedScale = denominator === 0
            ? 1
            : (currentVector[0] * initialVector[0] +
                currentVector[1] * initialVector[1]) /
                denominator;
        const factor = Math.max(0.12, Math.min(projectedScale, 8));
        resizeSelectedPathsFromSnapshot(factor, resizeState.anchor, resizeState.baseItems, resizeState.selectedPathIds);
        event.preventDefault?.();
        event.stopPropagation?.();
    };
    const endSelectionResize = (event: any) => {
        if (!selectionResizeLastPositionRef.current)
            return;
        selectionResizeLastPositionRef.current = null;
        selectionResizeStateRef.current = null;
        setIsSelectionResizing(false);
        releaseWebPointer(event);
        event.preventDefault?.();
        event.stopPropagation?.();
    };
    const cancelSelectionInteraction = () => {
        if (selectionDragFrameRef.current !== null) {
            if (Platform.OS === "web") {
                window.cancelAnimationFrame(selectionDragFrameRef.current);
            }
            selectionDragFrameRef.current = null;
        }
        selectionDragLastPositionRef.current = null;
        selectionDragSelectedIdsRef.current.clear();
        selectionDragPendingDeltaRef.current = [0, 0];
        selectionResizeLastPositionRef.current = null;
        selectionResizeStateRef.current = null;
        setIsSelectionDragging(false);
        setIsSelectionResizing(false);
    };
    useEffect(() => () => {
        if (selectionDragFrameRef.current !== null && Platform.OS === "web") {
            window.cancelAnimationFrame(selectionDragFrameRef.current);
        }
    }, []);
    return { isSelectionDragging, isSelectionResizing, startSelectionDrag, moveSelectionDrag, endSelectionDrag, startSelectionResize, moveSelectionResize, endSelectionResize, cancelSelectionInteraction };
}
