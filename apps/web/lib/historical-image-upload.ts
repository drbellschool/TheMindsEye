import { createHmac, timingSafeEqual } from "node:crypto";

import { detectSanbornMimeType, readSanbornImageDimensions, sanitizeSanbornFilename } from "./sanborn-intake.ts";

export const historicalImageUploadKinds = ["sanborn_sheet", "birds_eye_reference"] as const;
export type HistoricalImageUploadKind = (typeof historicalImageUploadKinds)[number];

export const historicalImageUploadMimes = ["image/jpeg", "image/png", "image/webp"] as const;
export type HistoricalImageUploadMime = (typeof historicalImageUploadMimes)[number];

export type HistoricalImageUploadClaims = {
  version: 1;
  kind: HistoricalImageUploadKind;
  assetId: string;
  townPackageId: string;
  atlasId: string | null;
  bucket: string;
  objectPath: string;
  originalFilename: string;
  declaredSize: number;
  declaredMimeType: HistoricalImageUploadMime;
  sourceRecordId: string | null;
  sheetNumber: number | null;
  sourceUrl: string | null;
  archiveName: string | null;
  rightsNote: string | null;
  intakeNotes: string | null;
  replacementAssetId?: string | null;
  expiresAt: number;
};

export type ValidatedHistoricalImage = {
  ok: true;
  mimeType: HistoricalImageUploadMime;
  byteSize: number;
  width: number;
  height: number;
  checksum: string;
  bytes: Uint8Array;
};

function signingSecret(): string {
  const secret = process.env.HISTORICAL_IMAGE_UPLOAD_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Historical image upload signing secret is not configured.");
  return secret;
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

export function createHistoricalImageFinalizationToken(claims: HistoricalImageUploadClaims): string {
  const encoded = base64url(JSON.stringify(claims));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyHistoricalImageFinalizationToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): HistoricalImageUploadClaims | null {
  try {
    const [encoded, providedSignature] = token.split(".");
    if (!encoded || !providedSignature) return null;
    const expectedSignature = sign(encoded);
    const provided = Buffer.from(providedSignature, "base64url");
    const expected = Buffer.from(expectedSignature, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    const claims = JSON.parse(decodeBase64url(encoded)) as Partial<HistoricalImageUploadClaims>;
    if (claims.version !== 1 || !historicalImageUploadKinds.includes(claims.kind as HistoricalImageUploadKind)) return null;
    if (!claims.assetId || !claims.townPackageId || !claims.bucket || !claims.objectPath || typeof claims.expiresAt !== "number" || claims.expiresAt <= nowSeconds) return null;
    if (typeof claims.declaredSize !== "number" || !Number.isSafeInteger(claims.declaredSize) || claims.declaredSize <= 0 || !historicalImageUploadMimes.includes(claims.declaredMimeType as HistoricalImageUploadMime)) return null;
    return claims as HistoricalImageUploadClaims;
  } catch {
    return null;
  }
}

export function normalizeUploadFilename(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 240) return null;
  const filename = sanitizeSanbornFilename(value.trim());
  return filename && filename !== "." ? filename : null;
}

export function normalizeUploadMime(value: unknown): HistoricalImageUploadMime | null {
  return typeof value === "string" && historicalImageUploadMimes.includes(value as HistoricalImageUploadMime) ? value as HistoricalImageUploadMime : null;
}

export function validateDeclaredUpload(input: { filename: unknown; mimeType: unknown; byteSize: unknown; maxBytes: number }): { ok: true; filename: string; mimeType: HistoricalImageUploadMime; byteSize: number } | { ok: false; reason: string } {
  const filename = normalizeUploadFilename(input.filename);
  if (!filename) return { ok: false, reason: "Choose a valid image filename." };
  const mimeType = normalizeUploadMime(input.mimeType);
  if (!mimeType) return { ok: false, reason: "This image type is not supported. Use JPEG, PNG, or WebP." };
  const byteSize = Number(input.byteSize);
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) return { ok: false, reason: "The image file is empty or has an invalid size." };
  if (byteSize > input.maxBytes) return { ok: false, reason: `File exceeds the ${Math.round(input.maxBytes / 1024 / 1024)} MB limit.` };
  return { ok: true, filename, mimeType, byteSize };
}

export function validateCompletedHistoricalImage(bytes: Uint8Array, claims: HistoricalImageUploadClaims, checksum: string): ValidatedHistoricalImage | { ok: false; reason: string } {
  if (bytes.byteLength !== claims.declaredSize) return { ok: false, reason: "Uploaded image size does not match the prepared upload." };
  const actualMimeType = detectSanbornMimeType(bytes);
  if (!actualMimeType || actualMimeType !== claims.declaredMimeType) return { ok: false, reason: "Upload completed, but image verification failed: the file signature or MIME type did not match." };
  const dimensions = readSanbornImageDimensions(bytes, actualMimeType);
  if (!dimensions) return { ok: false, reason: "Upload completed, but image verification failed: dimensions could not be read." };
  return { ok: true, mimeType: actualMimeType, byteSize: bytes.byteLength, width: dimensions.width, height: dimensions.height, checksum, bytes };
}
