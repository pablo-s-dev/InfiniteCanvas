import { expandBounds, getBounds, boundsIntersect, distanceToSegment } from "./pathGeometry";
export const pointInPolygon = (point: [
    number,
    number
], polygon: [
    number,
    number
][]) => {
    if (polygon.length < 3)
        return false;
    const [x, y] = point;
    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
        const [xi, yi] = polygon[index];
        const [xj, yj] = polygon[previousIndex];
        const intersects = yi > y !== yj > y &&
            x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi;
        if (intersects)
            inside = !inside;
    }
    return inside;
};
export const lineSegmentsIntersect = (firstStart: [
    number,
    number
], firstEnd: [
    number,
    number
], secondStart: [
    number,
    number
], secondEnd: [
    number,
    number
]) => {
    const cross = (start: [
        number,
        number
    ], end: [
        number,
        number
    ], point: [
        number,
        number
    ]) => (end[0] - start[0]) * (point[1] - start[1]) -
        (end[1] - start[1]) * (point[0] - start[0]);
    const within = (value: number, start: number, end: number) => value >= Math.min(start, end) - 1e-8 && value <= Math.max(start, end) + 1e-8;
    const liesOnSegment = (point: [
        number,
        number
    ], start: [
        number,
        number
    ], end: [
        number,
        number
    ]) => Math.abs(cross(start, end, point)) < 1e-8 &&
        within(point[0], start[0], end[0]) &&
        within(point[1], start[1], end[1]);
    const firstSideA = cross(firstStart, firstEnd, secondStart);
    const firstSideB = cross(firstStart, firstEnd, secondEnd);
    const secondSideA = cross(secondStart, secondEnd, firstStart);
    const secondSideB = cross(secondStart, secondEnd, firstEnd);
    if (((firstSideA > 0 && firstSideB < 0) ||
        (firstSideA < 0 && firstSideB > 0)) &&
        ((secondSideA > 0 && secondSideB < 0) ||
            (secondSideA < 0 && secondSideB > 0))) {
        return true;
    }
    return (liesOnSegment(secondStart, firstStart, firstEnd) ||
        liesOnSegment(secondEnd, firstStart, firstEnd) ||
        liesOnSegment(firstStart, secondStart, secondEnd) ||
        liesOnSegment(firstEnd, secondStart, secondEnd));
};
export const pathIntersectsPolygon = (pathPoints: [
    number,
    number
][], polygon: [
    number,
    number
][], padding: number) => {
    if (pathPoints.length === 0 || polygon.length < 3)
        return false;
    const pathBounds = expandBounds(getBounds(pathPoints), padding);
    const polygonBounds = getBounds(polygon);
    if (!boundsIntersect(pathBounds, polygonBounds))
        return false;
    if (pathPoints.some((point) => pointInPolygon(point, polygon)))
        return true;
    const pathSegments = pathPoints.length === 1
        ? [[pathPoints[0], pathPoints[0]] as const]
        : pathPoints.slice(1).map((point, index) => [pathPoints[index], point] as const);
    for (const [pathStart, pathEnd] of pathSegments) {
        for (let index = 0; index < polygon.length; index += 1) {
            const polygonStart = polygon[index];
            const polygonEnd = polygon[(index + 1) % polygon.length];
            if (lineSegmentsIntersect(pathStart, pathEnd, polygonStart, polygonEnd)) {
                return true;
            }
            if (padding > 0 &&
                (distanceToSegment(pathStart, polygonStart, polygonEnd) <= padding ||
                    distanceToSegment(pathEnd, polygonStart, polygonEnd) <= padding ||
                    distanceToSegment(polygonStart, pathStart, pathEnd) <= padding ||
                    distanceToSegment(polygonEnd, pathStart, pathEnd) <= padding)) {
                return true;
            }
        }
    }
    return false;
};
