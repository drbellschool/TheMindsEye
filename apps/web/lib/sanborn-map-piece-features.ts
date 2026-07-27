import { calculateSourceBoundingBox, validateNormalizedPolygon, type SanbornNormalizedPoint, type SanbornSourceBBox } from "./sanborn-atlas.ts";

export const sanbornMapPieceGeometryTypes = ["point", "line", "polygon", "junction"] as const;
export const sanbornMapPieceFeatureCategories = ["blocks_and_lots", "wells", "hydrants", "water_routes_and_junctions", "rail_and_transportation", "streets_and_intersections", "detached_or_unusual", "printed_notes_and_miscellaneous"] as const;
export const sanbornMapPieceReviewStatuses = ["not_reviewed", "in_progress", "reviewed_found", "reviewed_none_found"] as const;
export const sanbornMapPiecePlacementEligibilities = ["available", "reference_only", "unresolved"] as const;
export const streetAlignmentFeatureEnabled = false;

export function isStreetAlignmentFeatureEnabled(): boolean {
  return streetAlignmentFeatureEnabled;
}

export function getActiveSanbornMapPieceFeatureCategories(current?: SanbornMapPieceFeatureCategory | null): SanbornMapPieceFeatureCategory[] {
  return sanbornMapPieceFeatureCategories.filter((category) => category !== "streets_and_intersections" || streetAlignmentFeatureEnabled || current === category);
}
export const sanbornMapPieceFeatureCategoryLabels: Record<(typeof sanbornMapPieceFeatureCategories)[number], string> = {
  blocks_and_lots: "Blocks and lots",
  wells: "Wells",
  hydrants: "Hydrants",
  water_routes_and_junctions: "Water routes and junctions",
  rail_and_transportation: "Rail and transportation",
  streets_and_intersections: "Streets and intersections",
  detached_or_unusual: "Detached or unusual features",
  printed_notes_and_miscellaneous: "Printed notes and miscellaneous",
};

export type SanbornMapPieceGeometryType = (typeof sanbornMapPieceGeometryTypes)[number];
export type SanbornMapPieceFeatureCategory = (typeof sanbornMapPieceFeatureCategories)[number];
export type SanbornMapPieceReviewStatus = (typeof sanbornMapPieceReviewStatuses)[number];
export type SanbornMapPiecePlacementEligibility = (typeof sanbornMapPiecePlacementEligibilities)[number];
export type SanbornMapPieceSourceGeometry = {
  geometryType: SanbornMapPieceGeometryType;
  points: SanbornNormalizedPoint[];
};
export type SanbornMapPieceReviewCategories = Partial<Record<SanbornMapPieceFeatureCategory, SanbornMapPieceReviewStatus>>;

export type SanbornFeatureGeometryValidation =
  | { ok: true; geometry: SanbornMapPieceSourceGeometry; bbox: SanbornSourceBBox; legacyPolygon: SanbornNormalizedPoint[] }
  | { ok: false; error: string };

function finitePoint(value: unknown): value is SanbornNormalizedPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number(candidate.x) >= 0 && Number(candidate.x) <= 1 && Number(candidate.y) >= 0 && Number(candidate.y) <= 1;
}

function normalizedPoints(value: unknown): SanbornNormalizedPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = value.map((point) => (finitePoint(point) ? { x: Number((point as SanbornNormalizedPoint).x), y: Number((point as SanbornNormalizedPoint).y) } : null));
  return points.every(Boolean) ? (points as SanbornNormalizedPoint[]) : null;
}

function legacyPolygonFromGeometry(points: SanbornNormalizedPoint[]): SanbornNormalizedPoint[] {
  const bbox = calculateSourceBoundingBox(points);
  const epsilon = 0.000001;
  const rawMinX = Math.max(0, Math.min(1, bbox.minX));
  const minX = rawMinX >= 1 - epsilon ? 1 - epsilon : rawMinX;
  const maxX = Math.max(0, Math.min(1, Math.max(bbox.maxX, minX + epsilon)));
  const rawMinY = Math.max(0, Math.min(1, bbox.minY));
  const minY = rawMinY >= 1 - epsilon ? 1 - epsilon : rawMinY;
  const maxY = Math.max(0, Math.min(1, Math.max(bbox.maxY, minY + epsilon)));
  return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
}

export function normalizeSanbornMapPieceGeometry(value: unknown, fallbackPolygon?: unknown): SanbornFeatureGeometryValidation {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const geometryType = sanbornMapPieceGeometryTypes.includes(candidate?.geometryType as SanbornMapPieceGeometryType) ? candidate?.geometryType as SanbornMapPieceGeometryType : fallbackPolygon ? "polygon" : null;
  const points = normalizedPoints(candidate?.points ?? (geometryType === "polygon" ? fallbackPolygon : null));

  if (!geometryType || !points) return { ok: false, error: "Feature geometry must contain normalized points." };
  if (geometryType === "point" || geometryType === "junction") {
    if (points.length !== 1) return { ok: false, error: "Point and junction features require exactly one point." };
  } else if (geometryType === "line") {
    if (points.length < 2 || new Set(points.map((point) => `${point.x}:${point.y}`)).size < 2) return { ok: false, error: "Line features require at least two distinct points." };
  } else if (!validateNormalizedPolygon(points).ok) {
    return { ok: false, error: "Polygon features require at least three distinct vertices and nonzero area." };
  }

  const bbox = calculateSourceBoundingBox(points);
  const legacyPolygon = geometryType === "polygon" ? points : legacyPolygonFromGeometry(points);
  return { ok: true, geometry: { geometryType, points }, bbox, legacyPolygon };
}

export function normalizeSanbornMapPieceFeatureCategory(value: string | null | undefined): SanbornMapPieceFeatureCategory {
  return sanbornMapPieceFeatureCategories.includes(value as SanbornMapPieceFeatureCategory) ? value as SanbornMapPieceFeatureCategory : "detached_or_unusual";
}

export function normalizeSanbornMapPieceReviewCategories(value: unknown): SanbornMapPieceReviewCategories {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([category, status]) => sanbornMapPieceFeatureCategories.includes(category as SanbornMapPieceFeatureCategory) && sanbornMapPieceReviewStatuses.includes(status as SanbornMapPieceReviewStatus))) as SanbornMapPieceReviewCategories;
}

export function suggestSanbornFeatureLabel(category: SanbornMapPieceFeatureCategory, sequence: number, detail?: string | null): string {
  const prefix: Record<SanbornMapPieceFeatureCategory, string> = {
    blocks_and_lots: "Block",
    wells: "Public Well",
    hydrants: "Hydrant",
    water_routes_and_junctions: "Water Feature",
    rail_and_transportation: "Rail Feature",
    streets_and_intersections: "Street",
    detached_or_unusual: "Unusual Feature",
    printed_notes_and_miscellaneous: "Special Feature",
  };
  const cleanedDetail = detail?.trim() ?? "";
  if (category === "streets_and_intersections" && /\bstreet\b/i.test(cleanedDetail)) {
    return `${cleanedDetail} ${String(sequence).padStart(2, "0")}`.trim();
  }
  return `${prefix[category]} ${cleanedDetail ? `${cleanedDetail} ` : ""}${String(sequence).padStart(2, "0")}`;
}
