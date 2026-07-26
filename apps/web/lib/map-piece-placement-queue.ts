import { deriveCanonicalMapPiecePlacementStatus, countCanonicalMapPiecePlacements, canonicalStatusLabel, type CanonicalMapPiecePlacementStatus, type MapPiecePlacementCounts as CanonicalMapPiecePlacementCounts } from "./map-piece-placement-status.ts";
import type { SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";
import type { SanbornAtlasPageRecord, SanbornMapPieceRecord } from "./sanborn-atlas.ts";
import { formatMapPiecePlacementLabel } from "./map-piece-label.ts";

export const mapPiecePlacementQueueStatuses = ["not_placed", "draft", "placed", "reviewed", "unable_to_place"] as const;
export type MapPiecePlacementQueueStatus = CanonicalMapPiecePlacementStatus;

export type MapPiecePlacementQueueItem = {
  pieceId: string;
  pageId: string;
  label: string;
  category: string;
  geometryType: string;
  printedReference: string | null;
  status: MapPiecePlacementQueueStatus;
  statusLabel: string;
  reason: string | null;
  sourceAssetId: string;
  placement: SanbornMapPieceGeoreference | null;
};

export type MapPiecePlacementCounts = CanonicalMapPiecePlacementCounts & { totalPlaceable: number; notPlaced: number; placed: number; remaining: number };

function labelFor(piece: SanbornMapPieceRecord): string {
  return formatMapPiecePlacementLabel(piece);
}

function statusFor(placement: SanbornMapPieceGeoreference | null): MapPiecePlacementQueueStatus {
  return deriveCanonicalMapPiecePlacementStatus({ placement });
}

export function deriveMapPiecePlacementQueue(input: {
  activeAtlasId: string | null;
  pages: readonly SanbornAtlasPageRecord[];
  pieces: readonly SanbornMapPieceRecord[];
  placements: readonly SanbornMapPieceGeoreference[];
}): { items: MapPiecePlacementQueueItem[]; counts: MapPiecePlacementCounts } {
  const pages = new Map(input.pages.filter((page) => page.atlasId === input.activeAtlasId && !page.archivedAt).map((page) => [page.pageId, page]));
  const placements = new Map(input.placements.map((placement) => [placement.pieceId, placement]));
  const items = input.pieces
    .filter((piece) => pages.has(piece.atlasPageId) && piece.isPersisted !== false && (piece.placementEligibility ?? "available") === "available")
    .map((piece) => {
      const page = pages.get(piece.atlasPageId)!;
      const placement = placements.get(piece.pieceId) ?? null;
      const status = statusFor(placement);
      return {
        pieceId: piece.pieceId,
        pageId: piece.atlasPageId,
        label: labelFor(piece),
        category: (piece.featureCategory ?? "blocks_and_lots").replaceAll("_", " "),
        geometryType: piece.sourceGeometry?.geometryType ?? "polygon",
        printedReference: page.printedReference ?? (page.sheetNumber ? String(page.sheetNumber) : null),
        status,
        statusLabel: canonicalStatusLabel(status),
        reason: placement?.unableToPlaceReason ?? null,
        sourceAssetId: page.sanbornSheetAssetId,
        placement,
      };
    })
    .sort((left, right) => (left.status === "reviewed" ? 1 : 0) - (right.status === "reviewed" ? 1 : 0) || left.printedReference?.localeCompare(right.printedReference ?? "") || left.label.localeCompare(right.label));
  const canonicalCounts = countCanonicalMapPiecePlacements(items.map((item) => item.status));
  const counts: MapPiecePlacementCounts = {
    ...canonicalCounts,
    totalPlaceable: canonicalCounts.total,
    notPlaced: canonicalCounts.needPlacement,
    placed: canonicalCounts.placedAwaitingReview,
    remaining: canonicalCounts.placementWorkRemaining,
  };
  return { items, counts };
}
