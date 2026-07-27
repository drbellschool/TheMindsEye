import type { SheetInventoryQueueItem } from "./sheet-inventory-queue.ts";
import type { SheetMapPieceAudit } from "./sheet-map-piece-audit.ts";
import type { MapPiecePlacementQueueItem } from "./map-piece-placement-queue.ts";

export type SheetInventoryPrimaryAction = "review_source" | "resolve_index" | "continue_map_pieces" | "place_next_object" | "review_next_placement" | "view_completed" | "view_resolution";

export type SheetInventoryDashboardItem = {
  queueItem: SheetInventoryQueueItem;
  audit: SheetMapPieceAudit;
  placeableTotal: number;
  needPlacement: number;
  drafts: number;
  placed: number;
  awaitingReview: number;
  reviewed: number;
  isComplete: boolean;
  primaryAction: SheetInventoryPrimaryAction;
  primaryActionLabel: string;
  workflowRank: number;
};

export function deriveSheetInventoryDashboardItem(input: {
  queueItem: SheetInventoryQueueItem;
  audit: SheetMapPieceAudit;
  placementItems: readonly MapPiecePlacementQueueItem[];
}): SheetInventoryDashboardItem {
  const { queueItem, audit } = input;
  if (queueItem.kind === "missing") {
    return { queueItem, audit, placeableTotal: 0, needPlacement: 0, drafts: 0, placed: 0, awaitingReview: 0, reviewed: 0, isComplete: true, primaryAction: "view_resolution", primaryActionLabel: "View resolution", workflowRank: 5 };
  }
  const needPlacement = input.placementItems.filter((item) => item.status === "not_placed").length;
  const drafts = input.placementItems.filter((item) => item.status === "draft").length;
  const awaitingReview = input.placementItems.filter((item) => item.status === "placed").length;
  const reviewed = input.placementItems.filter((item) => item.status === "reviewed").length;
  const sourceNeedsSetup = queueItem.status === "needs_classification" || queueItem.status === "needs_source";
  const indexNeedsResolution = queueItem.status === "waiting_for_index_link";
  const isComplete = queueItem.sourceLinked && (queueItem.indexLinked || !queueItem.mapPieceCount) && audit.complete && needPlacement === 0 && drafts === 0 && awaitingReview === 0;
  const primaryAction: SheetInventoryPrimaryAction = sourceNeedsSetup
    ? "review_source"
    : indexNeedsResolution
      ? "resolve_index"
      : !audit.complete
        ? "continue_map_pieces"
        : needPlacement > 0 || drafts > 0
          ? "place_next_object"
          : awaitingReview > 0
            ? "review_next_placement"
            : isComplete ? "view_completed" : "continue_map_pieces";
  const primaryActionLabel: Record<SheetInventoryPrimaryAction, string> = {
    review_source: "Review source",
    resolve_index: "Resolve index link",
    continue_map_pieces: "Continue Map Pieces",
    place_next_object: "Place next object",
    review_next_placement: "Review next placement",
    view_completed: "View completed sheet",
    view_resolution: "View resolution",
  };
  const workflowRank = primaryAction === "review_source" || primaryAction === "resolve_index" ? 1 : primaryAction === "continue_map_pieces" ? 2 : primaryAction === "place_next_object" ? 3 : primaryAction === "review_next_placement" ? 4 : 5;
  return {
    queueItem,
    audit,
    placeableTotal: input.placementItems.length,
    needPlacement,
    drafts,
    placed: awaitingReview + reviewed,
    awaitingReview,
    reviewed,
    isComplete,
    primaryAction,
    primaryActionLabel: primaryActionLabel[primaryAction],
    workflowRank,
  };
}

export function sortSheetInventoryDashboardItems(items: readonly SheetInventoryDashboardItem[]): SheetInventoryDashboardItem[] {
  return [...items].sort((left, right) => left.workflowRank - right.workflowRank || (left.queueItem.printedReference ?? left.queueItem.displayLabel).localeCompare(right.queueItem.printedReference ?? right.queueItem.displayLabel));
}
