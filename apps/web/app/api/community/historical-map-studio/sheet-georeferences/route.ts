import { NextRequest, NextResponse } from "next/server";

import { isOperationalMapCenter } from "@/lib/historical-map-georeference";
import {
  normalizeGeoEditMode,
  normalizeGeographicMapSettings,
  normalizeProjectiveMatrix,
  normalizeSheetGeographicTransform,
  normalizeSheetGeoreferenceStatus,
  normalizeSheetPlacementStatus,
  normalizeSheetWarpType,
  type SheetGeographicTransform,
} from "@/lib/historical-map-sheet-georeference";
import { normalizeReviewClassification } from "@/lib/historical-map-studio";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";
import type { createAdminClient } from "@/lib/supabase/admin.ts";

export const runtime = "nodejs";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

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

type WorkspaceRow = {
  id: string;
  workspace_id: string;
  geographic_center_latitude: number | null;
  geographic_center_longitude: number | null;
  geographic_zoom: number | null;
  updated_at: string | null;
};

type SavedSheetGeoreferenceRow = {
  sheet_georeference_id: string;
  sanborn_sheet_asset_id: string;
  northwest_latitude: number | null;
  northwest_longitude: number | null;
  northeast_latitude: number | null;
  northeast_longitude: number | null;
  southeast_latitude: number | null;
  southeast_longitude: number | null;
  southwest_latitude: number | null;
  southwest_longitude: number | null;
  center_latitude: number | null;
  center_longitude: number | null;
  longitude_span: number | null;
  latitude_span: number | null;
  rotation: number | null;
  scale_x: number | null;
  scale_y: number | null;
  skew_x: number | null;
  skew_y: number | null;
  pivot_x: number | null;
  pivot_y: number | null;
  warp_type: string | null;
  projective_matrix: unknown;
  transform_version: number | null;
  placement_status: string | null;
  is_flipped_horizontally: boolean | null;
  is_flipped_vertically: boolean | null;
  opacity: number | null;
  layer_order: number | null;
  is_visible: boolean | null;
  is_locked: boolean | null;
  georeference_status: string | null;
  review_status: string | null;
  evidence_classification: string | null;
  updated_at: string | null;
};

const savedSheetSelect =
  "sheet_georeference_id, sanborn_sheet_asset_id, northwest_latitude, northwest_longitude, northeast_latitude, northeast_longitude, southeast_latitude, southeast_longitude, southwest_latitude, southwest_longitude, center_latitude, center_longitude, longitude_span, latitude_span, rotation, scale_x, scale_y, skew_x, skew_y, pivot_x, pivot_y, warp_type, projective_matrix, transform_version, placement_status, is_flipped_horizontally, is_flipped_vertically, opacity, layer_order, is_visible, is_locked, georeference_status, review_status, evidence_classification, updated_at";

function sanitizeWorkspaceId(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return normalized.length > 0 ? normalized : fallback;
}

function mapSavedSheet(row: SavedSheetGeoreferenceRow, assetId: string): SheetGeographicTransform {
  return normalizeSheetGeographicTransform({
    sheetGeoreferenceId: row.sheet_georeference_id,
    assetId,
    centerLatitude: row.center_latitude ?? undefined,
    centerLongitude: row.center_longitude ?? undefined,
    longitudeSpan: row.longitude_span ?? undefined,
    latitudeSpan: row.latitude_span ?? undefined,
    corners: {
      northwest: { latitude: row.northwest_latitude ?? 0, longitude: row.northwest_longitude ?? 0 },
      northeast: { latitude: row.northeast_latitude ?? 0, longitude: row.northeast_longitude ?? 0 },
      southeast: { latitude: row.southeast_latitude ?? 0, longitude: row.southeast_longitude ?? 0 },
      southwest: { latitude: row.southwest_latitude ?? 0, longitude: row.southwest_longitude ?? 0 },
    },
    rotation: row.rotation ?? 0,
    scaleX: row.scale_x ?? 1,
    scaleY: row.scale_y ?? 1,
    skewX: row.skew_x ?? 0,
    skewY: row.skew_y ?? 0,
    pivotX: row.pivot_x ?? 0.5,
    pivotY: row.pivot_y ?? 0.5,
    warpType: normalizeSheetWarpType(row.warp_type),
    projectiveMatrix: normalizeProjectiveMatrix(row.projective_matrix),
    transformVersion: row.transform_version ?? 1,
    placementStatus: normalizeSheetPlacementStatus(row.placement_status, row.is_visible ?? true),
    isFlippedHorizontally: row.is_flipped_horizontally ?? false,
    isFlippedVertically: row.is_flipped_vertically ?? false,
    opacity: row.opacity ?? undefined,
    layerOrder: row.layer_order ?? 0,
    isVisible: row.is_visible ?? true,
    isLocked: row.is_locked ?? false,
    georeferenceStatus: normalizeSheetGeoreferenceStatus(row.georeference_status),
    reviewStatus: normalizeReviewClassification(row.review_status),
    evidenceClassification: normalizeReviewClassification(row.evidence_classification),
    updatedAt: row.updated_at ?? undefined,
    isPersisted: true,
  });
}

async function loadSavedSheetGeoreferences(
  supabase: SupabaseAdminClient,
  workspaceId: string,
  assetIdByRowId: Map<string, string>,
) {
  const result = await supabase
    .from("historical_map_sheet_georeferences")
    .select(savedSheetSelect)
    .eq("workspace_id", workspaceId)
    .order("layer_order", { ascending: true });

  if (result.error) {
    return { error: result.error, sheets: [] as SheetGeographicTransform[] };
  }

  return {
    error: null,
    sheets: ((result.data ?? []) as SavedSheetGeoreferenceRow[])
      .map((row) => {
        const assetId = assetIdByRowId.get(row.sanborn_sheet_asset_id);
        return assetId ? mapSavedSheet(row, assetId) : null;
      })
      .filter((sheet): sheet is SheetGeographicTransform => Boolean(sheet)),
  };
}

export async function GET(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, request.nextUrl.searchParams.get("townPackageId"));

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
  const requestedYear = Number(request.nextUrl.searchParams.get("mapYear"));
  const mapYear = Number.isInteger(requestedYear) && requestedYear > 0 ? requestedYear : townPackage.year;
  const workspaceResult = await supabase
    .from("historical_map_workspaces")
    .select("id, workspace_id, geographic_center_latitude, geographic_center_longitude, geographic_zoom, updated_at")
    .eq("town_package_id", townPackage.id)
    .eq("map_year", mapYear)
    .maybeSingle();

  if (workspaceResult.error) {
    return jsonError(503, "Historical Map Studio workspace could not be loaded.");
  }

  if (!workspaceResult.data) {
    return NextResponse.json({ ok: true, workspaceId: null, savedAt: null, sheets: [] });
  }

  const assetsResult = await supabase.from("sanborn_sheet_assets").select("id, asset_id").eq("town_package_id", townPackage.id);

  if (assetsResult.error) {
    return jsonError(503, "Stored sheet assets could not be loaded before reloading geographic placement.");
  }

  const assetIdByRowId = new Map(((assetsResult.data ?? []) as AssetRow[]).map((row) => [row.id, row.asset_id]));
  const workspace = workspaceResult.data as WorkspaceRow;
  const saved = await loadSavedSheetGeoreferences(supabase, workspace.id, assetIdByRowId);

  if (saved.error) {
    return jsonError(503, "Saved sheet geographic placements could not be loaded.");
  }

  const workspaceCenter =
    typeof workspace.geographic_center_latitude === "number" && typeof workspace.geographic_center_longitude === "number"
      ? { latitude: workspace.geographic_center_latitude, longitude: workspace.geographic_center_longitude }
      : null;

  return NextResponse.json({
    ok: true,
    workspaceId: workspace.workspace_id,
    savedAt: workspace.updated_at ?? new Date().toISOString(),
    mapCenter: isOperationalMapCenter(workspaceCenter) ? workspaceCenter : null,
    mapZoom: workspace.geographic_zoom,
    sheets: saved.sheets,
  });
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
    pivot_x: sheet.pivotX,
    pivot_y: sheet.pivotY,
    warp_type: sheet.warpType,
    projective_matrix: sheet.projectiveMatrix,
    transform_version: sheet.transformVersion,
    placement_status: sheet.placementStatus,
    is_flipped_horizontally: sheet.isFlippedHorizontally,
    is_flipped_vertically: sheet.isFlippedVertically,
    opacity: sheet.opacity,
    layer_order: sheet.layerOrder ?? index,
    is_visible: sheet.isVisible,
    is_locked: sheet.isLocked,
    georeference_status: sheet.georeferenceStatus,
    review_status: sheet.reviewStatus,
    evidence_classification: sheet.evidenceClassification,
  }));

  if (records.length > 0) {
    const saveResult = await supabase
      .from("historical_map_sheet_georeferences")
      .upsert(records, {
        onConflict: "workspace_id,sanborn_sheet_asset_id",
      })
      .select(savedSheetSelect);

    if (saveResult.error) {
      return jsonError(503, "Sheet geographic placements could not be saved.");
    }
  }

  const saved = await loadSavedSheetGeoreferences(
    supabase,
    workspaceResult.data.id,
    new Map(assetRows.map((row) => [row.id, row.asset_id])),
  );

  if (saved.error) {
    return jsonError(503, "Sheet geographic placements were saved but could not be reloaded for confirmation.");
  }

  return NextResponse.json({
    ok: true,
    workspaceId: workspaceResult.data.workspace_id,
    savedAt: workspaceResult.data.updated_at ?? new Date().toISOString(),
    sheetCount: records.length,
    sheets: saved.sheets,
  });
}
