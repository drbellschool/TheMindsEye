import { hasOperationalMapPiecePlacement, type SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";
import type { SanbornAtlasPageRecord, SanbornMapPieceRecord } from "./sanborn-atlas.ts";

export const mapPiecePlacementQueueStatuses = ["not_placed", "draft", "placed", "reviewed", "unable_to_place"] as const;
export type MapPiecePlacementQueueStatus = (typeof mapPiecePlacementQueueStatuses)[number];

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

export type MapPiecePlacementCounts = {
  totalPlaceable: number;
  notPlaced: number;
  draft: number;
  placed: number;
  reviewed: number;
  unableToPlace: number;
  remaining: number;
};

function labelFor(piece: SanbornMapPieceRecord): string {
  return piece.titleText || piece.blockNumberText || `Feature ${String(piece.pieceSequence).padStart(2, "0")}`;
}

function statusFor(placement: SanbornMapPieceGeoreference | null): MapPiecePlacementQueueStatus {
  if (placement?.placementStatus === "unable_to_place") return "unable_to_place";
  if (!placement || placement.placementStatus === "unplaced" || !hasOperationalMapPiecePlacement(placement)) return "not_placed";
  if (placement.placementStatus === "reviewed") return "reviewed";
  if (placement.placementStatus === "draft") return "draft";
  return "placed";
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
        statusLabel: status === "not_placed" ? "Not placed" : status === "unable_to_place" ? "Unable to place" : status === "draft" ? "Draft placement" : status === "reviewed" ? "Reviewed" : "Placed",
        reason: placement?.unableToPlaceReason ?? null,
        sourceAssetId: page.sanbornSheetAssetId,
        placement,
      };
    })
    .sort((left, right) => (left.status === "reviewed" ? 1 : 0) - (right.status === "reviewed" ? 1 : 0) || left.printedReference?.localeCompare(right.printedReference ?? "") || left.label.localeCompare(right.label));
  const counts = items.reduce<MapPiecePlacementCounts>((summary, item) => {
    summary.totalPlaceable += 1;
    if (item.status === "not_placed") summary.notPlaced += 1;
    if (item.status === "draft") summary.draft += 1;
    if (item.status === "placed") summary.placed += 1;
    if (item.status === "reviewed") summary.reviewed += 1;
    if (item.status === "unable_to_place") summary.unableToPlace += 1;
    return summary;
  }, { totalPlaceable: 0, notPlaced: 0, draft: 0, placed: 0, reviewed: 0, unableToPlace: 0, remaining: 0 });
  counts.remaining = counts.notPlaced + counts.draft;
  return { items, counts };
}
