import { NextRequest, NextResponse } from "next/server";

import { reviewStatuses } from "@/lib/community-status";
import {
  birdsEyePresentationStatuses,
  mapBirdsEyePiecePresentationRow,
  validateBirdsEyeImageGeometry,
} from "@/lib/birds-eye-scene";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PresentationValidation =
  | { ok: true; presentation: Record<string, unknown> }
  | { ok: false; message: string };

function normalizePresentationInput(input: unknown, atlasId: string, referenceAssetId: string): PresentationValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, message: "Piece-presentation payload is required." };
  const record = input as Record<string, unknown>;
  const projected = validateBirdsEyeImageGeometry(record.projectedImageGeometry);
  if (!projected.ok) return projected;
  const adjusted = record.adjustedImageGeometry === null || record.adjustedImageGeometry === undefined
    ? null
    : validateBirdsEyeImageGeometry(record.adjustedImageGeometry);
  if (adjusted && !adjusted.ok) return adjusted;
  const mapPieceId = String(record.mapPieceId ?? "").trim();
  if (!mapPieceId) return { ok: false, message: "Map Piece ID is required." };
  const adjustmentStatus = String(record.adjustmentStatus ?? "projected");
  if (!birdsEyePresentationStatuses.includes(adjustmentStatus as (typeof birdsEyePresentationStatuses)[number])) return { ok: false, message: "Piece-presentation status is not allowed." };
  const reviewStatus = String(record.reviewStatus ?? "unknown");
  if (!reviewStatuses.includes(reviewStatus as (typeof reviewStatuses)[number])) return { ok: false, message: "Piece-presentation review status must use an approved classification." };
  const opacity = Number(record.opacity ?? 0.55);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) return { ok: false, message: "Piece-presentation opacity must be between 0 and 1." };
  return {
    ok: true,
    presentation: {
      ...record,
      presentationId: String(record.presentationId ?? `birds-eye-presentation-${atlasId}-${referenceAssetId}-${mapPieceId}`),
      mapPieceId,
      projectedImageGeometry: projected.geometry,
      adjustedImageGeometry: adjusted?.ok ? adjusted.geometry : null,
      adjustmentStatus,
      reviewStatus,
      opacity,
    },
  };
}

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
  const [atlas, reference] = await Promise.all([
    scope.supabase.from("sanborn_atlases").select("atlas_id").eq("atlas_id", scope.atlasId).eq("town_package_id", scope.town.id).maybeSingle(),
    scope.supabase.from("historical_map_birds_eye_reference_assets").select("asset_id").eq("asset_id", scope.referenceAssetId).eq("town_package_id", scope.town.id).maybeSingle(),
  ]);
  if (atlas.error || !atlas.data) return jsonError(404, "The selected edition was not found in this town.");
  if (reference.error || !reference.data) return jsonError(404, "The selected Birds-Eye reference was not found in this town.");
  const result = await scope.supabase
    .from("historical_map_birds_eye_piece_presentations")
    .select("*")
    .eq("town_package_id", scope.town.id)
    .eq("atlas_id", scope.atlasId)
    .eq("reference_asset_id", scope.referenceAssetId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (result.error) return jsonError(503, "Birds-Eye piece presentations could not be loaded.", { migrationRequired: true });
  return NextResponse.json({ ok: true, presentations: (result.data ?? []).map(mapBirdsEyePiecePresentationRow).filter(Boolean) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

async function save(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const scope = await resolveScope(request, body);
  if (!scope.ok) return scope.response;
  const inputs = Array.isArray(body?.presentations) ? body.presentations : body?.presentation === undefined ? [] : [body.presentation];
  if (inputs.length === 0) return jsonError(400, "At least one piece presentation is required.");
  if (inputs.length > 1000) return jsonError(400, "At most 1000 piece presentations may be saved at once.");
  const normalized = inputs.map((input) => normalizePresentationInput(input, scope.atlasId, scope.referenceAssetId));
  const invalid = normalized.find((result) => !result.ok);
  if (invalid && !invalid.ok) return jsonError(400, invalid.message);
  const presentations = normalized.flatMap((result) => result.ok ? [result.presentation] : []);
  const pieceIds = presentations.map((presentation) => String(presentation.mapPieceId));
  if (new Set(pieceIds).size !== pieceIds.length) return jsonError(400, "A bulk projection save cannot contain duplicate Map Piece IDs.");

  if (presentations.length === 1 && !Array.isArray(body?.presentations)) {
    const result = await scope.supabase.rpc("save_historical_map_birds_eye_piece_presentation", {
      p_town_package_id: scope.town.id,
      p_atlas_id: scope.atlasId,
      p_reference_asset_id: scope.referenceAssetId,
      p_presentation: presentations[0],
    });
    if (result.error) return jsonError(400, "The Birds-Eye piece presentation could not be saved. Check its edition, reference, Map Piece, and image geometry.");
    const mapped = mapBirdsEyePiecePresentationRow(result.data);
    if (!mapped) return jsonError(503, "The saved Birds-Eye piece presentation could not be normalized.");
    return NextResponse.json({ ok: true, presentation: mapped, presentations: [mapped] });
  }

  const result = await scope.supabase.rpc("save_historical_map_birds_eye_piece_presentations", {
    p_town_package_id: scope.town.id,
    p_atlas_id: scope.atlasId,
    p_reference_asset_id: scope.referenceAssetId,
    p_presentations: presentations,
  });
  if (result.error) return jsonError(400, "Projected Map Piece presentations could not be saved atomically. Check their edition, reference, source geometry, and links.");
  const rows = (result.data as { presentations?: unknown[] } | null)?.presentations ?? [];
  const mapped = rows.map(mapBirdsEyePiecePresentationRow).filter((presentation): presentation is NonNullable<typeof presentation> => Boolean(presentation));
  if (mapped.length !== presentations.length) return jsonError(503, "One or more saved Birds-Eye piece presentations could not be normalized.");
  return NextResponse.json({ ok: true, presentations: mapped });
}

export async function PUT(request: NextRequest) {
  return save(request);
}

export async function PATCH(request: NextRequest) {
  return save(request);
}
