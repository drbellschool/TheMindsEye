import assert from "node:assert/strict";
import test from "node:test";

import { birdsEyeEligibleMapPieceIds, buildBirdsEyeEligibleMapPieces } from "./birds-eye-map-pieces.ts";
import type { SanbornAtlasPageRecord, SanbornMapPieceRecord } from "./sanborn-atlas.ts";
import { normalizeSanbornMapPieceGeoreference, type SanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";

const atlasId = "atlas-1888";
const pageId = "page-4";

function page(overrides: Partial<SanbornAtlasPageRecord> = {}): SanbornAtlasPageRecord {
  return {
    rowId: "page-row-4",
    pageId,
    atlasRowId: "atlas-row-1888",
    atlasId,
    sanbornSheetAssetId: "sheet-asset-4",
    sanbornSheetAssetRowId: "sheet-row-4",
    pageSequence: 4,
    pageType: "sheet",
    sheetNumber: 4,
    printedReference: "4",
    volumeLabel: null,
    displayLabel: "Sheet 4",
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

function piece(pieceId: string, titleText = "Block 4 - Ace of Clubs", overrides: Partial<SanbornMapPieceRecord> = {}): SanbornMapPieceRecord {
  return {
    rowId: `${pieceId}-row`,
    pieceId,
    atlasPageRowId: "page-row-4",
    atlasPageId: pageId,
    parentPieceId: null,
    pieceSequence: 1,
    pieceType: "block",
    blockNumberText: "4",
    titleText,
    sourcePolygon: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.4, y: 0.4 }],
    sourceBBox: { minX: 0.1, minY: 0.1, maxX: 0.4, maxY: 0.4 },
    creationMethod: "manual",
    inventoryStatus: "candidate",
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
    atlasPageId: pageId,
    targetGeometry: "polygon",
    centerLatitude: 33.43,
    centerLongitude: -94.04,
    corners: {
      northwest: { latitude: 33.431, longitude: -94.041 },
      northeast: { latitude: 33.431, longitude: -94.039 },
      southeast: { latitude: 33.429, longitude: -94.039 },
      southwest: { latitude: 33.429, longitude: -94.041 },
    },
    placementStatus: "draft",
    isVisible: true,
    isPersisted: true,
    ...overrides,
  });
}

function build(mapPieces: SanbornMapPieceRecord[], mapPlacements: SanbornMapPieceGeoreference[], options: { loading?: boolean; pages?: SanbornAtlasPageRecord[] } = {}) {
  return buildBirdsEyeEligibleMapPieces({
    activeAtlasId: atlasId,
    mapPieces,
    mapPlacements,
    pages: options.pages ?? [page()],
    loading: options.loading,
  });
}

test("persisted operational placement is available through canonical status even when its raw status remains draft", () => {
  const result = build([piece("piece-global-4")], [placement("piece-global-4")]);
  assert.equal(result.length, 1);
  assert.equal(result[0].mapPieceId, "piece-global-4");
  assert.equal(result[0].canonicalPlacementStatus, "placed");
  assert.equal(result[0].eligibilityStatus, "available");
  assert.equal(result[0].isEligible, true);
  assert.match(result[0].sourceGeometryChecksum ?? "", /^geo-fnv1a-/);
});

test("canonical joins use Map Piece IDs and remain correct when labels differ or duplicate", () => {
  const first = piece("piece-global-a", "Duplicate label", { pieceSequence: 1 });
  const second = piece("piece-global-b", "Duplicate label", { pieceSequence: 2 });
  const result = build([first, second], [placement("piece-global-b"), placement("piece-global-a")]);
  assert.deepEqual(new Set(birdsEyeEligibleMapPieceIds(result)), new Set(["piece-global-a", "piece-global-b"]));
  assert.equal(result.find((entry) => entry.mapPieceId === "piece-global-a")?.placement?.pieceId, "piece-global-a");
  assert.equal(result.find((entry) => entry.mapPieceId === "piece-global-b")?.placement?.pieceId, "piece-global-b");
});

test("loading, missing, hidden, invalid, and archived records never masquerade as available", () => {
  const saved = piece("saved");
  assert.equal(build([saved], [], { loading: true })[0].eligibilityStatus, "loading");
  assert.equal(build([saved], [])[0].eligibilityStatus, "missing_map_placement");
  assert.equal(build([saved], [placement("saved", { isVisible: false })])[0].eligibilityStatus, "hidden");
  assert.equal(build([saved], [placement("saved", { corners: { northwest: null, northeast: null, southeast: null, southwest: null }, centerLatitude: 0, centerLongitude: 0 })])[0].eligibilityStatus, "invalid_geographic_geometry");
  const archived = build([saved], [placement("saved")], { pages: [page({ archivedAt: "2026-07-31T00:00:00.000Z" })] });
  assert.equal(archived[0].eligibilityStatus, "archived");
  assert.deepEqual(birdsEyeEligibleMapPieceIds(archived), []);
});

test("canonical Birds-Eye geometry is a detached downstream copy of Map Placement", () => {
  const authoritative = placement("piece-global-4");
  const before = structuredClone(authoritative);
  const result = build([piece("piece-global-4")], [authoritative]);
  assert.ok(result[0].corners?.northwest);
  result[0].corners.northwest.latitude = 12;
  assert.deepEqual(authoritative, before);
});
