import assert from "node:assert/strict";
import test from "node:test";

import { deriveReconstructionTaskLedger } from "./reconstruction-task-ledger.ts";
import { normalizeSanbornMapPieceGeoreference } from "./sanborn-map-piece-georeference.ts";

function page(pageId: string, overrides: Record<string, unknown> = {}) {
  return {
    pageId,
    atlasId: "atlas-1888",
    sanbornSheetAssetId: `${pageId}-asset`,
    pageType: "sanborn_sheet",
    pageSequence: 1,
    sheetNumber: 1,
    printedReference: "1",
    isPrimaryTownIndex: false,
    archivedAt: null,
    reviewCategories: {},
    ...overrides,
  } as any;
}

function asset(assetId: string, sourceRecordId: string | null = "source-1") {
  return { assetId, originalFilename: `${assetId}.png`, sourceRecordId } as any;
}

function piece(pieceId: string, pageId = "page-1", overrides: Record<string, unknown> = {}) {
  return {
    pieceId,
    atlasPageId: pageId,
    pieceSequence: 1,
    titleText: pieceId,
    blockNumberText: null,
    pieceType: "regular_block",
    isPersisted: true,
    inventoryStatus: "draft",
    reviewStatus: "unknown",
    placementEligibility: "available",
    ...overrides,
  } as any;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    town: { id: "town-1", name: "Example Town" } as any,
    atlas: { atlasId: "atlas-1888", editionYear: 1888, archivedAt: null } as any,
    pages: [page("page-1")],
    assets: [asset("page-1-asset")],
    regions: [],
    pieces: [piece("Block 1")],
    placements: [],
    sourceOptions: [{ sourceRecordId: "source-1" }] as any,
    currentStage: "map_placement" as const,
    ...overrides,
  };
}

test("ledger denominator expands when a new geographic object is discovered", () => {
  const before = deriveReconstructionTaskLedger(input());
  const after = deriveReconstructionTaskLedger(input({ pieces: [piece("Block 1"), piece("Hydrant 1", "page-1", { titleText: "Hydrant 1", featureCategory: "hydrants", sourceGeometry: { geometryType: "point", points: [{ x: 0.2, y: 0.2 }] } })] }));
  assert.equal(after.tasks.filter((task) => task.id.startsWith("placement:")).length, before.tasks.filter((task) => task.id.startsWith("placement:")).length + 1);
  assert.ok(after.overall.required > before.overall.required);
});

test("explicit reviewed-none-found resolves a sheet category", () => {
  const unresolved = deriveReconstructionTaskLedger(input({ pages: [page("page-1", { reviewCategories: {} })], pieces: [] }));
  const resolved = deriveReconstructionTaskLedger(input({ pages: [page("page-1", { reviewCategories: { wells: "reviewed_none_found" } })], pieces: [] }));
  assert.equal(unresolved.tasks.some((task) => task.id === "sheet-category:page-1:wells"), true);
  assert.equal(resolved.tasks.some((task) => task.id === "sheet-category:page-1:wells"), false);
});

test("unable-to-place is an exception only after a reason is saved", () => {
  const base = normalizeSanbornMapPieceGeoreference({ pieceId: "Block 1", atlasPageId: "page-1", targetGeometry: "point", geographicGeometry: { geometryType: "point", coordinates: [{ latitude: 33.43, longitude: -94.04 }] }, placementStatus: "unable_to_place" });
  const unresolved = deriveReconstructionTaskLedger(input({ placements: [base] }));
  const resolved = deriveReconstructionTaskLedger(input({ placements: [{ ...base, unableToPlaceReason: "Obscured by missing source detail" }] }));
  assert.equal(unresolved.tasks.find((task) => task.id === "placement:Block 1")?.resolved, false);
  assert.equal(resolved.tasks.find((task) => task.id === "placement:Block 1")?.state, "exception");
  assert.equal(resolved.tasks.find((task) => task.id === "placement:Block 1")?.resolved, true);
});

test("next incomplete task follows workflow order and archived pages do not contribute", () => {
  const ledger = deriveReconstructionTaskLedger(input({ pages: [page("page-1", { pageType: "unknown" }), page("archived", { archivedAt: "2026-01-01T00:00:00Z" })], pieces: [piece("Block 1"), piece("Archived", "archived")] }));
  assert.equal(ledger.nextIncompleteTask?.id, "source-classify:page-1");
  assert.equal(ledger.tasks.some((task) => task.label.includes("Archived")), false);
});

test("repeated derivation is idempotent and produces stable task IDs", () => {
  const first = deriveReconstructionTaskLedger(input()).tasks.map((task) => task.id);
  const second = deriveReconstructionTaskLedger(input()).tasks.map((task) => task.id);
  assert.deepEqual(second, first);
  assert.equal(new Set(first).size, first.length);
});
