import { NextRequest, NextResponse } from "next/server";

import { getStudioAssetByAssetId, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type DeleteBody = {
  assetId?: string;
};

export async function DELETE(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as DeleteBody | null;

  if (!body?.assetId) {
    return jsonError(400, "Asset ID is required.");
  }

  const { supabase } = access;
  const assetResult = await getStudioAssetByAssetId(supabase, body.assetId);

  if (assetResult.error) {
    return jsonError(503, "Sanborn sheet lookup failed before deletion.");
  }

  if (!assetResult.data) {
    return jsonError(404, "Sanborn sheet asset was not found.");
  }

  const asset = assetResult.data;
  const placementsDeleteResult = await supabase.from("historical_map_sheet_placements").delete().eq("sanborn_sheet_asset_id", asset.id);

  if (placementsDeleteResult.error) {
    return jsonError(503, "Workspace placements could not be removed.");
  }

  const metadataDeleteResult = await supabase.from("sanborn_sheet_assets").delete().eq("id", asset.id);

  if (metadataDeleteResult.error) {
    return jsonError(503, "Sanborn sheet metadata could not be removed.");
  }

  const storageDeleteResult = await supabase.storage.from(asset.storage_bucket).remove([asset.storage_path]);

  if (storageDeleteResult.error) {
    return NextResponse.json(
      {
        ok: false,
        partialFailure: true,
        message: "Metadata and placements were removed, but storage cleanup failed. Manual storage cleanup is required.",
        assetId: asset.asset_id,
        storagePath: asset.storage_path,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: {
      assetId: asset.asset_id,
      sheetNumber: asset.sheet_number,
      originalFilename: asset.original_filename,
    },
  });
}
