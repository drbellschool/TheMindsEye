import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildDefaultSanbornAtlasId,
  calculateNormalizedPolygonArea,
  calculateSourceBoundingBox,
  countDistinctNormalizedPolygonVertices,
  getPageTypeToolBlockMessage,
  getSanbornPageTypeLabel,
  getUnassignedSanbornUploads,
  isSanbornMapPieceType,
  isSanbornPageType,
  normalizeSanbornPageType,
  normalizedToPixelPoint,
  pageTypeSupportsMapPieces,
  pageTypeSupportsMapPlacement,
  pageTypeSupportsTownIndexRegions,
  pixelToNormalizedPoint,
  reorderAtlasPages,
  reorderMapPieces,
  sanbornMapPieceTypes,
  sanbornPageTypes,
  validateMapPieceSaveTownScope,
  validateNormalizedPolygon,
  type SanbornMapPieceRecord,
} from "./sanborn-atlas.ts";

const migrationPath = "../../supabase/migrations/0010_sanborn_atlas_page_piece_inventory.sql";
const pageClassificationMigrationPath = "../../supabase/migrations/0015_page_classification_workflow.sql";
const functionalSourceRegionsMigrationPath = "../../supabase/migrations/0016_functional_source_regions.sql";
const atlasRoutePath = "app/api/community/historical-map-studio/atlases/route.ts";
const pageRoutePath = "app/api/community/historical-map-studio/atlas-pages/route.ts";
const pieceRoutePath = "app/api/community/historical-map-studio/map-pieces/route.ts";
const piecePlacementRoutePath = "app/api/community/historical-map-studio/map-piece-georeferences/route.ts";

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

function readPageClassificationMigration(): string {
  return readFileSync(pageClassificationMigrationPath, "utf8");
}

function readFunctionalSourceRegionsMigration(): string {
  return readFileSync(functionalSourceRegionsMigrationPath, "utf8");
}

function readRoute(path: string): string {
  return readFileSync(path, "utf8");
}

function readSqlFunction(sql: string, functionName: string): string {
  const start = sql.indexOf(`create or replace function public.${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist in the migration.`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${functionName} should close with $$;`);
  return sql.slice(start, end + 4);
}

function assertSqlIncludes(sql: string, statement: string): void {
  const compactSql = sql.replace(/\s+/g, " ").toLowerCase();
  const compactStatement = statement.replace(/\s+/g, " ").toLowerCase();
  assert.ok(compactSql.includes(compactStatement), `Missing SQL statement: ${statement}`);
}

test("sanborn atlas page and piece type allowlists match the manual inventory workflow", () => {
  assert.deepEqual(sanbornPageTypes, [
    "cover",
    "index_or_mixed",
    "sanborn_sheet",
    "street_index",
    "special_sheet",
    "legend",
    "advertisement",
    "other",
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
  assert.equal(isSanbornPageType("sanborn_sheet"), true);
  assert.equal(isSanbornPageType("numbered_sheet"), false);
  assert.equal(normalizeSanbornPageType("numbered_sheet"), "sanborn_sheet");
  assert.equal(normalizeSanbornPageType("graphic_index"), "index_or_mixed");
  assert.equal(normalizeSanbornPageType("specials_index"), "special_sheet");
  assert.equal(normalizeSanbornPageType("inset"), "special_sheet");
  assert.equal(normalizeSanbornPageType("title"), "cover");
  assert.equal(normalizeSanbornPageType("supplement"), "other");
  assert.equal(isSanbornPageType("ocr_detected_sheet"), false);
  assert.equal(isSanbornMapPieceType("detached_inset"), true);
  assert.equal(isSanbornMapPieceType("auto_building_symbol"), false);
});

test("page classification controls Town Index, Map Pieces, and Map Placement availability", () => {
  assert.equal(pageTypeSupportsTownIndexRegions("index_or_mixed"), true);
  assert.equal(pageTypeSupportsTownIndexRegions("graphic_index"), true);
  assert.equal(pageTypeSupportsTownIndexRegions("sanborn_sheet"), false);
  assert.equal(pageTypeSupportsMapPieces("sanborn_sheet"), true);
  assert.equal(pageTypeSupportsMapPieces("inset"), true);
  assert.equal(pageTypeSupportsMapPieces("special_sheet"), true);
  assert.equal(pageTypeSupportsMapPieces("cover"), false);
  assert.equal(pageTypeSupportsMapPieces("index_or_mixed"), false);
  assert.equal(pageTypeSupportsMapPlacement("sanborn_sheet"), true);
  assert.equal(pageTypeSupportsMapPlacement("street_index"), false);
  assert.equal(getSanbornPageTypeLabel("graphic_index"), "Index or mixed page");
  assert.match(getPageTypeToolBlockMessage("cover"), /Cover pages do not use Map Pieces/);
  assert.match(getPageTypeToolBlockMessage("index_or_mixed"), /functional geographic map-content region/);
  assert.match(getPageTypeToolBlockMessage("unknown"), /Classify this page in Source Record/);
});

test("every canonical page type is accepted by client, API normalization, and database repair migration", () => {
  const route = readRoute(pageRoutePath);
  const migration = readFunctionalSourceRegionsMigration();

  for (const pageType of sanbornPageTypes) {
    assert.equal(isSanbornPageType(pageType), true);
    assert.equal(normalizeSanbornPageType(pageType), pageType);
    assert.match(migration, new RegExp(`'${pageType}'`));
  }

  assert.match(route, /normalizeSanbornPageType\(page\.pageType\)/);
  assert.match(route, /legacySanbornPageTypeAliases/);
  assert.match(migration, /save_sanborn_atlas_pages/);
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
    assert.equal(countDistinctNormalizedPolygonVertices(valid.polygon), 4);
    assert.ok(calculateNormalizedPolygonArea(valid.polygon) > 0);
  }

  assert.equal(validateNormalizedPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }]).ok, false);
  assert.equal(validateNormalizedPolygon([{ x: -0.01, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }]).ok, false);
  assert.equal(validateNormalizedPolygon([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }]).ok, false);
  assert.equal(validateNormalizedPolygon([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }]).ok, false);

  const migration = readMigration();
  assert.match(migration, /source_polygon jsonb not null/);
  assert.match(migration, /sanborn_source_polygon_is_valid\(source_polygon\)/);
  assert.match(migration, /array_length\(distinct_keys, 1\)/);
  assert.match(migration, /abs\(area_sum\) > 0\.000000000001/);
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

  const migration = readMigration();
  const savePieces = readSqlFunction(migration, "save_sanborn_map_pieces");
  assert.match(savePieces, /Atlas page belongs to another town package/);
});

test("atlas saves reject cross-town atlas IDs and avoid global-ID upserts", () => {
  const route = readRoute(atlasRoutePath);

  assert.match(route, /Atlas ID belongs to another town package/);
  assert.match(route, /\.update\(record\)/);
  assert.match(route, /\.eq\("id", existingAtlas\.id\)/);
  assert.match(route, /\.insert\(\{/);
  assert.doesNotMatch(route, /\.upsert\(/);
});

test("page saves resolve existing page IDs under the selected atlas before writing", () => {
  const route = readRoute(pageRoutePath);
  const migration = readMigration();
  const savePages = readSqlFunction(migration, "save_sanborn_atlas_pages");

  assert.match(route, /\.rpc\("save_sanborn_atlas_pages"/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /page_sequence:\s*100_000/);
  assert.match(savePages, /Atlas ID belongs to another town package/);
  assert.match(savePages, /Page ID belongs to another Sanborn atlas/);
  assert.match(savePages, /where page\.id = payload\.existing_page_row_id/);
  assert.match(savePages, /where payload\.existing_page_row_id is null/);
  assert.match(savePages, /Existing atlas page IDs cannot be reassigned to a different Sanborn sheet asset/);
});

test("migration 0016 repairs page classification values and preserves service-role-only page saves", () => {
  const migration = readFunctionalSourceRegionsMigration();
  const savePages = readSqlFunction(migration, "save_sanborn_atlas_pages");

  assert.match(migration, /0016_functional_source_regions|sanborn_atlas_pages/i);
  assert.match(migration, /when 'title' then 'cover'/);
  assert.match(migration, /when 'numbered_sheet' then 'sanborn_sheet'/);
  assert.match(migration, /when 'graphic_index' then 'index_or_mixed'/);
  assert.match(migration, /when 'specials_index' then 'special_sheet'/);
  assert.match(migration, /when 'inset' then 'special_sheet'/);
  assert.match(migration, /when 'supplement' then 'other'/);
  assert.match(migration, /sanborn_atlas_pages_page_type_allowed/);
  assert.match(migration, /'cover'/);
  assert.match(migration, /'index_or_mixed'/);
  assert.match(migration, /'sanborn_sheet'/);
  assert.match(migration, /'special_sheet'/);
  assert.match(migration, /'advertisement'/);
  assert.match(migration, /sanborn_atlas_pages_primary_index_requires_index_or_mixed/);
  assert.match(savePages, /Only Index or mixed pages can be the primary Town Index/);
  assert.match(savePages, /Only one primary Town Index page is allowed per Sanborn atlas/);
  assert.match(savePages, /Printed reference must be 80 characters or fewer/);
  assert.match(savePages, /Classification notes must be 1000 characters or fewer/);
  assert.match(savePages, /page_type <> 'index_or_mixed'/);
  assert.match(savePages, /is_primary_town_index = false/);
  assert.doesNotMatch(savePages, /count\(\*\) from _sanborn_page_payload where page_type = 'index_or_mixed'[\s\S]*set is_primary_town_index = true/);
  assert.match(savePages, /where page_row\.id = payload\.existing_page_row_id/);
  assert.doesNotMatch(savePages, /security definer/i);
  assert.match(savePages, /security invoker/i);
  assert.match(migration, /revoke execute on function public\.save_sanborn_atlas_pages\(uuid, text, jsonb\) from PUBLIC/);
  assert.match(migration, /grant execute on function public\.save_sanborn_atlas_pages\(uuid, text, jsonb\) to service_role/);
});

test("page classification API persists classification fields and blocks invalid primary indexes", () => {
  const route = readRoute(pageRoutePath);

  assert.match(route, /printedReference/);
  assert.match(route, /isPrimaryTownIndex/);
  assert.match(route, /classificationNotes/);
  assert.match(route, /normalizeLimitedText/);
  assert.match(route, /normalizeLimitedText\(page\.printedReference, 80, "Printed reference"\)/);
  assert.match(route, /\$\{fieldName\} must be \$\{maxLength\} characters or fewer/);
  assert.match(route, /contains unsupported control characters/);
  assert.match(route, /Only Index or mixed pages can be the primary Town Index/);
  assert.match(route, /Only one primary Town Index page is allowed per Sanborn atlas/);
  assert.match(route, /legacySanbornPageTypeAliases/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});

test("map-piece and placement APIs reject non-geographic page classifications before persistence", () => {
  const pieceRoute = readRoute(pieceRoutePath);
  const placementRoute = readRoute(piecePlacementRoutePath);

  assert.match(pieceRoute, /pageTypeSupportsMapPieces/);
  assert.match(pieceRoute, /sanborn_source_regions/);
  assert.match(pieceRoute, /getPageTypeToolBlockMessage/);
  assert.match(pieceRoute, /Classify this page as a Sanborn Sheet or mark a geographic source region before saving map pieces/);
  assert.match(placementRoute, /pageTypeSupportsMapPlacement/);
  assert.match(placementRoute, /sanborn_source_regions/);
  assert.match(placementRoute, /getPageTypeToolBlockMessage/);
  assert.match(placementRoute, /Classify this page as a Sanborn Sheet or mark a geographic source region before saving placement/);
});

test("piece saves reject cross-page piece IDs and update by scoped row ID", () => {
  const route = readRoute(pieceRoutePath);
  const migration = readMigration();
  const savePieces = readSqlFunction(migration, "save_sanborn_map_pieces");

  assert.match(route, /\.rpc\("save_sanborn_map_pieces"/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /piece_sequence:\s*100_000/);
  assert.match(savePieces, /Piece ID belongs to another atlas page/);
  assert.match(savePieces, /final_piece_row_id = piece\.id/);
  assert.match(savePieces, /where piece\.id = payload\.final_piece_row_id/);
  assert.match(savePieces, /where payload\.existing_piece_row_id is null/);
  assert.match(savePieces, /join public\.sanborn_map_pieces piece on piece\.id = payload\.existing_piece_row_id/);
});

test("ordinary atlas, page, and piece saves preserve review and evidence metadata", () => {
  const routes = [atlasRoutePath, pageRoutePath, pieceRoutePath].map(readRoute).join("\n");
  const migration = readMigration();
  const savePages = readSqlFunction(migration, "save_sanborn_atlas_pages");
  const savePieces = readSqlFunction(migration, "save_sanborn_map_pieces");

  assert.doesNotMatch(routes, /review_status|evidence_classification/);
  assert.doesNotMatch(savePages, /review_status|evidence_classification/);
  assert.doesNotMatch(savePieces, /review_status|evidence_classification/);
  assert.match(migration, /review_status review_status_enum not null default 'unknown'/);
  assert.match(migration, /evidence_classification review_status_enum not null default 'unknown'/);
});

test("migration restricts atlas page piece tables to service-role access", () => {
  const migration = readMigration();
  const tables = ["sanborn_atlases", "sanborn_atlas_pages", "sanborn_map_pieces"];

  for (const table of tables) {
    assertSqlIncludes(migration, `alter table public.${table} enable row level security;`);
    assertSqlIncludes(migration, `revoke all on table public.${table} from PUBLIC;`);
    assertSqlIncludes(migration, `revoke all on table public.${table} from anon;`);
    assertSqlIncludes(migration, `revoke all on table public.${table} from authenticated;`);
    assertSqlIncludes(migration, `grant select, insert, update, delete on table public.${table} to service_role;`);
  }

  assert.doesNotMatch(migration, /create\s+policy/i);
});

test("migration restricts atlas page piece functions to service-role execution", () => {
  const migration = readMigration();
  const functions = [
    "sanborn_source_polygon_is_valid(jsonb)",
    "save_sanborn_atlas_pages(uuid, text, jsonb)",
    "save_sanborn_map_pieces(uuid, text, jsonb)",
  ];

  for (const signature of functions) {
    assertSqlIncludes(migration, `revoke execute on function public.${signature} from PUBLIC;`);
    assertSqlIncludes(migration, `revoke execute on function public.${signature} from anon;`);
    assertSqlIncludes(migration, `revoke execute on function public.${signature} from authenticated;`);
    assertSqlIncludes(migration, `grant execute on function public.${signature} to service_role;`);
  }

  assert.match(readSqlFunction(migration, "sanborn_source_polygon_is_valid"), /security invoker/i);
  assert.match(readSqlFunction(migration, "save_sanborn_atlas_pages"), /security invoker/i);
  assert.match(readSqlFunction(migration, "save_sanborn_map_pieces"), /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /source_polygon jsonb not null check \(public\.sanborn_source_polygon_is_valid\(source_polygon\)\)/);
});

test("page and piece saves run through atomic RPCs with explicit empty-payload behavior", () => {
  const pageRoute = readRoute(pageRoutePath);
  const pieceRoute = readRoute(pieceRoutePath);
  const migration = readMigration();
  const savePages = readSqlFunction(migration, "save_sanborn_atlas_pages");
  const savePieces = readSqlFunction(migration, "save_sanborn_map_pieces");

  assert.match(pageRoute, /\.rpc\("save_sanborn_atlas_pages"/);
  assert.match(pieceRoute, /\.rpc\("save_sanborn_map_pieces"/);
  assert.match(savePages, /raise exception/);
  assert.match(savePieces, /raise exception/);
  assert.match(savePages, /'pageOmission', 'unchanged'/);
  assert.match(savePages, /Atlas page sequence belongs to an omitted page assignment/);
  assert.doesNotMatch(savePages, /delete from public\.sanborn_atlas_pages/);
  assert.match(savePieces, /if jsonb_array_length\(p_pieces\) = 0 then/);
  assert.match(savePieces, /Only draft map pieces can be deleted by omission/);
  assert.match(savePieces, /and inventory_status = 'draft'/);
  assert.match(savePieces, /'pieceOmission', 'delete'/);
});

test("piece parent resolution supports same-payload parents and rejects invalid references", () => {
  const route = readRoute(pieceRoutePath);
  const migration = readMigration();
  const savePieces = readSqlFunction(migration, "save_sanborn_map_pieces");

  assert.match(route, /Parent piece cannot be the same as the child piece/);
  assert.match(savePieces, /set resolved_parent_row_id = parent\.final_piece_row_id/);
  assert.match(savePieces, /Parent piece cannot be the same as the child piece/);
  assert.match(savePieces, /Parent piece belongs to another atlas page/);
  assert.match(savePieces, /Parent piece reference is invalid for the selected atlas page/);
});

test("rejects duplicate-point and collinear normalized polygons", () => {
  const duplicatePoint = validateNormalizedPolygon([
    { x: 0.1, y: 0.1 },
    { x: 0.1, y: 0.1 },
    { x: 0.8, y: 0.8 },
  ]);
  const collinear = validateNormalizedPolygon([
    { x: 0.1, y: 0.1 },
    { x: 0.4, y: 0.4 },
    { x: 0.8, y: 0.8 },
  ]);
  const migration = readMigration();
  const polygonFunction = readSqlFunction(migration, "sanborn_source_polygon_is_valid");

  assert.equal(duplicatePoint.ok, false);
  if (!duplicatePoint.ok) {
    assert.match(duplicatePoint.error, /distinct/);
  }

  assert.equal(collinear.ok, false);
  if (!collinear.ok) {
    assert.match(collinear.error, /nonzero area/);
  }

  assert.match(polygonFunction, /array_length\(distinct_keys, 1\)/);
  assert.match(polygonFunction, /abs\(area_sum\) > 0\.000000000001/);
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
