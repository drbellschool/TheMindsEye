import {
  calculatePlacementGeometryMeasurements,
  type PlacementGeometryMeasurements,
  type ScreenPoint,
} from "./placement-geometry-measurements.ts";
import {
  calculateSourceBoundingBox,
  validateNormalizedPolygon,
  type SanbornNormalizedPoint,
} from "./sanborn-atlas.ts";

export function normalizedSourcePointsToPixels(
  points: SanbornNormalizedPoint[],
  width: number,
  height: number,
): ScreenPoint[] {
  return points.map((point) => ({ x: point.x * width, y: point.y * height }));
}

export function calculateSourceQuadrilateralMeasurements(
  points: SanbornNormalizedPoint[],
  width: number,
  height: number,
): PlacementGeometryMeasurements | null {
  if (points.length !== 4 || width <= 0 || height <= 0) return null;
  return calculatePlacementGeometryMeasurements(
    normalizedSourcePointsToPixels(points, width, height) as [
      ScreenPoint,
      ScreenPoint,
      ScreenPoint,
      ScreenPoint,
    ],
  );
}

function signedArea(points: ScreenPoint[]): number {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function orderedPixelPoints(
  points: SanbornNormalizedPoint[],
  width: number,
  height: number,
): ScreenPoint[] | null {
  const pixels = normalizedSourcePointsToPixels(points, width, height);
  if (
    pixels.length !== 4 ||
    !pixels.every(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    )
  )
    return null;
  const originalWinding = Math.sign(signedArea(pixels));
  const center = pixels.reduce(
    (sum, point) => ({
      x: sum.x + point.x / pixels.length,
      y: sum.y + point.y / pixels.length,
    }),
    { x: 0, y: 0 },
  );
  const ordered = [...pixels].sort(
    (a, b) =>
      Math.atan2(a.y - center.y, a.x - center.x) -
      Math.atan2(b.y - center.y, b.x - center.x),
  );
  if (Math.sign(signedArea(ordered)) !== originalWinding) ordered.reverse();
  const start = ordered.reduce(
    (best, point, index) =>
      point.x + point.y < ordered[best].x + ordered[best].y ? index : best,
    0,
  );
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

export type SquareSanbornResult =
  { ok: true; points: SanbornNormalizedPoint[] } | { ok: false; error: string };

export function squareSanbornQuadrilateral(
  points: SanbornNormalizedPoint[],
  width: number,
  height: number,
): SquareSanbornResult {
  if (points.length !== 4 || width <= 0 || height <= 0)
    return {
      ok: false,
      error: "Square corners requires a four-corner polygon.",
    };
  const ordered = orderedPixelPoints(points, width, height);
  if (!ordered || !validateNormalizedPolygon(points).ok)
    return { ok: false, error: "This polygon is invalid or self-crossing." };
  const center = ordered.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 },
  );
  let axis = {
    x: ordered[1].x - ordered[0].x + ordered[2].x - ordered[3].x,
    y: ordered[1].y - ordered[0].y + ordered[2].y - ordered[3].y,
  };
  const axisLength = Math.hypot(axis.x, axis.y);
  if (axisLength < 0.001)
    return {
      ok: false,
      error: "The polygon has no stable dominant direction.",
    };
  axis = { x: axis.x / axisLength, y: axis.y / axisLength };
  let perpendicular = { x: -axis.y, y: axis.x };
  const sideVector = {
    x: ordered[3].x - ordered[0].x + ordered[2].x - ordered[1].x,
    y: ordered[3].y - ordered[0].y + ordered[2].y - ordered[1].y,
  };
  if (sideVector.x * perpendicular.x + sideVector.y * perpendicular.y < 0)
    perpendicular = { x: -perpendicular.x, y: -perpendicular.y };
  const halfWidth =
    (distance(ordered[0], ordered[1]) + distance(ordered[2], ordered[3])) / 4;
  const halfHeight =
    (distance(ordered[1], ordered[2]) + distance(ordered[3], ordered[0])) / 4;
  if (halfWidth < 0.001 || halfHeight < 0.001)
    return { ok: false, error: "The polygon is too small to square safely." };
  let result = [
    {
      x: center.x - axis.x * halfWidth - perpendicular.x * halfHeight,
      y: center.y - axis.y * halfWidth - perpendicular.y * halfHeight,
    },
    {
      x: center.x + axis.x * halfWidth - perpendicular.x * halfHeight,
      y: center.y + axis.y * halfWidth - perpendicular.y * halfHeight,
    },
    {
      x: center.x + axis.x * halfWidth + perpendicular.x * halfHeight,
      y: center.y + axis.y * halfWidth + perpendicular.y * halfHeight,
    },
    {
      x: center.x - axis.x * halfWidth + perpendicular.x * halfHeight,
      y: center.y - axis.y * halfWidth + perpendicular.y * halfHeight,
    },
  ];
  const minX = Math.min(...result.map((point) => point.x));
  const maxX = Math.max(...result.map((point) => point.x));
  const minY = Math.min(...result.map((point) => point.y));
  const maxY = Math.max(...result.map((point) => point.y));
  const fitScale = Math.min(
    1,
    (width - 1) / Math.max(1, maxX - minX),
    (height - 1) / Math.max(1, maxY - minY),
  );
  if (fitScale < 1)
    result = result.map((point) => ({
      x: center.x + (point.x - center.x) * fitScale,
      y: center.y + (point.y - center.y) * fitScale,
    }));
  const fittedMinX = Math.min(...result.map((point) => point.x));
  const fittedMaxX = Math.max(...result.map((point) => point.x));
  const fittedMinY = Math.min(...result.map((point) => point.y));
  const fittedMaxY = Math.max(...result.map((point) => point.y));
  const shiftX =
    fittedMinX < 0 ? -fittedMinX : fittedMaxX > width ? width - fittedMaxX : 0;
  const shiftY =
    fittedMinY < 0
      ? -fittedMinY
      : fittedMaxY > height
        ? height - fittedMaxY
        : 0;
  result = result.map((point) => ({
    x: point.x + shiftX,
    y: point.y + shiftY,
  }));
  const normalized = result.map((point) => ({
    x: Math.max(0, Math.min(1, point.x / width)),
    y: Math.max(0, Math.min(1, point.y / height)),
  }));
  return { ok: true, points: normalized };
}

export function isSourceQuadrilateralAlreadySquare(
  points: SanbornNormalizedPoint[],
  width: number,
  height: number,
  tolerance = 0.25,
): boolean {
  const measurements = calculateSourceQuadrilateralMeasurements(
    points,
    width,
    height,
  );
  return Boolean(
    measurements?.valid &&
    measurements.maximumCornerDeviation <= tolerance &&
    measurements.oppositeEdgeDrift.topBottom <= tolerance &&
    measurements.oppositeEdgeDrift.leftRight <= tolerance,
  );
}
