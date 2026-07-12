import { NextRequest, NextResponse } from "next/server";

import { isControlledSanbornStoragePath, studioSignedUrlTtlSeconds } from "@/lib/historical-map-studio";
import { getStudioAssetByAssetId, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";
import { sanbornSheetBucket } from "@/lib/sanborn-intake";

export const runtime = "nodejs";

type TownPackagePathRow = {
  package_id: string;
};

export async function GET(_request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const { assetId } = await context.params;
  const { supabase } = access;
  const assetResult = await getStudioAssetByAssetId(supabase, assetId);

  if (assetResult.error) {
    return jsonError(503, "Asset lookup failed.");
  }

  if (!assetResult.data) {
    return jsonError(404, "Sanborn sheet asset was not found.");
  }

  const townResult = await supabase
    .from("town_packages")
    .select("package_id")
    .eq("id", assetResult.data.town_package_id)
    .maybeSingle();

  if (townResult.error || !townResult.data) {
    return jsonError(503, "Town package lookup failed for signed URL generation.");
  }

  if (assetResult.data.storage_bucket !== sanbornSheetBucket || !isControlledSanbornStoragePath(assetResult.data.storage_path, townResult.data.package_id)) {
    return jsonError(400, "Stored asset path is not controlled by Historical Map Studio.");
  }

  const signedUrlResult = await supabase.storage.from(sanbornSheetBucket).createSignedUrl(assetResult.data.storage_path, studioSignedUrlTtlSeconds);

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    return jsonError(502, "Signed URL generation failed.");
  }

  return NextResponse.json({
    ok: true,
    asset: {
      assetId: assetResult.data.asset_id,
      sheetNumber: assetResult.data.sheet_number,
      originalFilename: assetResult.data.original_filename,
      checksum: assetResult.data.sha256_checksum,
      signedUrl: signedUrlResult.data.signedUrl,
      signedUrlExpiresAt: new Date(Date.now() + studioSignedUrlTtlSeconds * 1000).toISOString(),
    },
  });
}
