import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  buildSanbornStoragePath,
  detectSanbornMimeType,
  normalizeSanbornSheetNumber,
  readSanbornImageDimensions,
  sanbornDefaultEvidenceClassification,
  sanbornDefaultMaxUploadBytes,
  sanbornDefaultReviewStatus,
  sanbornSheetBucket,
  sanitizeSanbornFilename,
  validateSanbornFileInput,
} from "@/lib/sanborn-intake";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type TownPackageRow = { id: string; package_id: string };
type SourceRecordRow = { id: string; source_url: string | null; archive_name: string | null; rights_note: string | null };
type MapLayerRow = { id: string };
type SanbornDuplicateRow = { asset_id: string; original_filename: string; sheet_number: number | null };

function getMaxUploadBytes(): number {
  const configured = Number.parseInt(process.env.SANBORN_MAX_UPLOAD_BYTES ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : sanbornDefaultMaxUploadBytes;
}

function readFormString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalText(value: string | null): string | null {
  return value ? value.slice(0, 2000) : null;
}

async function getSourceRecord(supabase: any, townPackageId: string, sourceRecordId: string | null) {
  if (!sourceRecordId) return { data: null, error: null };
  return supabase
    .from("source_records")
    .select("id, source_url, archive_name, rights_note")
    .eq("id", sourceRecordId)
    .eq("town_package_id", townPackageId)
    .maybeSingle();
}

async function getMapLayerForSheet(supabase: any, townPackageId: string, sheetNumber: number) {
  return supabase.from("map_layers").select("id").eq("town_package_id", townPackageId).eq("sheet_number", sheetNumber).limit(1).maybeSingle();
}

export async function POST(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;
  const { supabase } = access;

  const bucketResult = await supabase.storage.getBucket(sanbornSheetBucket);
  if (bucketResult.error || !bucketResult.data) {
    return jsonError(503, `Sanborn uploads are disabled because the ${sanbornSheetBucket} Storage bucket is unavailable.`);
  }

  const formData = await request.formData();
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) return jsonError(400, "Attach one Sanborn image file before saving.");

  const arrayBuffer = await fileEntry.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const detectedMimeType = detectSanbornMimeType(bytes);
  if (!detectedMimeType) return jsonError(400, "The uploaded file contents are not a supported PNG, JPEG, or WebP image.");
  if (fileEntry.type && fileEntry.type !== detectedMimeType) {
    return jsonError(400, "The browser-reported MIME type does not match the uploaded image contents.");
  }

  const validation = validateSanbornFileInput({ filename: fileEntry.name, mimeType: detectedMimeType, byteSize: fileEntry.size, maxBytes: getMaxUploadBytes() });
  if (!validation.ok) return jsonError(400, validation.reason);

  const dimensions = readSanbornImageDimensions(bytes, detectedMimeType);
  if (!dimensions) return jsonError(400, "The uploaded image dimensions could not be read safely.");

  const sheetNumber = normalizeSanbornSheetNumber(readFormString(formData, "sheetNumber"));
  if (!sheetNumber) return jsonError(400, "Assign a positive sheet number before saving.");

  const requestedTownPackageId = readFormString(formData, "townPackageId");
  const townPackageResult = await getRequestedTownPackage(supabase, requestedTownPackageId);
  if (townPackageResult.error || !townPackageResult.data) return jsonError(503, "No active town package is available for Sanborn intake.");

  const townPackage = townPackageResult.data as TownPackageRow;
  const checksum = createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");

  const duplicateChecksumResult = await supabase
    .from("sanborn_sheet_assets")
    .select("asset_id, original_filename, sheet_number")
    .eq("town_package_id", townPackage.id)
    .eq("sha256_checksum", checksum)
    .limit(1)
    .maybeSingle();
  if (duplicateChecksumResult.error) return jsonError(503, "Sanborn metadata could not be checked for duplicate checksums.");
  if (duplicateChecksumResult.data) return jsonError(409, "This Sanborn image already exists in the intake workspace.", { code: "duplicate_checksum", duplicate: duplicateChecksumResult.data });

  const duplicateSheetResult = await supabase
    .from("sanborn_sheet_assets")
    .select("asset_id, original_filename, sheet_number")
    .eq("town_package_id", townPackage.id)
    .eq("sheet_number", sheetNumber)
    .limit(1)
    .maybeSingle();
  if (duplicateSheetResult.error) return jsonError(503, "Sanborn metadata could not be checked for duplicate sheet numbers.");
  if (duplicateSheetResult.data) return jsonError(409, "A Sanborn image is already stored for this sheet number.", { code: "duplicate_sheet_number", duplicate: duplicateSheetResult.data });

  const sourceRecordId = readFormString(formData, "sourceRecordId");
  const sourceRecordResult = await getSourceRecord(supabase, townPackage.id, sourceRecordId);
  if (sourceRecordResult.error) return jsonError(503, "The selected source record could not be verified.");
  if (sourceRecordId && !sourceRecordResult.data) return jsonError(400, "The selected source record is not available for the active town package.");

  const mapLayerResult = await getMapLayerForSheet(supabase, townPackage.id, sheetNumber);
  if (mapLayerResult.error) return jsonError(503, "The matching map layer could not be checked.");

  const assetId = randomUUID();
  const storagePath = buildSanbornStoragePath({ townPackageId: townPackage.package_id, assetId, originalFilename: fileEntry.name });
  const sourceRecord = sourceRecordResult.data;
  const sourceUrl = normalizeOptionalText(readFormString(formData, "sourceUrl")) ?? sourceRecord?.source_url ?? null;
  const archiveName = normalizeOptionalText(readFormString(formData, "archiveName")) ?? sourceRecord?.archive_name ?? null;
  const rightsNote = normalizeOptionalText(readFormString(formData, "rightsNote")) ?? sourceRecord?.rights_note ?? null;
  const intakeNotes = normalizeOptionalText(readFormString(formData, "intakeNotes"));

  const uploadResult = await supabase.storage.from(sanbornSheetBucket).upload(storagePath, Buffer.from(arrayBuffer), { contentType: detectedMimeType, upsert: false });
  if (uploadResult.error) return jsonError(502, "The Sanborn image could not be uploaded to Supabase Storage.");

  const insertResult = await supabase
    .from("sanborn_sheet_assets")
    .insert({
      asset_id: assetId,
      town_package_id: townPackage.id,
      source_record_id: sourceRecord?.id ?? null,
      map_layer_id: mapLayerResult.data?.id ?? null,
      sheet_number: sheetNumber,
      original_filename: fileEntry.name,
      storage_bucket: sanbornSheetBucket,
      storage_path: storagePath,
      mime_type: detectedMimeType,
      byte_size: fileEntry.size,
      width: dimensions.width,
      height: dimensions.height,
      sha256_checksum: checksum,
      source_url: sourceUrl,
      archive_name: archiveName,
      rights_note: rightsNote,
      evidence_classification: sanbornDefaultEvidenceClassification,
      review_status: sanbornDefaultReviewStatus,
      intake_notes: intakeNotes,
      uploaded_at: new Date().toISOString(),
    })
    .select("asset_id, uploaded_at")
    .single();

  if (insertResult.error) {
    await supabase.storage.from(sanbornSheetBucket).remove([storagePath]);
    return jsonError(502, "The Sanborn image uploaded, but metadata could not be saved. The uncommitted upload was removed.");
  }

  return NextResponse.json({
    ok: true,
    asset: {
      assetId,
      sheetNumber,
      originalFilename: fileEntry.name,
      safeFilename: sanitizeSanbornFilename(fileEntry.name),
      byteSize: fileEntry.size,
      width: dimensions.width,
      height: dimensions.height,
      checksum,
      storageBucket: sanbornSheetBucket,
      storagePath,
      evidenceClassification: sanbornDefaultEvidenceClassification,
      reviewStatus: sanbornDefaultReviewStatus,
      uploadedAt: insertResult.data.uploaded_at,
    },
  });
}
