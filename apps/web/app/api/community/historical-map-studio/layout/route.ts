import { NextRequest, NextResponse } from "next/server";

import { normalizePlacement, normalizeReviewClassification, normalizeViewport, type StudioPlacement } from "@/lib/historical-map-studio";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type LayoutSaveBody = {
  townPackageId?: string;
  mapYear?: number;
  workspaceId?: string;
  name?: string;
  viewport?: { x?: number; y?: number; scale?: number };
  placements?: Array<Partial<StudioPlacement> & { assetId: string }>;
};

type WorkspaceSaveRow = {
  id: string;
  workspace_id: string;
  updated_at: string;
};

type AssetRow = {
  id: string;
  asset_id: string;
};

function sanitizeWorkspaceId(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return normalized.length > 0 ? normalized : fallback;
}

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as LayoutSaveBody | null;

  if (!body || !Array.isArray(body.placements)) {
    return jsonError(400, "Layout payload is invalid.");
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
  const mapYear = Number.isInteger(body.mapYear) && body.mapYear! > 0 ? body.mapYear! : townPackage.year;
  const workspaceId = sanitizeWorkspaceId(body.workspaceId, `${townPackage.package_id}-${mapYear}-historical-map-studio`);
  const viewport = normalizeViewport(body.viewport);
  const normalizedPlacements = body.placements.map((placement, index) => normalizePlacement({ ...placement, layerOrder: placement.layerOrder ?? index }));
  const assetIds = normalizedPlacements.map((placement) => placement.assetId);
  const assetsResult =
    assetIds.length > 0
      ? await supabase.from("sanborn_sheet_assets").select("id, asset_id").eq("town_package_id", townPackage.id).in("asset_id", assetIds)
      : { data: [], error: null };

  if (assetsResult.error) {
    return jsonError(503, "Stored sheet assets could not be verified before saving layout.");
  }

  const assetRows = (assetsResult.data ?? []) as AssetRow[];
  const rowIdByAssetId = new Map(assetRows.map((row) => [row.asset_id, row.id]));

  if (rowIdByAssetId.size !== new Set(assetIds).size) {
    return jsonError(400, "One or more layout placements reference an asset outside the selected town package.");
  }

  const workspaceResult = await supabase
    .from("historical_map_workspaces")
    .upsert(
      {
        workspace_id: workspaceId,
        town_package_id: townPackage.id,
        map_year: mapYear,
        name: body.name?.trim().slice(0, 200) || `${townPackage.name} ${mapYear} Historical Map Studio`,
        review_status: "unknown",
        evidence_classification: normalizeReviewClassification("unknown"),
        viewport_x: viewport.x,
        viewport_y: viewport.y,
        viewport_scale: viewport.scale,
      },
      { onConflict: "town_package_id,map_year" },
    )
    .select("id, workspace_id, updated_at")
    .single();

  if (workspaceResult.error || !workspaceResult.data) {
    return jsonError(503, "Historical Map Studio workspace could not be saved.");
  }

  const workspace = workspaceResult.data;
  const placementRecords = normalizedPlacements.map((placement, index) => ({
    workspace_id: workspace.id,
    sanborn_sheet_asset_id: rowIdByAssetId.get(placement.assetId),
    x: placement.x,
    y: placement.y,
    scale_x: placement.scaleX,
    scale_y: placement.scaleY,
    skew_x: placement.skewX,
    skew_y: placement.skewY,
    rotation: placement.rotation,
    opacity: placement.opacity,
    layer_order: index,
    is_visible: placement.isVisible,
    is_locked: placement.isLocked,
    is_flipped_horizontally: placement.isFlippedHorizontally,
    is_flipped_vertically: placement.isFlippedVertically,
  }));

  if (placementRecords.length > 0) {
    const upsertResult = await supabase
      .from("historical_map_sheet_placements")
      .upsert(placementRecords, { onConflict: "workspace_id,sanborn_sheet_asset_id" });

    if (upsertResult.error) {
      return jsonError(503, "Historical Map Studio placements could not be saved.");
    }

  }

  return NextResponse.json({
    ok: true,
    workspaceId: workspace.workspace_id,
    savedAt: workspace.updated_at ?? new Date().toISOString(),
    placementCount: placementRecords.length,
  });
}
