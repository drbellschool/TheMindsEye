import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  basemaps as configuredBasemaps,
  contentSecurityPolicyImageSources,
  createTileDiagnostics,
  defaultBasemapKey,
  getBasemap,
  getModernTileLayerOpacity,
  isConfiguredImageSourceAllowed,
  leafletPaneStack,
  shouldAutoFallbackBasemap,
  updateTileDiagnostics,
} from "./historical-map-basemap.ts";
import {
  buildTownPackageLocationUpdate,
  geocodeLocation,
  mapNominatimResult,
  mapViewFromGeocodeResult,
  normalizeLocationQuery,
  parseDirectCoordinates,
  parseNominatimBoundingBox,
} from "./historical-map-geocode.ts";
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
  selectPreferredSheetAfterUpload,
  shouldPanModernMap,
  shouldPanStudioStage,
  undoStudioHistory,
  updatePlacement,
  validateStudioMetadataInput,
  type StudioPlacement,
  type StudioSheetAsset,
} from "./historical-map-studio.ts";
import { resolveInitialGeographicMapView, selectActiveTownPackage } from "./historical-map-studio-data.ts";
import {
  buildOperationalMapPieceLayers,
  createMapPieceInteractiveDraft,
  createDefaultMapPieceGeoreference,
  finishMapPieceInteractiveDraft,
  getMapPieceLayerBounds,
  getMapPieceLayerSourceAssetIds,
  hasOperationalMapPiecePlacement,
  mergeSavedAndDefaultMapPieceGeoreferences,
  normalizeSanbornMapPieceGeoreference,
  piecePlacementMatchesForPersistence,
  placeMapPieceAtCenter,
  resolveMapPiecePlacementSelection,
  rotateMapPieceGeoreference,
  runMapPiecePlacementNetworkRequest,
  shouldAutoFitMapPieceOverview,
  updateMapPieceGeographicCorner,
  validateMapPieceGeographicCorners,
  validateMapPiecePlacementForPersistence,
  type SanbornMapPieceGeoreference,
} from "./sanborn-map-piece-georeference.ts";
import {
  calculateMapPieceMaskRasterPlan,
  calculateRotationDeltaDegrees,
  clientPointToContainerPoint,
  maxMapPieceMaskRasterDimension,
} from "./sanborn-map-piece-rendering.ts";
import type { SanbornAtlasPageRecord, SanbornMapPieceRecord } from "./sanborn-atlas.ts";

function placement(assetId: string, overrides: Partial<StudioPlacement> = {}): StudioPlacement {
  return normalizePlacement({
    assetId,
    layerOrder: 0,
    ...overrides,
  });
}

function mapPiece(pieceId: string, overrides: Partial<SanbornMapPieceRecord> = {}): SanbornMapPieceRecord {
  const sourcePolygon = overrides.sourcePolygon ?? [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.12 },
    { x: 0.52, y: 0.42 },
    { x: 0.12, y: 0.5 },
  ];

  return {
    rowId: `${pieceId}-row`,
    pieceId,
    atlasPageRowId: "page-row-1",
    atlasPageId: "page-1",
    parentPieceId: null,
    pieceSequence: 1,
    pieceType: "regular_block",
    blockNumberText: "68",
    titleText: "Block 68",
    sourcePolygon,
    sourceBBox: { minX: 0.1, minY: 0.1, maxX: 0.52, maxY: 0.5 },
    creationMethod: "human",
    inventoryStatus: "draft",
    reviewStatus: "unknown",
    evidenceClassification: "unknown",
    notes: null,
    updatedAt: null,
    isPersisted: true,
    ...overrides,
  };
}

function atlasPage(pageId: string, overrides: Partial<SanbornAtlasPageRecord> = {}): SanbornAtlasPageRecord {
  return {
    rowId: `${pageId}-row`,
    pageId,
    atlasRowId: "atlas-row-1",
    atlasId: "atlas-1",
    sanbornSheetAssetId: `${pageId}-asset`,
    sanbornSheetAssetRowId: `${pageId}-asset-row`,
    pageSequence: 1,
    pageType: "sanborn_sheet",
    sheetNumber: 1,
    printedReference: "1",
    volumeLabel: null,
    displayLabel: null,
    isPrimaryTownIndex: false,
    classificationNotes: null,
    reviewStatus: "unknown",
    evidenceClassification: "unknown",
    updatedAt: null,
    isPersisted: true,
    ...overrides,
  };
}

function sheetAsset(assetId: string, overrides: Partial<StudioSheetAsset> = {}): StudioSheetAsset {
  return {
    assetId,
    rowId: `${assetId}-row`,
    townPackageId: "town-1",
    sourceRecordId: null,
    sourceId: null,
    sourceTitle: null,
    mapLayerId: null,
    sheetNumber: 1,
    originalFilename: `${assetId}.png`,
    storageBucket: "sanborn-sheets",
    storagePath: `town-1/sanborn-sheets/${assetId}.png`,
    signedUrl: `https://example.supabase.co/${assetId}.png`,
    signedUrlExpiresAt: "2099-01-01T00:00:00.000Z",
    mimeType: "image/png",
    byteSize: 100,
    width: 4000,
    height: 3000,
    checksum: `${assetId}-checksum`,
    sourceUrl: null,
    archiveName: null,
    rightsNote: null,
    evidenceClassification: "unknown",
    reviewStatus: "unknown",
    intakeNotes: null,
    uploadedAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function placedMapPieceGeoreference(
  pieceId: string,
  atlasPageId: string,
  centerLatitude: number,
  centerLongitude: number,
  overrides: Partial<SanbornMapPieceGeoreference> = {},
): SanbornMapPieceGeoreference {
  return normalizeSanbornMapPieceGeoreference({
    pieceId,
    atlasPageId,
    centerLatitude,
    centerLongitude,
    corners: {
      northwest: { latitude: centerLatitude + 0.001, longitude: centerLongitude - 0.001 },
      northeast: { latitude: centerLatitude + 0.001, longitude: centerLongitude + 0.001 },
      southeast: { latitude: centerLatitude - 0.001, longitude: centerLongitude + 0.001 },
      southwest: { latitude: centerLatitude - 0.001, longitude: centerLongitude - 0.001 },
    },
    placementStatus: "placed",
    isVisible: true,
    isPersisted: true,
    opacity: 0.72,
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

test("configures OpenStreetMap and a no-secret fallback street basemap", () => {
  const osm = getBasemap(defaultBasemapKey);
  const fallback = getBasemap("esri_world_street");

  assert.equal(osm.url, "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
  assert.match(osm.attribution, /OpenStreetMap/);
  assert.match(fallback.url, /server\.arcgisonline\.com/);
  assert.match(fallback.attribution, /Esri/);
  assert.deepEqual(configuredBasemaps.map((basemap) => basemap.key), ["osm", "esri_world_street"]);
});

test("minimal Map placement workflow renders upload controls inside the early-return interface", () => {
  const component = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const minimalStart = component.indexOf('className="minimal-sanborn-gps"');
  const legacyStart = component.indexOf('className="historical-map-studio"');
  const minimalInterface = component.slice(minimalStart, legacyStart);

  assert.match(minimalInterface, /Upload Sanborn sheets/);
  assert.match(minimalInterface, /ref=\{uploadInputRef\}/);
  assert.match(minimalInterface, /type="file"/);
  assert.match(minimalInterface, /multiple/);
  assert.match(minimalInterface, /void uploadSheets\(event\.currentTarget\.files\)/);
});

test("minimal Map placement toolbar uses grouped wrapping rows and gates placement controls", () => {
  const component = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");
  const minimalStart = component.indexOf("minimal-sanborn-gps--station-shell");
  const legacyStart = component.indexOf("Legacy pre-station");
  const minimalInterface = component.slice(minimalStart, legacyStart);
  const toolbarCssStart = css.indexOf(".minimal-sanborn-gps__toolbar {");
  const toolbarCssEnd = css.indexOf(".minimal-sanborn-gps__toolbar-row,", toolbarCssStart);
  const toolbarCss = css.slice(toolbarCssStart, toolbarCssEnd);

  assert.match(minimalInterface, /minimal-sanborn-gps__toolbar-row--primary/);
  assert.match(minimalInterface, /minimal-sanborn-gps__toolbar-row--source/);
  assert.match(minimalInterface, /minimal-sanborn-gps__status-row/);
  assert.doesNotMatch(minimalInterface, /minimal-sanborn-gps__workflow-switch/);
  assert.match(minimalInterface, /minimal-sanborn-gps__gps-workflow/);
  assert.match(minimalInterface, /Back to \{sanbornAtlasWorkflowSteps\.find/);
  assert.match(minimalInterface, /aria-label="Atlas workflow step"/);
  assert.match(minimalInterface, /sanborn-station-inspector/);
  assert.match(minimalInterface, /renderInspectorBody\(\)/);
  assert.match(component, /Place selected piece/);
  assert.match(component, /Advanced whole-sheet reference[\s\S]*Place sheet/s);
  assert.match(component, /Center on \{initialData\.activeTownPackage\?\.name \?\? "town"\}/);
  assert.match(minimalInterface, /renderStationWorkspace\(\)/);
  assert.match(component, /renderMapPlacementWorkspace/);
  assert.match(css, /grid-template-rows: auto minmax\(0, 1fr\);/);
  assert.match(css, /\.minimal-sanborn-gps__toolbar-row,[\s\S]*?flex-wrap: wrap;/);
  assert.doesNotMatch(toolbarCss, /grid-auto-flow/);
  assert.doesNotMatch(toolbarCss, /grid-auto-columns/);
  assert.doesNotMatch(toolbarCss, /height:\s*44px/);
  assert.doesNotMatch(toolbarCss, /overflow-x:\s*auto/);
});

test("missing Supabase warning names preview admin configuration without exposing service keys", () => {
  const dataSource = readFileSync("lib/historical-map-studio-data.ts", "utf8");

  assert.match(
    dataSource,
    /Supabase admin configuration is missing\. Add SUPABASE_URL \(or NEXT_PUBLIC_SUPABASE_URL\) and SUPABASE_SERVICE_ROLE_KEY to the Vercel Preview environment, then redeploy\./,
  );
  assert.doesNotMatch(dataSource, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(dataSource, /Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\./);
});

test("draft atlas pages block piece inventory until page assignments are saved", () => {
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const workbenchComponent = readFileSync("components/SanbornPageWorkbench.tsx", "utf8");

  assert.match(studioComponent, /pieceInventoryBlocked = atlasWorkflowStep === "piece_inventory" && Boolean\(selectedAtlasPage && !selectedAtlasPage\.isPersisted\)/);
  assert.match(studioComponent, /if \(!selectedAtlasPage \|\| !selectedAtlasPage\.isPersisted\) \{\s*setSaveStatus\("error"\);\s*setSaveMessage\("Save atlas page assignments before saving map pieces\."\);/s);
  assert.match(studioComponent, /pendingStudioSelectionRef/);
  assert.match(studioComponent, /workflowStepAfterSave = options\.workflowStepAfterSave \?\? \(options\.continueToPieceInventory \? "piece_inventory" : atlasWorkflowStep\)/);
  assert.match(studioComponent, /setAtlasWorkflowStep\(workflowStepAfterSave\)/);
  assert.match(studioComponent, /saveAtlasPages\(\{ continueToPieceInventory: true \}\)/);
  assert.match(studioComponent, /readOnly=\{atlasReadOnly \|\| !selectedAtlasPage \|\| !selectedAtlasPage\.isPersisted \|\| !selectedPageSupportsMapPieces\}/);
  assert.match(workbenchComponent, /Save the atlas page assignments before drawing map pieces\./);
  assert.match(workbenchComponent, /const editorReadOnly = readOnly \|\| pieceInventoryBlocked \|\| classificationBlocked/);
  assert.match(workbenchComponent, /disabled=\{editorReadOnly\}[\s\S]*Draw piece/);
  assert.match(workbenchComponent, /disabled=\{editorReadOnly \|\| !selectedPiece\}[\s\S]*Add vertex/);
  assert.match(workbenchComponent, /disabled=\{editorReadOnly \|\| draftPoints\.length < 3\}[\s\S]*Finish polygon/);
  assert.match(workbenchComponent, /disabled=\{editorReadOnly \|\| draftPoints\.length === 0\}[\s\S]*Clear draft/);
  assert.match(workbenchComponent, /disabled=\{editorReadOnly \|\| !page\}[\s\S]*Save pieces/);
  assert.match(studioComponent, /Save pages and continue/);
  assert.match(studioComponent, /sanborn-station-inspector/);
});

test("historical map studio uses compact chrome and sticky atlas actions", () => {
  const shell = readFileSync("components/CommunityShell.tsx", "utf8");
  const navigator = readFileSync("components/SanbornAtlasNavigator.tsx", "utf8");
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(shell, /community-shell--studio-focus/);
  assert.match(shell, /pathname === "\/community\/historical-map-studio"/);
  assert.match(css, /\.community-shell--studio-focus \.community-shell__frame\s*\{[\s\S]*height: calc\(100vh - 12px\);/);
  assert.match(css, /\.community-shell--studio-focus \.community-shell__frame::before\s*\{\s*display: none;\s*\}/);
  assert.match(css, /\.community-shell--studio-focus \.community-shell__main\s*\{[\s\S]*overflow: hidden;/);
  assert.match(navigator, /Town Reconstruction station rail/);
  assert.match(navigator, /sanborn-atlas-navigator__steps/);
  assert.match(css, /\.sanborn-atlas-navigator\s*\{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.sanborn-atlas-navigator__steps\s*\{[\s\S]*overflow: auto;/);
  assert.match(css, /\.sanborn-atlas-workflow--stations\s*\{[\s\S]*grid-template-columns: clamp\(190px, 16vw, 230px\) minmax\(0, 1fr\) clamp\(300px, 24vw, 360px\);/);
  assert.match(css, /\.sanborn-station-inspector\s*\{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);/);
  assert.match(css, /\.sanborn-page-workbench--center-only\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
});

test("Historical Map Studio uses six reconstruction stations with right-side inspectors", () => {
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const navigator = readFileSync("components/SanbornAtlasNavigator.tsx", "utf8");
  const missionMap = readFileSync("components/TownIndexMissionMap.tsx", "utf8");
  const activeShellStart = studioComponent.indexOf("minimal-sanborn-gps--station-shell");
  const legacyShellStart = studioComponent.indexOf("Legacy pre-station");
  const activeShell = studioComponent.slice(activeShellStart, legacyShellStart > activeShellStart ? legacyShellStart : undefined);

  assert.match(navigator, /Town & Edition/);
  assert.match(navigator, /Source Record/);
  assert.match(navigator, /Town Index/);
  assert.match(navigator, /Sheet Inventory/);
  assert.match(navigator, /Map Pieces/);
  assert.match(navigator, /Map Placement/);
  assert.doesNotMatch(navigator, /Building Reconstruction/);
  assert.doesNotMatch(navigator, /People & Activity/);
  assert.doesNotMatch(navigator, /Evidence Review/);
  assert.match(activeShell, /sanborn-station-workspace/);
  assert.match(activeShell, /sanborn-station-inspector/);
  assert.match(studioComponent, /Save atlas/);
  assert.match(activeShell, /sanborn-station-inspector__close/);
  assert.match(studioComponent, /Back to Town Index/);
  assert.match(studioComponent, /function renderInspectorBody/);
  assert.match(studioComponent, /function renderTownIndexWorkspace/);
  assert.match(studioComponent, /TownIndexMissionMap/);
  assert.match(missionMap, /Manual source region editor/);
  assert.match(missionMap, /mode === "draw"/);
  assert.match(missionMap, /mode === "move"/);
  assert.match(missionMap, /onKeyDown/);
  assert.match(missionMap, /validateTownIndexRegionPolygon/);
});

test("Historical Map Studio drives tools from page classification", () => {
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const workbenchComponent = readFileSync("components/SanbornPageWorkbench.tsx", "utf8");
  const activeShellStart = studioComponent.indexOf("minimal-sanborn-gps--station-shell");
  const legacyShellStart = studioComponent.indexOf("Legacy pre-station");
  const activeShell = studioComponent.slice(activeShellStart, legacyShellStart > activeShellStart ? legacyShellStart : undefined);

  assert.match(studioComponent, /Page Classification/);
  assert.match(studioComponent, /Page type<select/);
  assert.match(studioComponent, /Printed reference/);
  assert.match(studioComponent, /Display title/);
  assert.match(studioComponent, /Is primary Town Index/);
  assert.match(studioComponent, /Save page classification/);
  assert.match(studioComponent, /No primary Town Index page is designated for this edition\./);
  assert.match(studioComponent, /Classify as Index or mixed/);
  assert.match(studioComponent, /Functional Source Regions/);
  assert.match(studioComponent, /Mark region/);
  assert.match(studioComponent, /Save regions/);
  assert.match(studioComponent, /Set as Primary Town Index/);
  assert.doesNotMatch(studioComponent, /graphicIndexPages\.length === 1/);
  assert.match(studioComponent, /selectedPageSupportsMapPieces/);
  assert.match(studioComponent, /selectedPageSupportsMapPlacement/);
  assert.match(studioComponent, /selectedPageToolBlockMessage/);
  assert.match(studioComponent, /Reclassify page or archive invalid pieces/);
  assert.match(workbenchComponent, /classificationBlockedMessage/);
  assert.match(workbenchComponent, /repairClassificationAction/);
  assert.doesNotMatch(activeShell, /Building Reconstruction/);
  assert.doesNotMatch(activeShell, /People & Activity/);
  assert.doesNotMatch(activeShell, /Evidence Review/);
});

test("map piece saves restore selected page, piece, workflow, and source sheet after refresh", () => {
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");

  assert.match(studioComponent, /type PendingStudioSelection = \{[\s\S]*pieceId\?: string;[\s\S]*assetId\?: string;/);
  assert.match(studioComponent, /const restoredPage = pendingSelection[\s\S]*activePagesAfterRefresh\.find\(\(page\) => page\.pageId === pendingSelection\.pageId\) \?\? activePagesAfterRefresh\[0\] \?\? null/s);
  assert.match(studioComponent, /const restoredPiece = pendingSelection\?\.pieceId[\s\S]*piecesAfterRefresh\.find\(\(piece\) => piece\.pieceId === pendingSelection\.pieceId\) \?\? piecesAfterRefresh\[0\] \?\? null/s);
  assert.match(studioComponent, /setSelectedAssetId\(preferredAssetId\)/);
  assert.match(studioComponent, /setSelectedMapPieceId\(nextPieceId\)/);
  assert.match(studioComponent, /setAtlasWorkflowStep\(pendingSelection\.workflowStep\)/);
  assert.match(studioComponent, /pendingStudioSelectionRef\.current = \{\s*atlasId: selectedAtlasPage\.atlasId,\s*pageId: selectedAtlasPage\.pageId,\s*pieceId: selectedMapPieceId \|\| piecesToSave\[0\]\?\.pieceId,\s*assetId: selectedAtlasPage\.sanbornSheetAssetId,\s*workflowStep: atlasWorkflowStep,/s);
  assert.match(studioComponent, /function selectAtlasPage\(pageId: string, nextStep: SanbornAtlasWorkflowStep = atlasWorkflowStep\)/);
});

test("map piece placement helpers keep piece placement independent from source sheets", () => {
  const piece = mapPiece("piece-68");
  const defaultPlacement = createDefaultMapPieceGeoreference(piece);
  const placed = placeMapPieceAtCenter(piece, defaultPlacement, { latitude: 33.425, longitude: -94.047 });
  const rotated = rotateMapPieceGeoreference(placed, 22);
  const saved = { ...rotated, isPersisted: true };
  const secondPieceDefault = createDefaultMapPieceGeoreference(mapPiece("piece-69", { pieceSequence: 2 }));
  const merged = mergeSavedAndDefaultMapPieceGeoreferences([piece, mapPiece("piece-69", { pieceSequence: 2 })], [saved]);

  assert.equal(defaultPlacement.placementStatus, "unplaced");
  assert.equal(defaultPlacement.isVisible, false);
  assert.equal(hasOperationalMapPiecePlacement(placed), true);
  assert.equal(rotated.rotation, 22);
  assert.notDeepEqual(rotated.corners.northwest, placed.corners.northwest);
  assert.equal(piecePlacementMatchesForPersistence(rotated, saved), true);
  assert.equal(merged.find((placement) => placement.pieceId === "piece-68")?.isPersisted, true);
  assert.equal(merged.find((placement) => placement.pieceId === "piece-69")?.placementStatus, secondPieceDefault.placementStatus);
});

test("map piece layer construction spans active atlas pages and resolves each source sheet", () => {
  const page2 = atlasPage("page-2", { sanbornSheetAssetId: "asset-2", pageSequence: 2, sheetNumber: 2 });
  const page3 = atlasPage("page-3", { sanbornSheetAssetId: "asset-3", pageSequence: 3, sheetNumber: 3 });
  const otherAtlasPage = atlasPage("page-other", { atlasId: "atlas-2", sanbornSheetAssetId: "asset-other", sheetNumber: 4 });
  const block68 = mapPiece("piece-68", { atlasPageId: page2.pageId, blockNumberText: "68" });
  const sheet3Inset = mapPiece("piece-3a", { atlasPageId: page3.pageId, blockNumberText: "3A", sourceBBox: { minX: 0.2, minY: 0.2, maxX: 0.4, maxY: 0.46 } });
  const sheet3Block = mapPiece("piece-3b", { atlasPageId: page3.pageId, blockNumberText: "3B" });
  const hiddenPiece = mapPiece("piece-hidden", { atlasPageId: page2.pageId, blockNumberText: "hidden" });
  const unplacedPiece = mapPiece("piece-unplaced", { atlasPageId: page3.pageId, blockNumberText: "unplaced" });
  const otherAtlasPiece = mapPiece("piece-other", { atlasPageId: otherAtlasPage.pageId, blockNumberText: "other" });
  const layers = buildOperationalMapPieceLayers({
    atlasId: "atlas-1",
    pages: [page2, page3, otherAtlasPage],
    pieces: [block68, sheet3Inset, sheet3Block, hiddenPiece, unplacedPiece, otherAtlasPiece],
    placements: [
      placedMapPieceGeoreference(block68.pieceId, page2.pageId, 33.425, -94.047, { layerOrder: 2 }),
      placedMapPieceGeoreference(sheet3Inset.pieceId, page3.pageId, 33.426, -94.044, { layerOrder: 1 }),
      placedMapPieceGeoreference(sheet3Block.pieceId, page3.pageId, 33.423, -94.043, { layerOrder: 3 }),
      placedMapPieceGeoreference(hiddenPiece.pieceId, page2.pageId, 33.421, -94.041, { isVisible: false }),
      createDefaultMapPieceGeoreference(unplacedPiece),
      placedMapPieceGeoreference(otherAtlasPiece.pieceId, otherAtlasPage.pageId, 33.43, -94.04),
    ],
    assets: [
      sheetAsset("asset-2", { width: 5000, height: 4200, signedUrl: "https://example.test/sheet-2.png" }),
      sheetAsset("asset-3", { width: 6000, height: 4600, signedUrl: "https://example.test/sheet-3.png" }),
      sheetAsset("asset-other"),
    ],
    displayScope: "all_placed_pieces",
    getPieceLabel: (piece) => `Piece ${piece.blockNumberText}`,
  });

  assert.deepEqual(layers.map((layer) => layer.pieceId), ["piece-3a", "piece-68", "piece-3b"]);
  assert.equal(layers.find((layer) => layer.pieceId === "piece-68")?.sourceAssetId, "asset-2");
  assert.equal(layers.find((layer) => layer.pieceId === "piece-68")?.imageUrl, "https://example.test/sheet-2.png");
  assert.equal(layers.find((layer) => layer.pieceId === "piece-3a")?.sourceAssetId, "asset-3");
  assert.equal(layers.find((layer) => layer.pieceId === "piece-3a")?.sourceImageWidth, 6000);
  assert.equal(layers.find((layer) => layer.pieceId === "piece-3b")?.atlasPageId, "page-3");
  assert.equal(layers.some((layer) => layer.pieceId === "piece-hidden"), false);
  assert.equal(layers.some((layer) => layer.pieceId === "piece-unplaced"), false);
  assert.equal(layers.some((layer) => layer.pieceId === "piece-other"), false);

  const currentPageOnly = buildOperationalMapPieceLayers({
    atlasId: "atlas-1",
    pages: [page2, page3],
    pieces: [block68, sheet3Inset, sheet3Block],
    placements: [
      placedMapPieceGeoreference(block68.pieceId, page2.pageId, 33.425, -94.047, { layerOrder: 2 }),
      placedMapPieceGeoreference(sheet3Inset.pieceId, page3.pageId, 33.426, -94.044, { layerOrder: 1 }),
      placedMapPieceGeoreference(sheet3Block.pieceId, page3.pageId, 33.423, -94.043, { layerOrder: 3 }),
    ],
    assets: [sheetAsset("asset-2"), sheetAsset("asset-3")],
    selectedPageId: "page-3",
    displayScope: "current_page_only",
  });

  assert.deepEqual(currentPageOnly.map((layer) => layer.pieceId), ["piece-3a", "piece-3b"]);
});

test("map piece layer helpers support cross-page selection, fit-all bounds, auto-fit gating, and signed URL dedupe", () => {
  const page2 = atlasPage("page-2", { sanbornSheetAssetId: "asset-2", pageSequence: 2, sheetNumber: 2 });
  const page3 = atlasPage("page-3", { sanbornSheetAssetId: "asset-3", pageSequence: 3, sheetNumber: 3 });
  const block68 = mapPiece("piece-68", { atlasPageId: page2.pageId, blockNumberText: "68" });
  const sheet3Inset = mapPiece("piece-3a", { atlasPageId: page3.pageId, blockNumberText: "3A" });
  const sheet3Block = mapPiece("piece-3b", { atlasPageId: page3.pageId, blockNumberText: "3B" });
  const layers = buildOperationalMapPieceLayers({
    atlasId: "atlas-1",
    pages: [page2, page3],
    pieces: [block68, sheet3Inset, sheet3Block],
    placements: [
      placedMapPieceGeoreference(block68.pieceId, page2.pageId, 33.425, -94.047, { layerOrder: 1 }),
      placedMapPieceGeoreference(sheet3Inset.pieceId, page3.pageId, 33.43, -94.04, { layerOrder: 2 }),
      placedMapPieceGeoreference(sheet3Block.pieceId, page3.pageId, 33.42, -94.05, { layerOrder: 3 }),
    ],
    assets: [sheetAsset("asset-2"), sheetAsset("asset-3")],
  });

  const selection = resolveMapPiecePlacementSelection({
    atlasId: "atlas-1",
    pieceId: "piece-3a",
    pages: [page2, page3],
    pieces: [block68, sheet3Inset, sheet3Block],
  });
  const bounds = getMapPieceLayerBounds(layers);

  assert.equal(selection?.page.pageId, "page-3");
  assert.equal(selection?.sourceAssetId, "asset-3");
  assert.equal(resolveMapPiecePlacementSelection({ atlasId: "atlas-2", pieceId: "piece-3a", pages: [page2, page3], pieces: [sheet3Inset] }), null);
  assert.deepEqual(getMapPieceLayerSourceAssetIds(layers), ["asset-2", "asset-3"]);
  assert.deepEqual(bounds, {
    northLatitude: 33.431,
    southLatitude: 33.419,
    eastLongitude: -94.039,
    westLongitude: -94.051,
  });
  assert.equal(
    shouldAutoFitMapPieceOverview({
      isMapPlacementActive: true,
      savedVisiblePieceCount: layers.length,
      hasFitBounds: Boolean(bounds),
      autoFitAlreadyApplied: false,
      userMovedMap: false,
    }),
    true,
  );
  assert.equal(
    shouldAutoFitMapPieceOverview({
      isMapPlacementActive: true,
      savedVisiblePieceCount: layers.length,
      hasFitBounds: Boolean(bounds),
      autoFitAlreadyApplied: true,
      userMovedMap: false,
    }),
    false,
  );
  assert.equal(
    shouldAutoFitMapPieceOverview({
      isMapPlacementActive: true,
      savedVisiblePieceCount: layers.length,
      hasFitBounds: Boolean(bounds),
      autoFitAlreadyApplied: false,
      userMovedMap: true,
    }),
    false,
  );
});

test("map piece geographic corner validation rejects unusable quadrilaterals", () => {
  const validSkewed = {
    northwest: { latitude: 33.43, longitude: -94.055 },
    northeast: { latitude: 33.431, longitude: -94.04 },
    southeast: { latitude: 33.419, longitude: -94.038 },
    southwest: { latitude: 33.418, longitude: -94.056 },
  };
  const reversedWinding = {
    northwest: validSkewed.northwest,
    northeast: validSkewed.southwest,
    southeast: validSkewed.southeast,
    southwest: validSkewed.northeast,
  };
  const rotatedNormal = rotateMapPieceGeoreference(
    placeMapPieceAtCenter(mapPiece("piece-68"), createDefaultMapPieceGeoreference(mapPiece("piece-68")), { latitude: 33.425, longitude: -94.047 }),
    37,
  );

  assert.equal(validateMapPieceGeographicCorners(validSkewed).ok, true);
  assert.equal(validateMapPieceGeographicCorners(rotatedNormal.corners).ok, true);
  assert.equal(validateMapPieceGeographicCorners(reversedWinding).ok, false);
  assert.equal(validateMapPieceGeographicCorners({ ...validSkewed, southwest: validSkewed.northwest }).ok, false);
  assert.equal(
    validateMapPieceGeographicCorners({
      northwest: { latitude: 33.43, longitude: -94.06 },
      northeast: { latitude: 33.43, longitude: -94.05 },
      southeast: { latitude: 33.43, longitude: -94.04 },
      southwest: { latitude: 33.43, longitude: -94.03 },
    }).ok,
    false,
  );
  assert.equal(
    validateMapPieceGeographicCorners({
      northwest: { latitude: 33.43, longitude: -94.06 },
      northeast: { latitude: 33.418, longitude: -94.04 },
      southeast: { latitude: 33.43, longitude: -94.04 },
      southwest: { latitude: 33.418, longitude: -94.06 },
    }).ok,
    false,
  );
  assert.equal(
    validateMapPieceGeographicCorners({
      northwest: { latitude: 33.43, longitude: -94.06 },
      northeast: { latitude: 33.43, longitude: -94.04 },
      southeast: { latitude: 33.424, longitude: -94.052 },
      southwest: { latitude: 33.418, longitude: -94.06 },
    }).ok,
    false,
  );
  assert.equal(validateMapPieceGeographicCorners({ ...validSkewed, northwest: { latitude: 91, longitude: -94.055 } }).ok, false);
});

test("interactive map piece dragging rejects invalid geometry without fallback commits", () => {
  const piece = mapPiece("piece-68");
  const original = placeMapPieceAtCenter(piece, createDefaultMapPieceGeoreference(piece), { latitude: 33.425, longitude: -94.047 });
  const invalidCorners = {
    ...original.corners,
    northeast: original.corners.northwest,
  };
  const invalidDraft = createMapPieceInteractiveDraft(original, { corners: invalidCorners, rotation: original.rotation, placementStatus: "draft" });

  assert.equal(invalidDraft.ok, false);
  assert.deepEqual(invalidDraft.placement, original);

  const rejected = finishMapPieceInteractiveDraft(original, invalidDraft.ok ? invalidDraft.placement : null, invalidDraft.ok ? "" : invalidDraft.message);
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.placement, original);
  if (!rejected.ok) {
    assert.match(rejected.message, /valid, non-crossing geographic quadrilateral/);
  }

  const invalidSingleCorner = updateMapPieceGeographicCorner(original, "northeast", original.corners.northwest!);
  assert.deepEqual(invalidSingleCorner, original);
});

test("interactive map piece dragging commits valid raw corner geometry", () => {
  const piece = mapPiece("piece-68");
  const original = placeMapPieceAtCenter(piece, createDefaultMapPieceGeoreference(piece), { latitude: 33.425, longitude: -94.047 });
  const validCorners = {
    ...original.corners,
    northeast: {
      latitude: (original.corners.northeast?.latitude ?? 0) + 0.00002,
      longitude: (original.corners.northeast?.longitude ?? 0) + 0.00002,
    },
  };
  const draft = createMapPieceInteractiveDraft(original, { corners: validCorners, rotation: original.rotation, placementStatus: "draft" });

  assert.equal(draft.ok, true);
  if (!draft.ok) return;

  const committed = finishMapPieceInteractiveDraft(original, draft.placement);
  assert.equal(committed.ok, true);
  if (!committed.ok) return;

  assert.notDeepEqual(committed.placement.corners.northeast, original.corners.northeast);
  assert.equal(validateMapPieceGeographicCorners(committed.placement.corners).ok, true);
  assert.equal(committed.placement.placementStatus, "draft");
});

test("map piece persistence validator rejects route payloads before normalization", () => {
  const validCorners = {
    northwest: { latitude: 33.43, longitude: -94.055 },
    northeast: { latitude: 33.431, longitude: -94.04 },
    southeast: { latitude: 33.419, longitude: -94.038 },
    southwest: { latitude: 33.418, longitude: -94.056 },
  };

  assert.equal(validateMapPiecePlacementForPersistence({ targetType: "sanborn_map_piece", targetGeometry: "polygon", corners: validCorners }).ok, true);
  assert.deepEqual(validateMapPiecePlacementForPersistence({ targetType: "sanborn_map_piece", targetGeometry: "line", corners: validCorners }), {
    ok: false,
    message: "Map piece placement target geometry must be polygon.",
  });
  assert.deepEqual(validateMapPiecePlacementForPersistence({ targetType: "sanborn_map_piece", targetGeometry: "polygon", corners: { ...validCorners, southwest: validCorners.northwest } }), {
    ok: false,
    message: "Map piece placement corners must form a valid, non-crossing geographic quadrilateral.",
  });
});

test("map piece persistence comparison checks every editable saved field", () => {
  const piece = mapPiece("piece-68");
  const baseline = {
    ...placeMapPieceAtCenter(piece, createDefaultMapPieceGeoreference(piece), { latitude: 33.425, longitude: -94.047 }),
    notes: "Railroad lumber-loading dock and cotton platform.",
    layerOrder: 3,
    placementStatus: "draft" as const,
    isVisible: true,
    isLocked: false,
  };
  const saved = { ...baseline, isPersisted: true };

  assert.equal(piecePlacementMatchesForPersistence(baseline, saved), true);

  const changedCorner = {
    ...saved,
    corners: {
      ...saved.corners,
      northeast: {
        latitude: (saved.corners.northeast?.latitude ?? 0) + 0.001,
        longitude: saved.corners.northeast?.longitude ?? 0,
      },
    },
  };
  const mismatches = [
    { ...saved, pieceId: "piece-69" },
    { ...saved, centerLatitude: saved.centerLatitude + 0.001 },
    { ...saved, rotation: saved.rotation + 1 },
    { ...saved, opacity: saved.opacity - 0.1 },
    { ...saved, layerOrder: saved.layerOrder + 1 },
    { ...saved, placementStatus: "aligned" as const },
    { ...saved, isVisible: !saved.isVisible },
    { ...saved, isLocked: !saved.isLocked },
    { ...saved, notes: "Different notes" },
    changedCorner,
  ];

  mismatches.forEach((candidate) => {
    assert.equal(piecePlacementMatchesForPersistence(baseline, candidate), false);
  });
});

test("map piece rotation helper uses one coordinate space when the map is offset", () => {
  const mapContainerRect = { left: 200, top: 150 };
  const startPoint = clientPointToContainerPoint(220, 160, mapContainerRect);
  const currentPoint = clientPointToContainerPoint(210, 170, mapContainerRect);

  assert.deepEqual(startPoint, { x: 20, y: 10 });
  assert.deepEqual(currentPoint, { x: 10, y: 20 });
  assert.equal(Math.round(calculateRotationDeltaDegrees(startPoint, currentPoint, { x: 10, y: 10 })), 90);
});

test("map piece mask raster plans cap large source pieces without changing aspect ratio", () => {
  const plan = calculateMapPieceMaskRasterPlan({
    sourceImageWidth: 20_000,
    sourceImageHeight: 12_000,
    sourcePolygon: [
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.2 },
      { x: 0.9, y: 0.7 },
      { x: 0.1, y: 0.7 },
    ],
  });

  assert.equal(Math.max(plan.outputWidth, plan.outputHeight), maxMapPieceMaskRasterDimension);
  assert.equal(plan.outputWidth, 3072);
  assert.equal(plan.outputHeight, 1152);
  assert.equal(plan.sourceWidth / plan.sourceHeight, 16_000 / 6_000);
  assert.equal(plan.outputWidth / plan.outputHeight, 3072 / 1152);
});

test("map piece placement network helper clears in-flight state after rejected requests", async () => {
  let cleanedUp = false;
  const result = await runMapPiecePlacementNetworkRequest(
    async () => {
      throw new Error("network offline");
    },
    () => {
      cleanedUp = true;
    },
  );

  assert.equal(result.ok, false);
  assert.equal(cleanedUp, true);
  if (!result.ok) {
    assert.match(result.message, /network offline/);
  }
});

test("map piece placement migration is service-role-only and preserves review metadata", () => {
  const migration = readFileSync("../../supabase/migrations/0011_sanborn_map_piece_georeferences.sql", "utf8");
  const fixMigration = readFileSync("../../supabase/migrations/0012_fix_sanborn_map_piece_save_scope.sql", "utf8");
  const normalized = migration.replace(/\s+/g, " ").toLowerCase();
  const normalizedFix = fixMigration.replace(/\s+/g, " ").toLowerCase();

  assert.match(migration, /create table if not exists public\.sanborn_map_piece_georeferences/);
  assert.match(migration, /references public\.sanborn_map_pieces\(id\) on delete cascade/);
  assert.match(migration, /placement_status text not null default 'unplaced' check \(placement_status in \('unplaced', 'draft', 'placed', 'aligned', 'reviewed'\)\)/);
  assert.match(migration, /create or replace function public\.sanborn_map_piece_geographic_quad_is_valid/);
  assert.match(migration, /constraint sanborn_map_piece_georeferences_geographic_quad_check check/);
  assert.match(migration, /target_geometry text not null default 'polygon' check \(target_geometry = 'polygon'\)/);
  assert.match(normalized, /and cross_abc < -0\.000000000001 and cross_bcd < -0\.000000000001 and cross_cda < -0\.000000000001 and cross_dab < -0\.000000000001/);
  assert.doesNotMatch(normalized, /cross_abc > 0\.000000000001/);
  assert.match(migration, /create or replace function public\.save_sanborn_map_piece_georeference/);
  assert.match(migration, /Map piece placement corners must form a valid, non-crossing geographic quadrilateral\./);
  assert.match(normalized, /security invoker/);
  assert.match(normalized, /set search_path = public/);
  assert.doesNotMatch(normalized, /security definer/);
  assert.match(normalized, /alter table public\.sanborn_map_piece_georeferences enable row level security/);
  assert.match(normalized, /revoke all on table public\.sanborn_map_piece_georeferences from public/);
  assert.match(normalized, /revoke all on table public\.sanborn_map_piece_georeferences from anon/);
  assert.match(normalized, /revoke all on table public\.sanborn_map_piece_georeferences from authenticated/);
  assert.match(normalized, /grant select, insert, update, delete on table public\.sanborn_map_piece_georeferences to service_role/);
  assert.match(normalized, /revoke execute on function public\.sanborn_map_piece_geographic_quad_is_valid\(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision\) from public/);
  assert.match(normalized, /grant execute on function public\.sanborn_map_piece_geographic_quad_is_valid\(double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision\) to service_role/);
  assert.match(normalized, /revoke execute on function public\.save_sanborn_map_piece_georeference\(uuid, text, text, integer, jsonb, double precision, text, jsonb\) from public/);
  assert.match(normalized, /grant execute on function public\.save_sanborn_map_piece_georeference\(uuid, text, text, integer, jsonb, double precision, text, jsonb\) to service_role/);
  assert.match(fixMigration, /create or replace function public\.save_sanborn_map_piece_georeference/);
  assert.match(normalizedFix, /security invoker/);
  assert.match(normalizedFix, /set search_path = public/);
  assert.doesNotMatch(normalizedFix, /security definer/);
  assert.match(normalizedFix, /revoke execute on function public\.save_sanborn_map_piece_georeference\(uuid, text, text, integer, jsonb, double precision, text, jsonb\) from public/);
  assert.match(normalizedFix, /grant execute on function public\.save_sanborn_map_piece_georeference\(uuid, text, text, integer, jsonb, double precision, text, jsonb\) to service_role/);
  assert.doesNotMatch(migration, /review_status\s*=/);
  assert.doesNotMatch(migration, /evidence_classification\s*=/);
  assert.doesNotMatch(migration, /create table .*building|create table .*hydrant|create table .*railroad|create table .*historical_feature/i);
});

test("map piece save RPC avoids PL/pgSQL record and alias collision", () => {
  const migrations = [
    readFileSync("../../supabase/migrations/0011_sanborn_map_piece_georeferences.sql", "utf8"),
    readFileSync("../../supabase/migrations/0012_fix_sanborn_map_piece_save_scope.sql", "utf8"),
  ];

  migrations.forEach((migration) => {
    const normalized = migration.replace(/\s+/g, " ").toLowerCase();
    const assignIndex = normalized.indexOf("into piece_scope from public.sanborn_map_pieces as map_piece_row");
    const firstFieldAccess = normalized.indexOf("piece_scope.town_package_id");

    assert.doesNotMatch(migration, /\npiece record;/i);
    assert.doesNotMatch(migration, /from public\.sanborn_map_pieces\s+(?:as\s+)?piece\b/i);
    assert.match(normalized, /piece_scope record/);
    assert.match(normalized, /from public\.sanborn_map_pieces as map_piece_row/);
    assert.match(normalized, /join public\.sanborn_atlas_pages as atlas_page_row/);
    assert.match(normalized, /join public\.sanborn_atlases as atlas_row/);
    assert.equal(assignIndex >= 0, true);
    assert.equal(firstFieldAccess > assignIndex, true);
    assert.doesNotMatch(normalized, /\bpiece\.(town_package_id|map_piece_row_id|atlas_page_id)\b/);
    assert.match(normalized, /piece_scope\.town_package_id/);
    assert.match(normalized, /piece_scope\.map_piece_row_id/);
    assert.match(normalized, /piece_scope\.atlas_page_id/);
    assert.doesNotMatch(normalized, /security definer/);
  });
});

test("map piece placement route saves through the scoped service-role RPC", () => {
  const route = readFileSync("app/api/community/historical-map-studio/map-piece-georeferences/route.ts", "utf8");
  const dataSource = readFileSync("lib/historical-map-studio-data.ts", "utf8");

  assert.match(route, /requireMapStudioWriteAccess/);
  assert.match(route, /resolvePieceScope/);
  assert.match(route, /Map piece belongs to another town package/);
  assert.match(route, /validateMapPiecePlacementForPersistence\(body\.placement\)/);
  assert.match(route, /function mapSavedPiece[\s\S]*validateMapPieceGeographicCorners\(corners\)/);
  assert.match(dataSource, /validateMapPieceGeographicCorners\(corners\)/);
  assert.match(dataSource, /Saved map piece placement query returned \$\{savedMapPieceGeoreferenceMapping\.invalidCount\} invalid geographic placement row\(s\)\./);
  assert.match(route, /supabase\.rpc\("save_sanborn_map_piece_georeference"/);
  assert.match(route, /normalizeSanbornMapPieceGeoreference/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.from\("sanborn_map_piece_georeferences"\)[\s\S]{0,240}\.(insert|update|upsert)\(/);
});

test("Map placement opens at useful town zoom and exposes piece-first controls", () => {
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const leafletComponent = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");
  const pageComponent = readFileSync("app/community/historical-map-studio/page.tsx", "utf8");

  assert.match(studioComponent, /const minimumUsefulGpsZoom = 12;/);
  assert.match(studioComponent, /const defaultTownGpsZoom = 16;/);
  assert.match(studioComponent, /const minimumAutoGpsZoom = 15;/);
  assert.match(studioComponent, /const maximumAutoGpsZoom = 18;/);
  assert.match(studioComponent, /function isMeaningfulGpsView[\s\S]*zoom >= minimumUsefulGpsZoom/s);
  assert.match(studioComponent, /function getGpsTownCenterFromState[\s\S]*return getTownCenterFromState\(studioState\) \?\? getDefaultTownCenter\(studioState\);/);
  assert.match(studioComponent, /function getGpsTownZoomFromState[\s\S]*Math\.min\(maximumAutoGpsZoom, Math\.max\(minimumAutoGpsZoom, preferredZoom\)\)/s);
  assert.match(studioComponent, /function centerGpsOnActiveTown[\s\S]*const center = getGpsTownCenterFromState\(initialData\);[\s\S]*const zoom = getGpsTownZoomFromState\(initialData\);[\s\S]*setGeoEditMode\("pan_modern_map"\);[\s\S]*requestExternalMapView\(center, zoom, "town_package"/s);
  assert.match(studioComponent, /function enterGpsAlignment[\s\S]*setSelectedMapPieceId\(selectedMapPiece\.pieceId\)[\s\S]*if \(!isMeaningfulGpsView\(mapCenter, modernMapZoom\)\) \{\s*centerGpsOnActiveTown\("enterGpsAlignment"\);/s);
  assert.match(studioComponent, /function backToLastNonGpsWorkflowStep\(\)[\s\S]*changeAtlasWorkflowStep\(lastNonGpsWorkflowStep\);/);
  assert.match(studioComponent, /minimal-sanborn-gps__gps-workflow/);
  assert.match(studioComponent, /Center on \{initialData\.activeTownPackage\?\.name \?\? "town"\}/);
  assert.match(studioComponent, /aria-label="Historical Map Studio map placement tool"/);
  assert.match(studioComponent, /Place selected piece/);
  assert.match(studioComponent, /Edit selected piece/);
  assert.match(studioComponent, /Advanced whole-sheet reference[\s\S]*Place sheet/s);
  assert.match(studioComponent, /function normalizeAtlasWorkflowStep[\s\S]*value === "map_placement"[\s\S]*return "gps_alignment"/s);
  assert.match(studioComponent, /initialSelectionAppliedRef/);
  assert.match(studioComponent, /window\.history\.replaceState\(window\.history\.state, "", nextUrl\)/);
  assert.match(studioComponent, /params\.set\("workflow", atlasWorkflowStep\)/);
  assert.match(pageComponent, /workflow\?: string/);
  assert.match(pageComponent, /townPackageId: params\.townPackageId \?\? params\.town/);
  assert.match(pageComponent, /mapYear: params\.mapYear \?\? params\.year/);
  assert.match(pageComponent, /initialSelection=\{\{[\s\S]*workflowStep: params\.workflow[\s\S]*pieceId: params\.mapPieceId \?\? params\.piece[\s\S]*assetId: params\.sheetAssetId \?\? params\.sheet/s);
  assert.match(studioComponent, /pieceLayers=\{mapPieceLayers\}/);
  assert.match(studioComponent, /buildOperationalMapPieceLayers\(\{/);
  assert.match(studioComponent, /displayScope: "all_placed_pieces"/);
  assert.match(studioComponent, /pieceDisplayScope === "current_page_only"/);
  assert.match(studioComponent, /Fit all placed pieces/);
  assert.match(studioComponent, /showReferenceSheetAlignment && hasPlacedHistoricalSheets/);
  assert.match(studioComponent, /onPieceTransformCommit=\{\(pieceId, patch\) => commitMapPieceGeoreference\(pieceId, patch\)\}/);
  assert.match(studioComponent, /onSelectPiece=\{selectMapPieceForPlacement\}/);
  assert.match(leafletComponent, /function createMaskedPieceImageUrl/);
  assert.match(leafletComponent, /calculateMapPieceMaskRasterPlan/);
  assert.match(leafletComponent, /document\.createElement\("canvas"\)/);
  assert.match(leafletComponent, /context\.clip\(\)/);
  assert.match(leafletComponent, /canvas\.toBlob/);
  assert.match(leafletComponent, /URL\.createObjectURL\(blob\)/);
  assert.match(leafletComponent, /URL\.revokeObjectURL/);
  assert.match(leafletComponent, /createMapPieceInteractiveDraft\(start\.piece/);
  assert.match(leafletComponent, /finishMapPieceInteractiveDraft\(latestRef\.current\.layer, nextDraft, invalidDragDiagnostic\)/);
  assert.match(leafletComponent, /current\.mode !== "edit_historical_sheets" \|\| !current\.isSelected/);
  assert.match(leafletComponent, /element\.style\.pointerEvents = "auto"/);
  assert.doesNotMatch(leafletComponent, /draft = normalizeSanbornMapPieceGeoreference/);
  assert.doesNotMatch(leafletComponent, /supabase|upload/i);
});

test("upload refresh selects the newly returned uploaded sheet when present", () => {
  const assets = [{ assetId: "asset-1" }, { assetId: "asset-2" }];

  assert.equal(selectPreferredSheetAfterUpload(assets, "asset-2"), "asset-2");
  assert.equal(selectPreferredSheetAfterUpload(assets, "missing"), "asset-1");
  assert.equal(selectPreferredSheetAfterUpload([], "asset-2"), "");
});

test("normalizes town, ZIP, and direct coordinate location queries", () => {
  assert.deepEqual(normalizeLocationQuery("  Texarkana,   Texas "), { ok: true, query: "Texarkana, Texas" });
  assert.deepEqual(normalizeLocationQuery("75501"), { ok: true, query: "75501" });
  assert.deepEqual(normalizeLocationQuery("Waco, Texas"), { ok: true, query: "Waco, Texas" });
  assert.deepEqual(parseDirectCoordinates("33.425, -94.047"), { latitude: 33.425, longitude: -94.047 });
  assert.equal(parseDirectCoordinates("94, -181"), null);
});

test("maps Nominatim responses and town-package location persistence payloads", () => {
  const result = mapNominatimResult("Texarkana, Texas", {
    display_name: "Texarkana, Bowie County, Texas, United States",
    lat: "33.425",
    lon: "-94.047",
    boundingbox: ["33.33", "33.53", "-94.18", "-93.93"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.boundingBox, { south: 33.33, north: 33.53, west: -94.18, east: -93.93 });
  assert.deepEqual(parseNominatimBoundingBox(["2", "1", "0", "1"]), null);
  assert.deepEqual(mapViewFromGeocodeResult(result), { center: { latitude: 33.425, longitude: -94.047 }, zoom: 15 });
  assert.deepEqual(buildTownPackageLocationUpdate(result), {
    center_latitude: 33.425,
    center_longitude: -94.047,
    default_zoom: 15,
    location_query: "Texarkana, Texas",
    location_display_name: "Texarkana, Bowie County, Texas, United States",
    location_north: 33.53,
    location_south: 33.33,
    location_east: -93.93,
    location_west: -94.18,
  });
});

test("town-location metadata migration adds location fields without a competing table", () => {
  const migration = readFileSync("../../supabase/migrations/0009_town_package_location_metadata.sql", "utf8");

  assert.match(migration, /alter table public\.town_packages/);
  assert.match(migration, /location_query text/);
  assert.match(migration, /location_display_name text/);
  assert.match(migration, /location_north double precision/);
  assert.match(migration, /location_south double precision/);
  assert.match(migration, /location_east double precision/);
  assert.match(migration, /location_west double precision/);
  assert.doesNotMatch(migration, /create table/i);
});

test("geocoder supports direct coordinates, no results, and provider failures", async () => {
  const direct = await geocodeLocation("33.425, -94.047", async () => {
    throw new Error("fetch should not run for direct coordinates");
  });
  assert.equal(direct.ok, true);
  if (direct.ok) {
    assert.equal(direct.source, "direct_coordinates");
    assert.equal(direct.latitude, 33.425);
  }

  const noResults = await geocodeLocation("No Such Place 123", async () => ({
    ok: true,
    status: 200,
    json: async () => [],
  }));
  assert.deepEqual(noResults, { ok: false, code: "no_results", message: "No usable map location was found for that search." });

  const failed = await geocodeLocation("Provider Failure Place", async () => ({
    ok: false,
    status: 503,
    json: async () => [],
  }));
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.code, "provider_error");
  }
});

test("server-side geocoder sends an identifying User-Agent and does not autocomplete", async () => {
  let requestedUrl = "";
  let requestedUserAgent = "";
  const result = await geocodeLocation("Querytown, Texas", async (url, init) => {
    requestedUrl = url;
    requestedUserAgent = init?.headers?.["User-Agent"] ?? "";
    return {
      ok: true,
      status: 200,
      json: async () => [{ display_name: "Querytown", lat: "31.1", lon: "-97.1" }],
    };
  });

  assert.equal(result.ok, true);
  assert.match(requestedUrl, /nominatim\.openstreetmap\.org\/search/);
  assert.match(requestedUrl, /limit=1/);
  assert.doesNotMatch(requestedUrl, /autocomplete/i);
  assert.match(requestedUserAgent, /TheMindsEye/);
});

test("modern tile diagnostics require real tile image success before loaded", () => {
  const initial = createTileDiagnostics();
  const loading = updateTileDiagnostics(initial, "loading");
  const layerLoadedWithoutImages = updateTileDiagnostics(loading, "load");
  const firstTileLoaded = updateTileDiagnostics(layerLoadedWithoutImages, "tileload");
  const failedAfterSuccess = updateTileDiagnostics(firstTileLoaded, "tileerror");

  assert.equal(loading.status, "loading");
  assert.equal(layerLoadedWithoutImages.status, "loading");
  assert.equal(firstTileLoaded.status, "loaded");
  assert.equal(firstTileLoaded.successfulTiles, 1);
  assert.equal(failedAfterSuccess.status, "loaded");
  assert.equal(failedAfterSuccess.failedTiles, 1);
});

test("modern tile failure and retry diagnostics are accurate", () => {
  const failed = updateTileDiagnostics(createTileDiagnostics(), "tileerror");
  const retried = updateTileDiagnostics(failed, "retry");

  assert.equal(failed.status, "error");
  assert.equal(failed.successfulTiles, 0);
  assert.equal(failed.failedTiles, 1);
  assert.equal(retried.status, "loading");
  assert.equal(retried.successfulTiles, 0);
  assert.equal(retried.failedTiles, 0);
  assert.equal(retried.retryToken, 1);
});

test("modern map auto-fallback only triggers when OpenStreetMap has no loaded tiles", () => {
  assert.equal(shouldAutoFallbackBasemap({ basemapKey: "osm", status: "loading", successfulTiles: 0, failedTiles: 0, elapsedMs: 6_100 }), true);
  assert.equal(shouldAutoFallbackBasemap({ basemapKey: "osm", status: "error", successfulTiles: 0, failedTiles: 1, elapsedMs: 200 }), true);
  assert.equal(shouldAutoFallbackBasemap({ basemapKey: "osm", status: "loaded", successfulTiles: 1, failedTiles: 3, elapsedMs: 6_100 }), false);
  assert.equal(shouldAutoFallbackBasemap({ basemapKey: "esri_world_street", status: "error", successfulTiles: 0, failedTiles: 2, elapsedMs: 6_100 }), false);
});

test("runtime tile debug inspects actual Leaflet tile paint state", () => {
  const component = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");

  assert.equal(component.includes('document.querySelectorAll<HTMLImageElement>(".leaflet-tile")'), true);
  assert.match(component, /tile\.complete/);
  assert.match(component, /tile\.naturalWidth > 0/);
  assert.match(component, /window\.getComputedStyle\(firstTile\)/);
  assert.match(component, /getBoundingClientRect\(\)/);
  assert.equal(component.includes('closest(".leaflet-pane")'), true);
  assert.match(component, /tilePaneChildCount/);
  assert.match(component, /visibleLoadedTileCount/);
  assert.match(component, /Leaflet tile paint debug/);
});

test("geocode view refresh forces Leaflet view, size invalidation, and tile redraw", () => {
  const leafletComponent = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");

  assert.match(leafletComponent, /function ForceLeafletTileRedraw/);
  assert.match(leafletComponent, /function SyncMapView/);
  assert.match(leafletComponent, /request <= 0 \|\| lastRequest\.current === request/);
  assert.match(leafletComponent, /map\.setView\(center, zoom, \{ animate: false \}\)/);
  assert.match(leafletComponent, /map\.invalidateSize\(\{ animate: false \}\)/);
  assert.match(leafletComponent, /layer\.redraw\(\)/);
  assert.match(leafletComponent, /\[100, 500\]/);
  assert.match(studioComponent, /setMapViewRefreshRequest\(\(current\) => current \+ 1\)/);
  assert.match(studioComponent, /viewRefreshRequest=\{mapViewRefreshRequest\}/);
  assert.match(studioComponent, /requestedViewSource=\{requestedViewSource\}/);
});

test("location search priority blocks stale near-zero center and avoids automatic FitBounds", () => {
  const component = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const findLocationStart = component.indexOf("async function findLocation");
  const findLocationEnd = component.indexOf("async function uploadSheets", findLocationStart);
  const findLocationBody = component.slice(findLocationStart, findLocationEnd);

  assert.match(component, /requestedGeocodeCenterRef\.current = view\.center/);
  assert.match(component, /locationSearchGuardUntilRef\.current = Date\.now\(\) \+ 2_000/);
  assert.match(component, /A stale saved map position was prevented from replacing your selected location/);
  assert.match(component, /isNearZeroCoordinate\(nextCenter\)/);
  assert.doesNotMatch(findLocationBody, /setFitOverlayRequest/);
  assert.match(component, /fitBoundsEnabled=\{mapInteractionStatus !== "panning" && mapInteractionStatus !== "zooming"/);
});

test("invalid legacy sheet bounds are excluded from map layers and FitBounds inputs", () => {
  const component = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const route = readFileSync("app/api/community/historical-map-studio/sheet-georeferences/route.ts", "utf8");

  assert.match(component, /!hasOperationalSheetPlacement\(geoSheet\)/);
  assert.match(component, /\.filter\(\(layer\) => hasOperationalSheetPlacement\(layer\)\)/);
  assert.match(component, /const hasPlacedHistoricalSheets = historicalSheetLayers\.some\(\(layer\) => hasOperationalSheetPlacement\(layer\)\)/);
  assert.match(component, /selectedSheetGeoreference && hasOperationalSheetPlacement\(selectedSheetGeoreference\)/);
  assert.match(route, /isOperationalMapCenter\(workspaceCenter\) \? workspaceCenter : null/);
});

test("reset all sheet placements preserves assets and places selected sheet at current town location", () => {
  const component = readFileSync("components/HistoricalMapStudio.tsx", "utf8");

  assert.match(component, /function resetAllSheetPlacementsToCurrentTownLocation/);
  assert.match(component, /return hasOperationalSheetPlacement\(sheet\) \? sheet : removeSheetGeographicPlacement\(sheet\)/);
  assert.match(component, /resetSheetGeographicPlacementToCenter/);
  assert.match(component, /opacity: 0\.5/);
  assert.match(component, />\s*Reset all sheets\s*</);
});

test("projective overlay is anchored to Leaflet pane coordinates and updates through zoom lifecycle", () => {
  const component = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");

  assert.match(component, /L\.DomUtil\.setPosition\(element, offset\)/);
  assert.match(component, /map\.latLngToLayerPoint/);
  assert.match(component, /moveend zoomend viewreset resize/);
  assert.doesNotMatch(component, /movestart move moveend zoomstart zoom zoomend viewreset resize/);
  assert.match(component, /window\.requestAnimationFrame/);
  assert.match(component, /getProjectiveTransform\(imageSize\.width, imageSize\.height, points, offset\)/);
});

test("manual pan and zoom disable stale external view synchronization", () => {
  const component = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const leafletComponent = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");

  assert.match(component, /const clearActiveExternalViewRequest = useCallback/);
  assert.match(component, /requestedGeocodeCenterRef\.current = null/);
  assert.match(component, /locationSearchGuardUntilRef\.current = 0/);
  assert.match(component, /isUserPanningRef\.current = true/);
  assert.match(component, /isUserZoomingRef\.current = true/);
  assert.match(leafletComponent, /dragstart\(\) \{/);
  assert.match(leafletComponent, /onMapInteractionChange\?\.\("panning", "dragstart"\)/);
  assert.match(leafletComponent, /onMapViewChange\(\[center\.lat, center\.lng\], map\.getZoom\(\), "user_pan"\)/);
  assert.match(leafletComponent, /onMapViewChange\(\[center\.lat, center\.lng\], map\.getZoom\(\), "user_zoom"\)/);
});

test("setView only runs for explicit requested view token changes", () => {
  const component = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");
  const syncStart = component.indexOf("function SyncMapView");
  const syncEnd = component.indexOf("function InvalidateMapSize", syncStart);
  const syncBody = component.slice(syncStart, syncEnd);

  assert.match(syncBody, /request: number/);
  assert.match(syncBody, /lastRequest\.current = request/);
  assert.match(syncBody, /onViewMutation\?\.\(source\)/);
  assert.match(syncBody, /map\.setView\(center, zoom, \{ animate: false \}\)/);
  assert.doesNotMatch(syncBody, /const key =/);
});

test("mode switching preserves map view and does not remount map layers", () => {
  const component = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const leafletComponent = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");

  assert.match(component, /commitGeographicMapSettings\(\{ editMode: "pan_modern_map", globalHistoricalOpacity: 1 \}, false\)/);
  assert.match(component, /commitGeographicMapSettings\(\{ editMode: "edit_historical_sheets", globalHistoricalOpacity: 1 \}, false\)/);
  assert.doesNotMatch(component, /key=\{geoEditMode\}/);
  assert.doesNotMatch(component, /key=\{mapInteractionStatus\}/);
  assert.match(leafletComponent, /key=\{`\$\{basemap\.key\}-\$\{tileRetry\}`\}/);
});

test("move and zoom persist only after final gesture events", () => {
  const component = readFileSync("components/HistoricalMapStudio.tsx", "utf8");
  const leafletComponent = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");

  assert.match(component, /const scheduleMapViewPersistence = useCallback/);
  assert.match(component, /window\.setTimeout\(\(\) => \{/);
  assert.match(component, /saveMapViewOnly\(center, zoom\)/);
  assert.match(component, /}, 800\)/);
  assert.match(leafletComponent, /dragend\(\) \{/);
  assert.match(leafletComponent, /zoomend\(\) \{/);
  assert.doesNotMatch(leafletComponent, /move\(\) \{[\s\S]*onMapViewChange/);
  assert.doesNotMatch(leafletComponent, /zoom\(\) \{[\s\S]*onMapViewChange/);
});

test("stale geocode and fit-bounds requests do not reapply after user pan or zoom", () => {
  const component = readFileSync("components/HistoricalMapStudio.tsx", "utf8");

  assert.match(component, /clearActiveExternalViewRequest\(\)/);
  assert.match(component, /setRequestedGeocodeCenter\(null\)/);
  assert.match(component, /setFitBoundsActive\(false\)/);
  assert.match(component, /fitBoundsEnabled=\{mapInteractionStatus !== "panning" && mapInteractionStatus !== "zooming"/);
});

test("overlay follows pan and zoom with exact recalculation on final events", () => {
  const component = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");

  assert.match(component, /map\.on\("moveend zoomend viewreset resize", scheduleUpdateFromMap\)/);
  assert.match(component, /map\.off\("moveend zoomend viewreset resize", scheduleUpdateFromMap\)/);
  assert.match(component, /window\.cancelAnimationFrame\(animationFrame\)/);
  assert.match(component, /map\.fire\("moveend"\)/);
});

test("rectangular geographic overlay fallback uses native Leaflet ImageOverlay", () => {
  const component = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");

  assert.match(component, /overlayRenderMode\?: "projective" \| "rectangular"/);
  assert.match(component, /overlayRenderMode === "rectangular"/);
  assert.match(component, /<ImageOverlay bounds=\{boundsToLeaflet\(bounds\)\}/);
  assert.match(studioComponent, /Rectangular overlay/);
  assert.match(studioComponent, /overlayRenderMode=\{overlayRenderMode\}/);
});

test("plain map test renders a fixed Texarkana OpenStreetMap TileLayer without studio overlays", () => {
  const leafletComponent = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");

  assert.match(leafletComponent, /export function PlainLeafletMapTest/);
  assert.match(leafletComponent, /const center: LatLngTuple = \[33\.425, -94\.047\]/);
  assert.match(leafletComponent, /zoom=\{14\}/);
  assert.match(leafletComponent, /key=\{`plain-\$\{basemap\.key\}-\$\{tileRetry\}`\}/);
  assert.match(studioComponent, /plainMapTestMode \? \(/);
  assert.match(studioComponent, /<PlainLeafletMapTest/);
});

test("unplaced map placement uses a plain TileLayer path until piece or reference overlays are active", () => {
  const leafletComponent = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");

  assert.match(studioComponent, /const hasPlacedHistoricalSheets = historicalSheetLayers\.some/);
  assert.match(studioComponent, /const mapSheetLayers = showReferenceSheetAlignment && hasPlacedHistoricalSheets/);
  assert.match(studioComponent, /const mapPieceLayers = useMemo/);
  assert.match(studioComponent, /plainTileOnly=\{mapPieceLayers\.length === 0 && !\(showReferenceSheetAlignment && hasPlacedHistoricalSheets\)\}/);
  assert.match(studioComponent, /pieceLayers=\{mapPieceLayers\}/);
  assert.match(studioComponent, /sheetLayers=\{mapSheetLayers\}/);
  assert.match(leafletComponent, /const sheetLayers = props\.plainTileOnly \? \[\] : props\.sheetLayers \?\? \[\]/);
  assert.match(leafletComponent, /const pieceLayers = props\.plainTileOnly \? \[\] : props\.pieceLayers \?\? \[\]/);
  assert.match(leafletComponent, /props\.plainTileOnly \? null : <ConfigureLeafletPanes/);
  assert.match(leafletComponent, /<FitBounds bounds=\{derivedBounds\}/);
});

test("minimal Map placement workflow cannot hide the modern tile layer", () => {
  assert.equal(getModernTileLayerOpacity(), 1);
});

test("CSP permits OSM, fallback tiles, data/blob images, and Supabase signed images", () => {
  const config = readFileSync("next.config.mjs", "utf8");

  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /https:\/\/\*\.tile\.openstreetmap\.org/);
  assert.match(config, /https:\/\/tile\.openstreetmap\.org/);
  assert.match(config, /https:\/\/server\.arcgisonline\.com/);
  assert.match(config, /https:\/\/\*\.supabase\.co/);
  assert.match(config, /data:/);
  assert.match(config, /blob:/);
  assert.doesNotMatch(config, /img-src[^;]*\s\*/);
  assert.equal(contentSecurityPolicyImageSources.includes("https://*.tile.openstreetmap.org"), true);
  assert.equal(isConfiguredImageSourceAllowed("https://a.tile.openstreetmap.org/15/7823/13185.png"), true);
  assert.equal(isConfiguredImageSourceAllowed("https://tile.openstreetmap.org/15/7823/13185.png"), true);
  assert.equal(isConfiguredImageSourceAllowed("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/15/13185/7823"), true);
  assert.equal(isConfiguredImageSourceAllowed("https://example.supabase.co/storage/v1/object/sign/sanborn-sheets/file.png"), true);
  assert.equal(isConfiguredImageSourceAllowed("https://untrusted.example.test/tile.png"), false);
});

test("Leaflet panes keep visible tiles below transparent Sanborn overlays", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.equal(leafletPaneStack.tilePane < leafletPaneStack.historicalSheetPane, true);
  assert.match(css, /\.minimal-sanborn-gps \.leaflet-tile-pane/);
  assert.match(css, /z-index: 200/);
  assert.match(css, /opacity: 1 !important/);
  assert.match(css, /\.minimal-sanborn-gps \.leaflet-historical-sheet-pane/);
  assert.match(css, /z-index: 450/);
  assert.match(css, /\.minimal-sanborn-gps \.leaflet-control-attribution/);
  assert.match(css, /\.minimal-sanborn-gps \.map-studio-sheet-overlay,\s*\.minimal-sanborn-gps \.map-studio-sheet-overlay__image\s*\{\s*background: transparent;/);
});

test("minimal map shell no longer uses the blue fallback as an opaque obstruction", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(css, /background: #d9e7ef/);
  assert.match(css, /\.minimal-sanborn-gps__map \.map-studio-leaflet-map\s*\{[^}]*height: 100%;[^}]*background: #ece7dc;/s);
});

test("emergency tile paint diagnostics are visible and compact", () => {
  const css = readFileSync("app/globals.css", "utf8");

  assert.match(css, /\.map-studio-runtime-debug,/);
  assert.match(css, /\.map-studio-plain-tile-counts/);
  assert.match(css, /z-index: 790/);
  assert.match(css, /max-height: 260px/);
});
