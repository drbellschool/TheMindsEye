import { NextRequest, NextResponse } from "next/server";

import { isOperationalMapCenter, type GeoCoordinate } from "@/lib/historical-map-georeference";
import {
  normalizeSanbornMapPieceGeoreference,
  persistedMapPieceTargetGeometry,
  validateMapPieceGeographicCorners,
  validateMapPiecePlacementForPersistence,
  type SanbornMapPieceGeoreference,
} from "@/lib/sanborn-map-piece-georeference";
import { getPageTypeToolBlockMessage, normalizeOptionalSanbornText, normalizeSanbornPageType, pageTypeSupportsMapPlacement } from "@/lib/sanborn-atlas";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";
import type { createAdminClient } from "@/lib/supabase/admin.ts";

export const runtime = "nodejs";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type MapPieceGeoreferenceSaveBody = {
  townPackageId?: string;
  mapYear?: number;
  workspaceId?: string;
  workspaceName?: string;
  mapCenter?: GeoCoordinate | null;
  mapZoom?: number;
  pieceId?: string;
  placement?: Partial<SanbornMapPieceGeoreference> & { pieceId: string; atlasPageId: string };
};

type PieceRow = {
  id: string;
  piece_id: string;
  atlas_page_id: string;
};

type PageRow = {
  id: string;
  page_id: string;
  atlas_id: string;
  page_type: string | null;
};

type AtlasRow = {
  id: string;
  town_package_id: string;
};

type WorkspaceRow = {
  id: string;
  workspace_id: string;
  geographic_center_latitude: number | null;
  geographic_center_longitude: number | null;
  geographic_zoom: number | null;
  updated_at: string | null;
};

type SavedPieceGeoreferenceRow = {
  piece_georeference_id: string;
  atlas_page_id: string;
  map_piece_id: string;
  northwest_latitude: number;
  northwest_longitude: number;
  northeast_latitude: number;
  northeast_longitude: number;
  southeast_latitude: number;
  southeast_longitude: number;
  southwest_latitude: number;
  southwest_longitude: number;
  center_latitude: number;
  center_longitude: number;
  rotation: number | null;
  opacity: number | null;
  layer_order: number | null;
  placement_status: string | null;
  target_geometry: string | null;
  is_visible: boolean | null;
  is_locked: boolean | null;
  review_status: string | null;
  evidence_classification: string | null;
  notes: string | null;
  updated_at: string | null;
};

const savedPieceSelect =
  "piece_georeference_id, atlas_page_id, map_piece_id, northwest_latitude, northwest_longitude, northeast_latitude, northeast_longitude, southeast_latitude, southeast_longitude, southwest_latitude, southwest_longitude, center_latitude, center_longitude, rotation, opacity, layer_order, placement_status, target_geometry, is_visible, is_locked, review_status, evidence_classification, notes, updated_at";

function sanitizeWorkspaceId(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return normalized.length > 0 ? normalized : fallback;
}

async function resolvePieceScope(supabase: SupabaseAdminClient, pieceId: string, townPackageId: string) {
  const pieceResult = await supabase
    .from("sanborn_map_pieces")
    .select("id, piece_id, atlas_page_id")
    .eq("piece_id", pieceId)
    .maybeSingle<PieceRow>();

  if (pieceResult.error || !pieceResult.data) {
    return { error: pieceResult.error ?? new Error("Sanborn map piece was not found."), piece: null, page: null };
  }

  const pageResult = await supabase
    .from("sanborn_atlas_pages")
    .select("id, page_id, atlas_id, page_type")
    .eq("id", pieceResult.data.atlas_page_id)
    .maybeSingle<PageRow>();

  if (pageResult.error || !pageResult.data) {
    return { error: pageResult.error ?? new Error("Sanborn atlas page was not found."), piece: null, page: null };
  }

  const atlasResult = await supabase
    .from("sanborn_atlases")
    .select("id, town_package_id")
    .eq("id", pageResult.data.atlas_id)
    .maybeSingle<AtlasRow>();

  if (atlasResult.error || !atlasResult.data || atlasResult.data.town_package_id !== townPackageId) {
    return { error: atlasResult.error ?? new Error("Map piece belongs to another town package."), piece: null, page: null };
  }

  return { error: null, piece: pieceResult.data, page: pageResult.data };
}

function mapSavedPiece(row: SavedPieceGeoreferenceRow, piece: PieceRow, page: PageRow): SanbornMapPieceGeoreference {
  if (row.target_geometry !== persistedMapPieceTargetGeometry) {
    throw new Error("Saved map piece placement target geometry is invalid.");
  }

  const corners = {
    northwest: { latitude: row.northwest_latitude, longitude: row.northwest_longitude },
    northeast: { latitude: row.northeast_latitude, longitude: row.northeast_longitude },
    southeast: { latitude: row.southeast_latitude, longitude: row.southeast_longitude },
    southwest: { latitude: row.southwest_latitude, longitude: row.southwest_longitude },
  };
  const validation = validateMapPieceGeographicCorners(corners);

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return normalizeSanbornMapPieceGeoreference({
    pieceGeoreferenceId: row.piece_georeference_id,
    pieceId: piece.piece_id,
    atlasPageId: page.page_id,
    targetGeometry: persistedMapPieceTargetGeometry,
    centerLatitude: row.center_latitude,
    centerLongitude: row.center_longitude,
    corners,
    rotation: row.rotation ?? 0,
    opacity: row.opacity ?? undefined,
    layerOrder: row.layer_order ?? 0,
    placementStatus: row.placement_status ?? undefined,
    isVisible: row.is_visible ?? true,
    isLocked: row.is_locked ?? false,
    reviewStatus: row.review_status ?? undefined,
    evidenceClassification: row.evidence_classification ?? undefined,
    notes: row.notes,
    updatedAt: row.updated_at,
    isPersisted: true,
  });
}

async function loadSavedPiecePlacement(supabase: SupabaseAdminClient, workspaceId: string, piece: PieceRow, page: PageRow) {
  const result = await supabase
    .from("sanborn_map_piece_georeferences")
    .select(savedPieceSelect)
    .eq("workspace_id", workspaceId)
    .eq("map_piece_id", piece.id)
    .maybeSingle<SavedPieceGeoreferenceRow>();

  if (result.error) {
    return { error: result.error, placement: null };
  }

  try {
    return {
      error: null,
      placement: result.data ? mapSavedPiece(result.data, piece, page) : null,
    };
  } catch (error) {
    return {
      error,
      placement: null,
    };
  }
}

export async function GET(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, request.nextUrl.searchParams.get("townPackageId"));

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const pieceId = normalizeOptionalSanbornText(request.nextUrl.searchParams.get("pieceId"), 240);
  if (!pieceId) {
    return jsonError(400, "Map piece placement reload requires a piece ID.");
  }

  const requestedYear = Number(request.nextUrl.searchParams.get("mapYear"));
  const mapYear = Number.isInteger(requestedYear) && requestedYear > 0 ? requestedYear : townPackageResult.data.year;
  const scope = await resolvePieceScope(supabase, pieceId, townPackageResult.data.id);

  if (scope.error || !scope.piece || !scope.page) {
    return jsonError(400, scope.error?.message ?? "Map piece placement scope could not be resolved.");
  }

  const workspaceResult = await supabase
    .from("historical_map_workspaces")
    .select("id, workspace_id, geographic_center_latitude, geographic_center_longitude, geographic_zoom, updated_at")
    .eq("town_package_id", townPackageResult.data.id)
    .eq("map_year", mapYear)
    .maybeSingle<WorkspaceRow>();

  if (workspaceResult.error) {
    return jsonError(503, "Historical Map Studio workspace could not be loaded.");
  }

  if (!workspaceResult.data) {
    return NextResponse.json({ ok: true, workspaceId: null, placement: null });
  }

  const saved = await loadSavedPiecePlacement(supabase, workspaceResult.data.id, scope.piece, scope.page);
  if (saved.error) {
    return jsonError(503, "Saved map piece placement could not be loaded.");
  }

  const workspaceCenter =
    typeof workspaceResult.data.geographic_center_latitude === "number" && typeof workspaceResult.data.geographic_center_longitude === "number"
      ? { latitude: workspaceResult.data.geographic_center_latitude, longitude: workspaceResult.data.geographic_center_longitude }
      : null;

  return NextResponse.json({
    ok: true,
    workspaceId: workspaceResult.data.workspace_id,
    savedAt: workspaceResult.data.updated_at ?? new Date().toISOString(),
    mapCenter: isOperationalMapCenter(workspaceCenter) ? workspaceCenter : null,
    mapZoom: workspaceResult.data.geographic_zoom,
    placement: saved.placement,
  });
}

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as MapPieceGeoreferenceSaveBody | null;

  if (!body?.placement || !body.pieceId) {
    return jsonError(400, "Map piece placement payload is invalid.");
  }

  const placementValidation = validateMapPiecePlacementForPersistence(body.placement);
  if (!placementValidation.ok) {
    return jsonError(400, placementValidation.message);
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
  const scope = await resolvePieceScope(supabase, body.pieceId, townPackage.id);

  if (scope.error || !scope.piece || !scope.page) {
    return jsonError(400, scope.error?.message ?? "Map piece placement scope could not be resolved.");
  }

  const pageType = normalizeSanbornPageType(scope.page.page_type);
  if (!pageTypeSupportsMapPlacement(pageType)) {
    const sourceRegionResult = await supabase
      .from("sanborn_source_regions")
      .select("id")
      .eq("atlas_page_id", scope.page.id)
      .eq("available_to_map_pieces", true)
      .in("region_type", ["geographic_map_content", "inset_map"])
      .limit(1);

    if (sourceRegionResult.error) {
      return jsonError(503, `Functional source regions could not be checked: ${sourceRegionResult.error.message}`);
    }

    if ((sourceRegionResult.data ?? []).length === 0) {
      return jsonError(400, getPageTypeToolBlockMessage(pageType) || "Classify this page as a Sanborn Sheet or mark a geographic source region before saving placement.");
    }
  }

  const mapYear = Number.isInteger(body.mapYear) && body.mapYear! > 0 ? body.mapYear! : townPackage.year;
  const workspaceId = sanitizeWorkspaceId(body.workspaceId, `${townPackage.package_id}-${mapYear}-historical-map-studio`);
  const normalizedPlacement = normalizeSanbornMapPieceGeoreference({
    ...body.placement,
    pieceId: body.pieceId,
    atlasPageId: scope.page.page_id,
  });
  const saveResult = await supabase.rpc("save_sanborn_map_piece_georeference", {
    p_town_package_id: townPackage.id,
    p_workspace_id: workspaceId,
    p_workspace_name: body.workspaceName?.trim().slice(0, 200) || `${townPackage.name} ${mapYear} Historical Map Studio`,
    p_map_year: mapYear,
    p_map_center: body.mapCenter && isOperationalMapCenter(body.mapCenter) ? body.mapCenter : null,
    p_map_zoom: body.mapZoom,
    p_piece_id: body.pieceId,
    p_placement: normalizedPlacement,
  });

  if (saveResult.error) {
    const status = saveResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Sanborn map piece placement could not be saved: ${saveResult.error.message}`);
  }

  const workspaceResult = await supabase
    .from("historical_map_workspaces")
    .select("id, workspace_id, updated_at")
    .eq("town_package_id", townPackage.id)
    .eq("map_year", mapYear)
    .maybeSingle<{ id: string; workspace_id: string; updated_at: string | null }>();

  if (workspaceResult.error || !workspaceResult.data) {
    return jsonError(503, "Map piece placement was saved but the workspace could not be reloaded.");
  }

  const saved = await loadSavedPiecePlacement(supabase, workspaceResult.data.id, scope.piece, scope.page);
  if (saved.error || !saved.placement) {
    return jsonError(503, "Map piece placement was saved but could not be reloaded for confirmation.");
  }

  return NextResponse.json({
    ok: true,
    workspaceId: workspaceResult.data.workspace_id,
    savedAt: workspaceResult.data.updated_at ?? new Date().toISOString(),
    pieceId: body.pieceId,
    placement: saved.placement,
  });
}
