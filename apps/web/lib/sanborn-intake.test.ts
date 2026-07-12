import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSanbornIntakeState,
  buildSanbornStoragePath,
  createEmptySanbornIntakeState,
  findDuplicateChecksums,
  findDuplicateSheetNumbers,
  findMissingSheetNumbers,
  sanbornDefaultEvidenceClassification,
  sanbornDefaultReviewStatus,
  sanitizeSanbornFilename,
  validateSanbornFileInput,
  type SanbornSheetAssetSummary,
} from "./sanborn-intake.ts";

function asset(overrides: Partial<SanbornSheetAssetSummary>): SanbornSheetAssetSummary {
  return {
    assetId: "asset-1",
    sheetNumber: 1,
    originalFilename: "sheet-1.png",
    byteSize: 1024,
    width: 100,
    height: 100,
    checksum: "a".repeat(64),
    sourceRecordId: null,
    sourceId: null,
    sourceTitle: null,
    sourceUrl: null,
    archiveName: null,
    rightsNote: null,
    evidenceClassification: "unknown",
    reviewStatus: "unknown",
    intakeNotes: null,
    uploadedAt: null,
    ...overrides,
  };
}

test("validates supported Sanborn image file types", () => {
  assert.equal(validateSanbornFileInput({ filename: "sheet.png", mimeType: "image/png", byteSize: 10 }).ok, true);
  assert.equal(validateSanbornFileInput({ filename: "sheet.jpg", mimeType: "image/jpeg", byteSize: 10 }).ok, true);
  assert.equal(validateSanbornFileInput({ filename: "sheet.jpeg", mimeType: "image/jpeg", byteSize: 10 }).ok, true);
  assert.equal(validateSanbornFileInput({ filename: "sheet.webp", mimeType: "image/webp", byteSize: 10 }).ok, true);
});

test("rejects unsupported Sanborn image files", () => {
  const pdfResult = validateSanbornFileInput({ filename: "sheet.pdf", mimeType: "application/pdf", byteSize: 10 });
  const mismatchedResult = validateSanbornFileInput({ filename: "sheet.png", mimeType: "image/jpeg", byteSize: 10 });
  const emptyResult = validateSanbornFileInput({ filename: "sheet.png", mimeType: "image/png", byteSize: 0 });

  assert.equal(pdfResult.ok, false);
  assert.equal(mismatchedResult.ok, false);
  assert.equal(emptyResult.ok, false);
});

test("sanitizes original filenames without trusting path input", () => {
  assert.equal(sanitizeSanbornFilename("..\\Texarkana Sheet 01 @ LOC.png"), "Texarkana-Sheet-01-LOC.png");
  assert.equal(sanitizeSanbornFilename("../../"), "sanborn-sheet");
});

test("builds controlled storage paths", () => {
  assert.equal(
    buildSanbornStoragePath({
      townPackageId: "Texarkana 1885!",
      assetId: "Asset:01",
      originalFilename: "../Sheet 1.png",
    }),
    "texarkana-1885/sanborn-sheets/asset-01/Sheet-1.png",
  );
});

test("defaults new Sanborn intake classifications to unknown", () => {
  assert.equal(sanbornDefaultEvidenceClassification, "unknown");
  assert.equal(sanbornDefaultReviewStatus, "unknown");
});

test("detects duplicate checksums", () => {
  assert.deepEqual(findDuplicateChecksums(["a".repeat(64), "b".repeat(64), "a".repeat(64), null]), ["a".repeat(64)]);
});

test("detects duplicate sheet numbers", () => {
  assert.deepEqual(findDuplicateSheetNumbers([1, "2", "2", null, "not-a-number", 3, 3]), [2, 3]);
});

test("detects missing sheets inside the expected sheet range", () => {
  assert.deepEqual(findMissingSheetNumbers([1, 3, 6], 6), [2, 4, 5]);
});

test("builds an empty intake state without crashing", () => {
  const state = buildSanbornIntakeState({
    mode: "write_enabled",
    bucketName: "sanborn-sheets",
    maxUploadBytes: 1024,
    townPackage: {
      id: "town-1",
      packageId: "texarkana_1885",
      name: "Texarkana",
      region: "Texas / Arkansas",
      year: 1885,
    },
    activeMapYear: 1885,
    expectedSheetCount: 0,
    existingAssets: [],
    sourceOptions: [],
  });

  assert.equal(state.uploadedSheetCount, 0);
  assert.deepEqual(state.duplicateSheetNumbers, []);
  assert.deepEqual(state.missingSheetNumbers, []);
});

test("marks Supabase-unavailable intake state as read-only", () => {
  const state = createEmptySanbornIntakeState({ warningMessage: "Supabase unavailable." });

  assert.equal(state.mode, "read_only");
  assert.equal(state.warningMessage, "Supabase unavailable.");
  assert.equal(state.uploadedSheetCount, 0);
});

test("summarizes duplicate and missing sheets from stored assets", () => {
  const state = buildSanbornIntakeState({
    mode: "write_enabled",
    bucketName: "sanborn-sheets",
    maxUploadBytes: 1024,
    townPackage: {
      id: "town-1",
      packageId: "texarkana_1885",
      name: "Texarkana",
      region: "Texas / Arkansas",
      year: 1885,
    },
    activeMapYear: 1885,
    expectedSheetCount: 4,
    existingAssets: [asset({ assetId: "asset-1", sheetNumber: 1 }), asset({ assetId: "asset-2", sheetNumber: 1 }), asset({ assetId: "asset-3", sheetNumber: 3 })],
    sourceOptions: [],
  });

  assert.equal(state.uploadedSheetCount, 3);
  assert.deepEqual(state.duplicateSheetNumbers, [1]);
  assert.deepEqual(state.missingSheetNumbers, [2, 4]);
});
