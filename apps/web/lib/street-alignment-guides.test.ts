import test from "node:test";
import assert from "node:assert/strict";
import { compareBlockEdgesToStreetGuides, findNearbyStreetAlignmentGuides, normalizeBearingDifference, projectNormalizedPointThroughPlacement } from "./street-alignment-guides.ts";
import { sanbornMapPieceFeatureCategoryLabels, suggestSanbornFeatureLabel } from "./sanborn-map-piece-features.ts";

const piece = (pieceId: string, featureCategory: string, points: Array<{ x: number; y: number }>, geometryType: "line" | "polygon" | "junction" = "line") => ({
  pieceId, atlasPageId: "page-1", featureCategory, sourceGeometry: { geometryType, points }, sourcePolygon: points, sourceBBox: { minX: 0, maxX: 1, minY: 0, maxY: 1 }, pieceSequence: 1,
} as any);

test("finds only nearby same-page street guides", () => {
  const selected = piece("block", "blocks_and_lots", [{ x: .2, y: .2 }, { x: .4, y: .2 }, { x: .4, y: .4 }, { x: .2, y: .4 }], "polygon");
  const near = piece("street", "streets_and_intersections", [{ x: .1, y: .3 }, { x: .5, y: .3 }]);
  const otherPage = { ...near, pieceId: "other", atlasPageId: "page-2" };
  assert.deepEqual(findNearbyStreetAlignmentGuides({ selectedPiece: selected, pagePieces: [selected, near, otherPage] }).map((guide) => guide.pieceId), ["street"]);
});

test("projects normalized source points through the active placement", () => {
  const result = projectNormalizedPointThroughPlacement({ x: .5, y: .5 }, { northwest: { latitude: 10, longitude: 20 }, northeast: { latitude: 10, longitude: 22 }, southeast: { latitude: 8, longitude: 22 }, southwest: { latitude: 8, longitude: 20 } });
  assert.deepEqual(result, { latitude: 9, longitude: 21 });
});

test("normalizes opposite bearing direction and compares nearest edges", () => {
  assert.equal(normalizeBearingDifference(359, 1), 2);
  assert.equal(normalizeBearingDifference(0, 180), 0);
  const result = compareBlockEdgesToStreetGuides({ edges: [{ edge: "top", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }], guides: [{ label: "East Broad Street", points: [{ x: 0, y: 8 }, { x: 100, y: 8 }] }] });
  assert.equal(result[0]?.streetLabel, "East Broad Street");
  assert.equal(result[0]?.reliable, true);
  assert.equal(result[0]?.directionalDifference, 0);
});

test("street category has a review label and reference-only naming path", () => {
  assert.equal(sanbornMapPieceFeatureCategoryLabels.streets_and_intersections, "Streets and intersections");
  assert.equal(suggestSanbornFeatureLabel("streets_and_intersections", 2, "East Broad Street"), "East Broad Street 02");
});
