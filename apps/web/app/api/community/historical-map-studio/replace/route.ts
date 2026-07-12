import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getStudioAssetByAssetId, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";
import {
  buildSanbornReplacementStoragePath,
  detectSanbornMimeType,
  readSanbornImageDimensions,
  sanbornDefaultMaxUploadBytes,
  validateSanbornFileInput,
} from "@/lib/sanborn-intake";

export const runtime = "nodejs";

type TownPackageRow = {
  package_id: string;
};

function getMaxUploadBytes(): number {
  const configured = Number.parseInt(process.env.SANBORN_MAX_UPLOAD_BYTES ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : sanbornDefaultMaxUploadBytes;
}

export async function POST(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const formData = await request.formData();
  const assetId = formData.get("assetId");
  const fileEntry = formData.get("file");

  if (typeof assetId !== "string" || assetId.trim().length === 0) {
    return jsonError(400, "Asset ID is required.");
  }

  if (!(fileEntry instanceof File)) {
    return jsonError(400, "Attach a replacement PNG, JPEG, or WebP image.");
  }

  const { supabase } = access;
  const assetResult = await getStudioAssetByAssetId(supabase, assetId);

  if (assetResult.error) {
    return jsonError(503, "Sanborn sheet lookup failed before replacement.");
  }

  if (!assetResult.data) {
    return jsonError(404, "Sanborn sheet asset was not found.");
  }

  const asset = assetResult.data;
  const townResult = await supabase.from("town_packages").select("package_id").eq("id", asset.town_package_id).maybeSingle();

  if (townResult.error || !townResult.data) {
    return jsonError(503, "Town package lookup failed before replacement.");
  }

  const arrayBuffer = await fileEntry.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const detectedMimeType = detectSanbornMimeType(bytes);

  if (!detectedMimeType) {
    return jsonError(400, "The replacement file contents are not a supported PNG, JPEG, or WebP image.");
  }

  if (fileEntry.type && fileEntry.type !== detectedMimeType) {
    return jsonError(400, "The browser-reported MIME type does not match the replacement image contents.");
  }

  const validation = validateSanbornFileInput({
    filename: fileEntry.name,
    mimeType: detectedMimeType,
    byteSize: fileEntry.size,
    maxBytes: getMaxUploadBytes(),
  });

  if (!validation.ok) {
    return jsonError(400, validation.reason);
  }

  const dimensions = readSanbornImageDimensions(bytes, detectedMimeType);

  if (!dimensions) {
    return jsonError(400, "The replacement image dimensions could not be read safely.");
  }

  const checksum = createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");
  const duplicateChecksumResult = await supabase
    .from("sanborn_sheet_assets")
    .select("asset_id, original_filename, sheet_number")
    .eq("town_package_id", asset.town_package_id)
    .eq("sha256_checksum", checksum)
    .neq("id", asset.id)
    .limit(1)
    .maybeSingle();

  if (duplicateChecksumResult.error) {
    return jsonError(503, "Duplicate checksum check failed before replacement.");
  }

  if (duplicateChecksumResult.data) {
    return jsonError(409, "Another Sanborn sheet already uses this checksum.", {
      code: "duplicate_checksum",
      duplicate: duplicateChecksumResult.data,
    });
  }

  const replacementPath = buildSanbornReplacementStoragePath({
    townPackageId: townResult.data.package_id,
    assetId: asset.asset_id,
    replacementId: randomUUID(),
    originalFilename: fileEntry.name,
  });
  const uploadResult = await supabase.storage.from(asset.storage_bucket).upload(replacementPath, Buffer.from(arrayBuffer), {
    contentType: detectedMimeType,
    upsert: false,
  });

  if (uploadResult.error) {
    return jsonError(502, "Replacement image could not be uploaded to Supabase Storage.");
  }

  const updateResult = await supabase
    .from("sanborn_sheet_assets")
    .update({
      original_filename: fileEntry.name,
      storage_path: replacementPath,
      mime_type: detectedMimeType,
      byte_size: fileEntry.size,
      width: dimensions.width,
      height: dimensions.height,
      sha256_checksum: checksum,
      updated_at: new Date().toISOString(),
    })
    .eq("id", asset.id);

  if (updateResult.error) {
    await supabase.storage.from(asset.storage_bucket).remove([replacementPath]);
    return jsonError(502, "Replacement uploaded, but metadata could not be committed. The replacement upload was removed.");
  }

  const cleanupResult = await supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);

  return NextResponse.json({
    ok: true,
    asset: {
      assetId: asset.asset_id,
      originalFilename: fileEntry.name,
      storagePath: replacementPath,
      mimeType: detectedMimeType,
      byteSize: fileEntry.size,
      width: dimensions.width,
      height: dimensions.height,
      checksum,
    },
    previousStorageCleanup: cleanupResult.error ? "failed" : "removed",
    warningMessage: cleanupResult.error ? "Replacement succeeded, but the previous storage object could not be removed automatically." : undefined,
  });
}
