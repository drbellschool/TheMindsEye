import test from "node:test";
import assert from "node:assert/strict";
import { hydrateHistoricalMapStudioState } from "./historical-map-studio-hydration.ts";

const placement = (pieceId: string, updatedAt: string, latitude = 33.4) => ({
  pieceGeoreferenceId: `geo-${pieceId}`,
  pieceId,
  atlasPageId: "page-1",
  targetType: "sanborn_map_piece" as const,
  targetGeometry: "polygon" as const,
  corners: [{ latitude, longitude: -94 }, { latitude, longitude: -93.9 }, { latitude: 33.3, longitude: -93.9 }, { latitude: 33.3, longitude: -94 }],
  center: { latitude, longitude: -93.95 },
  rotation: 0,
  opacity: 1,
  layerOrder: 0,
  placementStatus: "placed" as const,
  geographicGeometry: null,
  unableToPlaceReason: null,
  reviewerIdentity: null,
  reviewedAt: null,
  isVisible: true,
  isLocked: false,
  reviewStatus: "pending" as const,
  evidenceClassification: "unknown" as const,
  notes: null,
  updatedAt,
  isPersisted: true,
});

test("hydration preserves a newer locally confirmed placement", () => {
  const current = { editionKey: "atlas-1888", loadedAt: "2026-01-02T00:00:00Z", mapPieceGeoreferences: [placement("piece-1", "2026-01-02T00:00:00Z", 33.5)] };
  const incoming = { editionKey: "atlas-1888", loadedAt: "2026-01-01T00:00:00Z", mapPieceGeoreferences: [placement("piece-1", "2026-01-01T00:00:00Z", 33.4)] };
  assert.equal(hydrateHistoricalMapStudioState(current, incoming).mapPieceGeoreferences[0]?.center.latitude, 33.5);
});

test("hydration accepts a newer authoritative placement and does not duplicate pieces", () => {
  const current = { editionKey: "atlas-1888", loadedAt: "2026-01-01T00:00:00Z", mapPieceGeoreferences: [placement("piece-1", "2026-01-01T00:00:00Z")] };
  const incoming = { editionKey: "atlas-1888", loadedAt: "2026-01-03T00:00:00Z", mapPieceGeoreferences: [placement("piece-1", "2026-01-03T00:00:00Z", 33.6), placement("piece-2", "2026-01-03T00:00:00Z")] };
  const result = hydrateHistoricalMapStudioState(current, incoming);
  assert.deepEqual(result.mapPieceGeoreferences.map((item) => item.pieceId), ["piece-1", "piece-2"]);
  assert.equal(result.mapPieceGeoreferences[0]?.center.latitude, 33.6);
});

test("hydration never carries a placement across editions", () => {
  const current = { editionKey: "atlas-1885", loadedAt: "2026-01-01T00:00:00Z", mapPieceGeoreferences: [placement("piece-1", "2026-01-01T00:00:00Z")] };
  const incoming = { editionKey: "atlas-1888", loadedAt: "2026-01-02T00:00:00Z", mapPieceGeoreferences: [] };
  assert.deepEqual(hydrateHistoricalMapStudioState(current, incoming).mapPieceGeoreferences, []);
});
