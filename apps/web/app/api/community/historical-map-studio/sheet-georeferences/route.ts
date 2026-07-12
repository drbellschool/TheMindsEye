import { NextRequest, NextResponse } from "next/server";

import {
  normalizeGeoEditMode,
  normalizeGeographicMapSettings,
  normalizeSheetGeographicTransform,
  type SheetGeographicTransform,
} from "@/lib/historical-map-sheet-georeference";
import { normalizeReviewClassification } from "@/lib/historical-map-studio";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type SheetGeoreferenceSaveBody = {
  townPackageId?: string;
  mapYear?: number;
  workspaceId?: string;
  workspaceName?: string;
  selectedBasemap?: string;
  mapCenter?: { latitude?: number; longitude?: number } | null;
  mapZoom?: number;
  editMode?: string;
  globalHistoricalOpacity?: number;
  sheets?: Array<Partial<SheetGeographicTransform> & { assetId: string }>;
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

  const body = (await request.json().catch(() => null)) as SheetGeoreferenceSaveBody | null;

  if (!body || !Array.isArray(body.sheets)) {
    return jsonError(400, "Sheet georeference payload is invalid.");
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
  const mapYear = Number.isInteger(body.mapYear) && body.mapYear! > 0 ? body.mapYear! : townPackage.year;
  const workspaceId = sanitizeWorkspaceId(body.workspaceId, `${townPackage.package_id}-${mapYear}-historical-map-studio`);
  const normalizedSheets = body.sheets.map((sheet, index) =>
    normalizeSheetGeographicTransform({
      ...sheet,
      layerOrder: sheet.layerOrder ?? index,
    }),
  );
  const assetIds = normalizedSheets.map((sheet) => sheet.assetId);
  const assetsResult =
    assetIds.length > 0
      ? await supabase.from("sanborn_sheet_assets").select("id, asset_id").eq("town_package_id", townPackage.id).in("asset_id", assetIds)
      : { data: [], error: null };

  if (assetsResult.error) {
    return jsonError(503, "Stored sheet assets could not be verified before saving geographic layout.");
  }

  const assetRows = (assetsResult.data ?? []) as AssetRow[];
  const rowIdByAssetId = new Map(assetRows.map((row) => [row.asset_id, row.id]));

  if (rowIdByAssetId.size !== new Set(assetIds).size) {
    return jsonError(400, "One or more geographic placements reference an asset outside the selected town package.");
  }

  const mapSettings = normalizeGeographicMapSettings({
    center:
      typeof body.mapCenter?.latitude === "number" && typeof body.mapCenter.longitude === "number"
        ? { latitude: body.mapCenter.latitude, longitude: body.mapCenter.longitude }
        : null,
    zoom: body.mapZoom,
    editMode: normalizeGeoEditMode(body.editMode),
    movementScope: "selected_sheet",
    globalHistoricalOpacity: body.globalHistoricalOpacity,
  });
  const workspaceResult = await supabase
    .from("historical_map_workspaces")
    .upsert(
      {
        workspace_id: workspaceId,
        town_package_id: townPackage.id,
        map_year: mapYear,
        name: body.workspaceName?.trim().slice(0, 200) || `${townPackage.name} ${mapYear} Historical Map Studio`,
        review_status: "unknown",
        evidence_classification: normalizeReviewClassification("unknown"),
        selected_basemap: body.selectedBasemap?.trim().slice(0, 80) || "osm",
        geographic_center_latitude: mapSettings.center?.latitude ?? null,
        geographic_center_longitude: mapSettings.center?.longitude ?? null,
        geographic_zoom: mapSettings.zoom,
        geographic_edit_mode: mapSettings.editMode,
        global_historical_opacity: mapSettings.globalHistoricalOpacity,
      },
      { onConflict: "town_package_id,map_year" },
    )
    .select("id, workspace_id, updated_at")
    .single();

  if (workspaceResult.error || !workspaceResult.data) {
    return jsonError(503, "Historical Map Studio workspace could not be saved for geographic stitching.");
  }

  const records = normalizedSheets.map((sheet, index) => ({
    sheet_georeference_id: sheet.sheetGeoreferenceId || `${workspaceResult.data!.workspace_id}-${sheet.assetId}-sheet-georef`,
    workspace_id: workspaceResult.data!.id,
    sanborn_sheet_asset_id: rowIdByAssetId.get(sheet.assetId),
    town_package_id: townPackage.id,
    map_year: mapYear,
    northwest_latitude: sheet.corners.northwest?.latitude ?? sheet.centerLatitude,
    northwest_longitude: sheet.corners.northwest?.longitude ?? sheet.centerLongitude,
    northeast_latitude: sheet.corners.northeast?.latitude ?? sheet.centerLatitude,
    northeast_longitude: sheet.corners.northeast?.longitude ?? sheet.centerLongitude,
    southeast_latitude: sheet.corners.southeast?.latitude ?? sheet.centerLatitude,
    southeast_longitude: sheet.corners.southeast?.longitude ?? sheet.centerLongitude,
    southwest_latitude: sheet.corners.southwest?.latitude ?? sheet.centerLatitude,
    southwest_longitude: sheet.corners.southwest?.longitude ?? sheet.centerLongitude,
    center_latitude: sheet.centerLatitude,
    center_longitude: sheet.centerLongitude,
    longitude_span: sheet.longitudeSpan,
    latitude_span: sheet.latitudeSpan,
    rotation: sheet.rotation,
    scale_x: sheet.scaleX,
    scale_y: sheet.scaleY,
    skew_x: sheet.skewX,
    skew_y: sheet.skewY,
    is_flipped_horizontally: sheet.isFlippedHorizontally,
    is_flipped_vertically: sheet.isFlippedVertically,
    opacity: sheet.opacity,
    layer_order: index,
    is_visible: sheet.isVisible,
    is_locked: sheet.isLocked,
    georeference_status: sheet.georeferenceStatus,
    review_status: sheet.reviewStatus,
    evidence_classification: sheet.evidenceClassification,
  }));

  if (records.length > 0) {
    const saveResult = await supabase.from("historical_map_sheet_georeferences").upsert(records, {
      onConflict: "workspace_id,sanborn_sheet_asset_id",
    });

    if (saveResult.error) {
      return jsonError(503, "Sheet geographic placements could not be saved.");
    }
  }

  return NextResponse.json({
    ok: true,
    workspaceId: workspaceResult.data.workspace_id,
    savedAt: workspaceResult.data.updated_at ?? new Date().toISOString(),
    sheetCount: records.length,
  });
}
