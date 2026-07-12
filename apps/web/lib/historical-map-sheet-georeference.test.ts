import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInitialSheetGeographicHistory,
  createSheetGeoreferencesFromStitching,
  deriveSheetGeoCorners,
  isAccidentalZeroSheetPlacement,
  mergeSavedAndDefaultSheetGeoreferences,
  moveSheetGeographicAssembly,
  normalizeGeoEditMode,
  normalizeGeographicMapSettings,
  normalizeMovementScope,
  normalizeProjectiveMatrix,
  normalizeSheetGeographicTransform,
  placeSheetAtMapCenter,
  redoSheetGeographicHistory,
  removeSheetGeographicPlacement,
  resetSheetGeographicPlacementToCenter,
  reorderSheetGeographicTransform,
  selectManualSheetPlacementForSave,
  sheetPlacementMatchesForPersistence,
  undoSheetGeographicHistory,
  updateSheetGeographicTransform,
  updateSheetGeographicCorner,
  type SheetGeographicTransform,
} from "./historical-map-sheet-georeference.ts";
import { normalizePlacement, type StudioPlacement } from "./historical-map-studio.ts";

function placement(assetId: string, overrides: Partial<StudioPlacement> = {}) {
  return normalizePlacement({
    assetId,
    x: 0,
    y: 0,
    scaleX: 0.5,
    scaleY: 0.5,
    layerOrder: 0,
    ...overrides,
  });
}

function sheet(assetId: string, overrides: Partial<SheetGeographicTransform> = {}) {
  return normalizeSheetGeographicTransform({
    assetId,
    sheetGeoreferenceId: `${assetId}-geo`,
    centerLatitude: 33,
    centerLongitude: -94,
    latitudeSpan: 0.003,
    longitudeSpan: 0.004,
    layerOrder: 0,
    ...overrides,
  });
}

test("normalizes independent sheet geographic transforms and invalid coordinates", () => {
  const normalized = normalizeSheetGeographicTransform({
    assetId: "asset-1",
    centerLatitude: 200,
    centerLongitude: -220,
    latitudeSpan: -1,
    longitudeSpan: Number.POSITIVE_INFINITY,
    scaleX: -5,
    scaleY: 99,
    skewX: 99,
    skewY: -99,
    opacity: 9,
    rotation: 725,
  });

  assert.equal(normalized.centerLatitude, 0);
  assert.equal(normalized.centerLongitude, 0);
  assert.equal(normalized.latitudeSpan > 0, true);
  assert.equal(normalized.longitudeSpan <= 5, true);
  assert.equal(normalized.scaleX, 0.05);
  assert.equal(normalized.scaleY, 8);
  assert.equal(normalized.skewX, 45);
  assert.equal(normalized.skewY, -45);
  assert.equal(normalized.opacity, 1);
  assert.equal(normalized.rotation, 5);
  assert.equal(normalized.pivotX, 0.5);
  assert.equal(normalized.pivotY, 0.5);
  assert.equal(normalized.warpType, "projective");
  assert.equal(normalized.placementStatus, "placed");
});

test("invalid provided corner coordinates are replaced with derived safe corners", () => {
  const normalized = normalizeSheetGeographicTransform({
    assetId: "asset-1",
    centerLatitude: 33,
    centerLongitude: -94,
    latitudeSpan: 0.003,
    longitudeSpan: 0.004,
    corners: {
      northwest: { latitude: 200, longitude: -94 },
      northeast: { latitude: 33, longitude: -94 },
      southeast: { latitude: 33, longitude: -94 },
      southwest: { latitude: 33, longitude: -94 },
    },
  });

  assert.equal(normalized.corners.northwest?.latitude !== 200, true);
  assert.equal(normalized.corners.northwest?.latitude, 33.0015);
});

test("derives four geographic corners from affine sheet transform values", () => {
  const corners = deriveSheetGeoCorners({
    centerLatitude: 33,
    centerLongitude: -94,
    latitudeSpan: 0.004,
    longitudeSpan: 0.006,
    rotation: 15,
    scaleX: 1.2,
    scaleY: 0.8,
    skewX: 5,
    skewY: -3,
  });

  assert.ok(corners.northwest);
  assert.ok(corners.northeast);
  assert.ok(corners.southeast);
  assert.ok(corners.southwest);
  assert.notEqual(corners.northwest?.longitude, corners.northeast?.longitude);
});

test("places an unplaced sheet at map center and preserves four corners", () => {
  const unplaced = sheet("asset-1", { isVisible: false, placementStatus: "unplaced", georeferenceStatus: "not_started" });
  const placed = placeSheetAtMapCenter(unplaced, { latitude: 33.45, longitude: -94.02 }, { latitudeSpan: 0.002, longitudeSpan: 0.003 });

  assert.equal(placed.isVisible, true);
  assert.equal(placed.placementStatus, "draft");
  assert.equal(placed.georeferenceStatus, "bounding_box");
  assert.equal(placed.centerLatitude, 33.45);
  assert.equal(placed.centerLongitude, -94.02);
  assert.notEqual(placed.centerLatitude, 0);
  assert.notEqual(placed.centerLongitude, 0);
  assert.ok(placed.corners.northwest);
  assert.ok(placed.corners.southeast);
});

test("independent corner movement updates center and persists projective warp metadata", () => {
  const original = sheet("asset-1", { warpType: "projective", pivotX: 0.25, pivotY: 0.75 });
  const moved = updateSheetGeographicCorner(original, "northwest", { latitude: 33.01, longitude: -94.02 });

  assert.equal(moved.corners.northwest?.latitude, 33.01);
  assert.equal(moved.corners.northwest?.longitude, -94.02);
  assert.notEqual(moved.centerLatitude, original.centerLatitude);
  assert.equal(moved.warpType, "projective");
  assert.equal(moved.pivotX, 0.25);
  assert.equal(moved.pivotY, 0.75);
});

test("projective matrix and pivot values normalize safely", () => {
  const normalized = normalizeSheetGeographicTransform({
    assetId: "asset-1",
    pivotX: -4,
    pivotY: 4,
    warpType: "unsupported",
    projectiveMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  });

  assert.equal(normalized.pivotX, 0);
  assert.equal(normalized.pivotY, 1);
  assert.equal(normalized.warpType, "projective");
  assert.deepEqual(normalized.projectiveMatrix, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.equal(normalizeProjectiveMatrix([1, 2, Number.NaN, 4, 5, 6, 7, 8, 9]), null);
});

test("copies stitching layout into independent georeferenced sheets while preserving relative placement", () => {
  const copied = createSheetGeoreferencesFromStitching({
    assets: [
      { assetId: "asset-1", width: 1000, height: 800 },
      { assetId: "asset-2", width: 1000, height: 800 },
    ],
    center: { latitude: 33.4, longitude: -94.1 },
    placements: [
      placement("asset-1", { x: 0, y: 0, rotation: 12, skewX: 4, isFlippedHorizontally: true, opacity: 0.7 }),
      placement("asset-2", { x: 1000, y: 0, rotation: -5, layerOrder: 1 }),
    ],
  });

  assert.equal(copied.length, 2);
  assert.equal(copied[0].rotation, 12);
  assert.equal(copied[0].skewX, 4);
  assert.equal(copied[0].isFlippedHorizontally, true);
  assert.equal(copied[0].opacity, 0.7);
  assert.equal(copied[0].georeferenceStatus, "bounding_box");
  assert.equal(copied[1].centerLongitude > copied[0].centerLongitude, true);
});

test("updates selected sheet, assembly movement, layer order, visibility, lock, and opacity", () => {
  const sheets = [sheet("asset-1", { layerOrder: 0 }), sheet("asset-2", { layerOrder: 1 })];
  const movedSelected = updateSheetGeographicTransform(sheets, "asset-1", { centerLatitude: 33.1, opacity: 0.4, isLocked: true, isVisible: false });
  assert.equal(movedSelected[0].centerLatitude, 33.1);
  assert.equal(movedSelected[0].opacity, 0.4);
  assert.equal(movedSelected[0].isLocked, true);
  assert.equal(movedSelected[0].isVisible, false);

  const movedAssembly = moveSheetGeographicAssembly(sheets, { latitude: 0.2, longitude: -0.1 });
  assert.equal(movedAssembly[0].centerLatitude, 33.2);
  assert.equal(movedAssembly[1].centerLongitude, -94.1);

  assert.deepEqual(reorderSheetGeographicTransform(sheets, "asset-1", "front").map((item) => item.assetId), ["asset-2", "asset-1"]);
});

test("removes geographic placement without deleting uploaded sheet identity", () => {
  const placed = sheet("asset-1", { isVisible: true, placementStatus: "placed", georeferenceStatus: "bounding_box" });
  const removed = removeSheetGeographicPlacement(placed);

  assert.equal(removed.assetId, "asset-1");
  assert.equal(removed.isVisible, false);
  assert.equal(removed.placementStatus, "unplaced");
  assert.equal(removed.georeferenceStatus, "not_started");
});

test("defaults unplaced sheets to town center instead of accidental zero-zero", () => {
  const [defaultSheet] = mergeSavedAndDefaultSheetGeoreferences(
    [{ assetId: "asset-1", width: 1200, height: 800 }],
    [],
    { latitude: 33.425, longitude: -94.047 },
  );

  assert.equal(defaultSheet.placementStatus, "unplaced");
  assert.equal(defaultSheet.isVisible, false);
  assert.equal(defaultSheet.centerLatitude, 33.425);
  assert.equal(defaultSheet.centerLongitude, -94.047);
  assert.equal(defaultSheet.opacity, 0.5);
});

test("resets invalid legacy zero-zero placement to town center", () => {
  const legacy = normalizeSheetGeographicTransform({
    assetId: "asset-1",
    centerLatitude: 0,
    centerLongitude: 0,
    corners: {
      northwest: { latitude: 0, longitude: 0 },
      northeast: { latitude: 0, longitude: 0 },
      southeast: { latitude: 0, longitude: 0 },
      southwest: { latitude: 0, longitude: 0 },
    },
    isVisible: true,
    placementStatus: "placed",
  });

  assert.equal(isAccidentalZeroSheetPlacement(legacy), false);
  const repaired = resetSheetGeographicPlacementToCenter(legacy, { latitude: 33.425, longitude: -94.047 });
  assert.equal(repaired.centerLatitude, 33.425);
  assert.equal(repaired.centerLongitude, -94.047);
  assert.equal(repaired.placementStatus, "draft");
  assert.equal(isAccidentalZeroSheetPlacement(repaired), false);
});

test("normalizes map edit mode, movement scope, center, zoom, and global opacity", () => {
  const settings = normalizeGeographicMapSettings({
    center: { latitude: 33.4, longitude: -94.1 },
    zoom: 99,
    editMode: "edit_historical_sheets",
    movementScope: "entire_assembly",
    globalHistoricalOpacity: -5,
  });

  assert.equal(settings.center?.latitude, 33.4);
  assert.equal(settings.zoom, 22);
  assert.equal(settings.editMode, "edit_historical_sheets");
  assert.equal(settings.movementScope, "entire_assembly");
  assert.equal(settings.globalHistoricalOpacity, 0.05);
  assert.equal(normalizeGeoEditMode("unknown"), "pan_modern_map");
  assert.equal(normalizeMovementScope("bad"), "selected_sheet");
});

test("manual GPS alignment save selects one visible placed sheet and allows zero control points", () => {
  const placed = sheet("asset-1", { isVisible: true, placementStatus: "draft", opacity: 0.5, controlPointCount: 0 });
  const hidden = sheet("asset-2", { isVisible: false, placementStatus: "unplaced", controlPointCount: 0 });

  const payload = selectManualSheetPlacementForSave([placed, hidden], "asset-1");

  assert.equal(payload.length, 1);
  assert.equal(payload[0].assetId, "asset-1");
  assert.equal(payload[0].controlPointCount, 0);
  assert.deepEqual(selectManualSheetPlacementForSave([placed, hidden], "asset-2"), []);
});

test("database-confirmed placement matching compares exact corners and opacity", () => {
  const draft = sheet("asset-1", { opacity: 0.5, placementStatus: "draft" });
  const saved = normalizeSheetGeographicTransform({ ...draft, isPersisted: true });
  const mismatchedOpacity = normalizeSheetGeographicTransform({ ...draft, opacity: 0.75 });
  const mismatchedCorner = normalizeSheetGeographicTransform({
    ...draft,
    corners: {
      ...draft.corners,
      northwest: { latitude: draft.corners.northwest!.latitude + 0.01, longitude: draft.corners.northwest!.longitude },
    },
  });

  assert.equal(sheetPlacementMatchesForPersistence(draft, saved), true);
  assert.equal(sheetPlacementMatchesForPersistence(draft, mismatchedOpacity), false);
  assert.equal(sheetPlacementMatchesForPersistence(draft, mismatchedCorner), false);
});

test("collapsed four-corner warp falls back to safe derived rectangle", () => {
  const normalized = normalizeSheetGeographicTransform({
    assetId: "asset-1",
    centerLatitude: 33.425,
    centerLongitude: -94.047,
    corners: {
      northwest: { latitude: 33.425, longitude: -94.047 },
      northeast: { latitude: 33.425, longitude: -94.047 },
      southeast: { latitude: 33.425, longitude: -94.047 },
      southwest: { latitude: 33.425, longitude: -94.047 },
    },
  });

  assert.notDeepEqual(normalized.corners.northwest, normalized.corners.southeast);
  assert.equal(normalized.centerLatitude, 33.425);
  assert.equal(normalized.centerLongitude, -94.047);
});

test("undo and redo restore saved geographic sheet state", () => {
  const initial = {
    sheets: [sheet("asset-1", { centerLatitude: 33 })],
    mapSettings: normalizeGeographicMapSettings({ center: { latitude: 33, longitude: -94 } }),
  };
  const history = buildInitialSheetGeographicHistory(initial);
  const changed = {
    ...initial,
    sheets: updateSheetGeographicTransform(initial.sheets, "asset-1", { centerLatitude: 34, rotation: 45 }),
  };
  const pushed = {
    past: [...history.past, history.present],
    present: changed,
    future: [],
  };
  const undone = undoSheetGeographicHistory(pushed);
  const redone = redoSheetGeographicHistory(undone);

  assert.equal(undone.present.sheets[0].centerLatitude, 33);
  assert.equal(redone.present.sheets[0].rotation, 45);
});
