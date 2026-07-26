import assert from "node:assert/strict";
import test from "node:test";
import { countCanonicalMapPiecePlacements, deriveCanonicalMapPiecePlacementStatus } from "./map-piece-placement-status.ts";
import { normalizeSanbornMapPieceGeoreference, type SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";

function placement(pieceId: string, overrides: Partial<SanbornMapPieceGeoreference> = {}): SanbornMapPieceGeoreference {
  return normalizeSanbornMapPieceGeoreference({
    pieceId, atlasPageId: "page", targetGeometry: "point", geographicGeometry: { geometryType: "point", coordinates: [{ latitude: 33.43, longitude: -94.04 }] },
    placementStatus: "unplaced", isPersisted: true, ...overrides,
  });
}

test("stale persisted unplaced geometry is canonically placed", () => {
  assert.equal(deriveCanonicalMapPiecePlacementStatus({ placement: placement("saved") }), "placed");
});

test("canonical status separates drafts, reviewed, unable, and not placed", () => {
  assert.equal(deriveCanonicalMapPiecePlacementStatus({ placement: placement("draft", { isPersisted: false }) }), "draft");
  assert.equal(deriveCanonicalMapPiecePlacementStatus({ placement: placement("reviewed", { placementStatus: "reviewed", reviewStatus: "reviewed" }) }), "reviewed");
  assert.equal(deriveCanonicalMapPiecePlacementStatus({ placement: placement("unable", { placementStatus: "unable_to_place", unableToPlaceReason: "Obscured" }) }), "unable_to_place");
  assert.equal(deriveCanonicalMapPiecePlacementStatus({ placement: placement("empty", { geographicGeometry: null, isPersisted: false }) }), "not_placed");
});

test("the 16-of-21 placement fixture reports truthful stage counts", () => {
  const statuses = [...Array.from({ length: 16 }, () => "placed" as const), ...Array.from({ length: 5 }, () => "not_placed" as const)];
  const counts = countCanonicalMapPiecePlacements(statuses);
  assert.deepEqual({ total: counts.total, geographicallyPlaced: counts.geographicallyPlaced, needPlacement: counts.needPlacement, draft: counts.draft, placedAwaitingReview: counts.placedAwaitingReview, reviewed: counts.reviewed, unableToPlace: counts.unableToPlace, placementWorkRemaining: counts.placementWorkRemaining, fullStageWorkRemaining: counts.fullStageWorkRemaining }, { total: 21, geographicallyPlaced: 16, needPlacement: 5, draft: 0, placedAwaitingReview: 16, reviewed: 0, unableToPlace: 0, placementWorkRemaining: 5, fullStageWorkRemaining: 21 });
});
