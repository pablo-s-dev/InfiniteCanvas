export type EraserPoint = [number, number];

const distanceToSegment = (
  point: EraserPoint,
  start: EraserPoint,
  end: EraserPoint,
) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    point[0] - (start[0] + dx * progress),
    point[1] - (start[1] + dy * progress),
  );
};

const distanceToPolyline = (point: EraserPoint, line: EraserPoint[]) => {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  if (line.length === 1) return Math.hypot(point[0] - line[0][0], point[1] - line[0][1]);

  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    distance = Math.min(
      distance,
      distanceToSegment(point, line[index - 1], line[index]),
    );
  }
  return distance;
};

const interpolate = (
  start: EraserPoint,
  end: EraserPoint,
  progress: number,
): EraserPoint => [
  start[0] + (end[0] - start[0]) * progress,
  start[1] + (end[1] - start[1]) * progress,
];

const boundaryPoint = (
  start: EraserPoint,
  end: EraserPoint,
  startIsErased: boolean,
  erasePath: EraserPoint[],
  radius: number,
) => {
  let low = 0;
  let high = 1;
  for (let index = 0; index < 12; index += 1) {
    const middle = (low + high) / 2;
    const middleIsErased =
      distanceToPolyline(interpolate(start, end, middle), erasePath) <= radius;
    if (middleIsErased === startIsErased) low = middle;
    else high = middle;
  }
  return interpolate(start, end, (low + high) / 2);
};

const coordinate = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));

const pathForPoints = (points: EraserPoint[]) =>
  points
    .map(
      (point, index) =>
        (index === 0 ? "M " : "L ") +
        coordinate(point[0]) +
        " " +
        coordinate(point[1]),
    )
    .join(" ");

export const splitPolylineByErasePath = (
  source: EraserPoint[],
  erasePath: EraserPoint[],
  radius: number,
): string[] | null => {
  if (source.length === 0 || erasePath.length === 0 || radius <= 0) return null;

  const sampleStep = Math.max(0.25, Math.min(2, radius / 3));
  const samples: EraserPoint[] = [source[0]];
  for (let index = 1; index < source.length; index += 1) {
    const start = source[index - 1];
    const end = source[index];
    const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const steps = Math.max(1, Math.ceil(distance / sampleStep));
    for (let step = 1; step <= steps; step += 1) {
      samples.push(interpolate(start, end, step / steps));
    }
  }

  const isErased = samples.map(
    (point) => distanceToPolyline(point, erasePath) <= radius,
  );
  if (!isErased.some(Boolean)) return null;

  const fragments: string[] = [];
  let fragment: EraserPoint[] = [];
  const saveFragment = () => {
    if (fragment.length > 1) fragments.push(pathForPoints(fragment));
    fragment = [];
  };

  if (!isErased[0]) fragment.push(samples[0]);
  for (let index = 1; index < samples.length; index += 1) {
    const previousIsErased = isErased[index - 1];
    const currentIsErased = isErased[index];
    const previous = samples[index - 1];
    const current = samples[index];

    if (previousIsErased !== currentIsErased) {
      const boundary = boundaryPoint(
        previous,
        current,
        previousIsErased,
        erasePath,
        radius,
      );
      if (previousIsErased) {
        fragment = [boundary];
      } else {
        fragment.push(boundary);
        saveFragment();
      }
    }

    if (!currentIsErased) {
      if (fragment.length === 0) fragment.push(current);
      else if (fragment.at(-1) !== current) fragment.push(current);
    }
  }

  if (fragment.length > 1) fragments.push(pathForPoints(fragment));
  if (fragments.length === 0) return [];
  return fragments;
};
