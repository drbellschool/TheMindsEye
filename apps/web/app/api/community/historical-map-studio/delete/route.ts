import { NextRequest, NextResponse } from "next/server";

import { getStudioAssetByAssetId, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type DeleteBody = {
  assetId?: string;
  confirmDeleteEligible?: boolean;
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
  const pageLookupResult = await supabase
    .from("sanborn_atlas_pages")
    .select("id, page_id, is_primary_town_index")
    .eq("sanborn_sheet_asset_id", asset.id);

  if (pageLookupResult.error) {
    return jsonError(503, "Atlas page dependencies could not be checked before deletion.");
  }

  const atlasPages = pageLookupResult.data ?? [];
  const atlasPageRowIds = atlasPages.map((page) => page.id);
  const atlasPageIds = atlasPages.map((page) => page.page_id);
  const primaryIndexCount = atlasPages.filter((page) => page.is_primary_town_index).length;

  const sourceRegionsByAssetResult = await supabase.from("sanborn_source_regions").select("id", { count: "exact", head: true }).eq("source_asset_id", asset.id);
  if (sourceRegionsByAssetResult.error) {
    return jsonError(503, "Source-region dependencies could not be checked before deletion.");
  }

  const sourceRegionsByPageResult = atlasPageRowIds.length
    ? await supabase.from("sanborn_source_regions").select("id", { count: "exact", head: true }).in("atlas_page_id", atlasPageRowIds)
    : { count: 0, error: null };
  if (sourceRegionsByPageResult.error) {
    return jsonError(503, "Atlas-page source-region dependencies could not be checked before deletion.");
  }

  const mapPiecesResult = atlasPageRowIds.length
    ? await supabase.from("sanborn_map_pieces").select("id", { count: "exact" }).in("atlas_page_id", atlasPageRowIds)
    : { data: [], count: 0, error: null };
  if (mapPiecesResult.error) {
    return jsonError(503, "Map-piece dependencies could not be checked before deletion.");
  }

  const mapPieceRowIds = (mapPiecesResult.data ?? []).map((piece) => piece.id);
  const mapPiecePlacementsResult = mapPieceRowIds.length
    ? await supabase.from("sanborn_map_piece_georeferences").select("id", { count: "exact", head: true }).in("map_piece_id", mapPieceRowIds)
    : { count: 0, error: null };
  if (mapPiecePlacementsResult.error) {
    return jsonError(503, "Map-piece placement dependencies could not be checked before deletion.");
  }

  const sheetGeoreferencesResult = await supabase.from("historical_map_sheet_georeferences").select("id", { count: "exact", head: true }).eq("sanborn_sheet_asset_id", asset.id);
  if (sheetGeoreferencesResult.error) {
    return jsonError(503, "Whole-sheet georeference dependencies could not be checked before deletion.");
  }

  const sheetPlacementsResult = await supabase.from("historical_map_sheet_placements").select("id", { count: "exact", head: true }).eq("sanborn_sheet_asset_id", asset.id);
  if (sheetPlacementsResult.error) {
    return jsonError(503, "Workspace placement dependencies could not be checked before deletion.");
  }

  const dependencyCounts = {
    atlasPages: atlasPages.length,
    sourceRegions: (sourceRegionsByAssetResult.count ?? 0) + (sourceRegionsByPageResult.count ?? 0),
    mapPieces: mapPiecesResult.count ?? 0,
    mapPiecePlacements: mapPiecePlacementsResult.count ?? 0,
    wholeSheetGeoreferences: sheetGeoreferencesResult.count ?? 0,
    workspacePlacements: sheetPlacementsResult.count ?? 0,
    primaryTownIndexPages: primaryIndexCount,
    sourceLinks: asset.source_record_id ? 1 : 0,
  };
  const linkedWorkCount =
    dependencyCounts.sourceRegions +
    dependencyCounts.mapPieces +
    dependencyCounts.mapPiecePlacements +
    dependencyCounts.wholeSheetGeoreferences +
    dependencyCounts.workspacePlacements +
    dependencyCounts.primaryTownIndexPages +
    dependencyCounts.sourceLinks;

  if (linkedWorkCount > 0 && body.confirmDeleteEligible !== true) {
    return jsonError(409, "Delete blocked because this page has linked reconstruction work. Archive the page instead.", {
      dependencyCounts,
      pageIds: atlasPageIds,
    });
  }

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
