import assert from "node:assert/strict";
import test from "node:test";

import { deriveMapPlacementInspectorActionMode, deriveMapPlacementInspectorState, mapPlacementInspectorStatusLabel, mapPlacementQueueFilterItems } from "./map-placement-inspector.ts";

const base = { hasSelection: true, hasPlacement: true, hasGeographicFootprint: false, isPersisted: true, hasPlacementAnchor: false };

test("derives the placement inspector state from saved data and interaction state", () => {
  assert.equal(deriveMapPlacementInspectorState({ ...base, hasSelection: false }), "no_selection");
  assert.equal(deriveMapPlacementInspectorState(base), "unplaced");
  assert.equal(deriveMapPlacementInspectorState({ ...base, hasPlacementAnchor: true }), "armed");
  assert.equal(deriveMapPlacementInspectorState({ ...base, hasGeographicFootprint: true, isPersisted: false }), "draft");
  assert.equal(deriveMapPlacementInspectorState({ ...base, hasGeographicFootprint: true }), "saved");
  assert.equal(deriveMapPlacementInspectorState({ ...base, hasGeographicFootprint: true, reviewStatus: "reviewed" }), "reviewed");
  assert.equal(deriveMapPlacementInspectorState({ ...base, placementStatus: "unable_to_place" }), "unable_to_place");
});

test("labels and filters keep the canonical placement queue compact", () => {
  assert.equal(mapPlacementInspectorStatusLabel("draft"), "DRAFT PLACEMENT");
  const items = [
    { status: "not_placed", pageId: "p1" },
    { status: "draft", pageId: "p2" },
    { status: "placed", pageId: "p1" },
    { status: "reviewed", pageId: "p2" },
  ];
  assert.equal(mapPlacementQueueFilterItems(items, "unplaced").length, 2);
  assert.equal(mapPlacementQueueFilterItems(items, "current_sheet", "p1").length, 2);
  assert.equal(mapPlacementQueueFilterItems(items, "placed_reviewed").length, 2);
});

test("dirty persisted placements expose save changes while new drafts retain save placement", () => {
  assert.equal(deriveMapPlacementInspectorActionMode({ state: "saved", isPersisted: true, hasGeographicFootprint: true, isDirty: true }), "save_dirty");
  assert.equal(deriveMapPlacementInspectorActionMode({ state: "saved", isPersisted: true, hasGeographicFootprint: true, isDirty: false }), "edit");
  assert.equal(deriveMapPlacementInspectorActionMode({ state: "draft", isPersisted: false, hasGeographicFootprint: true, isDirty: true }), "save_new");
  assert.equal(deriveMapPlacementInspectorActionMode({ state: "reviewed", isPersisted: true, hasGeographicFootprint: true, isDirty: true }), "save_dirty");
});
