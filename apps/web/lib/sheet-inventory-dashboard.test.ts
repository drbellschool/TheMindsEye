import assert from "node:assert/strict";
import test from "node:test";

import { deriveSheetInventoryDashboardItem } from "./sheet-inventory-dashboard.ts";
import { deriveSheetMapPieceAudit } from "./sheet-map-piece-audit.ts";
import type { SheetInventoryQueueItem } from "./sheet-inventory-queue.ts";

function queueItem(status: SheetInventoryQueueItem["status"]): SheetInventoryQueueItem {
  return { id: "page-1", kind: "sheet", pageId: "page-1", sheetAssetId: "asset-1", displayLabel: "Sheet 1", printedReference: "1", filename: "sheet-1.jpg", pageType: "sanborn_sheet", sourceLinked: true, indexLinked: true, mapPieceCount: 1, mapPiecesStatus: "in_progress", placedObjectCount: 0, awaitingPlacementCount: 1, status, statusLabel: status, warning: null, regionId: null };
}

test("dashboard tile prioritizes source setup before object work", () => {
  const audit = deriveSheetMapPieceAudit({ pieces: [] });
  const tile = deriveSheetInventoryDashboardItem({ queueItem: queueItem("needs_source"), audit, placementItems: [] });
  assert.equal(tile.primaryAction, "review_source");
});

test("dashboard tile reports placement and review denominators", () => {
  const baseAudit = deriveSheetMapPieceAudit({ pieces: [] });
  const audit = { ...baseAudit, complete: true, reviewedCategoryCount: baseAudit.activeCategoryCount, categories: baseAudit.categories.map((category) => ({ ...category, reviewComplete: true })) };
  const tile = deriveSheetInventoryDashboardItem({ queueItem: queueItem("waiting_for_placement"), audit, placementItems: [
    { pieceId: "a", pageId: "page-1", label: "Block 1", category: "blocks", geometryType: "polygon", printedReference: "1", status: "not_placed", statusLabel: "Not placed", reason: null, sourceAssetId: "asset-1", placement: null },
    { pieceId: "b", pageId: "page-1", label: "Block 2", category: "blocks", geometryType: "polygon", printedReference: "1", status: "placed", statusLabel: "Placed", reason: null, sourceAssetId: "asset-1", placement: null },
  ] });
  assert.equal(tile.placeableTotal, 2);
  assert.equal(tile.needPlacement, 1);
  assert.equal(tile.awaitingReview, 1);
  assert.equal(tile.placed, 1);
  assert.equal(tile.primaryAction, "place_next_object");
});
