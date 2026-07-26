import assert from "node:assert/strict";
import test from "node:test";
import { findNextUnplacedPlacementItem, mergePlacementStateFromServer } from "./map-placement-continuity.ts";
import type { MapPiecePlacementQueueItem } from "./map-piece-placement-queue.ts";
import type { SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";

function item(pieceId: string, status: MapPiecePlacementQueueItem["status"] = "not_placed"): MapPiecePlacementQueueItem {
  return { pieceId, pageId: "page", label: pieceId, category: "blocks and lots", geometryType: "polygon", printedReference: null, status, statusLabel: status, reason: null, sourceAssetId: "asset", placement: null };
}

function placement(pieceId: string, options: Partial<SanbornMapPieceGeoreference> = {}): SanbornMapPieceGeoreference {
  return {
    pieceGeoreferenceId: `geo-${pieceId}`, pieceId, atlasPageId: "page", targetType: "sanborn_map_piece", targetGeometry: "polygon",
    centerLatitude: 33, centerLongitude: -94, corners: { northwest: null, northeast: null, southeast: null, southwest: null }, rotation: 0, opacity: 0.72,
    layerOrder: 1, placementStatus: "placed", isVisible: true, isLocked: false, reviewStatus: "pending", evidenceClassification: "pending", notes: null,
    geographicGeometry: null, unableToPlaceReason: null, reviewerIdentity: null, reviewedAt: null, updatedAt: null, isPersisted: true, ...options,
  };
}

test("findNextUnplacedPlacementItem follows stable order and wraps", () => {
  const items = [item("one"), item("two", "placed"), item("three"), item("four")];
  assert.equal(findNextUnplacedPlacementItem({ items, currentPieceId: "one" })?.pieceId, "three");
  assert.equal(findNextUnplacedPlacementItem({ items, currentPieceId: "four" })?.pieceId, "one");
  assert.equal(findNextUnplacedPlacementItem({ items: [item("one", "placed")], currentPieceId: "one" }), null);
});

test("mergePlacementStateFromServer preserves a newer local confirmed placement", () => {
  const local = placement("one", { updatedAt: "2026-07-25T12:00:00Z" });
  const older = placement("one", { updatedAt: "2026-07-25T11:00:00Z", centerLatitude: 0 });
  assert.equal(mergePlacementStateFromServer([local], [older])[0].centerLatitude, 33);
});

test("mergePlacementStateFromServer accepts a newer authoritative record without duplication", () => {
  const local = placement("one", { updatedAt: "2026-07-25T11:00:00Z" });
  const newer = placement("one", { updatedAt: "2026-07-25T12:00:00Z", centerLatitude: 34 });
  const merged = mergePlacementStateFromServer([local], [newer]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].centerLatitude, 34);
});
