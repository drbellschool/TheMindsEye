import { NextRequest, NextResponse } from "next/server";
import { birdsEyeAnchorTypes } from "@/lib/birds-eye-calibration";
import { jsonError, getRequestedTownPackage, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as { townPackageId?: string; atlasId?: string; calibration?: Record<string, unknown>; controlPoints?: unknown[] } | null;
  if (!body?.townPackageId || !body.atlasId || !body.calibration || !Array.isArray(body.controlPoints)) return jsonError(400, "Birds-Eye calibration payload is invalid.");
  const town = await getRequestedTownPackage(access.supabase, body.townPackageId);
  if (town.error || !town.data) return jsonError(400, "The town package could not be loaded.");
  if (town.data.id !== body.townPackageId && town.data.package_id !== body.townPackageId) return jsonError(404, "The requested town package was not found.");
  const points = body.controlPoints as Array<Record<string, unknown>>;
  if (points.length > 450) return jsonError(400, "Birds-Eye calibration supports at most 450 control points.");
  const sequences = points.map((point) => Number(point.sequence));
  if (sequences.some((sequence) => !Number.isInteger(sequence) || sequence < 1) || new Set(sequences).size !== sequences.length) return jsonError(400, "Control-point sequence numbers must be unique positive integers.");
  const referenceAssetId = String(body.calibration.referenceAssetId ?? "");
  const reference = referenceAssetId
    ? await access.supabase.from("historical_map_birds_eye_reference_assets").select("width, height").eq("asset_id", referenceAssetId).eq("town_package_id", town.data.id).maybeSingle()
    : { data: null, error: null };
  if (reference.error || (referenceAssetId && !reference.data)) return jsonError(400, "The calibration reference asset does not belong to the selected town.");
  for (const point of points) {
    for (const key of ["longitude", "latitude", "imageX", "imageY"]) {
      const value = point[key];
      if (value !== null && value !== undefined && (!Number.isFinite(Number(value)))) return jsonError(400, "Control-point coordinates must be finite numbers.");
    }
    if (point.longitude !== null && point.longitude !== undefined && (Number(point.longitude) < -180 || Number(point.longitude) > 180)) return jsonError(400, "Control-point longitude is outside the valid range.");
    if (point.latitude !== null && point.latitude !== undefined && (Number(point.latitude) < -90 || Number(point.latitude) > 90)) return jsonError(400, "Control-point latitude is outside the valid range.");
    if (reference.data && point.imageX !== null && point.imageX !== undefined && (Number(point.imageX) < 0 || Number(point.imageX) > Number(reference.data.width))) return jsonError(400, "Control-point image X must remain inside the original image.");
    if (reference.data && point.imageY !== null && point.imageY !== undefined && (Number(point.imageY) < 0 || Number(point.imageY) > Number(reference.data.height))) return jsonError(400, "Control-point image Y must remain inside the original image.");
    if (point.anchorType && !birdsEyeAnchorTypes.includes(String(point.anchorType) as (typeof birdsEyeAnchorTypes)[number])) return jsonError(400, "Control-point anchor type is not supported.");
    for (const key of ["sourceMapZoom", "sourceMapBearing"]) {
      const value = point[key];
      if (value !== null && value !== undefined && value !== "" && !Number.isFinite(Number(value))) return jsonError(400, "Control-point map metadata must use finite numbers.");
    }
  }
  const result = await access.supabase.rpc("save_historical_map_birds_eye_calibration", { p_town_package_id: town.data.id, p_atlas_id: body.atlasId, p_calibration: body.calibration, p_control_points: points });
  if (result.error) return jsonError(503, "The Birds-Eye calibration could not be saved.");
  return NextResponse.json({ ok: true, ...(result.data as Record<string, unknown>) });
}

export async function GET(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;
  const params = new URL(request.url).searchParams;
  const townPackageId = params.get("townPackageId");
  const town = await getRequestedTownPackage(access.supabase, townPackageId);
  const atlasId = params.get("atlasId");
  if (!townPackageId || town.error || !town.data || !atlasId) return jsonError(400, "Town and edition are required.");
  if (town.data.id !== townPackageId && town.data.package_id !== townPackageId) return jsonError(404, "The requested town package was not found.");
  const atlas = await access.supabase.from("sanborn_atlases").select("id").eq("atlas_id", atlasId).eq("town_package_id", town.data.id).is("archived_at", null).maybeSingle();
  if (atlas.error || !atlas.data) return jsonError(404, "The active edition was not found.");
  const calibration = await access.supabase.from("historical_map_birds_eye_calibrations").select("*").eq("atlas_id", atlas.data.id).maybeSingle();
  if (calibration.error) return jsonError(503, "The Birds-Eye calibration could not be loaded.");
  const points = calibration.data ? await access.supabase.from("historical_map_birds_eye_control_points").select("*").eq("calibration_id", calibration.data.id).is("deleted_at", null).order("sequence_number", { ascending: true }) : { data: [], error: null };
  if (points.error) return jsonError(503, "Birds-Eye control points could not be loaded.");
  return NextResponse.json({ ok: true, calibration: calibration.data, controlPoints: points.data ?? [] }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
