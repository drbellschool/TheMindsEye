import { NextRequest, NextResponse } from "next/server";

import { buildTownPackageLocationUpdate, geocodeLocation } from "@/lib/historical-map-geocode";
import { jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type GeocodeBody = {
  query?: unknown;
  townPackageId?: unknown;
  saveToTownPackage?: unknown;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as GeocodeBody | null;
  const result = await geocodeLocation(body?.query);

  if (!result.ok) {
    return NextResponse.json(result, { status: result.code === "provider_error" ? 502 : 400 });
  }

  if (!body?.saveToTownPackage) {
    return NextResponse.json(result);
  }

  if (typeof body.townPackageId !== "string" || body.townPackageId.trim().length === 0) {
    return jsonError(400, "Choose an active town package before saving its map location.");
  }

  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const update = buildTownPackageLocationUpdate(result);
  const saveResult = await access.supabase
    .from("town_packages")
    .update(update)
    .eq("id", body.townPackageId)
    .select(
      "id, package_id, center_latitude, center_longitude, default_zoom, location_query, location_display_name, location_north, location_south, location_east, location_west",
    )
    .single();

  if (saveResult.error || !saveResult.data) {
    return jsonError(503, "The resolved location could not be saved to the active town package.");
  }

  return NextResponse.json({
    ...result,
    saved: true,
    townPackage: saveResult.data,
  });
}
