import { NextRequest, NextResponse } from "next/server";
import { jsonError, getRequestedTownPackage, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as { townPackageId?: string; atlasId?: string; calibration?: Record<string, unknown>; controlPoints?: unknown[] } | null;
  if (!body?.atlasId || !body.calibration || !Array.isArray(body.controlPoints)) return jsonError(400, "Birds-Eye calibration payload is invalid.");
  const town = await getRequestedTownPackage(access.supabase, body.townPackageId);
  if (town.error || !town.data) return jsonError(400, "The town package could not be loaded.");
  const points = body.controlPoints as Array<Record<string, unknown>>;
  if (points.length > 450) return jsonError(400, "Birds-Eye calibration supports at most 450 control points.");
  const sequences = points.map((point) => Number(point.sequence));
  if (sequences.some((sequence) => !Number.isInteger(sequence) || sequence < 1) || new Set(sequences).size !== sequences.length) return jsonError(400, "Control-point sequence numbers must be unique positive integers.");
  for (const point of points) {
    for (const key of ["longitude", "latitude", "imageX", "imageY"]) {
      const value = point[key];
      if (value !== null && value !== undefined && (!Number.isFinite(Number(value)))) return jsonError(400, "Control-point coordinates must be finite numbers.");
    }
  }
  const result = await access.supabase.rpc("save_historical_map_birds_eye_calibration", { p_town_package_id: town.data.id, p_atlas_id: body.atlasId, p_calibration: body.calibration, p_control_points: points });
  if (result.error) return jsonError(503, "The Birds-Eye calibration could not be saved.");
  return NextResponse.json({ ok: true, ...(result.data as Record<string, unknown>) });
}

export async function GET(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;
  const town = await getRequestedTownPackage(access.supabase, new URL(request.url).searchParams.get("townPackageId"));
  const atlasId = new URL(request.url).searchParams.get("atlasId");
  if (town.error || !town.data || !atlasId) return jsonError(400, "Town and edition are required.");
  const atlas = await access.supabase.from("sanborn_atlases").select("id").eq("atlas_id", atlasId).eq("town_package_id", town.data.id).is("archived_at", null).maybeSingle();
  if (atlas.error || !atlas.data) return jsonError(404, "The active edition was not found.");
  const calibration = await access.supabase.from("historical_map_birds_eye_calibrations").select("*").eq("atlas_id", atlas.data.id).maybeSingle();
  if (calibration.error) return jsonError(503, "The Birds-Eye calibration could not be loaded.");
  const points = calibration.data ? await access.supabase.from("historical_map_birds_eye_control_points").select("*").eq("calibration_id", calibration.data.id).is("deleted_at", null).order("sequence_number", { ascending: true }) : { data: [], error: null };
  if (points.error) return jsonError(503, "Birds-Eye control points could not be loaded.");
  return NextResponse.json({ ok: true, calibration: calibration.data, controlPoints: points.data ?? [] });
}
