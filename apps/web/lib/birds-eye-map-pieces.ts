import { checksumBirdsEyeGeographicGeometry, getBirdsEyePlacedGeometryCoordinates, type BirdsEyePlacedGeometry } from "./birds-eye-scene.ts";
import { isOperationalMapCenter, validateGeoCoordinate, type GeoCorners } from "./historical-map-georeference.ts";
import { deriveCanonicalMapPiecePlacementStatus, type CanonicalMapPiecePlacementStatus } from "./map-piece-placement-status.ts";
import { formatMapPiecePlacementLabel } from "./map-piece-label.ts";
import { getSanbornPageDisplayLabel, type SanbornAtlasPageRecord, type SanbornMapPieceRecord } from "./sanborn-atlas.ts";
import type { SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";

export const birdsEyeMapPieceEligibilityStatuses = [
  "loading",
  "available",
  "missing_map_placement",
  "invalid_geographic_geometry",
  "archived",
  "hidden",
] as const;

export type BirdsEyeMapPieceEligibilityStatus = (typeof birdsEyeMapPieceEligibilityStatuses)[number];

export type BirdsEyeCanonicalMapPiece = BirdsEyePlacedGeometry & {
  mapPieceId: string;
  atlasPageId: string;
  sourceSheetId: string | null;
  canonicalPlacementStatus: CanonicalMapPiecePlacementStatus;
  sourceGeometryChecksum: string | null;
  eligibilityStatus: BirdsEyeMapPieceEligibilityStatus;
  ineligibilityReason: string | null;
  isEligible: boolean;
  placement: SanbornMapPieceGeoreference | null;
};

export type BuildBirdsEyeEligibleMapPiecesInput = {
  activeAtlasId: string;
  mapPieces: readonly SanbornMapPieceRecord[];
  mapPlacements: readonly SanbornMapPieceGeoreference[];
  pages: readonly SanbornAtlasPageRecord[];
  archivedIds?: ReadonlySet<string>;
  loading?: boolean;
};

function geographicGeometry(placement: SanbornMapPieceGeoreference | null): BirdsEyePlacedGeometry["geometry"] {
  if (!placement?.geographicGeometry) return null;
  return {
    geometryType: placement.geographicGeometry.geometryType === "junction"
      ? "point"
      : placement.geographicGeometry.geometryType === "line"
        ? "polyline"
        : placement.geographicGeometry.geometryType,
    coordinates: placement.geographicGeometry.coordinates.map((coordinate) => ({ ...coordinate })),
  };
}

function geographicCorners(placement: SanbornMapPieceGeoreference | null): GeoCorners | null {
  if (!placement) return null;
  return {
    northwest: placement.corners.northwest ? { ...placement.corners.northwest } : null,
    northeast: placement.corners.northeast ? { ...placement.corners.northeast } : null,
    southeast: placement.corners.southeast ? { ...placement.corners.southeast } : null,
    southwest: placement.corners.southwest ? { ...placement.corners.southwest } : null,
  };
}

function hasValidAuthoritativeGeometry(piece: BirdsEyePlacedGeometry): boolean {
  const coordinates = getBirdsEyePlacedGeometryCoordinates(piece);
  const minimum = piece.geometry?.geometryType === "point" ? 1 : piece.geometry?.geometryType === "polyline" ? 2 : 3;
  return coordinates.length >= minimum &&
    coordinates.every((coordinate) => validateGeoCoordinate(coordinate).ok) &&
    coordinates.some((coordinate) => isOperationalMapCenter(coordinate));
}

/**
 * Build the one canonical Birds-Eye Map Piece collection by exact Map Piece ID.
 * Labels and page metadata are display-only and never participate in the join.
 */
export function buildBirdsEyeEligibleMapPieces(input: BuildBirdsEyeEligibleMapPiecesInput): BirdsEyeCanonicalMapPiece[] {
  const pagesById = new Map(input.pages.map((page) => [page.pageId, page]));
  const placementsByPieceId = new Map(input.mapPlacements.map((placement) => [placement.pieceId, placement]));
  const archivedIds = input.archivedIds ?? new Set<string>();

  return input.mapPieces
    .filter((piece) => pagesById.get(piece.atlasPageId)?.atlasId === input.activeAtlasId)
    .map((piece) => {
      const page = pagesById.get(piece.atlasPageId)!;
      const placement = placementsByPieceId.get(piece.pieceId) ?? null;
      const canonicalPlacementStatus = deriveCanonicalMapPiecePlacementStatus({ placement });
      const archived = Boolean(page.archivedAt) || archivedIds.has(piece.pieceId);
      const base: BirdsEyePlacedGeometry = {
        id: piece.pieceId,
        label: formatMapPiecePlacementLabel(piece),
        geometry: geographicGeometry(placement),
        corners: geographicCorners(placement),
        placementStatus: canonicalPlacementStatus,
        reviewStatus: placement?.reviewStatus ?? piece.reviewStatus,
        archivedAt: page.archivedAt,
        isVisible: placement?.isVisible ?? false,
        sourceSheetLabel: getSanbornPageDisplayLabel(page),
        sourcePageLabel: `Page ${page.pageSequence}`,
      };

      let eligibilityStatus: BirdsEyeMapPieceEligibilityStatus;
      let ineligibilityReason: string | null = null;
      if (input.loading) {
        eligibilityStatus = "loading";
        ineligibilityReason = "Loading Map Placement geometry";
      } else if (archived) {
        eligibilityStatus = "archived";
        ineligibilityReason = "The source page or Map Piece is archived.";
      } else if (placement?.isPersisted && !hasValidAuthoritativeGeometry(base)) {
        eligibilityStatus = "invalid_geographic_geometry";
        ineligibilityReason = "The authoritative geographic geometry is incomplete or invalid.";
      } else if (canonicalPlacementStatus !== "placed" && canonicalPlacementStatus !== "reviewed") {
        eligibilityStatus = "missing_map_placement";
        ineligibilityReason = placement?.isPersisted
          ? "The saved record does not contain operational authoritative geometry."
          : "No saved authoritative Map Placement geometry exists.";
      } else if (!hasValidAuthoritativeGeometry(base)) {
        eligibilityStatus = "invalid_geographic_geometry";
        ineligibilityReason = "The authoritative geographic geometry is incomplete or invalid.";
      } else if (placement?.isVisible === false) {
        eligibilityStatus = "hidden";
        ineligibilityReason = "The authoritative Map Placement record is hidden.";
      } else {
        eligibilityStatus = "available";
      }

      const isEligible = eligibilityStatus === "available";
      return {
        ...base,
        mapPieceId: piece.pieceId,
        atlasPageId: piece.atlasPageId,
        sourceSheetId: page.sanbornSheetAssetId || null,
        canonicalPlacementStatus,
        sourceGeometryChecksum: isEligible ? checksumBirdsEyeGeographicGeometry(base) : null,
        eligibilityStatus,
        ineligibilityReason,
        isEligible,
        placement,
      };
    })
    .sort((left, right) => left.atlasPageId.localeCompare(right.atlasPageId) || left.label.localeCompare(right.label) || left.mapPieceId.localeCompare(right.mapPieceId));
}

export function birdsEyeEligibleMapPieceIds(pieces: readonly BirdsEyeCanonicalMapPiece[]): string[] {
  return pieces.filter((piece) => piece.isEligible).map((piece) => piece.mapPieceId);
}
