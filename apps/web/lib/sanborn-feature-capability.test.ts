import test from "node:test";
import assert from "node:assert/strict";
import { getActiveSanbornMapPieceFeatureCategories, streetAlignmentFeatureEnabled } from "./sanborn-map-piece-features.ts";

test("street alignment capability is retired without removing the stored category", () => {
  assert.equal(streetAlignmentFeatureEnabled, false);
  assert.equal(getActiveSanbornMapPieceFeatureCategories().includes("streets_and_intersections"), false);
  assert.equal(getActiveSanbornMapPieceFeatureCategories("streets_and_intersections").includes("streets_and_intersections"), true);
});
