import assert from "node:assert/strict";
import test from "node:test";

import { deriveSheetMapPieceAudit } from "./sheet-map-piece-audit.ts";
import type { SanbornMapPieceRecord } from "./sanborn-atlas.ts";

function piece(pieceId: string, category = "blocks_and_lots", isPersisted = true): SanbornMapPieceRecord {
  return {
    pieceId,
    atlasPageId: "page-1",
    atlasPageRowId: "page-row-1",
    rowId: isPersisted ? `row-${pieceId}` : "",
    parentPieceId: null,
    pieceSequence: Number(pieceId.replace(/\D/g, "")) || 1,
    pieceType: "unclassified_region",
    blockNumberText: null,
    titleText: null,
    sourcePolygon: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.1, y: 0.2 }],
    sourceBBox: { minX: 0.1, minY: 0.1, maxX: 0.2, maxY: 0.2 },
    sourceGeometry: { geometryType: "polygon", points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.1, y: 0.2 }] },
    featureCategory: category as SanbornMapPieceRecord["featureCategory"],
    placementEligibility: "available",
    printedSymbolText: null,
    reviewCategories: {},
    creationMethod: "human",
    inventoryStatus: isPersisted ? "reviewed" : "draft",
    reviewStatus: "unknown",
    evidenceClassification: "unknown",
    notes: null,
    updatedAt: null,
    isPersisted,
  };
}

test("sheet audit auto-starts a category and tracks drafts", () => {
  const audit = deriveSheetMapPieceAudit({ pieces: [piece("piece-1", "blocks_and_lots", false)] });
  const blocks = audit.categories.find((category) => category.category === "blocks_and_lots");
  assert.equal(blocks?.reviewStatus, "in_progress");
  assert.equal(blocks?.workStarted, true);
  assert.equal(blocks?.draftObjectCount, 1);
  assert.equal(audit.complete, false);
});

test("sheet audit requires an explicit conclusion and excludes retired streets", () => {
  const audit = deriveSheetMapPieceAudit({
    pieces: [piece("piece-1")],
    reviewCategories: { blocks_and_lots: "reviewed_found", wells: "reviewed_none_found" },
  });
  assert.equal(audit.categories.some((category) => category.category === "streets_and_intersections"), false);
  assert.equal(audit.categories.find((category) => category.category === "blocks_and_lots")?.reviewComplete, true);
  assert.equal(audit.categories.find((category) => category.category === "wells")?.reviewComplete, true);
  assert.equal(audit.complete, false);
});

test("reviewed categories reopen when evidence changes", () => {
  const audit = deriveSheetMapPieceAudit({
    pieces: [piece("piece-1"), piece("piece-2")],
    reviewCategories: { blocks_and_lots: "reviewed_found" },
    reviewedObjectCounts: { blocks_and_lots: 1 },
  });
  const blocks = audit.categories.find((category) => category.category === "blocks_and_lots");
  assert.equal(blocks?.reviewStatus, "in_progress");
  assert.equal(blocks?.changedSinceReview, true);
  assert.equal(blocks?.reviewComplete, false);
});
