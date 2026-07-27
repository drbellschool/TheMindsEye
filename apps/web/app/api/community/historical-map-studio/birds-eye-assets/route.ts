import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { detectSanbornMimeType, readSanbornImageDimensions, sanitizeSanbornFilename } from "@/lib/sanborn-intake";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "Attach one Birds-Eye reference image.");
  const town = await getRequestedTownPackage(access.supabase, typeof form.get("townPackageId") === "string" ? String(form.get("townPackageId")) : null);
  if (town.error || !town.data) return jsonError(400, "The town package could not be loaded.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectSanbornMimeType(bytes);
  if (!mime) return jsonError(400, "The Birds-Eye reference must be a PNG, JPEG, or WebP image.");
  const dimensions = readSanbornImageDimensions(bytes, mime);
  if (!dimensions) return jsonError(400, "The Birds-Eye image dimensions could not be read safely.");
  if (bytes.byteLength <= 0 || bytes.byteLength > 52_428_800) return jsonError(400, "The Birds-Eye image is empty or exceeds the 50 MB limit.");
  const sourceRecordId = typeof form.get("sourceRecordId") === "string" ? String(form.get("sourceRecordId")).trim() : "";
  if (sourceRecordId) {
    const source = await access.supabase.from("source_records").select("id").eq("id", sourceRecordId).eq("town_package_id", town.data.id).maybeSingle();
    if (source.error) return jsonError(503, "The source record could not be verified.");
    if (!source.data) return jsonError(400, "The source record must belong to the selected town.");
  }
  const assetId = randomUUID();
  const storagePath = `${town.data.package_id}/birds-eye/${assetId}/${sanitizeSanbornFilename(file.name)}`;
  const checksum = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const upload = await access.supabase.storage.from("birds-eye-references").upload(storagePath, Buffer.from(bytes), { contentType: mime, upsert: false });
  if (upload.error) return jsonError(502, "The Birds-Eye reference could not be uploaded.");
  const insert = await access.supabase.from("historical_map_birds_eye_reference_assets").insert({ asset_id: assetId, town_package_id: town.data.id, source_record_id: sourceRecordId || null, original_filename: file.name, storage_bucket: "birds-eye-references", storage_path: storagePath, mime_type: mime, byte_size: bytes.byteLength, width: dimensions.width, height: dimensions.height, sha256_checksum: checksum, evidence_classification: "unknown", review_status: "unknown", intake_notes: "Uploaded as a historical Birds-Eye reference; requires human calibration review." }).select("id, asset_id, town_package_id, source_record_id, original_filename, storage_bucket, storage_path, mime_type, byte_size, width, height, sha256_checksum, evidence_classification, review_status, rights_note, intake_notes, created_at, updated_at").single();
  if (insert.error) {
    await access.supabase.storage.from("birds-eye-references").remove([storagePath]);
    return jsonError(502, "The Birds-Eye image uploaded, but its metadata could not be saved.");
  }
  const signed = await access.supabase.storage.from("birds-eye-references").createSignedUrl(storagePath, 3600);
  return NextResponse.json({ ok: true, asset: { ...insert.data, signed_url: signed.error ? null : signed.data?.signedUrl ?? null } });
}

export async function PATCH(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as { townPackageId?: string; atlasId?: string; assetId?: string | null } | null;
  if (!body?.atlasId) return jsonError(400, "An edition is required.");
  const town = await getRequestedTownPackage(access.supabase, body.townPackageId);
  if (town.error || !town.data) return jsonError(400, "The town package could not be loaded.");
  const atlas = await access.supabase.from("sanborn_atlases").select("id, atlas_id, birds_eye_reference_asset_id").eq("atlas_id", body.atlasId).eq("town_package_id", town.data.id).is("archived_at", null).maybeSingle();
  if (atlas.error || !atlas.data) return jsonError(400, "The active edition could not be resolved.");
  if (body.assetId) {
    const asset = await access.supabase.from("historical_map_birds_eye_reference_assets").select("id, asset_id").eq("asset_id", body.assetId).eq("town_package_id", town.data.id).maybeSingle();
    if (asset.error || !asset.data) return jsonError(400, "The Birds-Eye asset does not belong to this town.");
  }
  const previousAssetId = atlas.data.birds_eye_reference_asset_id as string | null;
  let referenceRowId: string | null = null;
  if (body.assetId) {
    const asset = await access.supabase.from("historical_map_birds_eye_reference_assets").select("id").eq("asset_id", body.assetId).eq("town_package_id", town.data.id).single();
    if (asset.error || !asset.data) return jsonError(400, "The Birds-Eye asset does not belong to this town.");
    referenceRowId = asset.data.id;
  }
  const update = await access.supabase.from("sanborn_atlases").update({ birds_eye_reference_asset_id: referenceRowId }).eq("id", atlas.data.id);
  if (update.error) return jsonError(503, "The Birds-Eye designation could not be saved.");
  if (previousAssetId !== referenceRowId) {
    await access.supabase.from("historical_map_birds_eye_calibrations").update({ calibration_status: "needs_review", updated_at: new Date().toISOString() }).eq("atlas_id", atlas.data.id).eq("town_package_id", town.data.id).not("calibration_status", "eq", "unavailable");
    await access.supabase.from("review_events").insert({ town_package_id: town.data.id, target_table: "sanborn_atlases", target_id: atlas.data.atlas_id, action_type: "birds_eye_reference_change", previous_review_status: "unknown", next_review_status: "unknown", reviewer_identifier: "historical-map-studio-public", reviewer_name: "Historical Map Studio", reviewer_role: "public_studio", certainty: "unknown", is_verified: false, summary: "Changed the edition Birds-Eye reference designation." });
  }
  return NextResponse.json({ ok: true, atlasId: atlas.data.atlas_id, assetId: body.assetId ?? null });
}
