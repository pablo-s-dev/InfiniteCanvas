import type { ShapeTool, SelectionBounds } from "./canvasTypes";
import type { CanvasPathItem } from "./document";
export const buildSmoothedPath = (points: [
    number,
    number
][]) => {
    if (points.length === 0)
        return "";
    if (points.length === 1)
        return `M ${points[0][0]} ${points[0][1]} `;
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
export const buildShapePath = (start: [
    number,
    number
], end: [
    number,
    number
], tool: ShapeTool) => {
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
export const extractPathPoints = (pathData: string): [
    number,
    number
][] => {
    const matches = pathData.match(/[MLQAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    const points: [
        number,
        number
    ][] = [];
    let index = 0;
    let command = "";
    let current: [
        number,
        number
    ] = [0, 0];
    let subpathStart: [
        number,
        number
    ] = [0, 0];
    const readNumber = () => Number(matches[index++]);
    const addPoint = (point: [
        number,
        number
    ]) => {
        if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]))
            return;
        points.push(point);
        current = point;
    };
    const distanceBetween = (first: [
        number,
        number
    ], second: [
        number,
        number
    ]) => Math.hypot(second[0] - first[0], second[1] - first[1]);
    const sampleArc = (radiusXValue: number, radiusYValue: number, rotationDegrees: number, largeArcValue: number, sweepValue: number, end: [
        number,
        number
    ]) => {
        let radiusX = Math.abs(radiusXValue);
        let radiusY = Math.abs(radiusYValue);
        const [startX, startY] = current;
        const [endX, endY] = end;
        if (radiusX === 0 || radiusY === 0 || (startX === endX && startY === endY)) {
            addPoint(end);
            return;
        }
        const rotation = (rotationDegrees * Math.PI) / 180;
        const cosRotation = Math.cos(rotation);
        const sinRotation = Math.sin(rotation);
        const halfDeltaX = (startX - endX) / 2;
        const halfDeltaY = (startY - endY) / 2;
        const transformedX = cosRotation * halfDeltaX + sinRotation * halfDeltaY;
        const transformedY = -sinRotation * halfDeltaX + cosRotation * halfDeltaY;
        const radiusScale = (transformedX * transformedX) / (radiusX * radiusX) +
            (transformedY * transformedY) / (radiusY * radiusY);
        if (radiusScale > 1) {
            const scale = Math.sqrt(radiusScale);
            radiusX *= scale;
            radiusY *= scale;
        }
        const radiusXSquared = radiusX * radiusX;
        const radiusYSquared = radiusY * radiusY;
        const transformedXSquared = transformedX * transformedX;
        const transformedYSquared = transformedY * transformedY;
        const denominator = radiusXSquared * transformedYSquared +
            radiusYSquared * transformedXSquared;
        const numerator = Math.max(0, radiusXSquared * radiusYSquared -
            radiusXSquared * transformedYSquared -
            radiusYSquared * transformedXSquared);
        const direction = largeArcValue === sweepValue ? -1 : 1;
        const centerFactor = denominator === 0 ? 0 : direction * Math.sqrt(numerator / denominator);
        const centerTransformedX = centerFactor * ((radiusX * transformedY) / radiusY);
        const centerTransformedY = centerFactor * (-(radiusY * transformedX) / radiusX);
        const centerX = cosRotation * centerTransformedX -
            sinRotation * centerTransformedY +
            (startX + endX) / 2;
        const centerY = sinRotation * centerTransformedX +
            cosRotation * centerTransformedY +
            (startY + endY) / 2;
        const startVector: [
            number,
            number
        ] = [
            (transformedX - centerTransformedX) / radiusX,
            (transformedY - centerTransformedY) / radiusY,
        ];
        const endVector: [
            number,
            number
        ] = [
            (-transformedX - centerTransformedX) / radiusX,
            (-transformedY - centerTransformedY) / radiusY,
        ];
        const vectorAngle = (first: [
            number,
            number
        ], second: [
            number,
            number
        ]) => Math.atan2(first[0] * second[1] - first[1] * second[0], first[0] * second[0] + first[1] * second[1]);
        const startAngle = vectorAngle([1, 0], startVector);
        let angleDelta = vectorAngle(startVector, endVector);
        if (sweepValue === 0 && angleDelta > 0)
            angleDelta -= 2 * Math.PI;
        if (sweepValue !== 0 && angleDelta < 0)
            angleDelta += 2 * Math.PI;
        const arcLengthEstimate = Math.abs(angleDelta) * Math.max(radiusX, radiusY);
        const steps = Math.max(8, Math.min(96, Math.ceil(arcLengthEstimate / 8)));
        for (let step = 1; step <= steps; step += 1) {
            const angle = startAngle + (angleDelta * step) / steps;
            const ellipseX = radiusX * Math.cos(angle);
            const ellipseY = radiusY * Math.sin(angle);
            addPoint([
                centerX + cosRotation * ellipseX - sinRotation * ellipseY,
                centerY + sinRotation * ellipseX + cosRotation * ellipseY,
            ]);
        }
        current = end;
    };
    while (index < matches.length) {
        const token = matches[index++];
        if (/^[MLQAZ]$/i.test(token)) {
            command = token.toUpperCase();
            if (command === "Z") {
                if (current[0] !== subpathStart[0] || current[1] !== subpathStart[1]) {
                    addPoint(subpathStart);
                }
                current = subpathStart;
                continue;
            }
        }
        else {
            index -= 1;
        }
        if (!command)
            continue;
        if (command === "M" || command === "L") {
            if (index + 1 >= matches.length)
                break;
            const point: [
                number,
                number
            ] = [readNumber(), readNumber()];
            addPoint(point);
            if (command === "M") {
                subpathStart = point;
                command = "L";
            }
            continue;
        }
        if (command === "Q") {
            if (index + 3 >= matches.length)
                break;
            const start = current;
            const control: [
                number,
                number
            ] = [readNumber(), readNumber()];
            const end: [
                number,
                number
            ] = [readNumber(), readNumber()];
            const lengthEstimate = distanceBetween(start, control) + distanceBetween(control, end);
            const steps = Math.max(8, Math.min(64, Math.ceil(lengthEstimate / 10)));
            for (let step = 1; step <= steps; step += 1) {
                const t = step / steps;
                const inverseT = 1 - t;
                addPoint([
                    inverseT * inverseT * start[0] +
                        2 * inverseT * t * control[0] +
                        t * t * end[0],
                    inverseT * inverseT * start[1] +
                        2 * inverseT * t * control[1] +
                        t * t * end[1],
                ]);
            }
            current = end;
            continue;
        }
        if (command === "A") {
            if (index + 6 >= matches.length)
                break;
            const radiusX = readNumber();
            const radiusY = readNumber();
            const rotation = readNumber();
            const largeArc = readNumber();
            const sweep = readNumber();
            const end: [
                number,
                number
            ] = [readNumber(), readNumber()];
            sampleArc(radiusX, radiusY, rotation, largeArc, sweep, end);
            continue;
        }
    }
    return points;
};
export const getBounds = (points: [
    number,
    number
][]) => {
    if (points.length === 0)
        return null;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
    };
};
export const expandBounds = (bounds: SelectionBounds | null, padding: number): SelectionBounds | null => {
    if (!bounds)
        return null;
    return {
        minX: bounds.minX - padding,
        maxX: bounds.maxX + padding,
        minY: bounds.minY - padding,
        maxY: bounds.maxY + padding,
    };
};
export const getPathItemBounds = (item: CanvasPathItem, padding = 0): SelectionBounds | null => expandBounds(getBounds(extractPathPoints(item.data)), padding);
export const boundsIntersect = (first: SelectionBounds | null, second: SelectionBounds | null) => {
    if (!first || !second)
        return false;
    return !(first.maxX < second.minX ||
        first.minX > second.maxX ||
        first.maxY < second.minY ||
        first.minY > second.maxY);
};
export const mergeBounds = (currentBounds: SelectionBounds | null, nextBounds: SelectionBounds | null): SelectionBounds | null => {
    if (!nextBounds)
        return currentBounds;
    if (!currentBounds)
        return nextBounds;
    return {
        minX: Math.min(currentBounds.minX, nextBounds.minX),
        maxX: Math.max(currentBounds.maxX, nextBounds.maxX),
        minY: Math.min(currentBounds.minY, nextBounds.minY),
        maxY: Math.max(currentBounds.maxY, nextBounds.maxY),
    };
};
export const distanceToSegment = (point: [
    number,
    number
], start: [
    number,
    number
], end: [
    number,
    number
]) => {
    const [px, py] = point;
    const [x1, y1] = start;
    const [x2, y2] = end;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
        return Math.hypot(px - x1, py - y1);
    }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
    const projectedX = x1 + t * dx;
    const projectedY = y1 + t * dy;
    return Math.hypot(px - projectedX, py - projectedY);
};
export const pathPointsIntersectPoint = (pathPoints: [
    number,
    number
][], point: [
    number,
    number
], threshold: number) => {
    if (pathPoints.length === 0)
        return false;
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
export const pathIntersectsPoint = (pathData: string, point: [
    number,
    number
], threshold: number) => pathPointsIntersectPoint(extractPathPoints(pathData), point, threshold);
export const clampScribbleSensitivity = (value: unknown) => {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue))
        return 1;
    return Math.min(1.8, Math.max(0.45, numericValue));
};
export const isShapeTool = (value: unknown): value is ShapeTool => value === "freehand" || value === "line" || value === "rectangle" || value === "ellipse";
