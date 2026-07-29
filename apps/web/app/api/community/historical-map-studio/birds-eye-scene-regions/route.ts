import { NextRequest, NextResponse } from "next/server";

import { reviewStatuses } from "@/lib/community-status";
import {
  birdsEyeSceneRegionTypes,
  deriveBirdsEyeCropBounds,
  mapBirdsEyeSceneRegionRow,
  validateBirdsEyeImageGeometry,
} from "@/lib/birds-eye-scene";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveScope(request: NextRequest, body?: Record<string, unknown> | null) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access;
  const params = request.nextUrl.searchParams;
  const townPackageId = String(body?.townPackageId ?? params.get("townPackageId") ?? "");
  const atlasId = String(body?.atlasId ?? params.get("atlasId") ?? "");
  const referenceAssetId = String(body?.referenceAssetId ?? params.get("referenceAssetId") ?? "");
  if (!townPackageId) return { ok: false as const, response: jsonError(400, "Town package is required.") };
  const town = await getRequestedTownPackage(access.supabase, townPackageId);
  if (town.error || !town.data) return { ok: false as const, response: jsonError(400, "The town package could not be loaded.") };
  if (town.data.id !== townPackageId && town.data.package_id !== townPackageId) return { ok: false as const, response: jsonError(404, "The requested town package was not found.") };
  if (!atlasId || !referenceAssetId) return { ok: false as const, response: jsonError(400, "Edition and Birds-Eye reference are required.") };
  return { ok: true as const, supabase: access.supabase, town: town.data, atlasId, referenceAssetId };
}

export async function GET(request: NextRequest) {
  const scope = await resolveScope(request);
  if (!scope.ok) return scope.response;
  const atlas = await scope.supabase.from("sanborn_atlases").select("atlas_id").eq("atlas_id", scope.atlasId).eq("town_package_id", scope.town.id).maybeSingle();
  if (atlas.error || !atlas.data) return jsonError(404, "The selected edition was not found in this town.");
  const reference = await scope.supabase.from("historical_map_birds_eye_reference_assets").select("asset_id").eq("asset_id", scope.referenceAssetId).eq("town_package_id", scope.town.id).maybeSingle();
  if (reference.error || !reference.data) return jsonError(404, "The selected Birds-Eye reference was not found in this town.");
  let query = scope.supabase
    .from("historical_map_birds_eye_scene_regions")
    .select("*")
    .eq("town_package_id", scope.town.id)
    .eq("atlas_id", scope.atlasId)
    .eq("reference_asset_id", scope.referenceAssetId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (request.nextUrl.searchParams.get("includeArchived") !== "true") query = query.is("archived_at", null);
  const result = await query;
  if (result.error) return jsonError(503, "Birds-Eye scene regions could not be loaded.", { migrationRequired: true });
  return NextResponse.json({ ok: true, regions: (result.data ?? []).map(mapBirdsEyeSceneRegionRow).filter(Boolean) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

async function save(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const scope = await resolveScope(request, body);
  if (!scope.ok) return scope.response;
  const regionInput = body?.region && typeof body.region === "object" && !Array.isArray(body.region) ? body.region as Record<string, unknown> : null;
  if (!regionInput) return jsonError(400, "Scene-region payload is required.");
  const geometry = validateBirdsEyeImageGeometry(regionInput.imageGeometry, { polygonOnly: true });
  if (!geometry.ok) return jsonError(400, geometry.message);
  const regionType = String(regionInput.regionType ?? "unknown");
  if (!birdsEyeSceneRegionTypes.includes(regionType as (typeof birdsEyeSceneRegionTypes)[number])) return jsonError(400, "Scene-region type is not allowed.");
  const label = String(regionInput.label ?? "").trim();
  if (!label) return jsonError(400, "Scene-region label is required.");
  const evidenceClassification = String(regionInput.evidenceClassification ?? "unknown");
  const reviewStatus = String(regionInput.reviewStatus ?? "unknown");
  if (!reviewStatuses.includes(evidenceClassification as (typeof reviewStatuses)[number]) || !reviewStatuses.includes(reviewStatus as (typeof reviewStatuses)[number])) return jsonError(400, "Scene-region evidence and review states must use approved classifications.");
  const confidence = regionInput.confidence === null || regionInput.confidence === "" || regionInput.confidence === undefined ? null : Number(regionInput.confidence);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) return jsonError(400, "Scene-region confidence must be between 0 and 1.");
  const region = {
    ...regionInput,
    regionId: String(regionInput.regionId ?? `birds-eye-region-${crypto.randomUUID()}`),
    label,
    regionType,
    imageGeometry: geometry.geometry,
    cropBounds: deriveBirdsEyeCropBounds(geometry.geometry),
    evidenceClassification,
    reviewStatus,
    confidence,
  };
  const result = await scope.supabase.rpc("save_historical_map_birds_eye_scene_region", {
    p_town_package_id: scope.town.id,
    p_atlas_id: scope.atlasId,
    p_reference_asset_id: scope.referenceAssetId,
    p_region: region,
  });
  if (result.error) return jsonError(400, "The Birds-Eye scene region could not be saved. Check its town, edition, reference, geometry, and links.");
  const mapped = mapBirdsEyeSceneRegionRow(result.data);
  if (!mapped) return jsonError(503, "The saved Birds-Eye scene region could not be normalized.");
  return NextResponse.json({ ok: true, region: mapped });
}

export async function POST(request: NextRequest) {
  return save(request);
}

export async function PATCH(request: NextRequest) {
  return save(request);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const scope = await resolveScope(request, body);
  if (!scope.ok) return scope.response;
  const regionId = String(body?.regionId ?? "").trim();
  if (!regionId) return jsonError(400, "Scene-region ID is required.");
  const result = await scope.supabase.rpc("archive_historical_map_birds_eye_scene_region", {
    p_town_package_id: scope.town.id,
    p_atlas_id: scope.atlasId,
    p_reference_asset_id: scope.referenceAssetId,
    p_region_id: regionId,
  });
  if (result.error) return jsonError(400, "The Birds-Eye scene region could not be archived in the selected scope.");
  return NextResponse.json({ ok: true, ...(result.data as Record<string, unknown>) });
}
