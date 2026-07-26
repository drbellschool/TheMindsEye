import type { GeoCoordinate, GeoCorners } from "./historical-map-georeference.ts";
import type { SanbornMapPieceRecord, SanbornNormalizedPoint } from "./sanborn-atlas.ts";
import type { SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";
import { calculateSourceBoundingBox } from "./sanborn-atlas.ts";
import { formatMapPiecePlacementLabel } from "./map-piece-label.ts";

export type StreetAlignmentGuide = {
  pieceId: string;
  label: string;
  geometryType: "line" | "junction" | "polygon";
  sourcePoints: SanbornNormalizedPoint[];
};

function pointsFor(piece: SanbornMapPieceRecord): SanbornNormalizedPoint[] {
  return piece.sourceGeometry?.points ?? piece.sourcePolygon ?? [];
}

function bboxIntersects(a: ReturnType<typeof calculateSourceBoundingBox>, b: ReturnType<typeof calculateSourceBoundingBox>): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function findNearbyStreetAlignmentGuides(args: {
  selectedPiece: SanbornMapPieceRecord | null;
  pagePieces: SanbornMapPieceRecord[];
  padding?: number;
}): StreetAlignmentGuide[] {
  if (!args.selectedPiece) return [];
  const selectedPoints = pointsFor(args.selectedPiece);
  if (selectedPoints.length < 2) return [];
  const selected = calculateSourceBoundingBox(selectedPoints);
  const padding = args.padding ?? Math.max(selected.maxX - selected.minX, selected.maxY - selected.minY) * 0.5;
  const neighborhood = {
    minX: Math.max(0, selected.minX - padding), maxX: Math.min(1, selected.maxX + padding),
    minY: Math.max(0, selected.minY - padding), maxY: Math.min(1, selected.maxY + padding),
  };
  return args.pagePieces
    .filter((piece) => piece.pieceId !== args.selectedPiece?.pieceId && piece.atlasPageId === args.selectedPiece?.atlasPageId && piece.featureCategory === "streets_and_intersections")
    .map((piece) => ({ piece, points: pointsFor(piece) }))
    .filter(({ points }) => points.length > 0 && bboxIntersects(calculateSourceBoundingBox(points), neighborhood))
    .sort((a, b) => a.piece.pieceSequence - b.piece.pieceSequence)
    .slice(0, 8)
    .map(({ piece, points }) => ({ pieceId: piece.pieceId, label: formatMapPiecePlacementLabel(piece), geometryType: piece.sourceGeometry?.geometryType === "junction" ? "junction" : piece.sourceGeometry?.geometryType === "polygon" ? "polygon" : "line", sourcePoints: points }));
}

function lerp(a: GeoCoordinate, b: GeoCoordinate, amount: number): GeoCoordinate {
  return { latitude: a.latitude + (b.latitude - a.latitude) * amount, longitude: a.longitude + (b.longitude - a.longitude) * amount };
}

export function projectNormalizedPointThroughPlacement(point: SanbornNormalizedPoint, corners: GeoCorners): GeoCoordinate | null {
  if (!corners.northwest || !corners.northeast || !corners.southeast || !corners.southwest) return null;
  const top = lerp(corners.northwest, corners.northeast, point.x);
  const bottom = lerp(corners.southwest, corners.southeast, point.x);
  return lerp(top, bottom, point.y);
}

export function projectStreetGuideThroughPlacement(guide: StreetAlignmentGuide, corners: GeoCorners): GeoCoordinate[] {
  return guide.sourcePoints.map((point) => projectNormalizedPointThroughPlacement(point, corners)).filter((point): point is GeoCoordinate => Boolean(point));
}

export type StreetEdgeComparison = { edge: string; streetLabel: string; directionalDifference: number; distancePixels: number; reliable: boolean };

export function normalizeBearingDifference(a: number, b: number): number {
  const raw = Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
  return Math.min(raw, Math.abs(180 - raw));
}

export function compareBlockEdgesToStreetGuides(args: { edges: Array<{ edge: string; start: { x: number; y: number }; end: { x: number; y: number } }>; guides: Array<{ label: string; points: Array<{ x: number; y: number }> }>; maxDistance?: number }): StreetEdgeComparison[] {
  const maxDistance = args.maxDistance ?? 180;
  const bearing = (start: { x: number; y: number }, end: { x: number; y: number }) => (Math.atan2(end.x - start.x, -(end.y - start.y)) * 180 / Math.PI + 360) % 360;
  return args.edges.flatMap((edge) => {
    const midpoint = { x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 };
    const blockBearing = bearing(edge.start, edge.end);
    const candidate = args.guides.map((guide) => {
      const closest = guide.points.reduce((best, point) => Math.min(best, Math.hypot(point.x - midpoint.x, point.y - midpoint.y)), Number.POSITIVE_INFINITY);
      const guideBearing = guide.points.length > 1 ? bearing(guide.points[0], guide.points[guide.points.length - 1]) : blockBearing;
      return { guide, distance: closest, difference: normalizeBearingDifference(blockBearing, guideBearing) };
    }).sort((a, b) => a.distance - b.distance)[0];
    if (!candidate) return [];
    return [{ edge: edge.edge, streetLabel: candidate.guide.label, directionalDifference: candidate.difference, distancePixels: candidate.distance, reliable: candidate.distance <= maxDistance && candidate.guide.points.length > 1 }];
  });
}
