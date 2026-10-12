import type { CanvasPreferences } from "./canvasTypes";
import { getBounds, clampScribbleSensitivity } from "./pathGeometry";
export const isScribbleEraseGesture = (points: [
    number,
    number
][], preferences: Pick<CanvasPreferences, "scribbleEraseEnabled" | "scribbleEraseSensitivity">) => {
    if (!preferences.scribbleEraseEnabled)
        return false;
    if (points.length < 14)
        return false;
    const sensitivity = clampScribbleSensitivity(preferences.scribbleEraseSensitivity);
    const bounds = getBounds(points);
    if (!bounds)
        return false;
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
        if (segmentDistance < 1)
            continue;
        distance += segmentDistance;
        const angle = Math.atan2(dy, dx);
        if (previousAngle !== null) {
            const delta = Math.abs(Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle)));
            if (delta > 1.25)
                directionChanges += 1;
        }
        previousAngle = angle;
    }
    return (width > 8 / sensitivity &&
        height > 8 / sensitivity &&
        directionChanges >= Math.max(3, Math.round(5 / sensitivity)) &&
        distance / diagonal > 2.6 / sensitivity);
};
