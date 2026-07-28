import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildSanbornReplacementStoragePath, buildSanbornStoragePath, sanbornDefaultMaxUploadBytes, sanbornSheetBucket } from "@/lib/sanborn-intake";
import { createHistoricalImageFinalizationToken, historicalImageUploadKinds, validateDeclaredUpload, type HistoricalImageUploadKind } from "@/lib/historical-image-upload";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

const birdsEyeBucket = "birds-eye-references";
const birdsEyeMaxUploadBytes = 50 * 1024 * 1024;
const tokenLifetimeSeconds = 30 * 60;

function optionalText(value: unknown, max = 2000): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function configuredProjectId(): string | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try { return new URL(url).hostname.split(".")[0] || null; } catch { return null; }
}

export async function POST(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const kind = body?.kind as HistoricalImageUploadKind;
  if (!historicalImageUploadKinds.includes(kind)) return jsonError(400, "The image upload kind is not supported.");
  const requestedTown = await getRequestedTownPackage(access.supabase, typeof body?.townPackageId === "string" ? body.townPackageId : null);
  if (requestedTown.error || !requestedTown.data) return jsonError(400, "The town package could not be verified for upload.");
  const town = requestedTown.data;
  const replacementAssetId = optionalText(body?.replacementAssetId, 160);
  let atlas: { id: string; atlasId: string; editionYear: number; volumeLabel: string | null } | null = null;
  if (typeof body?.atlasId === "string" && body.atlasId.trim()) {
    const result = await access.supabase.from("sanborn_atlases").select("id, atlas_id, edition_year, volume_label, town_package_id").eq("atlas_id", body.atlasId.trim()).is("archived_at", null).maybeSingle();
    if (result.error) return jsonError(503, "The selected edition could not be verified before upload.");
    if (!result.data || result.data.town_package_id !== town.id) return jsonError(400, "The selected edition does not belong to the active town.");
    atlas = { id: result.data.id, atlasId: result.data.atlas_id, editionYear: result.data.edition_year, volumeLabel: result.data.volume_label };
  }
  const validation = validateDeclaredUpload({ filename: body?.filename, mimeType: body?.mimeType, byteSize: body?.byteSize, maxBytes: kind === "birds_eye_reference" ? birdsEyeMaxUploadBytes : Number.parseInt(process.env.SANBORN_MAX_UPLOAD_BYTES ?? "", 10) || sanbornDefaultMaxUploadBytes });
  if (!validation.ok) return jsonError(400, validation.reason, { code: "request_validation" });
  const sourceRecordId = optionalText(body?.sourceRecordId, 160);
  if (sourceRecordId) {
    const source = await access.supabase.from("source_records").select("id").eq("id", sourceRecordId).eq("town_package_id", town.id).maybeSingle();
    if (source.error) return jsonError(503, "The source record could not be verified before upload.");
    if (!source.data) return jsonError(400, "The source record does not belong to the active town.");
  }
  if (replacementAssetId) {
    if (kind !== "sanborn_sheet") return jsonError(400, "Only Sanborn sheets can be replaced through this upload pipeline.");
    const asset = await access.supabase.from("sanborn_sheet_assets").select("asset_id, town_package_id").eq("asset_id", replacementAssetId).maybeSingle();
    if (asset.error || !asset.data || asset.data.town_package_id !== town.id) return jsonError(400, "The replacement asset does not belong to the active town.");
  }
  const bucket = kind === "birds_eye_reference" ? birdsEyeBucket : sanbornSheetBucket;
  const bucketResult = await access.supabase.storage.getBucket(bucket);
  if (bucketResult.error || !bucketResult.data) {
    return jsonError(503, kind === "birds_eye_reference" ? "Birds-Eye storage is not configured. Apply migration 0025_birds_eye_perspective_calibration.sql." : `Sanborn uploads are disabled because the ${bucket} Storage bucket is unavailable.`, { code: "bucket_unavailable" });
  }
  const assetId = replacementAssetId ?? randomUUID();
  const storagePath = replacementAssetId
    ? buildSanbornReplacementStoragePath({ townPackageId: town.package_id, assetId, replacementId: randomUUID(), originalFilename: validation.filename })
    : kind === "birds_eye_reference"
      ? `${town.package_id}/birds-eye/${assetId}/${validation.filename}`
      : buildSanbornStoragePath({ townPackageId: town.package_id, assetId, originalFilename: validation.filename });
  const signed = await access.supabase.storage.from(bucket).createSignedUploadUrl(storagePath, { upsert: false });
  if (signed.error || !signed.data?.token) return jsonError(503, "Secure upload preparation failed.", { code: "signed_upload_token" });
  const claims = { version: 1 as const, kind, assetId, townPackageId: town.id, atlasId: atlas?.atlasId ?? null, bucket, objectPath: storagePath, originalFilename: validation.filename, declaredSize: validation.byteSize, declaredMimeType: validation.mimeType, sourceRecordId, sheetNumber: Number.isInteger(Number(body?.sheetNumber)) ? Number(body?.sheetNumber) : null, sourceUrl: optionalText(body?.sourceUrl), archiveName: optionalText(body?.archiveName), rightsNote: optionalText(body?.rightsNote), intakeNotes: optionalText(body?.intakeNotes), replacementAssetId, expiresAt: Math.floor(Date.now() / 1000) + tokenLifetimeSeconds };
  const finalizationToken = createHistoricalImageFinalizationToken(claims);
  const projectId = configuredProjectId();
  if (!projectId) return jsonError(503, "Secure upload preparation failed because Supabase storage is not configured.");
  return NextResponse.json({ ok: true, upload: { projectId, endpoint: `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`, bucket, objectPath: storagePath, uploadToken: signed.data.token, finalizationToken, expiresAt: claims.expiresAt, assetId, kind, maxBytes: kind === "birds_eye_reference" ? birdsEyeMaxUploadBytes : Number.parseInt(process.env.SANBORN_MAX_UPLOAD_BYTES ?? "", 10) || sanbornDefaultMaxUploadBytes } });
}
