import { NextRequest, NextResponse } from "next/server";
import { reviewStatuses } from "@/lib/community-status";
import { defaultBirdsEyeDerivedPlacement, mapBirdsEyeDerivedMapPieceRow, birdsEyeDerivedPlacementPrecisions, birdsEyeDerivedPlacementTypes } from "@/lib/birds-eye-derived-map-pieces";
import { birdsEyeSceneRegionTypes, type BirdsEyeSceneRegionType } from "@/lib/birds-eye-scene";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function scope(request: NextRequest, body?: Record<string, unknown> | null) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access;
  const params = request.nextUrl.searchParams;
  const townPackageId = String(body?.townPackageId ?? params.get("townPackageId") ?? "");
  const atlasId = String(body?.atlasId ?? params.get("atlasId") ?? "");
  const referenceAssetId = String(body?.referenceAssetId ?? params.get("referenceAssetId") ?? "");
  if (!townPackageId || !atlasId || !referenceAssetId) return { ok: false as const, response: jsonError(400, "Town, edition, and reference asset are required.") };
  const town = await getRequestedTownPackage(access.supabase, townPackageId);
  if (town.error || !town.data) return { ok: false as const, response: jsonError(404, "The town package was not found.") };
  return { ok: true as const, supabase: access.supabase, town: town.data, townPackageId, atlasId, referenceAssetId };
}

export async function GET(request: NextRequest) {
  const current = await scope(request);
  if (!current.ok) return current.response;
  const result = await current.supabase.from("historical_map_birds_eye_derived_map_pieces").select("*").eq("town_package_id", current.town.id).eq("atlas_id", current.atlasId).eq("reference_asset_id", current.referenceAssetId).order("created_at", { ascending: true });
  if (result.error) return jsonError(503, "Birds-Eye derived Map Pieces could not be loaded.", { migrationRequired: true });
  const pieces = (result.data ?? []).map(mapBirdsEyeDerivedMapPieceRow).filter((piece): piece is NonNullable<typeof piece> => Boolean(piece));
  return NextResponse.json({ ok: true, pieces }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const current = await scope(request, body);
  if (!current.ok) return current.response;
  const regionId = String(body?.regionId ?? "").trim();
  if (!regionId) return jsonError(400, "Source scene region is required.");
  const regionResult = await current.supabase.from("historical_map_birds_eye_scene_regions").select("label, region_type, reference_asset_id, image_geometry, description, reconstruction_notes, confidence, evidence_classification, review_status, archived_at").eq("town_package_id", current.town.id).eq("atlas_id", current.atlasId).eq("reference_asset_id", current.referenceAssetId).eq("region_id", regionId).maybeSingle();
  if (regionResult.error || !regionResult.data) return jsonError(404, "The source scene region was not found in this edition.");
  if (regionResult.data.archived_at) return jsonError(409, "Archived scene regions cannot create new derived Map Pieces; existing provenance is preserved.");
  const asset = await current.supabase.from("historical_map_birds_eye_reference_assets").select("original_filename").eq("town_package_id", current.town.id).eq("asset_id", current.referenceAssetId).maybeSingle();
  const regionTypeCandidate = String(body?.regionType ?? regionResult.data.region_type);
  const regionType = birdsEyeSceneRegionTypes.includes(regionTypeCandidate as BirdsEyeSceneRegionType) ? regionTypeCandidate as BirdsEyeSceneRegionType : "unknown";
  const defaults = defaultBirdsEyeDerivedPlacement(regionType);
  const placementType = String(body?.placementType ?? defaults.placementType);
  const precision = String(body?.placementPrecision ?? defaults.placementPrecision);
  const evidenceClassification = String(body?.evidenceClassification ?? regionResult.data.evidence_classification ?? "unknown");
  if (!birdsEyeDerivedPlacementTypes.includes(placementType as never) || !birdsEyeDerivedPlacementPrecisions.includes(precision as never) || !reviewStatuses.includes(evidenceClassification as never)) return jsonError(400, "Derived Map Piece classification or precision is invalid.");
  const result = await current.supabase.rpc("create_birds_eye_derived_map_piece", {
    p_town_package_id: current.town.id, p_atlas_id: current.atlasId, p_reference_asset_id: current.referenceAssetId, p_region_id: regionId,
    p_piece: { label: String(body?.label ?? regionResult.data.label), regionType, placementType, placementPrecision: precision, sourceFilename: asset.data?.original_filename ?? "Historical Birds-Eye reference", provenanceNote: String(body?.provenanceNote ?? ""), sourceNotes: String(body?.sourceNotes ?? ""), evidenceClassification },
  });
  if (result.error) return jsonError(400, "The derived Map Piece could not be created. Check the scene region and apply migration 0027.");
  const data = result.data as { duplicate?: boolean; derivedPiece?: unknown } | null;
  const piece = mapBirdsEyeDerivedMapPieceRow(data?.derivedPiece);
  if (!piece) return jsonError(503, "The derived Map Piece response could not be normalized.");
  return NextResponse.json({ ok: true, duplicate: Boolean(data?.duplicate), piece, message: data?.duplicate ? "A derived Map Piece already exists for this scene region." : "Derived Map Piece created. Its shape is approximate and must be placed in Map Placement." });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const current = await scope(request, body);
  if (!current.ok) return current.response;
  const derivedPieceId = String(body?.derivedPieceId ?? "").trim();
  const placement = body?.placement && typeof body.placement === "object" ? body.placement : null;
  if (!derivedPieceId || !placement) return jsonError(400, "Derived Map Piece and placement are required.");
  const result = await current.supabase.rpc("save_birds_eye_derived_map_piece_placement", { p_town_package_id: current.town.id, p_atlas_id: current.atlasId, p_derived_piece_id: derivedPieceId, p_placement: placement });
  if (result.error) return jsonError(400, "The approximate derived placement could not be saved.");
  const piece = mapBirdsEyeDerivedMapPieceRow((result.data as { derivedPiece?: unknown })?.derivedPiece);
  return piece ? NextResponse.json({ ok: true, piece }) : jsonError(503, "The saved derived placement could not be normalized.");
}
