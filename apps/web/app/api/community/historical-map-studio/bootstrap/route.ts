import { NextRequest, NextResponse } from "next/server";
import { loadHistoricalMapStudioDataUncached } from "@/lib/historical-map-studio-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const townPackageId = params.get("townPackageId") ?? params.get("town");
  const mapYear = params.get("mapYear") ?? params.get("year");
  const atlasId = params.get("atlasId") ?? params.get("atlas");
  const state = await loadHistoricalMapStudioDataUncached({ townPackageId: townPackageId ?? undefined, mapYear: mapYear ?? undefined, atlasId: atlasId ?? undefined });
  const response = NextResponse.json({ ok: true, state, loadedAt: new Date().toISOString(), request: { townPackageId, mapYear, atlasId } });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
