import type { GeoCoordinate, GeoCorners } from "./historical-map-georeference.ts";

export const birdsEyeSceneRegionTypes = [
  "building",
  "building_group",
  "block",
  "street",
  "railroad",
  "depot",
  "industrial_site",
  "bridge",
  "waterway",
  "vegetation",
  "open_land",
  "landmark",
  "skyline",
  "background",
  "unknown",
] as const;

export const birdsEyePresentationStatuses = ["projected", "adjusted", "stale", "hidden", "reviewed"] as const;
export const birdsEyeImageGeometryTypes = ["polygon", "polyline", "point"] as const;

export type BirdsEyeSceneRegionType = (typeof birdsEyeSceneRegionTypes)[number];
export type BirdsEyePresentationStatus = (typeof birdsEyePresentationStatuses)[number];
export type BirdsEyeImageGeometryType = (typeof birdsEyeImageGeometryTypes)[number];

export type BirdsEyeNormalizedPoint = {
  x: number;
  y: number;
};

export type BirdsEyeImageGeometry = {
  geometryType: BirdsEyeImageGeometryType;
  coordinates: BirdsEyeNormalizedPoint[];
  coordinateSpace: "normalized_image";
};

export type BirdsEyeCropBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: "normalized_image";
};

export type BirdsEyeSceneRegion = {
  id: string | null;
  regionId: string;
  townPackageId: string;
  atlasId: string;
  referenceAssetId: string;
  regionType: BirdsEyeSceneRegionType;
  label: string;
  description: string;
  imageGeometry: BirdsEyeImageGeometry;
  linkedMapPieceId: string | null;
  linkedSourceRecordId: string | null;
  linkedBuildingId: string | null;
  evidenceClassification: string;
  reviewStatus: string;
  confidence: number | null;
  visibleFeatures: Record<string, unknown>;
  reconstructionNotes: string;
  renderingNotes: string;
  cropBounds: BirdsEyeCropBounds | null;
  isVisible: boolean;
  isLocked: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
  isPersisted: boolean;
};

export type BirdsEyePiecePresentation = {
  id: string | null;
  presentationId: string;
  townPackageId: string;
  atlasId: string;
  referenceAssetId: string;
  mapPieceId: string;
  sourceGeographicGeometryChecksum: string | null;
  projectedImageGeometry: BirdsEyeImageGeometry;
  adjustedImageGeometry: BirdsEyeImageGeometry | null;
  adjustmentStatus: BirdsEyePresentationStatus;
  displayLabel: string;
  opacity: number;
  isVisible: boolean;
  isLocked: boolean;
  notes: string;
  reviewStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
  isPersisted: boolean;
};

export type BirdsEyeBuildingOption = {
  buildingId: string;
  label: string;
};

export type BirdsEyeGeographicGeometry = {
  geometryType: BirdsEyeImageGeometryType;
  coordinates: GeoCoordinate[];
};

export type BirdsEyePlacedGeometry = {
  id: string;
  label: string;
  geometry: BirdsEyeGeographicGeometry | null;
  corners?: GeoCorners | null;
  placementStatus?: string;
  reviewStatus?: string;
  archivedAt?: string | null;
  isVisible?: boolean;
  sourceSheetLabel?: string | null;
  sourcePageLabel?: string | null;
};

export type BirdsEyeCalibrationReferenceStatus = "available" | "active" | "missing_map_placement" | "invalid_geographic_geometry" | "archived" | "hidden";

export function birdsEyeCalibrationReferenceStatus(
  piece: BirdsEyePlacedGeometry,
  activePieceId: string | null = null,
): BirdsEyeCalibrationReferenceStatus {
  if (piece.archivedAt) return "archived";
  if (activePieceId === piece.id) return "active";
  if (piece.placementStatus !== "placed" && piece.placementStatus !== "reviewed") return "missing_map_placement";
  const coordinates = getBirdsEyePlacedGeometryCoordinates(piece);
  if (coordinates.length === 0 || coordinates.some((coordinate) => !Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude))) return "invalid_geographic_geometry";
  if (piece.isVisible === false) return "hidden";
  return "available";
}

export function isBirdsEyeCalibrationReferenceEligible(piece: BirdsEyePlacedGeometry): boolean {
  const status = birdsEyeCalibrationReferenceStatus(piece);
  return status === "available" || status === "active";
}

export function birdsEyeCalibrationCoverageStatus(nearbyCompletePairs: number): string {
  if (nearbyCompletePairs === 0) return "No nearby complete pairs";
  if (nearbyCompletePairs < 2) return `${nearbyCompletePairs} nearby complete pair${nearbyCompletePairs === 1 ? "" : "s"}`;
  if (nearbyCompletePairs < 4) return "Locally supported";
  return "Strong local coverage";
}

export function projectBirdsEyePlacedGeometryUnclamped(
  input: BirdsEyePlacedGeometry,
  project: (coordinate: GeoCoordinate) => BirdsEyeNormalizedPoint,
): BirdsEyeImageGeometry | null {
  const source = getBirdsEyePlacedGeometryCoordinates(input);
  if (source.length === 0) return null;
  return {
    geometryType: input.geometry?.geometryType ?? "polygon",
    coordinates: source.map((coordinate) => project({ ...coordinate })),
    coordinateSpace: "normalized_image",
  };
}

export type BirdsEyeEvidencePackage = {
  contractVersion: "birds-eye-reconstruction-evidence-v1";
  referenceAssetId: string;
  referenceFilename: string;
  normalizedCropBounds: BirdsEyeCropBounds | null;
  sceneRegionPolygon: BirdsEyeImageGeometry | null;
  linkedMapPieceId: string | null;
  linkedSourceRecordId: string | null;
  linkedBuildingId: string | null;
  regionType: BirdsEyeSceneRegionType | null;
  label: string;
  visibleFeatures: Record<string, unknown>;
  reconstructionNotes: string;
  renderingNotes: string;
  confidence: number | null;
  reviewStatus: string;
  geographicSourceFingerprint: string | null;
  rendererCaution: string;
};

export type BirdsEyeGeometryValidation =
  | { ok: true; geometry: BirdsEyeImageGeometry }
  | { ok: false; message: string };

const geometryTolerance = 1e-7;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function normalizeBirdsEyeImagePoint(
  imageX: number,
  imageY: number,
  originalWidth: number,
  originalHeight: number,
): BirdsEyeNormalizedPoint {
  if (![imageX, imageY, originalWidth, originalHeight].every(Number.isFinite) || originalWidth <= 0 || originalHeight <= 0) {
    throw new Error("Image coordinates must be finite and original dimensions must be positive.");
  }
  return { x: clamp01(imageX / originalWidth), y: clamp01(imageY / originalHeight) };
}

export function denormalizeBirdsEyeImagePoint(
  point: BirdsEyeNormalizedPoint,
  originalWidth: number,
  originalHeight: number,
): BirdsEyeNormalizedPoint {
  if (![point.x, point.y, originalWidth, originalHeight].every(Number.isFinite) || originalWidth <= 0 || originalHeight <= 0) {
    throw new Error("Normalized coordinates must be finite and original dimensions must be positive.");
  }
  return { x: clamp01(point.x) * originalWidth, y: clamp01(point.y) * originalHeight };
}

function pointsEqual(left: BirdsEyeNormalizedPoint, right: BirdsEyeNormalizedPoint, tolerance = geometryTolerance): boolean {
  return Math.abs(left.x - right.x) <= tolerance && Math.abs(left.y - right.y) <= tolerance;
}

function cross(a: BirdsEyeNormalizedPoint, b: BirdsEyeNormalizedPoint, c: BirdsEyeNormalizedPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: BirdsEyeNormalizedPoint, b: BirdsEyeNormalizedPoint, point: BirdsEyeNormalizedPoint): boolean {
  return (
    Math.abs(cross(a, b, point)) <= geometryTolerance &&
    point.x >= Math.min(a.x, b.x) - geometryTolerance &&
    point.x <= Math.max(a.x, b.x) + geometryTolerance &&
    point.y >= Math.min(a.y, b.y) - geometryTolerance &&
    point.y <= Math.max(a.y, b.y) + geometryTolerance
  );
}

function segmentsIntersect(
  a: BirdsEyeNormalizedPoint,
  b: BirdsEyeNormalizedPoint,
  c: BirdsEyeNormalizedPoint,
  d: BirdsEyeNormalizedPoint,
): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (abC * abD < -geometryTolerance && cdA * cdB < -geometryTolerance) return true;
  return (
    pointOnSegment(a, b, c) ||
    pointOnSegment(a, b, d) ||
    pointOnSegment(c, d, a) ||
    pointOnSegment(c, d, b)
  );
}

function polygonSelfIntersects(points: readonly BirdsEyeNormalizedPoint[]): boolean {
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (left === right || leftNext === right || rightNext === left) continue;
      if (left === 0 && rightNext === 0) continue;
      if (segmentsIntersect(points[left], points[leftNext], points[right], points[rightNext])) return true;
    }
  }
  return false;
}

function polygonArea(points: readonly BirdsEyeNormalizedPoint[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

export function validateBirdsEyeImageGeometry(input: unknown, options: { polygonOnly?: boolean } = {}): BirdsEyeGeometryValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Image geometry must be an object." };
  const value = input as Partial<BirdsEyeImageGeometry>;
  if (!birdsEyeImageGeometryTypes.includes(value.geometryType as BirdsEyeImageGeometryType)) return { ok: false, message: "Image geometry type is not supported." };
  const geometryType = value.geometryType as BirdsEyeImageGeometryType;
  if (options.polygonOnly && value.geometryType !== "polygon") return { ok: false, message: "Scene regions must use polygon geometry." };
  if (value.coordinateSpace !== "normalized_image") return { ok: false, message: "Image geometry must use normalized_image coordinates." };
  if (!Array.isArray(value.coordinates)) return { ok: false, message: "Image geometry coordinates must be an array." };
  const minimum = value.geometryType === "polygon" ? 3 : value.geometryType === "polyline" ? 2 : 1;
  if (value.coordinates.length < minimum) return { ok: false, message: `${value.geometryType} geometry requires at least ${minimum} point${minimum === 1 ? "" : "s"}.` };
  if (value.coordinates.some((coordinate) => !coordinate || typeof coordinate.x !== "number" || typeof coordinate.y !== "number")) return { ok: false, message: "Image coordinates must be numeric x/y pairs." };
  const coordinates = value.coordinates.map((coordinate) => ({ x: Number(coordinate?.x), y: Number(coordinate?.y) }));
  if (coordinates.some((coordinate) => !Number.isFinite(coordinate.x) || !Number.isFinite(coordinate.y))) return { ok: false, message: "Image coordinates must be finite numbers." };
  if (coordinates.some((coordinate) => coordinate.x < 0 || coordinate.x > 1 || coordinate.y < 0 || coordinate.y > 1)) return { ok: false, message: "Image coordinates must remain between 0 and 1." };
  const distinct = coordinates.filter((coordinate, index) => coordinates.findIndex((candidate) => pointsEqual(candidate, coordinate)) === index);
  if (distinct.length < minimum) return { ok: false, message: `${value.geometryType} geometry does not contain enough distinct points.` };
  if (value.geometryType === "polygon") {
    if (polygonArea(coordinates) <= geometryTolerance) return { ok: false, message: "Scene-region polygon must have non-zero area." };
    if (polygonSelfIntersects(coordinates)) return { ok: false, message: "Scene-region polygon cannot self-intersect." };
  }
  return {
    ok: true,
    geometry: {
      geometryType,
      coordinates,
      coordinateSpace: "normalized_image",
    },
  };
}

export function deriveBirdsEyeCropBounds(geometry: BirdsEyeImageGeometry, padding = 0.025): BirdsEyeCropBounds | null {
  const validation = validateBirdsEyeImageGeometry(geometry);
  if (!validation.ok || validation.geometry.coordinates.length === 0) return null;
  const xs = validation.geometry.coordinates.map((point) => point.x);
  const ys = validation.geometry.coordinates.map((point) => point.y);
  const left = clamp01(Math.min(...xs) - padding);
  const top = clamp01(Math.min(...ys) - padding);
  const right = clamp01(Math.max(...xs) + padding);
  const bottom = clamp01(Math.max(...ys) + padding);
  return {
    x: left,
    y: top,
    width: Math.max(geometryTolerance, right - left),
    height: Math.max(geometryTolerance, bottom - top),
    coordinateSpace: "normalized_image",
  };
}

export function getBirdsEyePlacedGeometryCoordinates(geometry: BirdsEyePlacedGeometry): GeoCoordinate[] {
  if (geometry.geometry?.coordinates.length) return geometry.geometry.coordinates.map((coordinate) => ({ ...coordinate }));
  const corners = geometry.corners;
  return [corners?.northwest, corners?.northeast, corners?.southeast, corners?.southwest]
    .filter((coordinate): coordinate is GeoCoordinate => Boolean(coordinate))
    .map((coordinate) => ({ ...coordinate }));
}

function canonicalGeographicGeometry(input: BirdsEyePlacedGeometry): string {
  const geometryType = input.geometry?.geometryType ?? "polygon";
  const coordinates = getBirdsEyePlacedGeometryCoordinates(input).map((coordinate) => [
    Number(coordinate.longitude).toFixed(8),
    Number(coordinate.latitude).toFixed(8),
  ]);
  return JSON.stringify({ geometryType, coordinates });
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function checksumBirdsEyeGeographicGeometry(input: BirdsEyePlacedGeometry): string {
  return `geo-fnv1a-${fnv1a(canonicalGeographicGeometry(input))}`;
}

export function projectBirdsEyePlacedGeometry(
  input: BirdsEyePlacedGeometry,
  project: (coordinate: GeoCoordinate) => BirdsEyeNormalizedPoint,
): BirdsEyeImageGeometry | null {
  const source = getBirdsEyePlacedGeometryCoordinates(input);
  if (source.length === 0) return null;
  const geometryType = input.geometry?.geometryType ?? "polygon";
  const coordinates = source.map((coordinate) => {
    const projected = project({ ...coordinate });
    return { x: clamp01(projected.x), y: clamp01(projected.y) };
  });
  const candidate: BirdsEyeImageGeometry = { geometryType, coordinates, coordinateSpace: "normalized_image" };
  const validation = validateBirdsEyeImageGeometry(candidate);
  return validation.ok ? validation.geometry : null;
}

export function translateBirdsEyeGeometry(geometry: BirdsEyeImageGeometry, deltaX: number, deltaY: number): BirdsEyeImageGeometry {
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((point) => ({ x: clamp01(point.x + deltaX), y: clamp01(point.y + deltaY) })),
  };
}

export function scaleBirdsEyeGeometry(geometry: BirdsEyeImageGeometry, scale: number): BirdsEyeImageGeometry {
  const center = geometry.coordinates.reduce((sum, point) => ({ x: sum.x + point.x / geometry.coordinates.length, y: sum.y + point.y / geometry.coordinates.length }), { x: 0, y: 0 });
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((point) => ({
      x: clamp01(center.x + (point.x - center.x) * scale),
      y: clamp01(center.y + (point.y - center.y) * scale),
    })),
  };
}

export function rotateBirdsEyeGeometry(geometry: BirdsEyeImageGeometry, degrees: number): BirdsEyeImageGeometry {
  const center = geometry.coordinates.reduce((sum, point) => ({ x: sum.x + point.x / geometry.coordinates.length, y: sum.y + point.y / geometry.coordinates.length }), { x: 0, y: 0 });
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((point) => {
      const x = point.x - center.x;
      const y = point.y - center.y;
      return {
        x: clamp01(center.x + x * cosine - y * sine),
        y: clamp01(center.y + x * sine + y * cosine),
      };
    }),
  };
}

export function replaceBirdsEyeGeometryVertex(
  geometry: BirdsEyeImageGeometry,
  index: number,
  point: BirdsEyeNormalizedPoint,
): BirdsEyeImageGeometry {
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((coordinate, coordinateIndex) => coordinateIndex === index ? { x: clamp01(point.x), y: clamp01(point.y) } : coordinate),
  };
}

export function isBirdsEyePresentationStale(
  presentation: BirdsEyePiecePresentation,
  source: BirdsEyePlacedGeometry,
): boolean {
  return presentation.sourceGeographicGeometryChecksum !== checksumBirdsEyeGeographicGeometry(source);
}

export function createProjectedBirdsEyePresentation(input: {
  atlasId: string;
  geometry: BirdsEyeImageGeometry;
  referenceAssetId: string;
  source: BirdsEyePlacedGeometry;
  townPackageId: string;
  existing?: BirdsEyePiecePresentation | null;
}): BirdsEyePiecePresentation {
  const checksum = checksumBirdsEyeGeographicGeometry(input.source);
  const existing = input.existing ?? null;
  const sourceChanged = Boolean(existing?.sourceGeographicGeometryChecksum && existing.sourceGeographicGeometryChecksum !== checksum);
  if (existing && sourceChanged) {
    return {
      ...existing,
      adjustmentStatus: "stale",
    };
  }
  return {
    id: existing?.id ?? null,
    presentationId: existing?.presentationId ?? `birds-eye-presentation-${input.atlasId}-${input.referenceAssetId}-${input.source.id}`,
    townPackageId: input.townPackageId,
    atlasId: input.atlasId,
    referenceAssetId: input.referenceAssetId,
    mapPieceId: input.source.id,
    sourceGeographicGeometryChecksum: checksum,
    projectedImageGeometry: input.geometry,
    adjustedImageGeometry: existing?.adjustedImageGeometry ?? null,
    adjustmentStatus: existing?.isVisible === false
      ? "hidden"
      : existing?.adjustedImageGeometry
        ? "adjusted"
        : existing?.adjustmentStatus === "reviewed"
          ? "reviewed"
          : "projected",
    displayLabel: existing?.displayLabel || input.source.label,
    opacity: existing?.opacity ?? 0.55,
    isVisible: existing?.isVisible ?? true,
    isLocked: existing?.isLocked ?? false,
    notes: existing?.notes ?? "",
    reviewStatus: existing?.reviewStatus ?? "unknown",
    createdAt: existing?.createdAt ?? null,
    updatedAt: existing?.updatedAt ?? null,
    archivedAt: existing?.archivedAt ?? null,
    isPersisted: existing?.isPersisted ?? false,
  };
}

export function resetBirdsEyePresentationAdjustment(presentation: BirdsEyePiecePresentation): BirdsEyePiecePresentation {
  return {
    ...presentation,
    adjustedImageGeometry: null,
    adjustmentStatus: presentation.adjustmentStatus === "stale"
      ? "stale"
      : !presentation.isVisible
        ? "hidden"
        : presentation.reviewStatus === "unknown"
          ? "projected"
          : "reviewed",
    isPersisted: false,
  };
}

export function buildBirdsEyeEvidencePackage(input: {
  referenceAssetId: string;
  referenceFilename: string;
  region?: BirdsEyeSceneRegion | null;
  presentation?: BirdsEyePiecePresentation | null;
}): BirdsEyeEvidencePackage {
  const region = input.region ?? null;
  const presentation = input.presentation ?? null;
  return {
    contractVersion: "birds-eye-reconstruction-evidence-v1",
    referenceAssetId: input.referenceAssetId,
    referenceFilename: input.referenceFilename,
    normalizedCropBounds: region?.cropBounds ?? (region ? deriveBirdsEyeCropBounds(region.imageGeometry) : null),
    sceneRegionPolygon: region?.imageGeometry ?? null,
    linkedMapPieceId: region?.linkedMapPieceId ?? presentation?.mapPieceId ?? null,
    linkedSourceRecordId: region?.linkedSourceRecordId ?? null,
    linkedBuildingId: region?.linkedBuildingId ?? null,
    regionType: region?.regionType ?? null,
    label: region?.label ?? presentation?.displayLabel ?? "Birds-Eye evidence",
    visibleFeatures: region?.visibleFeatures ?? {},
    reconstructionNotes: region?.reconstructionNotes ?? "",
    renderingNotes: region?.renderingNotes ?? presentation?.notes ?? "",
    confidence: region?.confidence ?? null,
    reviewStatus: region?.reviewStatus ?? presentation?.reviewStatus ?? "unknown",
    geographicSourceFingerprint: presentation?.sourceGeographicGeometryChecksum ?? null,
    rendererCaution: "The historical artist's drawing is reconstruction evidence, not mechanically exact architecture.",
  };
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numeric(value: unknown): number | null {
  const result = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(result) ? result : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function mapBirdsEyeSceneRegionRow(rowInput: unknown): BirdsEyeSceneRegion | null {
  const row = record(rowInput);
  const geometry = validateBirdsEyeImageGeometry(row.image_geometry ?? row.imageGeometry, { polygonOnly: true });
  const regionId = text(row.region_id ?? row.regionId);
  if (!geometry.ok || !regionId) return null;
  const crop = record(row.crop_bounds ?? row.cropBounds);
  const cropBounds = Object.keys(crop).length
    ? {
        x: Number(crop.x),
        y: Number(crop.y),
        width: Number(crop.width),
        height: Number(crop.height),
        coordinateSpace: "normalized_image" as const,
      }
    : deriveBirdsEyeCropBounds(geometry.geometry);
  return {
    id: nullableText(row.id),
    regionId,
    townPackageId: text(row.town_package_id ?? row.townPackageId),
    atlasId: text(row.atlas_id ?? row.atlasId),
    referenceAssetId: text(row.reference_asset_id ?? row.referenceAssetId),
    regionType: birdsEyeSceneRegionTypes.includes((row.region_type ?? row.regionType) as BirdsEyeSceneRegionType) ? (row.region_type ?? row.regionType) as BirdsEyeSceneRegionType : "unknown",
    label: text(row.label, "Unidentified region"),
    description: text(row.description),
    imageGeometry: geometry.geometry,
    linkedMapPieceId: nullableText(row.linked_map_piece_id ?? row.linkedMapPieceId),
    linkedSourceRecordId: nullableText(row.linked_source_record_id ?? row.linkedSourceRecordId),
    linkedBuildingId: nullableText(row.linked_building_id ?? row.linkedBuildingId),
    evidenceClassification: text(row.evidence_classification ?? row.evidenceClassification, "unknown"),
    reviewStatus: text(row.review_status ?? row.reviewStatus, "unknown"),
    confidence: numeric(row.confidence),
    visibleFeatures: record(row.visible_features ?? row.visibleFeatures),
    reconstructionNotes: text(row.reconstruction_notes ?? row.reconstructionNotes),
    renderingNotes: text(row.rendering_notes ?? row.renderingNotes),
    cropBounds,
    isVisible: typeof (row.is_visible ?? row.isVisible) === "boolean" ? Boolean(row.is_visible ?? row.isVisible) : true,
    isLocked: typeof (row.is_locked ?? row.isLocked) === "boolean" ? Boolean(row.is_locked ?? row.isLocked) : false,
    sortOrder: numeric(row.sort_order ?? row.sortOrder) ?? 0,
    createdAt: nullableText(row.created_at ?? row.createdAt),
    updatedAt: nullableText(row.updated_at ?? row.updatedAt),
    archivedAt: nullableText(row.archived_at ?? row.archivedAt),
    isPersisted: Boolean(row.id),
  };
}

export function mapBirdsEyePiecePresentationRow(rowInput: unknown): BirdsEyePiecePresentation | null {
  const row = record(rowInput);
  const projected = validateBirdsEyeImageGeometry(row.projected_image_geometry ?? row.projectedImageGeometry);
  if (!projected.ok) return null;
  const adjustedInput = row.adjusted_image_geometry ?? row.adjustedImageGeometry;
  const adjusted = adjustedInput ? validateBirdsEyeImageGeometry(adjustedInput) : null;
  const presentationId = text(row.presentation_id ?? row.presentationId);
  const mapPieceId = text(row.map_piece_id ?? row.mapPieceId);
  if (!presentationId || !mapPieceId) return null;
  const statusInput = row.adjustment_status ?? row.adjustmentStatus;
  return {
    id: nullableText(row.id),
    presentationId,
    townPackageId: text(row.town_package_id ?? row.townPackageId),
    atlasId: text(row.atlas_id ?? row.atlasId),
    referenceAssetId: text(row.reference_asset_id ?? row.referenceAssetId),
    mapPieceId,
    sourceGeographicGeometryChecksum: nullableText(row.source_geographic_geometry_checksum ?? row.sourceGeographicGeometryChecksum),
    projectedImageGeometry: projected.geometry,
    adjustedImageGeometry: adjusted?.ok ? adjusted.geometry : null,
    adjustmentStatus: birdsEyePresentationStatuses.includes(statusInput as BirdsEyePresentationStatus) ? statusInput as BirdsEyePresentationStatus : "projected",
    displayLabel: text(row.display_label ?? row.displayLabel, mapPieceId),
    opacity: numeric(row.opacity) ?? 0.55,
    isVisible: typeof (row.is_visible ?? row.isVisible) === "boolean" ? Boolean(row.is_visible ?? row.isVisible) : true,
    isLocked: typeof (row.is_locked ?? row.isLocked) === "boolean" ? Boolean(row.is_locked ?? row.isLocked) : false,
    notes: text(row.notes),
    reviewStatus: text(row.review_status ?? row.reviewStatus, "unknown"),
    createdAt: nullableText(row.created_at ?? row.createdAt),
    updatedAt: nullableText(row.updated_at ?? row.updatedAt),
    archivedAt: nullableText(row.archived_at ?? row.archivedAt),
    isPersisted: Boolean(row.id),
  };
}
