import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  boundsFromCorners,
  calculateAffineTransform,
  clampOverlayOpacity,
  cornersFromBounds,
  deriveGeoreferenceStatus,
  getCompleteControlPoints,
  normalizeControlPoint,
  normalizeGeoreferenceStatus,
  normalizeGeoreferenceTargetType,
  normalizeGeoBounds,
  normalizeTransformationType,
  validateGeoCoordinate,
  type GeoBounds,
  type GeoCorners,
  type HistoricalMapControlPoint,
} from "@/lib/historical-map-georeference";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type GeoreferenceSaveBody = {
  townPackageId?: string;
  mapYear?: number;
  workspaceId?: string;
  workspaceName?: string;
  targetType?: string;
  targetAssetId?: string | null;
  status?: string;
  bounds?: Partial<GeoBounds> | null;
  corners?: Partial<Record<keyof GeoCorners, { latitude?: number; longitude?: number } | null>>;
  controlPoints?: Array<Partial<HistoricalMapControlPoint> & { controlPointId?: string }>;
  selectedBasemap?: string;
  overlayOpacity?: number;
  overlayVisible?: boolean;
  showControlPoints?: boolean;
  showSheetBoundaries?: boolean;
  notes?: string | null;
};

type WorkspaceRow = {
  id: string;
  workspace_id: string;
};

type SheetRow = {
  id: string;
  asset_id: string;
  town_package_id: string;
};

type GeoreferenceRow = {
  id: string;
  georeference_id: string;
};

function normalizeCorners(input: GeoreferenceSaveBody["corners"], fallbackBounds: GeoBounds | null): GeoCorners {
  const fallback = cornersFromBounds(fallbackBounds);

  return {
    northwest: normalizeCorner(input?.northwest) ?? fallback.northwest,
    northeast: normalizeCorner(input?.northeast) ?? fallback.northeast,
    southeast: normalizeCorner(input?.southeast) ?? fallback.southeast,
    southwest: normalizeCorner(input?.southwest) ?? fallback.southwest,
  };
}

function normalizeCorner(input: { latitude?: number; longitude?: number } | null | undefined) {
  if (!input || typeof input.latitude !== "number" || typeof input.longitude !== "number") {
    return null;
  }

  const coordinate = {
    latitude: input.latitude,
    longitude: input.longitude,
  };

  return validateGeoCoordinate(coordinate).ok ? coordinate : null;
}

function validateCorners(corners: GeoCorners) {
  for (const coordinate of [corners.northwest, corners.northeast, corners.southeast, corners.southwest]) {
    if (coordinate && !validateGeoCoordinate(coordinate).ok) {
      return false;
    }
  }

  return true;
}

function mapControlPoints(points: GeoreferenceSaveBody["controlPoints"]): HistoricalMapControlPoint[] {
  return (points ?? []).map((point, index) =>
    normalizeControlPoint({
      controlPointId: point.controlPointId || `cp-${index + 1}-${randomUUID()}`,
      label: point.label || `Control point ${index + 1}`,
      imageX: point.imageX,
      imageY: point.imageY,
      latitude: point.latitude,
      longitude: point.longitude,
      confidence: point.confidence || "draft",
      targetAssetId: point.targetAssetId ?? null,
      residualError: point.residualError,
      isComplete: point.isComplete,
      notes: point.notes,
      createdAt: point.createdAt,
      updatedAt: point.updatedAt,
    }),
  );
}

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as GeoreferenceSaveBody | null;

  if (!body) {
    return jsonError(400, "Georeference payload is invalid.");
  }

  const { supabase } = access;
  const townResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townResult.error || !townResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const town = townResult.data;
  const mapYear = Number.isInteger(body.mapYear) && body.mapYear! > 0 ? body.mapYear! : town.year;
  const workspaceId = body.workspaceId || `${town.package_id}-${mapYear}-historical-map-studio`;
  const workspaceResult = await supabase
    .from("historical_map_workspaces")
    .upsert(
      {
        workspace_id: workspaceId,
        town_package_id: town.id,
        map_year: mapYear,
        name: body.workspaceName?.trim().slice(0, 200) || `${town.name} ${mapYear} Historical Map Studio`,
        review_status: "unknown",
        evidence_classification: "unknown",
      },
      { onConflict: "town_package_id,map_year" },
    )
    .select("id, workspace_id")
    .single();

  if (workspaceResult.error || !workspaceResult.data) {
    return jsonError(503, "Historical Map Studio workspace could not be prepared for georeferencing.");
  }

  const targetType = normalizeGeoreferenceTargetType(body.targetType);
  let sheetRow: SheetRow | null = null;

  if (targetType === "sheet") {
    if (!body.targetAssetId) {
      return jsonError(400, "Sheet georeferencing requires a target sheet asset.");
    }

    const sheetResult = await supabase
      .from("sanborn_sheet_assets")
      .select("id, asset_id, town_package_id")
      .eq("asset_id", body.targetAssetId)
      .eq("town_package_id", town.id)
      .maybeSingle();

    if (sheetResult.error) {
      return jsonError(503, "Target sheet lookup failed.");
    }

    if (!sheetResult.data) {
      return jsonError(400, "Target sheet does not belong to the selected town package.");
    }

    sheetRow = sheetResult.data;
  }

  const bounds = normalizeGeoBounds(body.bounds);
  const corners = normalizeCorners(body.corners, bounds);

  if (!validateCorners(corners)) {
    return jsonError(400, "One or more geographic corners contain invalid latitude or longitude.");
  }

  const derivedBounds = boundsFromCorners(corners) ?? bounds;
  const controlPoints = mapControlPoints(body.controlPoints);
  const completePoints = getCompleteControlPoints(controlPoints);
  const transform = calculateAffineTransform(completePoints);
  const requestedStatus = normalizeGeoreferenceStatus(body.status);
  const derivedStatus = requestedStatus === "reviewed" ? "reviewed" : deriveGeoreferenceStatus({ corners, controlPoints });
  const transformationType = transform.ok ? "affine" : derivedBounds ? "bounding_box" : normalizeTransformationType("none");
  const existingQuery = supabase
    .from("historical_map_georeferences")
    .select("id, georeference_id")
    .eq("workspace_id", workspaceResult.data.id)
    .eq("target_type", targetType);
  const existingResult =
    targetType === "workspace"
      ? await existingQuery.is("sanborn_sheet_asset_id", null).maybeSingle()
      : await existingQuery.eq("sanborn_sheet_asset_id", sheetRow!.id).maybeSingle();

  if (existingResult.error) {
    return jsonError(503, "Existing georeference lookup failed.");
  }

  const georeferenceId = existingResult.data?.georeference_id ?? `${workspaceResult.data.workspace_id}-${targetType}-${sheetRow?.asset_id ?? "workspace"}-georef`;
  const record = {
    georeference_id: georeferenceId,
    workspace_id: workspaceResult.data.id,
    sanborn_sheet_asset_id: sheetRow?.id ?? null,
    town_package_id: town.id,
    map_year: mapYear,
    target_type: targetType,
    status: derivedStatus,
    transformation_type: transformationType,
    north_latitude: derivedBounds?.northLatitude ?? null,
    south_latitude: derivedBounds?.southLatitude ?? null,
    east_longitude: derivedBounds?.eastLongitude ?? null,
    west_longitude: derivedBounds?.westLongitude ?? null,
    northwest_latitude: corners.northwest?.latitude ?? null,
    northwest_longitude: corners.northwest?.longitude ?? null,
    northeast_latitude: corners.northeast?.latitude ?? null,
    northeast_longitude: corners.northeast?.longitude ?? null,
    southeast_latitude: corners.southeast?.latitude ?? null,
    southeast_longitude: corners.southeast?.longitude ?? null,
    southwest_latitude: corners.southwest?.latitude ?? null,
    southwest_longitude: corners.southwest?.longitude ?? null,
    transform_matrix: transform.ok ? transform.matrix : null,
    residual_error: transform.ok ? transform.residualError : null,
    control_point_count: completePoints.length,
    selected_basemap: body.selectedBasemap?.trim().slice(0, 80) || "osm",
    overlay_opacity: clampOverlayOpacity(body.overlayOpacity),
    overlay_visible: body.overlayVisible ?? true,
    show_control_points: body.showControlPoints ?? true,
    show_sheet_boundaries: body.showSheetBoundaries ?? true,
    rendering_mode: "rectangular_preview",
    review_status: "unknown",
    evidence_classification: "unknown",
    notes: body.notes?.trim().slice(0, 2000) || null,
  };
  const saveResult = existingResult.data
    ? await supabase.from("historical_map_georeferences").update(record).eq("id", existingResult.data.id).select("id, georeference_id").single()
    : await supabase.from("historical_map_georeferences").insert(record).select("id, georeference_id").single();

  if (saveResult.error || !saveResult.data) {
    return jsonError(503, "Geographic alignment could not be saved.");
  }

  const deletePointsResult = await supabase.from("historical_map_control_points").delete().eq("georeference_id", saveResult.data.id);

  if (deletePointsResult.error) {
    return jsonError(503, "Previous control points could not be cleared.");
  }

  if (controlPoints.length > 0) {
    const insertPointsResult = await supabase.from("historical_map_control_points").insert(
      controlPoints.map((point) => ({
        georeference_id: saveResult.data!.id,
        sanborn_sheet_asset_id: sheetRow?.id ?? null,
        control_point_id: point.controlPointId,
        label: point.label,
        image_x: point.imageX,
        image_y: point.imageY,
        latitude: point.latitude,
        longitude: point.longitude,
        confidence: point.confidence,
        residual_error: point.residualError,
        is_complete: point.isComplete,
        notes: point.notes,
      })),
    );

    if (insertPointsResult.error) {
      return jsonError(503, "Control points could not be saved.");
    }
  }

  return NextResponse.json({
    ok: true,
    georeferenceId: saveResult.data.georeference_id,
    status: derivedStatus,
    transformationType,
    controlPointCount: completePoints.length,
    residualError: transform.ok ? transform.residualError : null,
    transformWarning: transform.ok ? undefined : transform.error,
    bounds: derivedBounds,
  });
}
