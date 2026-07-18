import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeSanbornMapPieceGeoreference, type SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";
import {
  buildReconstructionUrl,
  buildStandardSanbornCitation,
  buildTownIndexSummary,
  calculateEditionProgress,
  calculateMapPieceProgress,
  calculateSheetProgress,
  calculateTownProgress,
  buildReconstructionWorkQueue,
  formatMindseyeSourceIdFromUuid,
  getSourceDisplayId,
  reconstructionWorkflowSteps,
  type ReconstructionSourceRecord,
} from "./town-reconstruction.ts";
import type { StudioSheetAsset, StudioSourceOption, StudioTownPackage } from "./historical-map-studio.ts";
import type { SanbornAtlasPageRecord, SanbornAtlasRecord, SanbornMapPieceRecord } from "./sanborn-atlas.ts";

function town(overrides: Partial<StudioTownPackage> = {}): StudioTownPackage {
  return {
    id: "town-1",
    packageId: "texarkana_1885",
    name: "Texarkana",
    region: "Texas / Arkansas",
    year: 1885,
    centerLatitude: 33.425,
    centerLongitude: -94.047,
    defaultZoom: 15,
    ...overrides,
  };
}

function source(overrides: Partial<StudioSourceOption> = {}): StudioSourceOption {
  return {
    sourceRecordId: "source-row-1",
    sourceId: "SRC-123456789ABC",
    title: "Sanborn Fire Insurance Map from Texarkana",
    sourceUrl: "https://www.loc.gov/item/sanborn00001/",
    archiveName: "Library of Congress",
    rightsNote: "No known restrictions.",
    ...overrides,
  };
}

function asset(assetId: string, overrides: Partial<StudioSheetAsset> = {}): StudioSheetAsset {
  return {
    assetId,
    rowId: `${assetId}-row`,
    townPackageId: "town-1",
    sourceRecordId: "source-row-1",
    sourceId: "SRC-123456789ABC",
    sourceTitle: "Sanborn Fire Insurance Map from Texarkana",
    mapLayerId: null,
    sheetNumber: 2,
    originalFilename: `${assetId}.png`,
    storageBucket: "sanborn-sheets",
    storagePath: `texarkana_1885/sanborn-sheets/${assetId}/sheet.png`,
    signedUrl: `https://example.supabase.co/${assetId}.png`,
    signedUrlExpiresAt: "2099-01-01T00:00:00.000Z",
    mimeType: "image/png",
    byteSize: 100,
    width: 4000,
    height: 3000,
    checksum: "a".repeat(64),
    sourceUrl: null,
    archiveName: null,
    rightsNote: null,
    evidenceClassification: "unknown",
    reviewStatus: "unknown",
    intakeNotes: null,
    uploadedAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...overrides,
  };
}

function atlas(overrides: Partial<SanbornAtlasRecord> = {}): SanbornAtlasRecord {
  return {
    rowId: "atlas-row-1",
    atlasId: "atlas-1",
    townPackageId: "town-1",
    sourceRecordId: "source-row-1",
    title: "Texarkana 1885 Sanborn Atlas",
    editionYear: 1885,
    editionDate: null,
    volumeLabel: null,
    expectedPageCount: null,
    reviewStatus: "unknown",
    evidenceClassification: "unknown",
    updatedAt: null,
    isPersisted: true,
    ...overrides,
  };
}

function page(pageId: string, overrides: Partial<SanbornAtlasPageRecord> = {}): SanbornAtlasPageRecord {
  return {
    rowId: `${pageId}-row`,
    pageId,
    atlasRowId: "atlas-row-1",
    atlasId: "atlas-1",
    sanbornSheetAssetId: `${pageId}-asset`,
    sanbornSheetAssetRowId: `${pageId}-asset-row`,
    pageSequence: 1,
    pageType: "numbered_sheet",
    sheetNumber: 2,
    volumeLabel: null,
    displayLabel: null,
    reviewStatus: "unknown",
    evidenceClassification: "unknown",
    updatedAt: null,
    isPersisted: true,
    ...overrides,
  };
}

function piece(pieceId: string, overrides: Partial<SanbornMapPieceRecord> = {}): SanbornMapPieceRecord {
  return {
    rowId: `${pieceId}-row`,
    pieceId,
    atlasPageRowId: "page-2-row",
    atlasPageId: "page-2",
    parentPieceId: null,
    pieceSequence: 1,
    pieceType: "regular_block",
    blockNumberText: "68",
    titleText: "Block 68",
    sourcePolygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.1, y: 0.5 },
    ],
    sourceBBox: { minX: 0.1, minY: 0.1, maxX: 0.5, maxY: 0.5 },
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

function placement(pieceId: string, overrides: Partial<SanbornMapPieceGeoreference> = {}): SanbornMapPieceGeoreference {
  return normalizeSanbornMapPieceGeoreference({
    pieceId,
    atlasPageId: "page-2",
    centerLatitude: 33.425,
    centerLongitude: -94.047,
    corners: {
      northwest: { latitude: 33.426, longitude: -94.048 },
      northeast: { latitude: 33.426, longitude: -94.046 },
      southeast: { latitude: 33.424, longitude: -94.046 },
      southwest: { latitude: 33.424, longitude: -94.048 },
    },
    placementStatus: "placed",
    targetGeometry: "polygon",
    opacity: 0.72,
    layerOrder: 0,
    isVisible: true,
    isPersisted: true,
    ...overrides,
  });
}

test("reconstruction workflow exposes the ordered town-edition-sheet-block stages", () => {
  assert.deepEqual(
    reconstructionWorkflowSteps.map((step) => step.label),
    [
      "Town & Edition",
      "Source Record",
      "Town Index",
      "Sheet Inventory",
      "Map Pieces / Blocks",
      "Map Placement",
      "Building Reconstruction",
      "People & Activity",
      "Evidence Review",
    ],
  );
  assert.equal(reconstructionWorkflowSteps.slice(0, 6).every((step) => step.isOperational), true);
  assert.equal(reconstructionWorkflowSteps.slice(6).every((step) => !step.isOperational), true);
});

test("source identity uses a stable internal display ID and LOC citation fields", () => {
  const sourceRecord: ReconstructionSourceRecord = {
    sourceRecordId: "12345678-90ab-4cde-8f12-34567890abcd",
    repositoryName: "Library of Congress",
    collectionName: "Sanborn Fire Insurance Maps",
    repositoryExternalId: "sanborn03345_001",
    persistentUrl: "https://www.loc.gov/item/sanborn03345_001/",
    title: "Sanborn Fire Insurance Map from Texarkana, Bowie County, Texas",
    town: "Texarkana",
    county: "Bowie",
    state: "Texas",
    editionYear: 1885,
    sheetNumber: 2,
    mapPublisher: "Sanborn Map Company",
    rightsStatement: "No known restrictions on publication.",
  };

  assert.equal(formatMindseyeSourceIdFromUuid(sourceRecord.sourceRecordId), "SRC-1234567890AB");
  assert.equal(getSourceDisplayId(sourceRecord), "SRC-1234567890AB");
  assert.match(buildStandardSanbornCitation(sourceRecord, new Date("2026-07-18T00:00:00Z")), /Sheet 2/);
  assert.match(buildStandardSanbornCitation(sourceRecord, new Date("2026-07-18T00:00:00Z")), /Library of Congress/);
  assert.match(buildStandardSanbornCitation(sourceRecord, new Date("2026-07-18T00:00:00Z")), /Accessed 2026-07-18/);

  assert.equal(getSourceDisplayId({ internalSourceId: "SRC-ABCDEF123456", sourceRecordId: sourceRecord.sourceRecordId }), "SRC-ABCDEF123456");
});

test("URL context preserves town, edition, sheet, page, piece, and workflow aliases", () => {
  const href = buildReconstructionUrl("/community/building-auditor", {
    townPackageId: "town-1",
    mapYear: 1885,
    atlasId: "atlas-1",
    atlasPageId: "page-2",
    sheetAssetId: "asset-2",
    mapPieceId: "piece-68",
    blockId: "68",
    workflow: "piece_inventory",
  });

  assert.match(href, /^\/community\/building-auditor\?/);
  assert.match(href, /town=town-1/);
  assert.match(href, /townPackageId=town-1/);
  assert.match(href, /year=1885/);
  assert.match(href, /mapYear=1885/);
  assert.match(href, /sheet=asset-2/);
  assert.match(href, /sheetAssetId=asset-2/);
  assert.match(href, /piece=piece-68/);
  assert.match(href, /mapPieceId=piece-68/);
});

test("sheet and map-piece progress is based on explicit completed work", () => {
  const page2 = page("page-2");
  const asset2 = asset("page-2-asset");
  const piece68 = piece("piece-68");
  const savedPlacement = placement("piece-68");
  const mapPieceProgress = calculateMapPieceProgress({ piece: piece68, placement: savedPlacement });
  const sheetProgress = calculateSheetProgress({
    asset: asset2,
    page: page2,
    pieces: [piece68],
    placements: [savedPlacement],
  });

  assert.equal(mapPieceProgress.regionDefined, true);
  assert.equal(mapPieceProgress.geographicPlacementSaved, true);
  assert.equal(mapPieceProgress.visibleAndOperational, true);
  assert.equal(mapPieceProgress.status, "placed");
  assert.equal(sheetProgress.sourceLinked, true);
  assert.equal(sheetProgress.mapPiecesIdentified, 1);
  assert.equal(sheetProgress.mapPiecesPlaced, 1);
  assert.equal(sheetProgress.mapPiecesUnplaced, 0);
  assert.equal(sheetProgress.status, "placed");
});

test("non-sequential sheets aggregate without assuming a sheet-one sequence", () => {
  const page2 = page("page-2", { sheetNumber: 2, pageSequence: 1, sanbornSheetAssetId: "asset-2" });
  const page7 = page("page-7", { sheetNumber: 7, pageSequence: 2, sanbornSheetAssetId: "asset-7" });
  const asset2 = asset("asset-2", { sheetNumber: 2 });
  const asset7 = asset("asset-7", { sheetNumber: 7, sourceRecordId: null });
  const piece68 = piece("piece-68", { atlasPageId: "page-2" });
  const piece90 = piece("piece-90", { atlasPageId: "page-7", blockNumberText: "90", titleText: "Block 90" });
  const savedPlacement = placement("piece-68", { atlasPageId: "page-2" });
  const edition = calculateEditionProgress({
    atlas: atlas(),
    pages: [page7, page2],
    assets: [asset7, asset2],
    pieces: [piece68, piece90],
    placements: [savedPlacement],
  });
  const townProgress = calculateTownProgress({
    town: town(),
    activeMapYear: 1885,
    sourceOptions: [source()],
    sheets: [asset7, asset2],
    pages: [page7, page2],
    pieces: [piece68, piece90],
    placements: [savedPlacement],
  });

  assert.equal(edition.sheetCount, 2);
  assert.equal(edition.mapPieceCount, 2);
  assert.equal(edition.placedMapPieceCount, 1);
  assert.equal(townProgress.sheetCount, 2);
  assert.equal(townProgress.mapPiecesIdentified, 2);
  assert.equal(townProgress.mapPiecesPlaced, 1);
  assert.equal(townProgress.unresolvedWorkCount > 0, true);
});

test("Town Index designation and region navigation summary use index page metadata", () => {
  const indexPage = page("index-page", { pageType: "graphic_index", sheetNumber: null, displayLabel: "Town Index", sanbornSheetAssetId: "index-asset" });
  const page2 = page("page-2", { sheetNumber: 2, sanbornSheetAssetId: "asset-2" });
  const page9 = page("page-9", { sheetNumber: 9, sanbornSheetAssetId: "asset-9" });
  const summary = buildTownIndexSummary({
    pages: [page9, indexPage, page2],
    assets: [asset("index-asset"), asset("asset-2"), asset("asset-9")],
    pieces: [piece("piece-68", { atlasPageId: "page-2" })],
    placements: [placement("piece-68", { atlasPageId: "page-2" })],
  });

  assert.equal(summary.indexPage?.pageId, "index-page");
  assert.equal(summary.indexAsset?.assetId, "index-asset");
  assert.deepEqual(summary.regions.map((region) => region.sheetNumber), [2, 9]);
  assert.equal(summary.regions[0]?.atlasPageId, "page-2");
});

test("work queue is generated from incomplete records and removes completed placement tasks", () => {
  const missingSourceSheet = calculateSheetProgress({
    asset: asset("asset-2", { sourceRecordId: null }),
    page: page("page-2", { sanbornSheetAssetId: "asset-2" }),
    pieces: [piece("piece-68")],
    placements: [],
  });
  const unplacedPiece = calculateMapPieceProgress({ piece: piece("piece-68"), placement: null });
  const placedPiece = calculateMapPieceProgress({ piece: piece("piece-69", { blockNumberText: "69" }), placement: placement("piece-69") });
  const tasks = buildReconstructionWorkQueue({
    townPackageId: "town-1",
    mapYear: 1885,
    atlasId: "atlas-1",
    sheets: [missingSourceSheet],
    pieces: [unplacedPiece, placedPiece],
    index: { indexPage: null, indexAsset: null, regions: [], unresolvedRegionCount: 0 },
    sourceRecordCount: 1,
  });

  assert.equal(tasks.some((task) => task.label === "Designate the Town Index page"), true);
  assert.equal(tasks.some((task) => task.label === "Add source record for Sheet 2"), true);
  assert.equal(tasks.some((task) => task.label === "Place Block 68"), true);
  assert.equal(tasks.some((task) => task.label === "Place Block 69"), false);
});

test("migration 0013 extends source_records and child source linkage without creating a competing source table", () => {
  const migration = readFileSync("../../supabase/migrations/0013_town_reconstruction_source_provenance.sql", "utf8");

  assert.match(migration, /alter table public\.source_records/);
  assert.match(migration, /internal_source_id text/);
  assert.match(migration, /repository_external_id text/);
  assert.match(migration, /iiif_manifest_url text/);
  assert.match(migration, /alter table public\.sanborn_atlas_pages\s+add column if not exists source_record_id uuid/);
  assert.match(migration, /alter table public\.sanborn_map_pieces\s+add column if not exists source_record_id uuid/);
  assert.match(migration, /alter table public\.buildings\s+add column if not exists source_record_id uuid/);
  assert.match(migration, /alter table public\.people\s+add column if not exists source_record_id uuid/);
  assert.match(migration, /alter table public\.businesses\s+add column if not exists source_record_id uuid/);
  assert.match(migration, /repository_external_id text/);
  assert.match(migration, /persistent_url text/);
  assert.match(migration, /create unique index if not exists idx_source_records_repository_external/);
  assert.match(migration, /references public\.source_records\(id\) on delete set null/);
  assert.doesNotMatch(migration, /create table public\.source_records/i);
  assert.doesNotMatch(migration, /citation_text/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke execute on function public\.format_mindseye_source_id\(uuid\) from PUBLIC/);
  assert.match(migration, /grant execute on function public\.format_mindseye_source_id\(uuid\) to service_role/);
  assert.match(migration, /grant execute on function public\.set_source_record_internal_source_id\(\) to service_role/);
});

test("demo fallback includes reconstruction overview and durable LOC provenance", () => {
  const demo = JSON.parse(readFileSync("./lib/demo-data/community.json", "utf8")) as {
    townReconstruction?: {
      demoLabel?: string;
      sourceIdentity?: Record<string, string>;
      sheetInventory?: Array<{ sheetNumber: number; sourceRecordId: string | null }>;
      nextTasks?: string[];
    };
  };

  assert.equal(demo.townReconstruction?.demoLabel, "Demo fallback reconstruction overview");
  assert.equal(demo.townReconstruction?.sourceIdentity?.internalSourceId, "SRC-1234567890AB");
  assert.equal(demo.townReconstruction?.sourceIdentity?.repository, "Library of Congress");
  assert.equal(demo.townReconstruction?.sourceIdentity?.collection, "Sanborn Fire Insurance Maps");
  assert.match(demo.townReconstruction?.sourceIdentity?.citation ?? "", /Standard historical citation|Sanborn Map Company/);
  assert.deepEqual(demo.townReconstruction?.sheetInventory?.map((sheet) => sheet.sheetNumber), [2, 3, 7]);
  assert.equal(demo.townReconstruction?.sheetInventory?.some((sheet) => sheet.sourceRecordId === null), true);
  assert.equal(demo.townReconstruction?.nextTasks?.some((task) => /Place Block 68/.test(task)), true);
});

test("source-record creation route uses service-role access and existing source_records storage", () => {
  const route = readFileSync("./app/api/community/source-records/route.ts", "utf8");

  assert.match(route, /requireMapStudioWriteAccess/);
  assert.match(route, /\.from\("source_records"\)/);
  assert.match(route, /repository_name/);
  assert.match(route, /iiif_manifest_url/);
  assert.match(route, /internal_source_id/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /create table/i);
});

test("shared ReconstructionContextBar is wired across Map, Buildings, People, and Sources routes", () => {
  const mapPage = readFileSync("./app/community/historical-map-studio/page.tsx", "utf8");
  const mapComponent = readFileSync("./components/HistoricalMapStudio.tsx", "utf8");
  const buildings = readFileSync("./app/community/building-auditor/page.tsx", "utf8");
  const people = readFileSync("./app/community/people-auditor/page.tsx", "utf8");
  const sources = readFileSync("./app/community/source-provenance-inspector/page.tsx", "utf8");
  const contextBar = readFileSync("./components/ReconstructionContextBar.tsx", "utf8");
  const townLib = readFileSync("./lib/town-reconstruction.ts", "utf8");

  assert.match(mapPage, /townPackageId\?: string/);
  assert.match(mapComponent, /<ReconstructionContextBar/);
  assert.match(buildings, /<ReconstructionContextBar/);
  assert.match(people, /<ReconstructionContextBar/);
  assert.match(sources, /<ReconstructionContextBar/);
  assert.match(townLib, /label: "Map"/);
  assert.match(townLib, /label: "Buildings"/);
  assert.match(townLib, /label: "People"/);
  assert.match(townLib, /label: "Sources"/);
  assert.match(contextBar, /Source Info/);
  assert.match(contextBar, /Create source record/);
  assert.match(contextBar, /Copy citation/);
  assert.match(contextBar, /recentTownStorageKey/);
  assert.match(contextBar, /localStorage/);
  assert.match(contextBar, /buildReconstructionUrl\(tab\.href, context\)/);
});

test("Historical Map Studio navigator uses reconstruction workflow labels", () => {
  const navigator = readFileSync("./components/SanbornAtlasNavigator.tsx", "utf8");

  for (const label of [
    "Town & Edition",
    "Source Record",
    "Town Index",
    "Sheet Inventory",
    "Map Pieces / Blocks",
    "Map Placement",
    "Building Reconstruction",
    "People & Activity",
    "Evidence Review",
  ]) {
    assert.match(navigator, new RegExp(label.replace(/[&/]/g, (match) => `\\${match}`)));
  }

  assert.match(navigator, /ReconstructionRailSummary/);
  assert.match(navigator, /TownIndexPanel/);
  assert.match(navigator, /SheetInventoryPanel/);
  assert.match(navigator, /PieceWorkloadPanel/);
  assert.match(navigator, /WorkQueuePanel/);
});
