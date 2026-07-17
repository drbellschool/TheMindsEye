import { reviewStatuses, type ReviewStatus } from "./community-status.ts";
import { isOperationalMapCenter, isValidLatitude, isValidLongitude, validateGeoCoordinate, type GeoCoordinate, type GeoCorners } from "./historical-map-georeference.ts";
import { clampHistoricalOpacity, clampNumber, defaultHistoricalSheetOpacity, normalizeReviewClassification, normalizeRotation } from "./historical-map-studio.ts";
import { calculateSourceBoundingBox, type SanbornMapPieceRecord, type SanbornSourceBBox } from "./sanborn-atlas.ts";

export const mapPiecePlacementStatuses = ["unplaced", "draft", "placed", "aligned", "reviewed"] as const;
export const mapPlacementTargetGeometries = ["polygon", "line", "point"] as const;
export const mapPlacementTargetTypes = ["sanborn_map_piece"] as const;
export const persistedMapPieceTargetGeometry = "polygon" as const;

export type MapPiecePlacementStatus = (typeof mapPiecePlacementStatuses)[number];
export type MapPlacementTargetGeometry = (typeof mapPlacementTargetGeometries)[number];
export type MapPlacementTargetType = (typeof mapPlacementTargetTypes)[number];

export type SanbornMapPieceGeoreference = {
  pieceGeoreferenceId: string;
  pieceId: string;
  atlasPageId: string;
  targetType: MapPlacementTargetType;
  targetGeometry: typeof persistedMapPieceTargetGeometry;
  centerLatitude: number;
  centerLongitude: number;
  corners: GeoCorners;
  rotation: number;
  opacity: number;
  layerOrder: number;
  placementStatus: MapPiecePlacementStatus;
  isVisible: boolean;
  isLocked: boolean;
  reviewStatus: ReviewStatus;
  evidenceClassification: ReviewStatus;
  notes: string | null;
  updatedAt: string | null;
  isPersisted: boolean;
};

export type CompleteGeoCorners = {
  northwest: GeoCoordinate;
  northeast: GeoCoordinate;
  southeast: GeoCoordinate;
  southwest: GeoCoordinate;
};

export const defaultMapPieceOpacity = 0.72;
export const defaultMapPieceLongitudeSpan = 0.0009;
export const minMapPieceSpan = 0.00002;
export const maxMapPieceSpan = 0.05;
export const mapPieceGeographicQuadAreaTolerance = 1e-12;
export const invalidMapPieceGeographicQuadMessage = "Map piece placement corners must form a valid, non-crossing geographic quadrilateral.";

export type MapPieceGeographicCornersValidation =
  | { ok: true; corners: CompleteGeoCorners; signedArea: number }
  | { ok: false; error: string };

export type MapPieceInteractiveDraftResult =
  | { ok: true; placement: SanbornMapPieceGeoreference }
  | { ok: false; message: string; placement: SanbornMapPieceGeoreference };

function normalizeCenterLatitude(value: number | null | undefined): number {
  return isValidLatitude(value) ? Number(value) : 0;
}

function normalizeCenterLongitude(value: number | null | undefined): number {
  return isValidLongitude(value) ? Number(value) : 0;
}

function normalizeMapPiecePlacementStatus(value: string | null | undefined, isVisible = true): MapPiecePlacementStatus {
  if (mapPiecePlacementStatuses.includes(value as MapPiecePlacementStatus)) {
    return value as MapPiecePlacementStatus;
  }

  return isVisible ? "placed" : "unplaced";
}

function hasCompleteRangedCorners(corners: GeoCorners | null | undefined): corners is CompleteGeoCorners {
  if (!corners?.northwest || !corners.northeast || !corners.southeast || !corners.southwest) {
    return false;
  }

  const coordinates = [corners.northwest, corners.northeast, corners.southeast, corners.southwest];
  return coordinates.every((coordinate) => validateGeoCoordinate(coordinate).ok);
}

function getCornersBounds(corners: CompleteGeoCorners) {
  const latitudes = [corners.northwest.latitude, corners.northeast.latitude, corners.southeast.latitude, corners.southwest.latitude];
  const longitudes = [corners.northwest.longitude, corners.northeast.longitude, corners.southeast.longitude, corners.southwest.longitude];

  return {
    northLatitude: Math.max(...latitudes),
    southLatitude: Math.min(...latitudes),
    eastLongitude: Math.max(...longitudes),
    westLongitude: Math.min(...longitudes),
  };
}

function orderedCornerCoordinates(corners: CompleteGeoCorners): GeoCoordinate[] {
  return [corners.northwest, corners.northeast, corners.southeast, corners.southwest];
}

function coordinateToPoint(coordinate: GeoCoordinate) {
  return { x: coordinate.longitude, y: coordinate.latitude };
}

function crossProduct(a: GeoCoordinate, b: GeoCoordinate, c: GeoCoordinate): number {
  const pointA = coordinateToPoint(a);
  const pointB = coordinateToPoint(b);
  const pointC = coordinateToPoint(c);

  return (pointB.x - pointA.x) * (pointC.y - pointA.y) - (pointB.y - pointA.y) * (pointC.x - pointA.x);
}

function signedPolygonArea(corners: CompleteGeoCorners): number {
  const points = orderedCornerCoordinates(corners).map(coordinateToPoint);
  let area = 0;

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    area += point.x * next.y - next.x * point.y;
  });

  return area / 2;
}

function coordinatesDistinct(coordinates: GeoCoordinate[], tolerance = 1e-10): boolean {
  for (let left = 0; left < coordinates.length; left += 1) {
    for (let right = left + 1; right < coordinates.length; right += 1) {
      if (
        Math.abs(coordinates[left].latitude - coordinates[right].latitude) <= tolerance &&
        Math.abs(coordinates[left].longitude - coordinates[right].longitude) <= tolerance
      ) {
        return false;
      }
    }
  }

  return true;
}

function segmentsCross(a: GeoCoordinate, b: GeoCoordinate, c: GeoCoordinate, d: GeoCoordinate): boolean {
  const abC = crossProduct(a, b, c);
  const abD = crossProduct(a, b, d);
  const cdA = crossProduct(c, d, a);
  const cdB = crossProduct(c, d, b);

  return (
    abC * abD < -mapPieceGeographicQuadAreaTolerance &&
    cdA * cdB < -mapPieceGeographicQuadAreaTolerance
  );
}

export function validateMapPieceGeographicCorners(corners: GeoCorners | null | undefined): MapPieceGeographicCornersValidation {
  if (!corners?.northwest || !corners.northeast || !corners.southeast || !corners.southwest) {
    return { ok: false, error: `${invalidMapPieceGeographicQuadMessage} All four corners are required.` };
  }

  if (!hasCompleteRangedCorners(corners)) {
    return { ok: false, error: `${invalidMapPieceGeographicQuadMessage} Corner coordinates must be finite latitude/longitude values in range.` };
  }

  const completeCorners: CompleteGeoCorners = {
    northwest: corners.northwest,
    northeast: corners.northeast,
    southeast: corners.southeast,
    southwest: corners.southwest,
  };
  const ordered = orderedCornerCoordinates(completeCorners);

  if (!coordinatesDistinct(ordered)) {
    return { ok: false, error: `${invalidMapPieceGeographicQuadMessage} Corners must be four distinct coordinates.` };
  }

  const area = signedPolygonArea(completeCorners);
  if (Math.abs(area) <= mapPieceGeographicQuadAreaTolerance) {
    return { ok: false, error: `${invalidMapPieceGeographicQuadMessage} The quadrilateral area is zero or too small.` };
  }

  if (area >= -mapPieceGeographicQuadAreaTolerance) {
    return { ok: false, error: `${invalidMapPieceGeographicQuadMessage} Corners must use northwest, northeast, southeast, southwest clockwise winding.` };
  }

  if (
    segmentsCross(completeCorners.northwest, completeCorners.northeast, completeCorners.southeast, completeCorners.southwest) ||
    segmentsCross(completeCorners.northeast, completeCorners.southeast, completeCorners.southwest, completeCorners.northwest)
  ) {
    return { ok: false, error: `${invalidMapPieceGeographicQuadMessage} Opposite edges must not cross.` };
  }

  const crossProducts = [
    crossProduct(completeCorners.northwest, completeCorners.northeast, completeCorners.southeast),
    crossProduct(completeCorners.northeast, completeCorners.southeast, completeCorners.southwest),
    crossProduct(completeCorners.southeast, completeCorners.southwest, completeCorners.northwest),
    crossProduct(completeCorners.southwest, completeCorners.northwest, completeCorners.northeast),
  ];
  const allNegative = crossProducts.every((value) => value < -mapPieceGeographicQuadAreaTolerance);

  if (!allNegative) {
    return { ok: false, error: `${invalidMapPieceGeographicQuadMessage} Corners must stay in clockwise northwest, northeast, southeast, southwest order without foldover.` };
  }

  return { ok: true, corners: completeCorners, signedArea: area };
}

export function validateMapPiecePlacementForPersistence(input: {
  targetType?: string | null;
  targetGeometry?: string | null;
  corners?: GeoCorners | null;
}): { ok: true } | { ok: false; message: string } {
  if (input.targetType && input.targetType !== "sanborn_map_piece") {
    return { ok: false, message: "Map piece placement target type must be sanborn_map_piece." };
  }

  if (input.targetGeometry && input.targetGeometry !== persistedMapPieceTargetGeometry) {
    return { ok: false, message: "Map piece placement target geometry must be polygon." };
  }

  const cornerValidation = validateMapPieceGeographicCorners(input.corners);
  if (!cornerValidation.ok) {
    return { ok: false, message: invalidMapPieceGeographicQuadMessage };
  }

  return { ok: true };
}

function rotatePoint(x: number, y: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

export function deriveMapPieceGeoCorners(input: {
  centerLatitude: number;
  centerLongitude: number;
  longitudeSpan: number;
  latitudeSpan: number;
  rotation?: number;
}): GeoCorners {
  const halfWidth = clampNumber(Number(input.longitudeSpan), minMapPieceSpan, maxMapPieceSpan) / 2;
  const halfHeight = clampNumber(Number(input.latitudeSpan), minMapPieceSpan, maxMapPieceSpan) / 2;
  const localCorners = {
    northwest: { x: -halfWidth, y: -halfHeight },
    northeast: { x: halfWidth, y: -halfHeight },
    southeast: { x: halfWidth, y: halfHeight },
    southwest: { x: -halfWidth, y: halfHeight },
  };

  return Object.fromEntries(
    Object.entries(localCorners).map(([key, point]) => {
      const rotated = rotatePoint(point.x, point.y, normalizeRotation(Number(input.rotation ?? 0)));

      return [
        key,
        {
          latitude: clampNumber(input.centerLatitude - rotated.y, -90, 90),
          longitude: clampNumber(input.centerLongitude + rotated.x, -180, 180),
        },
      ];
    }),
  ) as GeoCorners;
}

export function getMapPieceSourceBBox(piece: Pick<SanbornMapPieceRecord, "sourcePolygon" | "sourceBBox">): SanbornSourceBBox {
  return piece.sourceBBox ?? calculateSourceBoundingBox(piece.sourcePolygon);
}

export function getMapPiecePlacementSpan(piece: Pick<SanbornMapPieceRecord, "sourcePolygon" | "sourceBBox">): { longitudeSpan: number; latitudeSpan: number } {
  const bbox = getMapPieceSourceBBox(piece);
  const sourceWidth = Math.max(0.01, bbox.maxX - bbox.minX);
  const sourceHeight = Math.max(0.01, bbox.maxY - bbox.minY);
  const longitudeSpan = clampNumber(defaultMapPieceLongitudeSpan * Math.max(0.35, sourceWidth / Math.max(sourceHeight, 0.01)), minMapPieceSpan, maxMapPieceSpan);
  const latitudeSpan = clampNumber(longitudeSpan * Math.max(0.35, sourceHeight / Math.max(sourceWidth, 0.01)), minMapPieceSpan, maxMapPieceSpan);

  return { longitudeSpan, latitudeSpan };
}

export function normalizeSanbornMapPieceGeoreference(
  input: Partial<Omit<SanbornMapPieceGeoreference, "targetGeometry" | "placementStatus" | "reviewStatus" | "evidenceClassification">> & {
    pieceId: string;
    atlasPageId: string;
    targetGeometry?: string | null;
    placementStatus?: string | null;
    reviewStatus?: string | null;
    evidenceClassification?: string | null;
  },
): SanbornMapPieceGeoreference {
  let centerLatitude = normalizeCenterLatitude(input.centerLatitude);
  let centerLongitude = normalizeCenterLongitude(input.centerLongitude);
  const rotation = normalizeRotation(Number(input.rotation ?? 0));
  const fallbackSpan = getMapPiecePlacementSpan({ sourcePolygon: [], sourceBBox: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });
  const fallbackCorners = deriveMapPieceGeoCorners({
    centerLatitude,
    centerLongitude,
    longitudeSpan: fallbackSpan.longitudeSpan,
    latitudeSpan: fallbackSpan.latitudeSpan,
    rotation,
  });
  const validatedCorners = validateMapPieceGeographicCorners(input.corners);
  const corners = validatedCorners.ok ? validatedCorners.corners : fallbackCorners;

  if (hasCompleteRangedCorners(corners)) {
    const bounds = getCornersBounds(corners);
    centerLatitude = Number(((bounds.northLatitude + bounds.southLatitude) / 2).toFixed(8));
    centerLongitude = Number(((bounds.eastLongitude + bounds.westLongitude) / 2).toFixed(8));
  }

  return {
    pieceGeoreferenceId: input.pieceGeoreferenceId?.trim() || `${input.pieceId}-piece-georef`,
    pieceId: input.pieceId,
    atlasPageId: input.atlasPageId,
    targetType: "sanborn_map_piece",
    targetGeometry: persistedMapPieceTargetGeometry,
    centerLatitude,
    centerLongitude,
    corners,
    rotation,
    opacity: clampHistoricalOpacity(input.opacity, defaultMapPieceOpacity),
    layerOrder: Number.isInteger(input.layerOrder) ? Number(input.layerOrder) : 0,
    placementStatus: normalizeMapPiecePlacementStatus(input.placementStatus, input.isVisible ?? true),
    isVisible: input.isVisible ?? true,
    isLocked: input.isLocked ?? false,
    reviewStatus: reviewStatuses.includes(input.reviewStatus as ReviewStatus) ? (input.reviewStatus as ReviewStatus) : "unknown",
    evidenceClassification: normalizeReviewClassification(input.evidenceClassification),
    notes: input.notes ?? null,
    updatedAt: input.updatedAt ?? null,
    isPersisted: input.isPersisted ?? false,
  };
}

export function createDefaultMapPieceGeoreference(piece: SanbornMapPieceRecord, index = 0): SanbornMapPieceGeoreference {
  return normalizeSanbornMapPieceGeoreference({
    pieceId: piece.pieceId,
    atlasPageId: piece.atlasPageId,
    centerLatitude: 0,
    centerLongitude: 0,
    corners: deriveMapPieceGeoCorners({ centerLatitude: 0, centerLongitude: 0, ...getMapPiecePlacementSpan(piece) }),
    isVisible: false,
    placementStatus: "unplaced",
    opacity: defaultMapPieceOpacity,
    layerOrder: index,
    isPersisted: false,
  });
}

export function placeMapPieceAtCenter(piece: SanbornMapPieceRecord, placement: SanbornMapPieceGeoreference, center: GeoCoordinate): SanbornMapPieceGeoreference {
  const span = getMapPiecePlacementSpan(piece);

  return normalizeSanbornMapPieceGeoreference({
    ...placement,
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    corners: deriveMapPieceGeoCorners({
      centerLatitude: center.latitude,
      centerLongitude: center.longitude,
      longitudeSpan: span.longitudeSpan,
      latitudeSpan: span.latitudeSpan,
      rotation: placement.rotation,
    }),
    isVisible: true,
    placementStatus: "draft",
    isPersisted: false,
  });
}

export function createMapPieceInteractiveDraft(
  placement: SanbornMapPieceGeoreference,
  patch: {
    corners: GeoCorners;
    rotation?: number;
    placementStatus?: string | null;
  },
): MapPieceInteractiveDraftResult {
  const validation = validateMapPieceGeographicCorners(patch.corners);

  if (!validation.ok) {
    return {
      ok: false,
      message: validation.error,
      placement,
    };
  }

  return {
    ok: true,
    placement: normalizeSanbornMapPieceGeoreference({
      ...placement,
      rotation: patch.rotation ?? placement.rotation,
      corners: validation.corners,
      isVisible: true,
      placementStatus: patch.placementStatus ?? "draft",
      isPersisted: false,
    }),
  };
}

export function finishMapPieceInteractiveDraft(
  originalPlacement: SanbornMapPieceGeoreference,
  draftPlacement: SanbornMapPieceGeoreference | null,
  invalidMessage = "",
): MapPieceInteractiveDraftResult {
  if (invalidMessage) {
    return {
      ok: false,
      message: invalidMessage,
      placement: originalPlacement,
    };
  }

  if (!draftPlacement) {
    return {
      ok: false,
      message: "No map piece placement change was available.",
      placement: originalPlacement,
    };
  }

  return createMapPieceInteractiveDraft(draftPlacement, {
    corners: draftPlacement.corners,
    rotation: draftPlacement.rotation,
    placementStatus: draftPlacement.placementStatus === "aligned" || draftPlacement.placementStatus === "reviewed" ? draftPlacement.placementStatus : "draft",
  });
}

export function updateMapPieceGeographicCorner(
  placement: SanbornMapPieceGeoreference,
  corner: keyof GeoCorners,
  coordinate: GeoCoordinate,
): SanbornMapPieceGeoreference {
  const next = createMapPieceInteractiveDraft(placement, {
    corners: {
      ...placement.corners,
      [corner]: coordinate,
    },
    placementStatus: "draft",
  });

  return next.ok ? next.placement : placement;
}

export function rotateMapPieceGeoreference(
  placement: SanbornMapPieceGeoreference,
  nextRotation: number,
): SanbornMapPieceGeoreference {
  const center = { latitude: placement.centerLatitude, longitude: placement.centerLongitude };
  const delta = normalizeRotation(nextRotation - placement.rotation);
  const radians = (delta * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotateCorner = (coordinate: GeoCoordinate | null | undefined): GeoCoordinate | null => {
    if (!coordinate) {
      return null;
    }

    const x = coordinate.longitude - center.longitude;
    const y = coordinate.latitude - center.latitude;

    return {
      latitude: clampNumber(center.latitude + x * sin + y * cos, -90, 90),
      longitude: clampNumber(center.longitude + x * cos - y * sin, -180, 180),
    };
  };

  return normalizeSanbornMapPieceGeoreference({
    ...placement,
    rotation: nextRotation,
    corners: {
      northwest: rotateCorner(placement.corners.northwest),
      northeast: rotateCorner(placement.corners.northeast),
      southeast: rotateCorner(placement.corners.southeast),
      southwest: rotateCorner(placement.corners.southwest),
    },
    isVisible: true,
    placementStatus: placement.placementStatus === "reviewed" || placement.placementStatus === "aligned" ? placement.placementStatus : "draft",
    isPersisted: false,
  });
}

export function hasOperationalMapPiecePlacement(placement: SanbornMapPieceGeoreference | null | undefined): boolean {
  if (!placement || !placement.isVisible || placement.placementStatus === "unplaced") {
    return false;
  }

  if (placement.targetType !== "sanborn_map_piece" || placement.targetGeometry !== persistedMapPieceTargetGeometry) {
    return false;
  }

  const validation = validateMapPieceGeographicCorners(placement.corners);
  if (!validation.ok) {
    return false;
  }

  return orderedCornerCoordinates(validation.corners).some((coordinate) => isOperationalMapCenter(coordinate));
}

export function piecePlacementMatchesForPersistence(
  expected: SanbornMapPieceGeoreference,
  saved: SanbornMapPieceGeoreference,
  tolerance = 0.0000001,
): boolean {
  const coordinatesMatch = (left: GeoCoordinate | null | undefined, right: GeoCoordinate | null | undefined) =>
    Boolean(left && right && Math.abs(left.latitude - right.latitude) <= tolerance && Math.abs(left.longitude - right.longitude) <= tolerance);
  const textMatch = (left: string | null | undefined, right: string | null | undefined) => (left ?? null) === (right ?? null);

  return (
    expected.pieceId === saved.pieceId &&
    expected.targetType === saved.targetType &&
    expected.targetGeometry === persistedMapPieceTargetGeometry &&
    saved.targetGeometry === persistedMapPieceTargetGeometry &&
    coordinatesMatch({ latitude: expected.centerLatitude, longitude: expected.centerLongitude }, { latitude: saved.centerLatitude, longitude: saved.centerLongitude }) &&
    Math.abs(expected.rotation - saved.rotation) <= 0.001 &&
    Math.abs(expected.opacity - saved.opacity) <= 0.0001 &&
    expected.layerOrder === saved.layerOrder &&
    expected.placementStatus === saved.placementStatus &&
    expected.isVisible === saved.isVisible &&
    expected.isLocked === saved.isLocked &&
    textMatch(expected.notes, saved.notes) &&
    coordinatesMatch(expected.corners.northwest, saved.corners.northwest) &&
    coordinatesMatch(expected.corners.northeast, saved.corners.northeast) &&
    coordinatesMatch(expected.corners.southeast, saved.corners.southeast) &&
    coordinatesMatch(expected.corners.southwest, saved.corners.southwest)
  );
}

export function mergeSavedAndDefaultMapPieceGeoreferences(
  pieces: SanbornMapPieceRecord[],
  saved: SanbornMapPieceGeoreference[],
): SanbornMapPieceGeoreference[] {
  const savedByPieceId = new Map(saved.map((placement) => [placement.pieceId, placement]));
  const defaults = pieces
    .filter((piece) => !savedByPieceId.has(piece.pieceId))
    .map((piece, index) => createDefaultMapPieceGeoreference(piece, saved.length + index));

  return [...saved.map((placement) => normalizeSanbornMapPieceGeoreference({ ...placement, isPersisted: true })), ...defaults].sort((a, b) => a.layerOrder - b.layerOrder);
}

export async function runMapPiecePlacementNetworkRequest<T>(
  request: () => Promise<T>,
  cleanup: () => void,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await request() };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Network request failed.",
    };
  } finally {
    cleanup();
  }
}
