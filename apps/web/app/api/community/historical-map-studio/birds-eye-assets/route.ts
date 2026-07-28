import { NextRequest, NextResponse } from "next/server";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  return jsonError(410, "Birds-Eye uploads now use direct resumable upload. Prepare an upload through the shared image-upload endpoint.", { code: "direct_upload_required" });
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
