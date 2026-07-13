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

test("configures OpenStreetMap and a no-secret fallback street basemap", () => {
  const osm = getBasemap(defaultBasemapKey);
  const fallback = getBasemap("esri_world_street");

  assert.equal(osm.url, "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
  assert.match(osm.attribution, /OpenStreetMap/);
  assert.match(fallback.url, /server\.arcgisonline\.com/);
  assert.match(fallback.attribution, /Esri/);
  assert.deepEqual(configuredBasemaps.map((basemap) => basemap.key), ["osm", "esri_world_street"]);
});

test("minimal GPS workflow renders upload controls inside the early-return interface", () => {
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
  assert.match(component, /Reset all sheet placements to current town location/);
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
  assert.match(studioComponent, /Rectangular geographic overlay/);
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

test("no placed sheets use a plain TileLayer path instead of custom Sanborn overlays", () => {
  const leafletComponent = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");
  const studioComponent = readFileSync("components/HistoricalMapStudio.tsx", "utf8");

  assert.match(studioComponent, /const hasPlacedHistoricalSheets = historicalSheetLayers\.some/);
  assert.match(studioComponent, /const mapSheetLayers = hasPlacedHistoricalSheets \? historicalSheetLayers : \[\]/);
  assert.match(studioComponent, /plainTileOnly=\{!hasPlacedHistoricalSheets\}/);
  assert.match(studioComponent, /sheetLayers=\{mapSheetLayers\}/);
  assert.match(leafletComponent, /const sheetLayers = props\.plainTileOnly \? \[\] : props\.sheetLayers \?\? \[\]/);
  assert.match(leafletComponent, /props\.plainTileOnly \? null : <ConfigureLeafletPanes/);
  assert.match(leafletComponent, /<FitBounds bounds=\{derivedBounds\}/);
});

test("minimal GPS workflow cannot hide the modern tile layer", () => {
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
