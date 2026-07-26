export type ScreenPoint = { x: number; y: number };

export type PlacementGeometryMeasurements = {
  valid: boolean;
  message: string | null;
  corners: Array<{ name: "NW" | "NE" | "SE" | "SW"; angle: number; deviation: number; point: ScreenPoint }>;
  edges: Array<{ name: "top" | "right" | "bottom" | "left"; bearing: number }>;
  oppositeEdgeDrift: { topBottom: number; leftRight: number };
  maximumCornerDeviation: number;
};

const cornerNames = ["NW", "NE", "SE", "SW"] as const;
const edgeNames = ["top", "right", "bottom", "left"] as const;

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalizeBearing(value: number): number {
  return (value + 360) % 360;
}

export function compareParallelBearings(first: number, second: number): number {
  const difference = Math.abs(((first - second + 180) % 360) - 180);
  return Math.min(difference, Math.abs(180 - difference));
}

function edgeBearing(start: ScreenPoint, end: ScreenPoint): number {
  return normalizeBearing((Math.atan2(end.x - start.x, -(end.y - start.y)) * 180) / Math.PI);
}

function polygonIsValid(points: ScreenPoint[]): boolean {
  const crossProducts = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    return (point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x);
  });
  if (crossProducts.some((value) => Math.abs(value) < 0.0001)) return false;
  const sign = Math.sign(crossProducts[0]);
  return crossProducts.every((value) => Math.sign(value) === sign);
}

export function calculatePlacementGeometryMeasurements(points: [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint]): PlacementGeometryMeasurements {
  if (points.some((point, index) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || distance(point, points[(index + 1) % points.length]) < 0.5) || !polygonIsValid(points)) {
    return { valid: false, message: "Invalid corner order", corners: [], edges: [], oppositeEdgeDrift: { topBottom: 0, leftRight: 0 }, maximumCornerDeviation: 0 };
  }

  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const firstLength = distance(point, previous);
    const secondLength = distance(point, next);
    const dot = (previous.x - point.x) * (next.x - point.x) + (previous.y - point.y) * (next.y - point.y);
    const cosine = Math.max(-1, Math.min(1, dot / (firstLength * secondLength)));
    const angle = (Math.acos(cosine) * 180) / Math.PI;
    return { name: cornerNames[index], angle, deviation: angle - 90, point };
  });
  const edges = points.map((point, index) => ({ name: edgeNames[index], bearing: edgeBearing(point, points[(index + 1) % points.length]) }));
  const maximumCornerDeviation = Math.max(...corners.map((corner) => Math.abs(corner.deviation)));

  return {
    valid: true,
    message: null,
    corners,
    edges,
    oppositeEdgeDrift: { topBottom: compareParallelBearings(edges[0].bearing, edges[2].bearing), leftRight: compareParallelBearings(edges[1].bearing, edges[3].bearing) },
    maximumCornerDeviation,
  };
}

export function formatGeometryMeasurement(value: number): string {
  return value.toFixed(1);
}
