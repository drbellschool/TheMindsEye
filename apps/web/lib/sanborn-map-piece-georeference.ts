import { reviewStatuses, type ReviewStatus } from "./community-status.ts";
import { isOperationalMapCenter, isValidLatitude, isValidLongitude, validateGeoCoordinate, type GeoCoordinate, type GeoCorners } from "./historical-map-georeference.ts";
import { clampHistoricalOpacity, clampNumber, defaultHistoricalSheetOpacity, normalizeReviewClassification, normalizeRotation } from "./historical-map-studio.ts";
import { calculateSourceBoundingBox, type SanbornMapPieceRecord, type SanbornSourceBBox } from "./sanborn-atlas.ts";

export const mapPiecePlacementStatuses = ["unplaced", "draft", "placed", "aligned", "reviewed"] as const;
export const mapPlacementTargetGeometries = ["polygon", "line", "point"] as const;
export const mapPlacementTargetTypes = ["sanborn_map_piece"] as const;

export type MapPiecePlacementStatus = (typeof mapPiecePlacementStatuses)[number];
export type MapPlacementTargetGeometry = (typeof mapPlacementTargetGeometries)[number];
export type MapPlacementTargetType = (typeof mapPlacementTargetTypes)[number];

export type SanbornMapPieceGeoreference = {
  pieceGeoreferenceId: string;
  pieceId: string;
  atlasPageId: string;
  targetType: MapPlacementTargetType;
  targetGeometry: MapPlacementTargetGeometry;
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

type CompleteGeoCorners = {
  northwest: GeoCoordinate;
  northeast: GeoCoordinate;
  southeast: GeoCoordinate;
  southwest: GeoCoordinate;
};

export const defaultMapPieceOpacity = 0.72;
export const defaultMapPieceLongitudeSpan = 0.0009;
export const minMapPieceSpan = 0.00002;
export const maxMapPieceSpan = 0.05;

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

function hasValidCorners(corners: GeoCorners | null | undefined): corners is CompleteGeoCorners {
  if (!corners?.northwest || !corners.northeast || !corners.southeast || !corners.southwest) {
    return false;
  }

  const coordinates = [corners.northwest, corners.northeast, corners.southeast, corners.southwest];
  if (!coordinates.every((coordinate) => validateGeoCoordinate(coordinate).ok)) {
    return false;
  }

  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);

  return Math.max(...latitudes) - Math.min(...latitudes) > minMapPieceSpan / 10 && Math.max(...longitudes) - Math.min(...longitudes) > minMapPieceSpan / 10;
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
  const targetGeometry = mapPlacementTargetGeometries.includes(input.targetGeometry as MapPlacementTargetGeometry)
    ? (input.targetGeometry as MapPlacementTargetGeometry)
    : "polygon";
  const fallbackSpan = getMapPiecePlacementSpan({ sourcePolygon: [], sourceBBox: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });
  const fallbackCorners = deriveMapPieceGeoCorners({
    centerLatitude,
    centerLongitude,
    longitudeSpan: fallbackSpan.longitudeSpan,
    latitudeSpan: fallbackSpan.latitudeSpan,
    rotation,
  });
  const corners = hasValidCorners(input.corners) ? input.corners : fallbackCorners;

  if (hasValidCorners(corners)) {
    const bounds = getCornersBounds(corners);
    centerLatitude = Number(((bounds.northLatitude + bounds.southLatitude) / 2).toFixed(8));
    centerLongitude = Number(((bounds.eastLongitude + bounds.westLongitude) / 2).toFixed(8));
  }

  return {
    pieceGeoreferenceId: input.pieceGeoreferenceId?.trim() || `${input.pieceId}-piece-georef`,
    pieceId: input.pieceId,
    atlasPageId: input.atlasPageId,
    targetType: "sanborn_map_piece",
    targetGeometry,
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

export function updateMapPieceGeographicCorner(
  placement: SanbornMapPieceGeoreference,
  corner: keyof GeoCorners,
  coordinate: GeoCoordinate,
): SanbornMapPieceGeoreference {
  return normalizeSanbornMapPieceGeoreference({
    ...placement,
    corners: {
      ...placement.corners,
      [corner]: coordinate,
    },
    isVisible: true,
    placementStatus: "draft",
    isPersisted: false,
  });
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

  const coordinates = [placement.corners.northwest, placement.corners.northeast, placement.corners.southeast, placement.corners.southwest].filter(
    (coordinate): coordinate is GeoCoordinate => Boolean(coordinate),
  );

  return coordinates.length === 4 && coordinates.some((coordinate) => isOperationalMapCenter(coordinate));
}

export function piecePlacementMatchesForPersistence(
  expected: SanbornMapPieceGeoreference,
  saved: SanbornMapPieceGeoreference,
  tolerance = 0.0000001,
): boolean {
  const coordinatesMatch = (left: GeoCoordinate | null | undefined, right: GeoCoordinate | null | undefined) =>
    Boolean(left && right && Math.abs(left.latitude - right.latitude) <= tolerance && Math.abs(left.longitude - right.longitude) <= tolerance);

  return (
    expected.pieceId === saved.pieceId &&
    Math.abs(expected.opacity - saved.opacity) <= 0.0001 &&
    expected.isVisible === saved.isVisible &&
    expected.isLocked === saved.isLocked &&
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
