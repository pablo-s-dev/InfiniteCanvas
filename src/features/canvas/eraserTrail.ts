export const ERASER_TRAIL_DURATION_MS = 160;
export const ERASER_TRAIL_SIZE_PX = 12;

export interface EraserTrailPoint {
  x: number;
  y: number;
  time: number;
}

type Point = Pick<EraserTrailPoint, "x" | "y">;

/** Keep only the recent tail, interpolating its first point to avoid a visible pop. */
export function eraserTrailPointsAtTime(
  points: EraserTrailPoint[],
  now: number,
): Point[] {
  const cutoff = now - ERASER_TRAIL_DURATION_MS;
  while (points.length > 1 && points[1].time <= cutoff) points.shift();
  if (points.length < 2 || points[0].time >= cutoff) return points;

  const first = points[0];
  const next = points[1];
  const progress = Math.min(
    1,
    (cutoff - first.time) / Math.max(0.001, next.time - first.time),
  );
  return [
    {
      x: first.x + (next.x - first.x) * progress,
      y: first.y + (next.y - first.y) * progress,
    },
    ...points.slice(1),
  ];
}

function smoothPoints(points: Point[]) {
  if (points.length < 3) return points;
  const smoothed = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    smoothed.push(
      {
        x: current.x * 0.75 + next.x * 0.25,
        y: current.y * 0.75 + next.y * 0.25,
      },
      {
        x: current.x * 0.25 + next.x * 0.75,
        y: current.y * 0.25 + next.y * 0.75,
      },
    );
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

function coordinate(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

/** Build the curved, tapered ribbon used for the readTogether eraser tail. */
export function eraserTrailPath(
  points: Point[],
  sizePx = ERASER_TRAIL_SIZE_PX,
) {
  const distinctPoints = points.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) >=
        0.35,
  );
  const smoothed = smoothPoints(distinctPoints);
  if (!smoothed.length) return "";

  if (smoothed.length === 1) {
    const point = smoothed[0];
    const radius = sizePx / 2;
    return [
      `M ${coordinate(point.x + radius)} ${coordinate(point.y)}`,
      `A ${coordinate(radius)} ${coordinate(radius)} 0 1 0 ${coordinate(point.x - radius)} ${coordinate(point.y)}`,
      `A ${coordinate(radius)} ${coordinate(radius)} 0 1 0 ${coordinate(point.x + radius)} ${coordinate(point.y)}`,
      "Z",
    ].join(" ");
  }

  const left: Point[] = [];
  const right: Point[] = [];
  const distances = [0];
  for (let index = 1; index < smoothed.length; index += 1) {
    distances.push(
      distances[index - 1] +
        Math.hypot(
          smoothed[index].x - smoothed[index - 1].x,
          smoothed[index].y - smoothed[index - 1].y,
        ),
    );
  }

  const length = distances[distances.length - 1];
  const taperStrength = Math.min(1, length / (sizePx * 2));
  const radiusAt = (progress: number) =>
    (sizePx / 2) *
    (1 -
      taperStrength *
        (1 - Math.max(0.08, Math.pow(progress, 0.72))));

  for (let index = 0; index < smoothed.length; index += 1) {
    const previous = smoothed[Math.max(0, index - 1)];
    const next = smoothed[Math.min(smoothed.length - 1, index + 1)];
    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentY));
    const radius = radiusAt(distances[index] / Math.max(0.001, length));
    const normalX = -tangentY / tangentLength;
    const normalY = tangentX / tangentLength;
    left.push({
      x: smoothed[index].x + normalX * radius,
      y: smoothed[index].y + normalY * radius,
    });
    right.push({
      x: smoothed[index].x - normalX * radius,
      y: smoothed[index].y - normalY * radius,
    });
  }

  const headRadius = sizePx / 2;
  const tailRadius = radiusAt(0);
  const formatPoint = (point: Point) =>
    `${coordinate(point.x)} ${coordinate(point.y)}`;
  return [
    `M ${formatPoint(left[0])}`,
    ...left.slice(1).map((point) => `L ${formatPoint(point)}`),
    `A ${coordinate(headRadius)} ${coordinate(headRadius)} 0 0 0 ${formatPoint(right[right.length - 1])}`,
    ...right
      .slice(0, -1)
      .reverse()
      .map((point) => `L ${formatPoint(point)}`),
    `A ${coordinate(tailRadius)} ${coordinate(tailRadius)} 0 0 0 ${formatPoint(left[0])}`,
    "Z",
  ].join(" ");
}
