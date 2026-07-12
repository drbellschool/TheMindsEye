import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInitialSheetGeographicHistory,
  createSheetGeoreferencesFromStitching,
  deriveSheetGeoCorners,
  moveSheetGeographicAssembly,
  normalizeGeoEditMode,
  normalizeGeographicMapSettings,
  normalizeMovementScope,
  normalizeSheetGeographicTransform,
  redoSheetGeographicHistory,
  reorderSheetGeographicTransform,
  undoSheetGeographicHistory,
  updateSheetGeographicTransform,
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
  assert.equal(settings.globalHistoricalOpacity, 0);
  assert.equal(normalizeGeoEditMode("unknown"), "pan_modern_map");
  assert.equal(normalizeMovementScope("bad"), "selected_sheet");
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
