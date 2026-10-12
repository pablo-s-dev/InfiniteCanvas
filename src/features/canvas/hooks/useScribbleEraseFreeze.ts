import { useEffect, useRef, type RefObject } from "react";
import type { CanvasPreferences } from "../canvasTypes";
import { isScribbleEraseGesture } from "../scribbleGesture";
import { SCRIBBLE_TO_ERASE_FREEZE_INTERVAL_MS, SCRIBBLE_TO_ERASE_FREEZE_TOLERANCE_PX } from "../canvasConstants";
type Point = [
    number,
    number
];
export function useScribbleEraseFreeze({ pointsRef, scale, preferences, context, onFreeze }: {
    pointsRef: RefObject<Point[]>;
    scale: number;
    preferences: Pick<CanvasPreferences, "scribbleEraseEnabled" | "scribbleEraseSensitivity">;
    context: string;
    onFreeze: (points: Point[]) => boolean;
}) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const anchorRef = useRef<Point | null>(null);
    const consumedRef = useRef(false);
    const onFreezeRef = useRef(onFreeze);
    onFreezeRef.current = onFreeze;
    const cancel = () => {
        anchorRef.current = null;
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };
    const schedule = () => {
        const points = pointsRef.current;
        const lastPoint = points[points.length - 1];
        const anchor = anchorRef.current;
        // Use the pause anchor so a slow drift cannot accumulate beyond the tolerance.
        if (timerRef.current !== null && anchor && lastPoint &&
            Math.hypot(lastPoint[0] - anchor[0], lastPoint[1] - anchor[1]) * scale
                <= SCRIBBLE_TO_ERASE_FREEZE_TOLERANCE_PX)
            return;
        cancel();
        if (!lastPoint || !isScribbleEraseGesture(points, preferences))
            return;
        anchorRef.current = lastPoint;
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            anchorRef.current = null;
            if (pointsRef.current.length === 0)
                return;
            if (onFreezeRef.current(points))
                consumedRef.current = true;
        }, SCRIBBLE_TO_ERASE_FREEZE_INTERVAL_MS);
    };
    useEffect(() => {
        cancel();
        return cancel;
    }, [context, preferences.scribbleEraseEnabled, preferences.scribbleEraseSensitivity]);
    return { schedule, cancel, consumedRef };
}
