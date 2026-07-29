import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const workspace = readFileSync(resolve(process.cwd(), "components/BirdsEyePerspectiveWorkspace.tsx"), "utf8");
const sourceMap = readFileSync(resolve(process.cwd(), "components/BirdsEyeSourceMap.tsx"), "utf8");
const studio = readFileSync(resolve(process.cwd(), "components/HistoricalMapStudio.tsx"), "utf8");
const loader = readFileSync(resolve(process.cwd(), "lib/historical-map-studio-data.ts"), "utf8");
const atlasLoader = readFileSync(resolve(process.cwd(), "lib/sanborn-atlas-data.ts"), "utf8");
const bootstrapRoute = readFileSync(resolve(process.cwd(), "app/api/community/historical-map-studio/bootstrap/route.ts"), "utf8");
const sceneRoute = readFileSync(resolve(process.cwd(), "app/api/community/historical-map-studio/birds-eye-scene-regions/route.ts"), "utf8");
const presentationRoute = readFileSync(resolve(process.cwd(), "app/api/community/historical-map-studio/birds-eye-piece-presentations/route.ts"), "utf8");

test("Step 7 has three distinct workspaces and narrow-screen tabs", () => {
  assert.match(workspace, /Historical Illustration/);
  assert.match(workspace, /Flat Geographic Map/);
  assert.match(workspace, /Warped Geographic Preview/);
  for (const tab of ["Illustration", "Flat Map", "Warped Preview", "Scene Markup"]) {
    assert.match(workspace, new RegExp(`label: "${tab}"`));
  }
  assert.match(workspace, /birds-eye-pane--illustration/);
  assert.match(workspace, /birds-eye-pane--map/);
  assert.match(workspace, /birds-eye-pane--preview/);
});

test("the authoritative source map is real Leaflet and remains separate from the warp renderer", () => {
  assert.match(sourceMap, /MapContainer/);
  assert.match(sourceMap, /TileLayer/);
  assert.match(sourceMap, /Polygon/);
  assert.match(sourceMap, /Polyline/);
  assert.match(sourceMap, /Town center/);
  assert.doesNotMatch(sourceMap, /solveBirdsEye|warpBirdsEye|globalMatrix|adjustedImageGeometry/);
  assert.match(workspace, /Separate warped geographic preview renderer/);
  assert.match(workspace, /<BirdsEyeSourceMap/);
  assert.match(sourceMap, /\}, \[fitRequest, map\]\);/);
  assert.doesNotMatch(sourceMap, /\[center, fitRequest, map, pieces, points/);
  assert.doesNotMatch(studio, /placement\.isVisible && \(placement\.placementStatus/);
});

test("map and illustration clicks preserve their own coordinate contracts", () => {
  assert.match(sourceMap, /onMapClick\(event\.latlng\.lat, event\.latlng\.lng, map\.getZoom\(\)\)/);
  assert.match(workspace, /patchPoint\(selectedPoint\.sequence, \{\s*latitude,\s*longitude,/);
  assert.match(workspace, /denormalizeBirdsEyeImagePoint\(normalized, width, height\)/);
  assert.match(workspace, /imageX: originalImagePoint\.x, imageY: originalImagePoint\.y/);
  assert.match(sourceMap, /draggable=\{!props\.readOnly\}/);
});

test("guided calibration exposes all stages, quality diagnostics, and point controls", () => {
  for (const phrase of [
    "Add control point",
    "Illustration:",
    "Geographic map:",
    "Either pane may be first",
    "Worst residual",
    "Enabled in solve",
    "Previous",
    "Next",
    "Focus illustration",
    "Focus map",
    "Delete",
  ]) {
    assert.match(workspace, new RegExp(phrase));
  }
  assert.match(workspace, /solve\.residuals/);
  assert.match(workspace, /solve\.localWarp\.triangles/);
});

test("preview comparison and projected content never wait for six points", () => {
  assert.match(workspace, /side_by_side/);
  assert.match(workspace, /overlay/);
  assert.match(workspace, /difference/);
  assert.match(workspace, /comparisonOpacity/);
  assert.match(workspace, /Blink comparison/);
  assert.match(workspace, /flat geographic preview is available before calibration/i);
  assert.match(workspace, /previewPieces\.map/);
  assert.match(workspace, /birds-eye-preview__placed-bounds/);
});

test("scene markup has explicit modes, normalized drawing, crop, linkage, filters, and accessible actions", () => {
  for (const mode of [
    "Select",
    "Pan",
    "Add calibration point",
    "Draw scene region",
    "Edit scene region",
    "Link Map Piece",
    "Adjust projected piece",
  ]) {
    assert.match(workspace, new RegExp(`label: "${mode}"`));
  }
  for (const action of ["Finish", "Cancel", "Save region", "Archive", "Delete draft"]) {
    assert.match(workspace, new RegExp(action));
  }
  assert.match(workspace, /coordinateSpace: "normalized_image"/);
  assert.match(workspace, /Derived crop preview/);
  assert.match(workspace, /Primary Map Piece/);
  assert.match(workspace, /Primary source record/);
  assert.match(workspace, /Building record/);
  assert.match(workspace, /regionReviewFilter/);
  assert.match(workspace, /regionConfidenceFilter/);
});

test("presentation adjustments and evidence exports are downstream-only", () => {
  for (const action of ["Move left", "Move right", "Scale \\+", "Rotate left", "Edit vertices on image", "Reset to projected", "Reproject from Map Placement"]) {
    assert.match(workspace, new RegExp(action));
  }
  assert.match(workspace, /Map Placement was not modified/);
  assert.match(workspace, /Geographic source geometry remains unchanged/);
  assert.match(workspace, /Copy evidence package/);
  assert.match(workspace, /without a signed image URL/);
  assert.doesNotMatch(sceneRoute + presentationRoute, /map-piece-georeferences|historical_map_piece_georeferences|latitude\s*:|longitude\s*:/i);
});

test("Step 7 keeps separate save, loading, read-only, and unsaved-change states", () => {
  assert.match(workspace, /Calibration: \{saveLabel\(calibrationSaveState\)\}/);
  assert.match(workspace, /Region: \{saveLabel\(regionSaveState\)\}/);
  assert.match(workspace, /Presentation: \{saveLabel\(presentationSaveState\)\}/);
  assert.match(workspace, /Loading saved calibration, control points, scene regions, and presentation geometry/);
  assert.match(workspace, /This archived or unavailable edition is read-only/);
  assert.match(workspace, /beforeunload/);
  assert.match(studio, /Leave Birds-Eye Perspective and discard unsaved/);
  assert.match(studio, /Change edition and discard unsaved Birds-Eye edits/);
  assert.match(studio, /Boolean\(activeAtlas\?\.archivedAt\)/);
  assert.match(studio, /View read-only/);
  assert.match(atlasLoader, /requestedArchivedAtlas/);
  assert.match(loader, /loadedAtlasRecords/);
});

test("bootstrap hydration is no-store, exact-scope, and leaves the upload manager mounted", () => {
  assert.match(bootstrapRoute, /loadHistoricalMapStudioDataUncached/);
  assert.match(bootstrapRoute, /Cache-Control", "no-store, max-age=0"/);
  assert.match(loader, /historical_map_birds_eye_scene_regions/);
  assert.match(loader, /historical_map_birds_eye_piece_presentations/);
  assert.match(loader, /\.eq\("atlas_id", activeAtlasForYear\.atlasId\)/);
  assert.match(loader, /\.eq\("reference_asset_id", designatedAsset\.asset_id\)/);
  assert.match(studio, /useHistoricalImageUploadManager/);
  assert.match(studio, /setBirdsEye\(state\.birdsEye\)/);
  assert.doesNotMatch(studio, /setHistoricalUploads|clearHistoricalUploads/);
});

test("scene and presentation routes are server-scoped and reject recovered cross-town IDs", () => {
  for (const route of [sceneRoute, presentationRoute]) {
    assert.match(route, /requireMapStudioWriteAccess/);
    assert.match(route, /town\.data\.id !== townPackageId && town\.data\.package_id !== townPackageId/);
    assert.match(route, /\.eq\("town_package_id", scope\.town\.id\)/);
    assert.match(route, /\.eq\("atlas_id", scope\.atlasId\)/);
    assert.match(route, /\.eq\("reference_asset_id", scope\.referenceAssetId\)/);
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/);
  }
  assert.match(presentationRoute, /birds-eye-presentation-\$\{atlasId\}-\$\{referenceAssetId\}-\$\{mapPieceId\}/);
});
