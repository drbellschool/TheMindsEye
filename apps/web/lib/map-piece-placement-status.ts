import { isOperationalMapCenter, validateGeoCoordinate } from "./historical-map-georeference.ts";
import type { SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";

export const canonicalMapPiecePlacementStatuses = ["not_placed", "draft", "placed", "reviewed", "unable_to_place"] as const;
export type CanonicalMapPiecePlacementStatus = (typeof canonicalMapPiecePlacementStatuses)[number];

function hasOperationalGeometry(placement: SanbornMapPieceGeoreference): boolean {
  if (placement.targetGeometry !== "polygon") {
    return Boolean(
      placement.geographicGeometry?.coordinates.length &&
        placement.geographicGeometry.coordinates.every((coordinate) => validateGeoCoordinate(coordinate).ok) &&
        placement.geographicGeometry.coordinates.some((coordinate) => isOperationalMapCenter(coordinate)),
    );
  }

  const corners = [placement.corners.northwest, placement.corners.northeast, placement.corners.southeast, placement.corners.southwest];
  return Boolean(corners.every((coordinate) => coordinate && validateGeoCoordinate(coordinate).ok) && corners.some((coordinate) => coordinate && isOperationalMapCenter(coordinate)));
}

export function deriveCanonicalMapPiecePlacementStatus(input: {
  placement: SanbornMapPieceGeoreference | null | undefined;
}): CanonicalMapPiecePlacementStatus {
  const placement = input.placement;
  if (!placement) return "not_placed";

  const operational = hasOperationalGeometry(placement);
  if (placement.placementStatus === "unable_to_place" && Boolean(placement.unableToPlaceReason?.trim())) return "unable_to_place";
  if (operational && placement.isPersisted && (placement.placementStatus === "reviewed" || (placement.reviewStatus as string) === "reviewed" || placement.reviewStatus === "verified_fact")) return "reviewed";
  if (operational && !placement.isPersisted) return "draft";
  if (operational && placement.isPersisted) return "placed";
  return "not_placed";
}

export type MapPiecePlacementCounts = {
  total: number;
  needPlacement: number;
  draft: number;
  placedAwaitingReview: number;
  reviewed: number;
  unableToPlace: number;
  geographicallyPlaced: number;
  placementResolved: number;
  placementWorkRemaining: number;
  reviewWorkRemaining: number;
  fullStageWorkRemaining: number;
};

export function countCanonicalMapPiecePlacements(statuses: readonly CanonicalMapPiecePlacementStatus[]): MapPiecePlacementCounts {
  const counts: MapPiecePlacementCounts = {
    total: statuses.length,
    needPlacement: statuses.filter((status) => status === "not_placed").length,
    draft: statuses.filter((status) => status === "draft").length,
    placedAwaitingReview: statuses.filter((status) => status === "placed").length,
    reviewed: statuses.filter((status) => status === "reviewed").length,
    unableToPlace: statuses.filter((status) => status === "unable_to_place").length,
    geographicallyPlaced: 0,
    placementResolved: 0,
    placementWorkRemaining: 0,
    reviewWorkRemaining: 0,
    fullStageWorkRemaining: 0,
  };
  counts.geographicallyPlaced = counts.placedAwaitingReview + counts.reviewed;
  counts.placementResolved = counts.reviewed + counts.unableToPlace;
  counts.placementWorkRemaining = counts.needPlacement + counts.draft;
  counts.reviewWorkRemaining = counts.placedAwaitingReview;
  counts.fullStageWorkRemaining = counts.needPlacement + counts.draft + counts.placedAwaitingReview;
  return counts;
}

export function canonicalStatusLabel(status: CanonicalMapPiecePlacementStatus): string {
  return status === "not_placed" ? "Not placed" : status === "unable_to_place" ? "Unable to place" : status === "draft" ? "Draft placement" : status === "reviewed" ? "Reviewed" : "Placed";
}
