export type MapPlacementInspectorState = "no_selection" | "unplaced" | "armed" | "draft" | "saved" | "reviewed" | "unable_to_place";

export type MapPlacementInspectorStateInput = {
  hasSelection: boolean;
  hasPlacement: boolean;
  hasGeographicFootprint: boolean;
  isPersisted: boolean;
  placementStatus?: string | null;
  reviewStatus?: string | null;
  hasPlacementAnchor: boolean;
  canonicalStatus?: CanonicalMapPiecePlacementStatus;
};

export function deriveMapPlacementInspectorState(input: MapPlacementInspectorStateInput): MapPlacementInspectorState {
  if (!input.hasSelection) return "no_selection";
  if (input.hasPlacementAnchor && input.canonicalStatus !== "unable_to_place") return "armed";
  if (input.canonicalStatus === "unable_to_place") return "unable_to_place";
  if (input.canonicalStatus === "reviewed") return "reviewed";
  if (input.canonicalStatus === "placed") return "saved";
  if (input.canonicalStatus === "draft") return "draft";
  if (input.canonicalStatus === "not_placed") return "unplaced";
  if (input.placementStatus === "unable_to_place") return "unable_to_place";
  if (input.placementStatus === "reviewed" || input.reviewStatus === "reviewed") return "reviewed";
  if (input.hasPlacementAnchor) return "armed";
  if (input.hasGeographicFootprint && input.isPersisted) return "saved";
  if (input.hasGeographicFootprint) return "draft";
  return "unplaced";
}

export function mapPlacementInspectorStatusLabel(state: MapPlacementInspectorState): string {
  switch (state) {
    case "no_selection": return "SELECT AN OBJECT";
    case "unplaced": return "NOT PLACED";
    case "armed": return "READY TO DROP";
    case "draft": return "DRAFT PLACEMENT";
    case "saved": return "SAVED PLACEMENT";
    case "reviewed": return "REVIEWED";
    case "unable_to_place": return "UNABLE TO PLACE";
  }
}

export type MapPlacementQueueFilter = "need_placement" | "drafts" | "awaiting_review" | "reviewed" | "unable" | "current_sheet" | "all" | "unplaced" | "placed_reviewed";

export function mapPlacementQueueFilterItems<T extends { status: string; pageId?: string }>(items: T[], filter: MapPlacementQueueFilter, currentPageId?: string): T[] {
  if (filter === "all") return items;
  if (filter === "current_sheet") return items.filter((item) => item.pageId === currentPageId);
  if (filter === "awaiting_review") return items.filter((item) => item.status === "placed");
  if (filter === "placed_reviewed") return items.filter((item) => item.status === "placed" || item.status === "reviewed" || item.status === "unable_to_place");
  if (filter === "reviewed") return items.filter((item) => item.status === "reviewed");
  if (filter === "unable") return items.filter((item) => item.status === "unable_to_place");
  if (filter === "drafts") return items.filter((item) => item.status === "draft");
  if (filter === "need_placement") return items.filter((item) => item.status === "not_placed");
  return items.filter((item) => item.status === "not_placed" || item.status === "draft");
}
import type { CanonicalMapPiecePlacementStatus } from "./map-piece-placement-status.ts";
