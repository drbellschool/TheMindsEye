import assert from "node:assert/strict";
import test from "node:test";

import {
  applyInspectorTransformPatch,
  buildInitialHistory,
  canAutosaveStudioMode,
  canDragStudioPlacement,
  canEditHistoricalSheetOnMap,
  createDefaultGridPlacements,
  findDuplicateStudioSheetNumbers,
  findMissingStudioSheetNumbers,
  isControlledSanbornStoragePath,
  maxStudioOpacity,
  maxStudioScale,
  maxStudioSkew,
  mergeSavedAndDefaultPlacements,
  minStudioOpacity,
  minStudioScale,
  minStudioSkew,
  normalizePlacement,
  normalizeRotation,
  normalizeSkew,
  planDeleteSheetOperations,
  planReplacementOperations,
  pushStudioHistory,
  redoStudioHistory,
  reorderPlacement,
  shouldAttachStudioTransformer,
  shouldClearStudioSelection,
  shouldIgnoreStudioShortcut,
  shouldRefreshSignedUrl,
  shouldPanModernMap,
  shouldPanStudioStage,
  undoStudioHistory,
  updatePlacement,
  validateStudioMetadataInput,
  type StudioPlacement,
} from "./historical-map-studio.ts";
import { resolveInitialGeographicMapView, selectActiveTownPackage } from "./historical-map-studio-data.ts";

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
    skewX: -99,
    skewY: 99,
    layerOrder: 2,
  });

  assert.equal(normalized.scaleX, minStudioScale);
  assert.equal(normalized.scaleY, maxStudioScale);
  assert.equal(normalized.opacity, maxStudioOpacity);
  assert.equal(normalized.rotation, 5);
  assert.equal(normalized.skewX, minStudioSkew);
  assert.equal(normalized.skewY, maxStudioSkew);
  assert.equal(normalizeRotation(-725), -5);
  assert.equal(normalizeSkew(Number.POSITIVE_INFINITY), minStudioSkew);
});

test("selects and transforms sheets before drag begins", () => {
  assert.equal(canDragStudioPlacement(placement("asset-1", { isVisible: true, isLocked: false })), true);
  assert.equal(canDragStudioPlacement(placement("asset-1", { isVisible: true, isLocked: true })), false);
  assert.equal(canDragStudioPlacement(placement("asset-1", { isVisible: false, isLocked: false })), false);
  assert.equal(shouldAttachStudioTransformer({ isSelected: true, isLocked: false, nodeMounted: true }), true);
  assert.equal(shouldAttachStudioTransformer({ isSelected: true, isLocked: true, nodeMounted: true }), false);
  assert.equal(shouldAttachStudioTransformer({ isSelected: true, isLocked: false, nodeMounted: false }), false);
});

test("background clearing and stage panning require explicit pan mode", () => {
  assert.equal(shouldClearStudioSelection({ targetIsStage: true, isStagePanning: false, pointerButton: 0 }), true);
  assert.equal(shouldClearStudioSelection({ targetIsStage: false, isStagePanning: false, pointerButton: 0 }), false);
  assert.equal(shouldClearStudioSelection({ targetIsStage: true, isStagePanning: true, pointerButton: 0 }), false);
  assert.equal(shouldPanStudioStage({ targetIsStage: true, isSpacePanning: true, pointerButton: 0 }), true);
  assert.equal(shouldPanStudioStage({ targetIsStage: true, isSpacePanning: false, pointerButton: 1 }), true);
  assert.equal(shouldPanStudioStage({ targetIsStage: true, isSpacePanning: false, pointerButton: 0 }), false);
  assert.equal(shouldPanStudioStage({ targetIsStage: false, isSpacePanning: true, pointerButton: 0 }), false);
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

test("preserves saved skew and flip transforms across reload normalization", () => {
  const merged = mergeSavedAndDefaultPlacements(
    [{ assetId: "asset-1", width: 1000, height: 800 }],
    [
      placement("asset-1", {
        skewX: 12.5,
        skewY: -8.25,
        isFlippedHorizontally: true,
        isFlippedVertically: true,
        isPersisted: true,
      }),
    ],
  );

  assert.equal(merged[0].skewX, 12.5);
  assert.equal(merged[0].skewY, -8.25);
  assert.equal(merged[0].isFlippedHorizontally, true);
  assert.equal(merged[0].isFlippedVertically, true);
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

test("updates layer ordering, visibility, lock state, opacity, scale, skew, and rotation safely", () => {
  const placements = [placement("asset-1", { layerOrder: 0 }), placement("asset-2", { layerOrder: 1 }), placement("asset-3", { layerOrder: 2 })];
  assert.deepEqual(reorderPlacement(placements, "asset-1", "front").map((item) => item.assetId), ["asset-2", "asset-3", "asset-1"]);
  assert.deepEqual(reorderPlacement(placements, "asset-3", "back").map((item) => item.assetId), ["asset-3", "asset-1", "asset-2"]);

  const [updated] = updatePlacement([placement("asset-1")], "asset-1", {
    opacity: -5,
    scaleX: 100,
    skewX: 72,
    rotation: 540,
    isVisible: false,
    isLocked: true,
  });

  assert.equal(updated.opacity, minStudioOpacity);
  assert.equal(updated.scaleX, maxStudioScale);
  assert.equal(updated.skewX, maxStudioSkew);
  assert.equal(updated.rotation, 180);
  assert.equal(updated.isVisible, false);
  assert.equal(updated.isLocked, true);
});

test("normalizes inspector transform updates immediately", () => {
  const updated = applyInspectorTransformPatch(
    placement("asset-1", { scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, skewY: 0 }),
    {
      x: 25,
      y: 35,
      scaleX: -2,
      scaleY: 100,
      skewX: -90,
      skewY: 90,
      rotation: 725,
      opacity: 0,
    },
  );

  assert.equal(updated.x, 25);
  assert.equal(updated.y, 35);
  assert.equal(updated.scaleX, minStudioScale);
  assert.equal(updated.scaleY, maxStudioScale);
  assert.equal(updated.skewX, minStudioSkew);
  assert.equal(updated.skewY, maxStudioSkew);
  assert.equal(updated.rotation, 5);
  assert.equal(updated.opacity, minStudioOpacity);
});

test("public mode autosaves without login dependency", () => {
  assert.equal(canAutosaveStudioMode("public"), true);
  assert.equal(canAutosaveStudioMode("read_only"), false);
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

test("selects valid, single, and stale town packages safely", () => {
  const towns = [
    { id: "town-1", packageId: "texarkana_1885", name: "Texarkana", region: "Texas / Arkansas", year: 1885, centerLatitude: 33.425, centerLongitude: -94.047, defaultZoom: 15 },
    { id: "town-2", packageId: "other_1900", name: "Other", region: "Unknown", year: 1900, centerLatitude: null, centerLongitude: null, defaultZoom: null },
  ];

  assert.equal(selectActiveTownPackage(towns, "town-1").town?.id, "town-1");
  assert.equal(selectActiveTownPackage([towns[0]], undefined).town?.id, "town-1");

  const recovered = selectActiveTownPackage(towns, "deleted-town");
  assert.equal(recovered.town?.id, "town-1");
  assert.match(recovered.warningMessage ?? "", /Recovered from unavailable town package/);

  assert.equal(selectActiveTownPackage([], "deleted-town").town, null);
});

test("resolves Historical Map Studio center without accidental zero-zero defaults", () => {
  const texarkana = { id: "town-1", packageId: "texarkana_1885", name: "Texarkana", region: "Texas / Arkansas", year: 1885, centerLatitude: 33.425, centerLongitude: -94.047, defaultZoom: 15 };

  const fromTown = resolveInitialGeographicMapView({ town: texarkana, workspaceCenter: null, sheetGeoreferences: [], georeferences: [] });
  assert.equal(fromTown.center?.latitude, 33.425);
  assert.equal(fromTown.center?.longitude, -94.047);
  assert.equal(fromTown.source, "town_package");

  const saved = resolveInitialGeographicMapView({ town: texarkana, workspaceCenter: { latitude: 33.43, longitude: -94.05 }, workspaceZoom: 17 });
  assert.equal(saved.center?.latitude, 33.43);
  assert.equal(saved.zoom, 17);
  assert.equal(saved.source, "workspace");

  const recovered = resolveInitialGeographicMapView({ town: texarkana, workspaceCenter: { latitude: 0, longitude: 0 }, sheetGeoreferences: [], georeferences: [] });
  assert.notDeepEqual(recovered.center, { latitude: 0, longitude: 0 });
  assert.equal(recovered.recoveredFromInvalidWorkspaceCenter, true);
});

test("existing sheet bounds override configured fallback when town metadata is missing", () => {
  const townWithoutCenter = { id: "town-1", packageId: "texarkana_1885", name: "Texarkana", region: "Texas / Arkansas", year: 1885, centerLatitude: null, centerLongitude: null, defaultZoom: null };
  const sheet = {
    assetId: "asset-1",
    centerLatitude: 33.5,
    centerLongitude: -94.2,
    latitudeSpan: 0.01,
    longitudeSpan: 0.01,
    corners: {
      northwest: { latitude: 33.505, longitude: -94.205 },
      northeast: { latitude: 33.505, longitude: -94.195 },
      southeast: { latitude: 33.495, longitude: -94.195 },
      southwest: { latitude: 33.495, longitude: -94.205 },
    },
    isVisible: true,
    placementStatus: "draft" as const,
  };

  const resolved = resolveInitialGeographicMapView({ town: townWithoutCenter, sheetGeoreferences: [sheet as never], georeferences: [] });
  assert.equal(resolved.source, "sheet_bounds");
  assert.equal(resolved.center?.latitude, 33.5);
});

test("map edit mode and signed URL refresh helpers distinguish pan, edit, and expiry states", () => {
  assert.equal(shouldPanModernMap("pan_modern_map"), true);
  assert.equal(shouldPanModernMap("edit_historical_sheets"), false);
  assert.equal(canEditHistoricalSheetOnMap({ mode: "edit_historical_sheets", isVisible: true, isLocked: false }), true);
  assert.equal(canEditHistoricalSheetOnMap({ mode: "pan_modern_map", isVisible: true, isLocked: false }), false);
  assert.equal(canEditHistoricalSheetOnMap({ mode: "edit_historical_sheets", isVisible: true, isLocked: true }), false);

  const now = Date.parse("2026-07-12T12:00:00Z");
  assert.equal(shouldRefreshSignedUrl("2026-07-12T12:00:30Z", now), true);
  assert.equal(shouldRefreshSignedUrl("2026-07-12T12:05:00Z", now), false);
  assert.equal(shouldRefreshSignedUrl(null, now), true);
});
