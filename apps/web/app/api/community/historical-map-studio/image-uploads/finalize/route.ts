import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildDefaultSanbornPageId, normalizeOptionalSanbornText } from "@/lib/sanborn-atlas";
import { buildSanbornStoragePath, detectSanbornMimeType, normalizeSanbornSheetNumber, readSanbornImageDimensions, sanbornDefaultEvidenceClassification, sanbornDefaultMaxUploadBytes, sanbornDefaultReviewStatus, sanbornSheetBucket, sanitizeSanbornFilename } from "@/lib/sanborn-intake";
import { validateCompletedHistoricalImage, verifyHistoricalImageFinalizationToken, type HistoricalImageUploadClaims, type ValidatedHistoricalImage } from "@/lib/historical-image-upload";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

function signedViewingUrl(supabase: any, bucket: string, path: string) {
  return supabase.storage.from(bucket).createSignedUrl(path, 3600);
}

async function removeUploadedObject(supabase: any, claims: HistoricalImageUploadClaims) {
  await supabase.storage.from(claims.bucket).remove([claims.objectPath]);
}

async function finalizeBirdsEye(supabase: any, town: { id: string }, claims: HistoricalImageUploadClaims, image: ValidatedHistoricalImage) {
  const insert = await supabase.from("historical_map_birds_eye_reference_assets").insert({ asset_id: claims.assetId, town_package_id: town.id, source_record_id: claims.sourceRecordId, original_filename: claims.originalFilename, storage_bucket: claims.bucket, storage_path: claims.objectPath, mime_type: image.mimeType, byte_size: image.byteSize, width: image.width, height: image.height, sha256_checksum: image.checksum, evidence_classification: "unknown", review_status: "unknown", intake_notes: claims.intakeNotes ?? "Uploaded as a historical Birds-Eye reference; requires human calibration review." }).select("id, asset_id, town_package_id, source_record_id, original_filename, storage_bucket, storage_path, mime_type, byte_size, width, height, sha256_checksum, evidence_classification, review_status, rights_note, intake_notes, created_at, updated_at").single();
  if (insert.error) return { ok: false as const, response: jsonError(502, "Upload complete; asset registration failed. Retry registration without re-uploading the image.", { code: "metadata_registration_failed", retryable: true }) };
  const signed = await signedViewingUrl(supabase, claims.bucket, claims.objectPath);
  return { ok: true as const, asset: { ...insert.data, signed_url: signed.error ? null : signed.data?.signedUrl ?? null } };
}

async function finalizeSanborn(supabase: any, town: { id: string; package_id: string }, claims: HistoricalImageUploadClaims, image: ValidatedHistoricalImage) {
  const replacement = claims.replacementAssetId ? await supabase.from("sanborn_sheet_assets").select("id, asset_id, town_package_id, storage_bucket, storage_path, width, height, sheet_number, source_record_id, map_layer_id").eq("asset_id", claims.replacementAssetId).eq("town_package_id", town.id).maybeSingle() : { data: null, error: null };
  if (replacement.error || (claims.replacementAssetId && !replacement.data)) return { ok: false as const, response: jsonError(400, "The replacement asset could not be resolved for this town.", { code: "wrong_town" }) };
  const duplicateChecksum = await supabase.from("sanborn_sheet_assets").select("asset_id, original_filename, sheet_number").eq("town_package_id", town.id).eq("sha256_checksum", image.checksum).neq("id", replacement.data?.id ?? "00000000-0000-0000-0000-000000000000").limit(1).maybeSingle();
  if (duplicateChecksum.error) return { ok: false as const, response: jsonError(503, "Sanborn duplicate checksum validation failed.", { code: "metadata_validation_failed" }) };
  if (duplicateChecksum.data) return { ok: false as const, response: jsonError(409, "A duplicate Sanborn image already exists for this town.", { code: "duplicate_checksum", duplicate: duplicateChecksum.data }) };
  const sheetNumber = replacement.data?.sheet_number ?? normalizeSanbornSheetNumber(claims.sheetNumber);
  if (!sheetNumber) return { ok: false as const, response: jsonError(400, "Assign a positive sheet number before finalizing the Sanborn image.", { code: "request_validation" }) };
  let atlasScope: { id: string; atlas_id: string; edition_year: number; volume_label: string | null } | null = null;
  if (claims.atlasId) {
    const atlas = await supabase.from("sanborn_atlases").select("id, atlas_id, edition_year, volume_label, town_package_id").eq("atlas_id", claims.atlasId).is("archived_at", null).maybeSingle();
    if (atlas.error || !atlas.data || atlas.data.town_package_id !== town.id) return { ok: false as const, response: jsonError(400, "The selected edition no longer belongs to the active town.", { code: "wrong_edition" }) };
    atlasScope = atlas.data;
    if (!replacement.data) {
      const duplicateSheet = await supabase.from("sanborn_atlas_pages").select("page_id").eq("atlas_id", atlas.data.id).eq("sheet_number", sheetNumber).limit(1).maybeSingle();
      if (duplicateSheet.error) return { ok: false as const, response: jsonError(503, "Sanborn sheet-number validation failed.", { code: "metadata_validation_failed" }) };
      if (duplicateSheet.data) return { ok: false as const, response: jsonError(409, "A Sanborn image is already stored for this sheet number.", { code: "duplicate_sheet_number" }) };
    }
  }
  const source = claims.sourceRecordId ? await supabase.from("source_records").select("id, source_url, archive_name, rights_note").eq("id", claims.sourceRecordId).eq("town_package_id", town.id).maybeSingle() : { data: null, error: null };
  if (source.error || (claims.sourceRecordId && !source.data)) return { ok: false as const, response: jsonError(400, "The selected source record is not available for this town.", { code: "wrong_town" }) };
  const mapLayer = await supabase.from("map_layers").select("id").eq("town_package_id", town.id).eq("sheet_number", sheetNumber).limit(1).maybeSingle();
  if (mapLayer.error) return { ok: false as const, response: jsonError(503, "The matching map layer could not be checked.", { code: "metadata_validation_failed" }) };
  if (replacement.data) {
    const update = await supabase.from("sanborn_sheet_assets").update({ original_filename: claims.originalFilename, storage_path: claims.objectPath, mime_type: image.mimeType, byte_size: image.byteSize, width: image.width, height: image.height, sha256_checksum: image.checksum, updated_at: new Date().toISOString() }).eq("id", replacement.data.id);
    if (update.error) return { ok: false as const, response: jsonError(502, "Upload complete; asset registration failed. Retry registration without re-uploading the image.", { code: "metadata_registration_failed", retryable: true }) };
    if (replacement.data.storage_path !== claims.objectPath) await supabase.storage.from(replacement.data.storage_bucket).remove([replacement.data.storage_path]);
    const signed = await signedViewingUrl(supabase, claims.bucket, claims.objectPath);
    return { ok: true as const, asset: { assetId: replacement.data.asset_id, originalFilename: claims.originalFilename, storagePath: claims.objectPath, mimeType: image.mimeType, byteSize: image.byteSize, width: image.width, height: image.height, checksum: image.checksum, signedUrl: signed.error ? null : signed.data?.signedUrl ?? null } };
  }
  const insert = await supabase.from("sanborn_sheet_assets").insert({ asset_id: claims.assetId, town_package_id: town.id, source_record_id: source.data?.id ?? null, map_layer_id: mapLayer.data?.id ?? null, sheet_number: sheetNumber, original_filename: claims.originalFilename, storage_bucket: sanbornSheetBucket, storage_path: claims.objectPath, mime_type: image.mimeType, byte_size: image.byteSize, width: image.width, height: image.height, sha256_checksum: image.checksum, source_url: claims.sourceUrl ?? source.data?.source_url ?? null, archive_name: claims.archiveName ?? source.data?.archive_name ?? null, rights_note: claims.rightsNote ?? source.data?.rights_note ?? null, evidence_classification: sanbornDefaultEvidenceClassification, review_status: sanbornDefaultReviewStatus, intake_notes: claims.intakeNotes, uploaded_at: new Date().toISOString() }).select("id, asset_id, uploaded_at").single();
  if (insert.error) return { ok: false as const, response: jsonError(502, "Upload complete; asset registration failed. Retry registration without re-uploading the image.", { code: "metadata_registration_failed", retryable: true }) };
  let pageId: string | null = null;
  if (atlasScope) {
    const sequence = await supabase.from("sanborn_atlas_pages").select("page_sequence").eq("atlas_id", atlasScope.id).order("page_sequence", { ascending: false }).limit(1).maybeSingle();
    if (sequence.error) return { ok: false as const, response: jsonError(502, "Upload complete; asset registration failed while assigning its edition page. Retry registration.", { code: "metadata_registration_failed", retryable: true }) };
    pageId = buildDefaultSanbornPageId({ atlasId: atlasScope.atlas_id, assetId: claims.assetId });
    const page = await supabase.from("sanborn_atlas_pages").insert({ page_id: pageId, atlas_id: atlasScope.id, sanborn_sheet_asset_id: insert.data.id, page_sequence: (sequence.data?.page_sequence ?? 0) + 1, page_type: "unknown", sheet_number: sheetNumber, printed_reference: String(sheetNumber), volume_label: atlasScope.volume_label, display_label: claims.originalFilename });
    if (page.error) return { ok: false as const, response: jsonError(502, "Upload complete; asset registration failed while assigning its edition page. Retry registration.", { code: "metadata_registration_failed", retryable: true }) };
  }
  const signed = await signedViewingUrl(supabase, sanbornSheetBucket, claims.objectPath);
  return { ok: true as const, asset: { rowId: insert.data.id, assetId: claims.assetId, sheetNumber, originalFilename: claims.originalFilename, safeFilename: sanitizeSanbornFilename(claims.originalFilename), byteSize: image.byteSize, width: image.width, height: image.height, checksum: image.checksum, storageBucket: sanbornSheetBucket, storagePath: claims.objectPath, evidenceClassification: sanbornDefaultEvidenceClassification, reviewStatus: sanbornDefaultReviewStatus, uploadedAt: insert.data.uploaded_at, signedUrl: signed.error ? null : signed.data?.signedUrl ?? null }, atlasId: atlasScope?.atlas_id ?? null, editionYear: atlasScope?.edition_year ?? null, pageId };
}

export async function POST(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as { finalizationToken?: string } | null;
  const claims = body?.finalizationToken ? verifyHistoricalImageFinalizationToken(body.finalizationToken) : null;
  if (!claims) return jsonError(401, "The upload finalization authorization is invalid or expired.", { code: "finalization_token" });
  const town = await getRequestedTownPackage(access.supabase, claims.townPackageId);
  if (town.error || !town.data || town.data.id !== claims.townPackageId) return jsonError(403, "The upload does not belong to the active town.", { code: "wrong_town" });
  const download = await access.supabase.storage.from(claims.bucket).download(claims.objectPath);
  if (download.error || !download.data) return jsonError(409, "Upload has not completed at the prepared storage path.", { code: "object_missing", retryable: true });
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const checksum = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const image = validateCompletedHistoricalImage(bytes, claims, checksum);
  if (!image.ok) {
    await removeUploadedObject(access.supabase, claims);
    return jsonError(400, image.reason, { code: "image_validation_failed" });
  }
  const result = claims.kind === "birds_eye_reference" ? await finalizeBirdsEye(access.supabase, town.data, claims, image) : await finalizeSanborn(access.supabase, town.data, claims, image);
  if (!result.ok) return result.response;
  return NextResponse.json({ ok: true, kind: claims.kind, asset: result.asset, atlasId: "atlasId" in result ? result.atlasId : null, editionYear: "editionYear" in result ? result.editionYear : null, pageId: "pageId" in result ? result.pageId : null });
}
