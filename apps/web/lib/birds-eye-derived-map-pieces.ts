import type { BirdsEyeCropBounds, BirdsEyeImageGeometry, BirdsEyeSceneRegion, BirdsEyeSceneRegionType } from "./birds-eye-scene";

export const birdsEyeDerivedPlacementTypes = ["building", "building_group", "city_block", "industrial_site", "railroad_area", "campus", "landscape_area", "waterway", "broad_area", "unknown"] as const;
export const birdsEyeDerivedPlacementPrecisions = ["exact", "approximate", "broad_area", "uncertain"] as const;
export type BirdsEyeDerivedPlacementType = (typeof birdsEyeDerivedPlacementTypes)[number];
export type BirdsEyeDerivedPlacementPrecision = (typeof birdsEyeDerivedPlacementPrecisions)[number];

export type BirdsEyeDerivedMapPiece = {
  id: string | null;
  derivedPieceId: string;
  townPackageId: string;
  atlasId: string;
  sourceRegionId: string;
  referenceAssetId: string;
  sourceFilename: string;
  label: string;
  regionType: BirdsEyeSceneRegionType;
  placementType: BirdsEyeDerivedPlacementType;
  sourceClassification: "birds_eye_derived";
  placementPrecision: BirdsEyeDerivedPlacementPrecision;
  sourceImageGeometry: BirdsEyeImageGeometry;
  cropBounds: BirdsEyeCropBounds | null;
  provenanceNote: string;
  sourceNotes: string;
  evidenceClassification: string;
  reviewStatus: string;
  confidence: number | null;
  creationStatus: "created" | "ready_for_placement" | "placed" | "archived";
  geographicGeometry: { geometryType: "polygon" | "polyline" | "point"; coordinates: Array<{ latitude: number; longitude: number }> } | null;
  centerLatitude: number | null;
  centerLongitude: number | null;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  isVisible: boolean;
  isLocked: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
  isPersisted: boolean;
};

const defaults: Record<BirdsEyeSceneRegionType, { placementType: BirdsEyeDerivedPlacementType; placementPrecision: BirdsEyeDerivedPlacementPrecision }> = {
  building: { placementType: "building", placementPrecision: "approximate" },
  building_group: { placementType: "building_group", placementPrecision: "broad_area" },
  block: { placementType: "city_block", placementPrecision: "broad_area" },
  street: { placementType: "broad_area", placementPrecision: "broad_area" },
  railroad: { placementType: "railroad_area", placementPrecision: "broad_area" },
  depot: { placementType: "railroad_area", placementPrecision: "approximate" },
  industrial_site: { placementType: "industrial_site", placementPrecision: "broad_area" },
  bridge: { placementType: "broad_area", placementPrecision: "approximate" },
  waterway: { placementType: "waterway", placementPrecision: "approximate" },
  vegetation: { placementType: "landscape_area", placementPrecision: "broad_area" },
  open_land: { placementType: "landscape_area", placementPrecision: "broad_area" },
  landmark: { placementType: "building", placementPrecision: "approximate" },
  skyline: { placementType: "broad_area", placementPrecision: "broad_area" },
  background: { placementType: "broad_area", placementPrecision: "broad_area" },
  unknown: { placementType: "unknown", placementPrecision: "uncertain" },
};

export function defaultBirdsEyeDerivedPlacement(regionType: BirdsEyeSceneRegionType) {
  return defaults[regionType] ?? defaults.unknown;
}

export function buildBirdsEyeDerivedProvenance(region: Pick<BirdsEyeSceneRegion, "label" | "regionType" | "referenceAssetId" | "imageGeometry" | "description" | "reconstructionNotes">, sourceFilename: string): string {
  return `Birds-Eye-derived from ${sourceFilename}; region “${region.label}” (${region.regionType}), reference asset ${region.referenceAssetId}. This perspective illustration may be artistically distorted; use for approximate placement unless supported by stronger sources. Original normalized image geometry is retained as source evidence.`;
}

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }
function nullableText(value: unknown) { return typeof value === "string" && value.trim() ? value : null; }
function num(value: unknown, fallback: number | null = null) { const n = Number(value); return value !== null && value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback; }

export function mapBirdsEyeDerivedMapPieceRow(input: unknown): BirdsEyeDerivedMapPiece | null {
  const row = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const geometry = row.source_image_geometry ?? row.sourceImageGeometry;
  if (!geometry || typeof geometry !== "object") return null;
  const sourceGeometry = geometry as BirdsEyeImageGeometry;
  const derivedPieceId = text(row.derived_piece_id ?? row.derivedPieceId);
  if (!derivedPieceId) return null;
  const placementType = text(row.placement_type ?? row.placementType, "unknown") as BirdsEyeDerivedPlacementType;
  const precision = text(row.placement_precision ?? row.placementPrecision, "approximate") as BirdsEyeDerivedPlacementPrecision;
  const geographic = row.geographic_geometry ?? row.geographicGeometry;
  return {
    id: nullableText(row.id), derivedPieceId, townPackageId: text(row.town_package_id ?? row.townPackageId), atlasId: text(row.atlas_id ?? row.atlasId),
    sourceRegionId: text(row.source_region_id ?? row.sourceRegionId), referenceAssetId: text(row.reference_asset_id ?? row.referenceAssetId), sourceFilename: text(row.source_filename ?? row.sourceFilename, "Historical Birds-Eye reference"),
    label: text(row.label, derivedPieceId), regionType: text(row.region_type ?? row.regionType, "unknown") as BirdsEyeSceneRegionType, placementType: birdsEyeDerivedPlacementTypes.includes(placementType) ? placementType : "unknown", sourceClassification: "birds_eye_derived", placementPrecision: birdsEyeDerivedPlacementPrecisions.includes(precision) ? precision : "approximate",
    sourceImageGeometry: sourceGeometry, cropBounds: (row.crop_bounds ?? row.cropBounds) as BirdsEyeCropBounds | null, provenanceNote: text(row.provenance_note ?? row.provenanceNote), sourceNotes: text(row.source_notes ?? row.sourceNotes), evidenceClassification: text(row.evidence_classification ?? row.evidenceClassification, "unknown"), reviewStatus: text(row.review_status ?? row.reviewStatus, "unknown"), confidence: num(row.confidence),
    creationStatus: ["created", "ready_for_placement", "placed", "archived"].includes(text(row.creation_status ?? row.creationStatus)) ? text(row.creation_status ?? row.creationStatus) as BirdsEyeDerivedMapPiece["creationStatus"] : "created",
    geographicGeometry: geographic && typeof geographic === "object" ? geographic as BirdsEyeDerivedMapPiece["geographicGeometry"] : null,
    centerLatitude: num(row.center_latitude ?? row.centerLatitude), centerLongitude: num(row.center_longitude ?? row.centerLongitude), rotation: num(row.rotation, 0) ?? 0, scaleX: num(row.scale_x ?? row.scaleX, 1) ?? 1, scaleY: num(row.scale_y ?? row.scaleY, 1) ?? 1, opacity: num(row.opacity, 0.72) ?? 0.72, isVisible: (row.is_visible ?? row.isVisible) !== false, isLocked: Boolean(row.is_locked ?? row.isLocked), createdAt: nullableText(row.created_at ?? row.createdAt), updatedAt: nullableText(row.updated_at ?? row.updatedAt), archivedAt: nullableText(row.archived_at ?? row.archivedAt), isPersisted: Boolean(row.id),
  };
}

export function isDerivedPiecePlaced(piece: Pick<BirdsEyeDerivedMapPiece, "geographicGeometry" | "creationStatus">) { return Boolean(piece.geographicGeometry && piece.creationStatus === "placed"); }

export function derivedPieceSourceShapeUnchanged(before: BirdsEyeImageGeometry, after: BirdsEyeImageGeometry) { return JSON.stringify(before) === JSON.stringify(after); }

export function calculateBirdsEyeDerivedVisualAgreement(source: BirdsEyeImageGeometry, projected: BirdsEyeImageGeometry): { label: "Strong visual agreement" | "Moderate visual agreement" | "Weak visual agreement" | "Outside source region"; overlap: number; centroidDistance: number } {
  const bounds = (geometry: BirdsEyeImageGeometry) => { const xs = geometry.coordinates.map((point) => point.x); const ys = geometry.coordinates.map((point) => point.y); return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), centerX: (Math.min(...xs) + Math.max(...xs)) / 2, centerY: (Math.min(...ys) + Math.max(...ys)) / 2 }; };
  const a = bounds(source); const b = bounds(projected);
  const intersection = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  const union = (a.maxX - a.minX) * (a.maxY - a.minY) + (b.maxX - b.minX) * (b.maxY - b.minY) - intersection;
  const overlap = union > 0 ? intersection / union : 0;
  const centroidDistance = Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY);
  return { overlap, centroidDistance, label: overlap >= 0.55 && centroidDistance <= 0.08 ? "Strong visual agreement" : overlap >= 0.25 && centroidDistance <= 0.18 ? "Moderate visual agreement" : overlap > 0 ? "Weak visual agreement" : "Outside source region" };
}
