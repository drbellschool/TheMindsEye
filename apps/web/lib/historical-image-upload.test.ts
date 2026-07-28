import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalImageFinalizationToken, validateCompletedHistoricalImage, validateDeclaredUpload, verifyHistoricalImageFinalizationToken, type HistoricalImageUploadClaims } from "./historical-image-upload.ts";

process.env.HISTORICAL_IMAGE_UPLOAD_SECRET = "unit-test-upload-secret";

const claims: HistoricalImageUploadClaims = { version: 1, kind: "birds_eye_reference", assetId: "asset-1", townPackageId: "town-1", atlasId: "atlas-1", bucket: "birds-eye-references", objectPath: "town/birds-eye/asset-1/map.jpg", originalFilename: "map.jpg", declaredSize: 24, declaredMimeType: "image/jpeg", sourceRecordId: null, sheetNumber: null, sourceUrl: null, archiveName: null, rightsNote: null, intakeNotes: null, replacementAssetId: null, expiresAt: Math.floor(Date.now() / 1000) + 300 };

test("11 MB is within the Birds-Eye server limit and over-limit files fail before transfer", () => {
  assert.equal(validateDeclaredUpload({ filename: "Old_map-Texarkana-1888.jpg", mimeType: "image/jpeg", byteSize: 11 * 1024 * 1024, maxBytes: 50 * 1024 * 1024 }).ok, true);
  const rejected = validateDeclaredUpload({ filename: "huge.jpg", mimeType: "image/jpeg", byteSize: 51 * 1024 * 1024, maxBytes: 50 * 1024 * 1024 });
  assert.equal(rejected.ok, false);
  assert.match(rejected.ok ? "" : rejected.reason, /50 MB/);
});

test("finalization token binds upload scope and rejects tampering or expiry", () => {
  const token = createHistoricalImageFinalizationToken(claims);
  assert.deepEqual(verifyHistoricalImageFinalizationToken(token)?.objectPath, claims.objectPath);
  assert.equal(verifyHistoricalImageFinalizationToken(`${token}x`), null);
  const expired = createHistoricalImageFinalizationToken({ ...claims, expiresAt: 1 });
  assert.equal(verifyHistoricalImageFinalizationToken(expired), null);
});

test("final image verification checks signature, size, and dimensions", () => {
  const invalid = validateCompletedHistoricalImage(new Uint8Array(claims.declaredSize), claims, "checksum");
  assert.equal(invalid.ok, false);
  assert.match(invalid.ok ? "" : invalid.reason, /verification|signature|MIME/i);
});
