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
  calculatePageClassificationSummary,
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
import {
  calculateTownIndexCompletion,
  calculateTownIndexRegionProgress,
  compareSheetReferences,
  getSourceRegionTypeLabel,
  sanbornSourceRegionTypes,
  sourceRegionSupportsMapPieces,
  sourceRegionSupportsTownIndex,
  validateTownIndexRegionPolygon,
  type SanbornTownIndexRegionRecord,
} from "./sanborn-town-index.ts";

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
    notes: null,
    archivedAt: null,
    archiveReason: null,
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
    pageType: "sanborn_sheet",
    sheetNumber: 2,
    printedReference: "2",
    volumeLabel: null,
    displayLabel: null,
    isPrimaryTownIndex: false,
    classificationNotes: null,
    archivedAt: null,
    archiveReason: null,
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

function indexRegion(regionId: string, overrides: Partial<SanbornTownIndexRegionRecord> = {}): SanbornTownIndexRegionRecord {
  return {
    rowId: `${regionId}-row`,
    regionId,
    townPackageId: "town-1",
    atlasRowId: "atlas-row-1",
    atlasId: "atlas-1",
    indexAtlasPageRowId: "index-page-row",
    indexAtlasPageId: "index-page",
    sourceAssetRowId: "index-asset-row",
    sourceAssetId: "index-asset",
    linkedAtlasPageRowId: null,
    linkedAtlasPageId: null,
    linkedSheetAssetRowId: null,
    linkedSheetAssetId: null,
    regionLabel: regionId,
    sheetReference: null,
    regionType: "sheet_coverage_region",
    sourcePolygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.1 },
      { x: 0.4, y: 0.4 },
      { x: 0.1, y: 0.4 },
    ],
    workflowStatus: "not_started",
    progressStatus: "not_started",
    includeInTownIndex: true,
    availableToMapPieces: false,
    reviewStatus: "unknown",
    evidenceClassification: "unknown",
    notes: null,
    updatedAt: null,
    isPersisted: true,
    ...overrides,
  };
}

test("reconstruction workflow exposes the ordered town-edition-sheet-block stages", () => {
  assert.deepEqual(
    reconstructionWorkflowSteps.map((step) => step.label),
    [
      "Town & Edition",
      "Source Record",
      "Town Index",
      "Sheet Inventory",
      "Map Pieces",
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
    indexRegionId: "index-region-2",
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
  assert.match(href, /indexRegionId=index-region-2/);
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

test("page classification progress tracks unknown pages, geographic pages, primary index, and conflicts", () => {
  const cover = page("cover-page", { pageType: "cover", printedReference: null });
  const indexPage = page("index-page", { pageType: "index_or_mixed", printedReference: "Index", isPrimaryTownIndex: true });
  const sheet = page("sheet-page", { pageType: "sanborn_sheet", printedReference: "2" });
  const unknown = page("unknown-page", { pageType: "unknown", printedReference: null });
  const invalidCoverPiece = piece("piece-on-cover", { atlasPageId: "cover-page" });
  const summary = calculatePageClassificationSummary({
    pages: [cover, indexPage, sheet, unknown],
    pieces: [invalidCoverPiece],
  });

  assert.equal(summary.totalPages, 4);
  assert.equal(summary.classifiedPages, 3);
  assert.equal(summary.unknownPages, 1);
  assert.equal(summary.geographicPages, 1);
  assert.equal(summary.indexPages, 1);
  assert.equal(summary.primaryIndexPages, 1);
  assert.equal(summary.conflictPages, 1);
  assert.equal(summary.status, "conflict");

  const emptySummary = calculatePageClassificationSummary({ pages: [], pieces: [] });
  assert.equal(emptySummary.completionPercent, 0);
  assert.equal(emptySummary.status, "not_started");
});

test("sheet progress requires classification and flags invalid pieces on metadata-only pages", () => {
  const cover = page("cover-page", { pageType: "cover", printedReference: null, sanbornSheetAssetId: "cover-asset" });
  const unknown = page("unknown-page", { pageType: "unknown", printedReference: null, sanbornSheetAssetId: "unknown-asset" });
  const coverProgress = calculateSheetProgress({
    asset: asset("cover-asset"),
    page: cover,
    pieces: [piece("piece-on-cover", { atlasPageId: "cover-page" })],
    placements: [],
  });
  const unknownProgress = calculateSheetProgress({
    asset: asset("unknown-asset"),
    page: unknown,
    pieces: [],
    placements: [],
  });

  assert.equal(coverProgress.classificationConflict, true);
  assert.equal(coverProgress.status, "conflict");
  assert.match(coverProgress.warning ?? "", /classification/i);
  assert.equal(unknownProgress.pageClassified, false);
  assert.equal(unknownProgress.warning, "Page type unknown");
});

test("functional source regions refine index page Map Pieces availability and Town Index progress", () => {
  const mixedPage = page("mixed-page", { pageType: "index_or_mixed", printedReference: "Index", sanbornSheetAssetId: "mixed-asset" });
  const mixedPiece = piece("piece-on-mixed", { atlasPageId: "mixed-page" });
  const geographicRegion = indexRegion("geographic-content", {
    indexAtlasPageId: "mixed-page",
    indexAtlasPageRowId: "mixed-page-row",
    sourceAssetId: "mixed-asset",
    sourceAssetRowId: "mixed-asset-row",
    regionType: "geographic_map_content",
    includeInTownIndex: false,
    availableToMapPieces: true,
  });
  const sheetCoverage = indexRegion("sheet-2", {
    regionLabel: "Sheet 2",
    sheetReference: "2",
    linkedAtlasPageId: "page-2",
    linkedAtlasPageRowId: "page-2-row",
    linkedSheetAssetId: "asset-2",
    linkedSheetAssetRowId: "asset-2-row",
  });
  const printedIndex = indexRegion("printed-index", {
    regionType: "printed_index",
    regionLabel: "Printed index",
    sheetReference: null,
    includeInTownIndex: true,
  });
  const classification = calculatePageClassificationSummary({
    pages: [mixedPage],
    pieces: [mixedPiece],
    sourceRegions: [geographicRegion],
  });
  const sheetProgress = calculateSheetProgress({
    asset: asset("mixed-asset"),
    page: mixedPage,
    pieces: [mixedPiece],
    placements: [],
    sourceRegions: [geographicRegion],
  });
  const townIndex = buildTownIndexSummary({
    pages: [page("index-page", { pageType: "index_or_mixed", isPrimaryTownIndex: true, sanbornSheetAssetId: "index-asset" }), page("page-2", { sanbornSheetAssetId: "asset-2" })],
    assets: [asset("index-asset"), asset("asset-2")],
    pieces: [],
    placements: [],
    indexRegions: [sheetCoverage, printedIndex, geographicRegion],
  });

  assert.equal(sourceRegionSupportsMapPieces(geographicRegion), true);
  assert.equal(sourceRegionSupportsTownIndex(printedIndex), false);
  assert.equal(getSourceRegionTypeLabel("town_coverage_diagram"), "Town coverage diagram");
  assert.equal(classification.conflictPages, 0);
  assert.equal(classification.geographicPages, 1);
  assert.equal(sheetProgress.classificationConflict, false);
  assert.equal(sheetProgress.mapPiecesIdentified, 1);
  assert.equal(townIndex.regions.some((region) => region.id === "printed-index"), true);
  assert.equal(townIndex.completion.totalRegions, 1);
});

test("source region model supports all functional region types", () => {
  assert.deepEqual(sanbornSourceRegionTypes, [
    "town_coverage_diagram",
    "sheet_coverage_region",
    "printed_index",
    "geographic_map_content",
    "street_index_text",
    "block_index_text",
    "legend_key",
    "inset_map",
    "title_or_decoration",
    "notes",
    "other",
  ]);
});

test("non-sequential sheets aggregate without assuming a sheet-one sequence", () => {
  const page2 = page("page-2", { sheetNumber: 2, printedReference: "2", pageSequence: 1, sanbornSheetAssetId: "asset-2" });
  const page7 = page("page-7", { sheetNumber: 7, printedReference: "7", pageSequence: 2, sanbornSheetAssetId: "asset-7" });
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
  const indexPage = page("index-page", { pageType: "index_or_mixed", sheetNumber: null, printedReference: "Index", displayLabel: "Town Index", sanbornSheetAssetId: "index-asset", isPrimaryTownIndex: true });
  const page2 = page("page-2", { sheetNumber: 2, printedReference: "2", sanbornSheetAssetId: "asset-2" });
  const page9 = page("page-9", { sheetNumber: 9, printedReference: "9", sanbornSheetAssetId: "asset-9" });
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

test("Town Index region polygons reject invalid normalized geometry", () => {
  assert.equal(
    validateTownIndexRegionPolygon([
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.1 },
      { x: 0.4, y: 0.4 },
      { x: 0.1, y: 0.4 },
    ]).ok,
    true,
  );
  assert.equal(
    validateTownIndexRegionPolygon([
      { x: 0.1, y: 0.1 },
      { x: 0.4, y: 0.4 },
      { x: 0.4, y: 0.1 },
      { x: 0.1, y: 0.4 },
    ]).ok,
    false,
  );
  assert.equal(
    validateTownIndexRegionPolygon([
      { x: 0.1, y: 0.1 },
      { x: 1.4, y: 0.1 },
      { x: 0.4, y: 0.4 },
    ]).ok,
    false,
  );
});

test("durable Town Index regions sort non-sequential references and aggregate completion", () => {
  const indexPage = page("index-page", { pageType: "index_or_mixed", sheetNumber: null, printedReference: "Index", displayLabel: "Town Index", sanbornSheetAssetId: "index-asset", isPrimaryTownIndex: true });
  const page2 = page("page-2", { sheetNumber: 2, printedReference: "2", sanbornSheetAssetId: "asset-2" });
  const page2A = page("page-2a", { sheetNumber: null, printedReference: "2A", displayLabel: "Sheet 2A", sanbornSheetAssetId: "asset-2a" });
  const page10 = page("page-10", { sheetNumber: 10, printedReference: "10", sanbornSheetAssetId: "asset-10" });
  const placedPiece = piece("piece-68", { atlasPageId: "page-2" });
  const reviewedPiece = piece("piece-2a", { atlasPageId: "page-2a", inventoryStatus: "reviewed", reviewStatus: "verified_fact" });
  const regions = [
    indexRegion("east", { regionLabel: "East inset", sheetReference: "East inset", workflowStatus: "missing", progressStatus: "missing" }),
    indexRegion("ten", { regionLabel: "Sheet 10", sheetReference: "10", linkedAtlasPageId: "page-10", linkedAtlasPageRowId: "page-10-row", linkedSheetAssetId: "asset-10", linkedSheetAssetRowId: "asset-10-row" }),
    indexRegion("two-a", { regionLabel: "Sheet 2A", sheetReference: "2A", linkedAtlasPageId: "page-2a", linkedAtlasPageRowId: "page-2a-row", linkedSheetAssetId: "asset-2a", linkedSheetAssetRowId: "asset-2a-row", workflowStatus: "reviewed", progressStatus: "reviewed" }),
    indexRegion("two", { regionLabel: "Sheet 2", sheetReference: "2", linkedAtlasPageId: "page-2", linkedAtlasPageRowId: "page-2-row", linkedSheetAssetId: "asset-2", linkedSheetAssetRowId: "asset-2-row" }),
  ];
  const summary = buildTownIndexSummary({
    pages: [indexPage, page10, page2A, page2],
    assets: [asset("index-asset"), asset("asset-10"), asset("asset-2a"), asset("asset-2")],
    pieces: [placedPiece, reviewedPiece],
    placements: [placement("piece-68", { atlasPageId: "page-2" }), placement("piece-2a", { atlasPageId: "page-2a", placementStatus: "reviewed" })],
    indexRegions: regions,
  });

  assert.deepEqual(summary.regions.map((region) => region.sheetReference), ["2", "2A", "10", "East inset"]);
  assert.equal(compareSheetReferences("2", "10") < 0, true);
  assert.equal(summary.completion.totalRegions, 4);
  assert.equal(summary.completion.linkedRegions, 3);
  assert.equal(summary.completion.missingRegions, 1);
  assert.equal(summary.completion.reviewedRegions, 1);
  assert.equal(summary.completion.completionPercent < 100, true);
});

test("Town Index region progress treats missing and conflict states as unresolved work", () => {
  const indexPage = page("index-page", { pageType: "index_or_mixed", sheetNumber: null, printedReference: "Index", sanbornSheetAssetId: "index-asset", isPrimaryTownIndex: true });
  const page2 = page("page-2", { sheetNumber: 2, printedReference: "2", sanbornSheetAssetId: "asset-2" });
  const good = calculateTownIndexRegionProgress({
    region: indexRegion("good", { linkedAtlasPageId: "page-2", linkedAtlasPageRowId: "page-2-row", linkedSheetAssetId: "asset-2", linkedSheetAssetRowId: "asset-2-row" }),
    pages: [indexPage, page2],
    assets: [asset("index-asset"), asset("asset-2")],
    pieces: [piece("piece-68", { atlasPageId: "page-2" })],
    placements: [placement("piece-68", { atlasPageId: "page-2" })],
  });
  const missing = calculateTownIndexRegionProgress({
    region: indexRegion("missing", { workflowStatus: "missing", progressStatus: "missing" }),
    pages: [indexPage, page2],
    assets: [asset("index-asset"), asset("asset-2")],
    pieces: [],
    placements: [],
  });
  const conflict = calculateTownIndexRegionProgress({
    region: indexRegion("conflict", { workflowStatus: "conflict", progressStatus: "conflict", linkedAtlasPageId: "page-2", linkedSheetAssetId: "wrong-asset" }),
    pages: [indexPage, page2],
    assets: [asset("index-asset"), asset("asset-2")],
    pieces: [],
    placements: [],
  });
  const completion = calculateTownIndexCompletion([good, missing, conflict]);

  assert.equal(good.status, "placed");
  assert.equal(missing.status, "missing");
  assert.equal(missing.completionPercent, 0);
  assert.equal(conflict.status, "conflict");
  assert.equal(completion.conflictRegions, 1);
  assert.equal(completion.missingRegions, 1);
  assert.equal(completion.completionPercent < good.completionPercent, true);
});

test("work queue is generated from incomplete records and removes completed placement tasks", () => {
  const unknownPage = page("unknown-page", { pageType: "unknown", printedReference: null, sanbornSheetAssetId: "unknown-asset" });
  const coverPage = page("cover-page", { pageType: "cover", printedReference: null, sanbornSheetAssetId: "cover-asset" });
  const invalidCoverPiece = piece("piece-on-cover", { atlasPageId: "cover-page", titleText: "Cover decoration" });
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
    pages: [unknownPage, coverPage, page("page-2", { sanbornSheetAssetId: "asset-2" })],
    sheets: [missingSourceSheet],
    pieces: [unplacedPiece, placedPiece, calculateMapPieceProgress({ piece: invalidCoverPiece, placement: null })],
    classification: calculatePageClassificationSummary({ pages: [unknownPage, coverPage, page("page-2")], pieces: [invalidCoverPiece] }),
    index: {
      indexPage: null,
      indexAsset: null,
      regions: [],
      regionProgress: [],
      completion: calculateTownIndexCompletion([]),
      unresolvedRegionCount: 0,
    },
    sourceRecordCount: 1,
  });

  assert.equal(tasks.some((task) => task.label === "Select a primary Town Index page"), true);
  assert.equal(tasks.some((task) => /Classify uploaded page/.test(task.label)), true);
  assert.equal(tasks.some((task) => /Resolve map pieces created on/.test(task.label)), true);
  assert.equal(tasks.some((task) => /Add source record/.test(task.label)), true);
  assert.equal(tasks.some((task) => task.label === "Place Block 68"), true);
  assert.equal(tasks.some((task) => task.label === "Place Block 69"), false);
  assert.equal(tasks.some((task) => task.label === "Place Cover decoration"), false);

  const emptyTasks = buildReconstructionWorkQueue({
    townPackageId: "town-1",
    mapYear: 1885,
    atlasId: "atlas-1",
    pages: [],
    sheets: [],
    pieces: [],
    index: {
      indexPage: null,
      indexAsset: null,
      regions: [],
      regionProgress: [],
      completion: calculateTownIndexCompletion([]),
      unresolvedRegionCount: 0,
    },
    sourceRecordCount: 0,
  });
  assert.equal(emptyTasks.some((task) => task.label === "Select a primary Town Index page"), false);
});

test("work queue generates Town Index region tasks and removes reviewed regions", () => {
  const regions = [
    { id: "conflict", label: "Sheet 2", sheetReference: "2", sheetNumber: 2, atlasPageId: "page-2", sheetAssetId: "asset-2", status: "conflict" as const, completionPercent: 30, warnings: ["Linked page and sheet conflict"] },
    { id: "missing", label: "Sheet 4", sheetReference: "4", sheetNumber: 4, atlasPageId: null, sheetAssetId: null, status: "missing" as const, completionPercent: 0, warnings: ["Marked missing"] },
    { id: "unlinked", label: "East inset", sheetReference: "East inset", sheetNumber: null, atlasPageId: null, sheetAssetId: null, status: "not_started" as const, completionPercent: 15, warnings: ["No linked sheet or page"] },
    { id: "reviewed", label: "Business District", sheetReference: "Business District", sheetNumber: null, atlasPageId: "page-7", sheetAssetId: "asset-7", status: "reviewed" as const, completionPercent: 100, warnings: [] },
  ];
  const tasks = buildReconstructionWorkQueue({
    townPackageId: "town-1",
    mapYear: 1885,
    atlasId: "atlas-1",
    sheets: [],
    pieces: [],
    index: {
      indexPage: page("index-page", { pageType: "index_or_mixed", isPrimaryTownIndex: true }),
      indexAsset: asset("index-asset"),
      regions,
      regionProgress: [],
      completion: calculateTownIndexCompletion([]),
      unresolvedRegionCount: 3,
    },
    sourceRecordCount: 1,
  });

  assert.equal(tasks.some((task) => task.label === "Resolve index conflict for Sheet 2"), true);
  assert.equal(tasks.some((task) => task.label === "Upload source for missing region Sheet 4"), true);
  assert.equal(tasks.some((task) => task.label === "Link index region East inset"), true);
  assert.equal(tasks.some((task) => task.label.includes("Business District")), false);
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

test("migration 0014 stores durable Town Index regions with service-role-only security", () => {
  const migration = readFileSync("../../supabase/migrations/0014_town_index_regions.sql", "utf8");

  assert.match(migration, /create table if not exists public\.sanborn_town_index_regions/);
  assert.match(migration, /region_id text not null unique/);
  assert.match(migration, /source_polygon jsonb not null/);
  assert.match(migration, /constraint sanborn_town_index_regions_polygon_valid/);
  assert.match(migration, /public\.sanborn_index_region_polygon_is_valid\(source_polygon\)/);
  assert.match(migration, /references public\.town_packages\(id\) on delete cascade/);
  assert.match(migration, /references public\.sanborn_atlases\(id\) on delete cascade/);
  assert.match(migration, /references public\.sanborn_atlas_pages\(id\) on delete set null/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /alter table public\.sanborn_town_index_regions enable row level security/);
  assert.match(migration, /revoke all on table public\.sanborn_town_index_regions from PUBLIC, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.sanborn_town_index_regions to service_role/);
  assert.match(migration, /revoke execute on function public\.save_sanborn_town_index_region\(uuid, text, jsonb\) from PUBLIC, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.save_sanborn_town_index_region\(uuid, text, jsonb\) to service_role/);
  assert.match(migration, /revoke execute on function public\.delete_sanborn_town_index_region\(uuid, text, text\) from PUBLIC, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.delete_sanborn_town_index_region\(uuid, text, text\) to service_role/);
  assert.match(migration, /p_town_package_id/);
  assert.match(migration, /where atlas_row\.atlas_id = p_atlas_id\s+and atlas_row\.town_package_id = p_town_package_id/);
  assert.match(migration, /where page_row\.page_id = v_linked_page_id\s+and page_row\.atlas_id = atlas_scope\.id/);
  assert.match(migration, /asset_page_row\.atlas_id = atlas_scope\.id/);
  assert.match(migration, /Linked Sanborn sheet asset must be assigned to the selected atlas/);
  assert.match(migration, /Linked atlas page must belong to the selected atlas/);
});

test("migration 0016 stores functional source regions with scoped service-role-only RPCs", () => {
  const migration = readFileSync("../../supabase/migrations/0016_functional_source_regions.sql", "utf8");

  assert.match(migration, /create table if not exists public\.sanborn_source_regions/);
  assert.match(migration, /source_region_id text not null unique/);
  assert.match(migration, /region_type text not null/);
  assert.match(migration, /normalized_polygon jsonb not null/);
  assert.match(migration, /include_in_town_index boolean not null default false/);
  assert.match(migration, /available_to_map_pieces boolean not null default false/);
  assert.match(migration, /town_coverage_diagram/);
  assert.match(migration, /sheet_coverage_region/);
  assert.match(migration, /printed_index/);
  assert.match(migration, /geographic_map_content/);
  assert.match(migration, /public\.sanborn_source_region_polygon_is_valid\(normalized_polygon\)/);
  assert.match(migration, /alter table public\.sanborn_town_index_regions\s+add column if not exists source_region_id uuid references public\.sanborn_source_regions\(id\)/);
  assert.match(migration, /insert into public\.sanborn_source_regions/);
  assert.match(migration, /save_sanborn_source_region\(uuid, text, jsonb\)/);
  assert.match(migration, /delete_sanborn_source_region\(uuid, text, text\)/);
  assert.match(migration, /Source region page must belong to the selected atlas/);
  assert.match(migration, /Linked atlas page must belong to the selected atlas/);
  assert.match(migration, /Linked Sanborn sheet asset must be assigned to the selected atlas/);
  assert.match(migration, /alter table public\.sanborn_source_regions enable row level security/);
  assert.match(migration, /revoke all on table public\.sanborn_source_regions from PUBLIC, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.sanborn_source_regions to service_role/);
  assert.match(migration, /revoke execute on function public\.save_sanborn_source_region\(uuid, text, jsonb\) from PUBLIC, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.save_sanborn_source_region\(uuid, text, jsonb\) to service_role/);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("Town Index region API validates polygons and keeps the service-role key server-side", () => {
  const route = readFileSync("./app/api/community/historical-map-studio/town-index-regions/route.ts", "utf8");

  assert.match(route, /requireMapStudioWriteAccess/);
  assert.match(route, /validateTownIndexRegionPolygon/);
  assert.match(route, /Town Index region type is not allowed/);
  assert.match(route, /Town Index region status is not allowed/);
  assert.match(route, /save_sanborn_town_index_region/);
  assert.match(route, /delete_sanborn_town_index_region/);
  assert.match(route, /townPackageId/);
  assert.match(route, /atlasId/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /\.upsert\(/);
});

test("Source Record source-region API validates polygons and keeps the service-role key server-side", () => {
  const route = readFileSync("./app/api/community/historical-map-studio/source-regions/route.ts", "utf8");

  assert.match(route, /requireMapStudioWriteAccess/);
  assert.match(route, /validateTownIndexRegionPolygon/);
  assert.match(route, /Source region type is not allowed/);
  assert.match(route, /Source region status is not allowed/);
  assert.match(route, /availableToMapPieces/);
  assert.match(route, /save_sanborn_source_region/);
  assert.match(route, /delete_sanborn_source_region/);
  assert.match(route, /townPackageId/);
  assert.match(route, /atlasId/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /\.upsert\(/);
});

test("Historical Map Studio reads functional source regions before legacy Town Index regions", () => {
  const loader = readFileSync("./lib/historical-map-studio-data.ts", "utf8");

  assert.match(loader, /\.from\("sanborn_source_regions"\)/);
  assert.match(loader, /\.from\("sanborn_town_index_regions"\)/);
  assert.match(loader, /Functional source regions are not available yet/);
  assert.match(loader, /include_in_town_index/);
  assert.match(loader, /available_to_map_pieces/);
});

test("demo fallback includes reconstruction overview and durable LOC provenance", () => {
  const demo = JSON.parse(readFileSync("./lib/demo-data/community.json", "utf8")) as {
    townReconstruction?: {
      demoLabel?: string;
      sourceIdentity?: Record<string, string>;
      editionManagement?: {
        demoOnly?: boolean;
        note?: string;
        savedEditions?: Array<{ year: number; pageCount: number; archived: boolean }>;
        pageManagementExamples?: string[];
        mapPiecesViewport?: { zoomRange?: string };
      };
      pageClassification?: {
        totalPages?: number;
        unknownPages?: number;
        conflicts?: number;
        pages?: Array<{ pageType: string; primaryTownIndex?: boolean; filename?: string }>;
      };
      sourceRegions?: Array<{ regionType: string; includeInTownIndex?: boolean; availableToMapPieces?: boolean }>;
      townIndex?: { regions?: Array<{ sheetReference: string; status: string }> };
      sheetInventory?: Array<{ sheetNumber: number | null; sheetReference: string; sourceRecordId: string | null; pageType?: string }>;
      nextTasks?: string[];
    };
  };

  assert.equal(demo.townReconstruction?.demoLabel, "Demo fallback reconstruction overview");
  assert.equal(demo.townReconstruction?.sourceIdentity?.internalSourceId, "SRC-1234567890AB");
  assert.equal(demo.townReconstruction?.sourceIdentity?.repository, "Library of Congress");
  assert.equal(demo.townReconstruction?.sourceIdentity?.collection, "Sanborn Fire Insurance Maps");
  assert.match(demo.townReconstruction?.sourceIdentity?.citation ?? "", /Standard historical citation|Sanborn Map Company/);
  assert.equal(demo.townReconstruction?.editionManagement?.demoOnly, true);
  assert.equal(demo.townReconstruction?.editionManagement?.note, "These are saved demo editions, not automatic production year suggestions.");
  assert.equal(demo.townReconstruction?.editionManagement?.savedEditions?.some((edition) => edition.year === 1888 && edition.pageCount === 0), true);
  assert.equal(demo.townReconstruction?.editionManagement?.savedEditions?.some((edition) => edition.archived === true), true);
  assert.equal(demo.townReconstruction?.editionManagement?.pageManagementExamples?.some((example) => /Move misplaced 1888 upload/.test(example)), true);
  assert.equal(demo.townReconstruction?.editionManagement?.mapPiecesViewport?.zoomRange, "25%-800%");
  assert.equal(demo.townReconstruction?.pageClassification?.totalPages, 9);
  assert.equal(demo.townReconstruction?.pageClassification?.unknownPages, 1);
  assert.equal(demo.townReconstruction?.pageClassification?.conflicts, 1);
  assert.equal(demo.townReconstruction?.pageClassification?.pages?.some((page) => page.pageType === "cover"), true);
  assert.equal(demo.townReconstruction?.pageClassification?.pages?.some((page) => page.pageType === "index_or_mixed" && page.primaryTownIndex), true);
  assert.equal(demo.townReconstruction?.pageClassification?.pages?.some((page) => page.pageType === "street_index"), true);
  assert.equal(demo.townReconstruction?.pageClassification?.pages?.some((page) => page.pageType === "special_sheet"), true);
  assert.equal(demo.townReconstruction?.pageClassification?.pages?.some((page) => page.pageType === "unknown"), true);
  assert.equal(demo.townReconstruction?.sourceRegions?.some((region) => region.regionType === "town_coverage_diagram"), true);
  assert.equal(demo.townReconstruction?.sourceRegions?.some((region) => region.regionType === "printed_index"), true);
  assert.equal(demo.townReconstruction?.sourceRegions?.some((region) => region.regionType === "geographic_map_content" && region.availableToMapPieces), true);
  assert.deepEqual(demo.townReconstruction?.townIndex?.regions?.map((region) => region.sheetReference), ["2", "3", "7", "2A", "10", "East inset"]);
  assert.deepEqual(new Set(demo.townReconstruction?.townIndex?.regions?.map((region) => region.status)), new Set(["missing", "not_started", "started", "placed", "reviewed", "conflict"]));
  assert.deepEqual(demo.townReconstruction?.sheetInventory?.map((sheet) => sheet.sheetReference), ["2", "2A", "3", "7", "10"]);
  assert.equal(demo.townReconstruction?.sheetInventory?.some((sheet) => sheet.pageType === "special_sheet"), true);
  assert.equal(demo.townReconstruction?.sheetInventory?.some((sheet) => sheet.sourceRecordId === null), true);
  assert.equal(demo.townReconstruction?.nextTasks?.some((task) => /Classify uploaded page/.test(task)), true);
  assert.equal(demo.townReconstruction?.nextTasks?.some((task) => /Resolve map pieces created on Cover/.test(task)), true);
  assert.equal(demo.townReconstruction?.nextTasks?.some((task) => /Place Block 68/.test(task)), true);
  assert.equal(demo.townReconstruction?.nextTasks?.some((task) => /Resolve duplicate link/.test(task)), true);
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
  const studio = readFileSync("./components/HistoricalMapStudio.tsx", "utf8");
  const activeShell = studio.slice(studio.indexOf("minimal-sanborn-gps--station-shell"), studio.indexOf("Legacy pre-station"));

  for (const label of [
    "Town & Edition",
    "Source Record",
    "Town Index",
    "Sheet Inventory",
    "Map Pieces",
    "Map Placement",
  ]) {
    assert.match(navigator, new RegExp(label.replace(/[&/]/g, (match) => `\\${match}`)));
  }

  assert.match(navigator, /Town Reconstruction station rail/);
  assert.match(navigator, /sanbornAtlasWorkflowSteps/);
  assert.doesNotMatch(navigator, /Building Reconstruction/);
  assert.doesNotMatch(navigator, /People & Activity/);
  assert.doesNotMatch(navigator, /Evidence Review/);
  assert.match(activeShell, /sanborn-atlas-workflow--stations/);
  assert.match(activeShell, /sanborn-station-inspector/);
  assert.match(activeShell, /renderStationWorkspace\(\)/);
  assert.match(activeShell, /renderInspectorBody\(\)/);
});
