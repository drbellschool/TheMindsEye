import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInitialHistory,
  createDefaultGridPlacements,
  findDuplicateStudioSheetNumbers,
  findMissingStudioSheetNumbers,
  isControlledSanbornStoragePath,
  maxStudioOpacity,
  maxStudioScale,
  mergeSavedAndDefaultPlacements,
  minStudioOpacity,
  minStudioScale,
  normalizePlacement,
  normalizeRotation,
  planDeleteSheetOperations,
  planReplacementOperations,
  pushStudioHistory,
  redoStudioHistory,
  reorderPlacement,
  shouldIgnoreStudioShortcut,
  undoStudioHistory,
  updatePlacement,
  validateStudioMetadataInput,
  type StudioPlacement,
} from "./historical-map-studio.ts";

function placement(assetId: string, overrides: Partial<StudioPlacement> = {}): StudioPlacement {
  return normalizePlacement({
    assetId,
    layerOrder: 0,
    ...overrides,
  });
}

test("normalizes placement boundaries and rotation", () => {
  const normalized = normalizePlacement({
    assetId: "asset-1",
    scaleX: -1,
    scaleY: 99,
    opacity: 3,
    rotation: 725,
    layerOrder: 2,
  });

  assert.equal(normalized.scaleX, minStudioScale);
  assert.equal(normalized.scaleY, maxStudioScale);
  assert.equal(normalized.opacity, maxStudioOpacity);
  assert.equal(normalized.rotation, 5);
  assert.equal(normalizeRotation(-725), -5);
});

test("creates useful non-overlapping default grid placements", () => {
  const placements = createDefaultGridPlacements([
    { assetId: "asset-1", width: 1000, height: 800 },
    { assetId: "asset-2", width: 1000, height: 800 },
    { assetId: "asset-3", width: 500, height: 600 },
  ]);

  assert.equal(placements.length, 3);
  assert.deepEqual(new Set(placements.map((item) => `${item.x},${item.y}`)).size, 3);
  assert.equal(placements.every((item) => item.x === 0 && item.y === 0), false);
});

test("merges saved placements with default placements for newly uploaded sheets", () => {
  const merged = mergeSavedAndDefaultPlacements(
    [
      { assetId: "asset-1", width: 1000, height: 800 },
      { assetId: "asset-2", width: 1000, height: 800 },
    ],
    [placement("asset-1", { x: 25, y: 35, layerOrder: 4, isPersisted: true })],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].assetId, "asset-1");
  assert.equal(merged[0].isPersisted, true);
  assert.equal(merged[1].assetId, "asset-2");
  assert.equal(merged[1].isPersisted, false);
  assert.equal(merged[1].layerOrder, 5);
});

test("detects duplicate and missing studio sheet numbers", () => {
  assert.deepEqual(
    findDuplicateStudioSheetNumbers([
      { sheetNumber: 1 },
      { sheetNumber: 2 },
      { sheetNumber: 2 },
      { sheetNumber: null },
    ]),
    [2],
  );
  assert.deepEqual(findMissingStudioSheetNumbers([{ sheetNumber: 1 }, { sheetNumber: 3 }], 4), [2, 4]);
});

test("validates controlled storage paths and town-package separation", () => {
  assert.equal(isControlledSanbornStoragePath("texarkana_1885/sanborn-sheets/asset-1/sheet.png", "texarkana_1885"), true);
  assert.equal(isControlledSanbornStoragePath("other-town/sanborn-sheets/asset-1/sheet.png", "texarkana_1885"), false);
  assert.equal(isControlledSanbornStoragePath("../texarkana_1885/sanborn-sheets/asset-1/sheet.png", "texarkana_1885"), false);
  assert.equal(isControlledSanbornStoragePath("/texarkana_1885/sanborn-sheets/asset-1/sheet.png", "texarkana_1885"), false);
  assert.equal(isControlledSanbornStoragePath("texarkana_1885/not-sanborn/asset-1/sheet.png", "texarkana_1885"), false);
});

test("validates metadata and never promotes invalid statuses", () => {
  const valid = validateStudioMetadataInput({
    sheetNumber: 3,
    evidenceClassification: "source_based_inference",
    reviewStatus: "unknown",
    sourceUrl: " https://example.test/source ",
  });

  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.sourceUrl, "https://example.test/source");
    assert.equal(valid.value.evidenceClassification, "source_based_inference");
  }

  assert.equal(validateStudioMetadataInput({ evidenceClassification: "verified_by_default" }).ok, false);
  assert.equal(validateStudioMetadataInput({ reviewStatus: "approved" }).ok, false);
  assert.equal(validateStudioMetadataInput({ sheetNumber: -1 }).ok, false);
});

test("updates layer ordering, visibility, lock state, opacity, and scale safely", () => {
  const placements = [placement("asset-1", { layerOrder: 0 }), placement("asset-2", { layerOrder: 1 }), placement("asset-3", { layerOrder: 2 })];
  assert.deepEqual(reorderPlacement(placements, "asset-1", "front").map((item) => item.assetId), ["asset-2", "asset-3", "asset-1"]);
  assert.deepEqual(reorderPlacement(placements, "asset-3", "back").map((item) => item.assetId), ["asset-3", "asset-1", "asset-2"]);

  const [updated] = updatePlacement([placement("asset-1")], "asset-1", {
    opacity: -5,
    scaleX: 100,
    isVisible: false,
    isLocked: true,
  });

  assert.equal(updated.opacity, minStudioOpacity);
  assert.equal(updated.scaleX, maxStudioScale);
  assert.equal(updated.isVisible, false);
  assert.equal(updated.isLocked, true);
});

test("tracks bounded undo and redo state for layout changes", () => {
  const history = buildInitialHistory({
    viewport: { x: 0, y: 0, scale: 1 },
    placements: [placement("asset-1", { x: 0 })],
  });
  const moved = pushStudioHistory(history, {
    viewport: { x: 0, y: 0, scale: 1 },
    placements: [placement("asset-1", { x: 100 })],
  });
  const undone = undoStudioHistory(moved);
  const redone = redoStudioHistory(undone);

  assert.equal(moved.past.length, 1);
  assert.equal(undone.present.placements[0].x, 0);
  assert.equal(redone.present.placements[0].x, 100);
});

test("filters keyboard shortcuts while typing into form controls", () => {
  const previousHTMLElement = (globalThis as { HTMLElement?: unknown }).HTMLElement;

  class FakeElement {
    tagName: string;
    isContentEditable: boolean;

    constructor(tagName: string, isContentEditable = false) {
      this.tagName = tagName;
      this.isContentEditable = isContentEditable;
    }
  }

  (globalThis as { HTMLElement?: unknown }).HTMLElement = FakeElement;

  try {
    assert.equal(shouldIgnoreStudioShortcut(new FakeElement("INPUT") as unknown as EventTarget), true);
    assert.equal(shouldIgnoreStudioShortcut(new FakeElement("DIV", true) as unknown as EventTarget), true);
    assert.equal(shouldIgnoreStudioShortcut(new FakeElement("BUTTON") as unknown as EventTarget), false);
  } finally {
    (globalThis as { HTMLElement?: unknown }).HTMLElement = previousHTMLElement;
  }
});

test("documents delete and replacement transaction operation order", () => {
  assert.deepEqual(planDeleteSheetOperations(), ["delete_workspace_placements", "delete_metadata_record", "remove_storage_object"]);
  assert.deepEqual(planReplacementOperations(), ["upload_replacement_object", "update_metadata_record", "remove_previous_storage_object"]);
});
