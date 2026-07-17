import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildDefaultSanbornAtlasId,
  calculateSourceBoundingBox,
  getUnassignedSanbornUploads,
  isSanbornMapPieceType,
  isSanbornPageType,
  normalizedToPixelPoint,
  pixelToNormalizedPoint,
  reorderAtlasPages,
  reorderMapPieces,
  sanbornMapPieceTypes,
  sanbornPageTypes,
  validateMapPieceSaveTownScope,
  validateNormalizedPolygon,
  type SanbornMapPieceRecord,
} from "./sanborn-atlas.ts";

test("sanborn atlas page and piece type allowlists match the manual inventory workflow", () => {
  assert.deepEqual(sanbornPageTypes, [
    "title",
    "legend",
    "graphic_index",
    "street_index",
    "specials_index",
    "numbered_sheet",
    "supplement",
    "unknown",
  ]);
  assert.deepEqual(sanbornMapPieceTypes, [
    "regular_block",
    "block_fragment",
    "detached_inset",
    "industrial_special",
    "railroad_special",
    "waterfront_special",
    "institutional_special",
    "unclassified_region",
  ]);
  assert.equal(isSanbornPageType("numbered_sheet"), true);
  assert.equal(isSanbornPageType("ocr_detected_sheet"), false);
  assert.equal(isSanbornMapPieceType("detached_inset"), true);
  assert.equal(isSanbornMapPieceType("auto_building_symbol"), false);
});

test("validates normalized polygon coordinates without accepting source-image crops", () => {
  const valid = validateNormalizedPolygon([
    { x: 0.1124, y: 0.2081 },
    { x: 0.441, y: 0.2013 },
    { x: 0.4578, y: 0.4892 },
    { x: 0.1052, y: 0.5017 },
  ]);

  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.deepEqual(valid.bbox, { minX: 0.1052, minY: 0.2013, maxX: 0.4578, maxY: 0.5017 });
  }

  assert.equal(validateNormalizedPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }]).ok, false);
  assert.equal(validateNormalizedPolygon([{ x: -0.01, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }]).ok, false);

  const migration = readFileSync("../../supabase/migrations/0010_sanborn_atlas_page_piece_inventory.sql", "utf8");
  assert.match(migration, /source_polygon jsonb not null/);
  assert.match(migration, /jsonb_array_length\(source_polygon\) >= 3/);
  assert.doesNotMatch(migration, /crop|cropped|derivative_storage|storage_path/i);
});

test("converts between pixel and normalized image coordinates", () => {
  assert.deepEqual(pixelToNormalizedPoint({ x: 250, y: 125, width: 1000, height: 500 }), { x: 0.25, y: 0.25 });
  assert.deepEqual(pixelToNormalizedPoint({ x: -50, y: 700, width: 1000, height: 500 }), { x: 0, y: 1 });
  assert.deepEqual(normalizedToPixelPoint({ x: 0.25, y: 0.75 }, 1200, 800), { x: 300, y: 600 });
});

test("calculates source polygon bounding boxes", () => {
  assert.deepEqual(
    calculateSourceBoundingBox([
      { x: 0.4, y: 0.2 },
      { x: 0.8, y: 0.25 },
      { x: 0.7, y: 0.9 },
      { x: 0.3, y: 0.7 },
    ]),
    { minX: 0.3, minY: 0.2, maxX: 0.8, maxY: 0.9 },
  );
});

test("orders atlas pages and map pieces with stable one-based sequences", () => {
  assert.deepEqual(
    reorderAtlasPages([
      { pageId: "page-c", pageSequence: 30 },
      { pageId: "page-a", pageSequence: 10 },
      { pageId: "page-b", pageSequence: 20 },
    ]).map((page) => [page.pageId, page.pageSequence]),
    [
      ["page-a", 1],
      ["page-b", 2],
      ["page-c", 3],
    ],
  );

  assert.deepEqual(
    reorderMapPieces([
      { pieceId: "piece-b", pieceSequence: 2 },
      { pieceId: "piece-a", pieceSequence: 1 },
    ]).map((piece) => [piece.pieceId, piece.pieceSequence]),
    [
      ["piece-a", 1],
      ["piece-b", 2],
    ],
  );
});

test("keeps legacy uploaded Sanborn sheets visible as unassigned uploads", () => {
  const assets = [{ assetId: "asset-1" }, { assetId: "asset-2" }, { assetId: "asset-3" }];
  const pages = [{ sanbornSheetAssetId: "asset-2" }];

  assert.deepEqual(getUnassignedSanbornUploads(assets, pages).map((asset) => asset.assetId), ["asset-1", "asset-3"]);
});

test("rejects map-piece saves for atlas pages outside the active town package", () => {
  assert.equal(validateMapPieceSaveTownScope({ pageTownPackageId: "town-1", activeTownPackageId: "town-1" }).ok, true);
  const rejected = validateMapPieceSaveTownScope({ pageTownPackageId: "town-2", activeTownPackageId: "town-1" });

  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.match(rejected.error, /active town package/);
  }

  const route = readFileSync("app/api/community/historical-map-studio/map-pieces/route.ts", "utf8");
  assert.match(route, /validateMapPieceSaveTownScope/);
});

test("round trips manual piece inventory data through JSON serialization", () => {
  const polygon = [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.12 },
    { x: 0.62, y: 0.5 },
    { x: 0.2, y: 0.7 },
  ];
  const piece: SanbornMapPieceRecord = {
    rowId: "row-1",
    pieceId: "piece-1",
    atlasPageRowId: "page-row-1",
    atlasPageId: "page-1",
    parentPieceId: null,
    pieceSequence: 1,
    pieceType: "detached_inset",
    blockNumberText: "12",
    titleText: "Inset A",
    sourcePolygon: polygon,
    sourceBBox: calculateSourceBoundingBox(polygon),
    creationMethod: "human",
    inventoryStatus: "draft",
    reviewStatus: "unknown",
    evidenceClassification: "unknown",
    notes: "Manual outline.",
    updatedAt: null,
    isPersisted: true,
  };
  const reloaded = JSON.parse(JSON.stringify(piece)) as SanbornMapPieceRecord;
  const validation = validateNormalizedPolygon(reloaded.sourcePolygon);

  assert.equal(validation.ok, true);
  assert.deepEqual(reloaded.sourceBBox, { minX: 0.1, minY: 0.1, maxX: 0.62, maxY: 0.7 });
  assert.equal(reloaded.creationMethod, "human");
  assert.equal(reloaded.evidenceClassification, "unknown");
});

test("preserves the existing full-sheet georeference tables and projective overlay path", () => {
  const migration = readFileSync("../../supabase/migrations/0010_sanborn_atlas_page_piece_inventory.sql", "utf8");
  const dataLoader = readFileSync("lib/historical-map-studio-data.ts", "utf8");
  const sheetRoute = readFileSync("app/api/community/historical-map-studio/sheet-georeferences/route.ts", "utf8");
  const leaflet = readFileSync("components/HistoricalMapLeaflet.tsx", "utf8");

  assert.doesNotMatch(migration, /drop table.*historical_map_sheet_georeferences/i);
  assert.doesNotMatch(migration, /alter table public\.historical_map_sheet_georeferences/i);
  assert.match(dataLoader, /from\("historical_map_sheet_georeferences"\)/);
  assert.match(sheetRoute, /historical_map_sheet_georeferences/);
  assert.match(leaflet, /getProjectiveTransform/);
  assert.match(leaflet, /overlayRenderMode === "rectangular"/);
});

test("builds stable atlas IDs without hard-coding Texarkana", () => {
  assert.equal(
    buildDefaultSanbornAtlasId({ townPackageId: "sample-town_1901", editionYear: 1901, volumeLabel: "Vol. 2" }),
    "sample-town-1901-1901-vol-2-sanborn-atlas",
  );
});
