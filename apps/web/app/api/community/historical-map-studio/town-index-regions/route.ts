import { NextRequest, NextResponse } from "next/server";

import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";
import {
  buildDefaultTownIndexRegionId,
  normalizeTownIndexRegionType,
  normalizeTownIndexStatus,
  sanbornTownIndexRegionTypes,
  sanbornTownIndexStatuses,
  validateTownIndexRegionPolygon,
} from "@/lib/sanborn-town-index";
import { normalizeOptionalSanbornText } from "@/lib/sanborn-atlas";

export const runtime = "nodejs";

type TownIndexRegionBody = {
  townPackageId?: string | null;
  atlasId?: string | null;
  region?: {
    regionId?: string | null;
    indexAtlasPageId?: string | null;
    linkedAtlasPageId?: string | null;
    linkedSheetAssetId?: string | null;
    regionLabel?: string | null;
    sheetReference?: string | null;
    regionType?: string | null;
    sourcePolygon?: unknown;
    workflowStatus?: string | null;
    progressStatus?: string | null;
    notes?: string | null;
  } | null;
};

function normalizeRegionPayload(body: TownIndexRegionBody, atlasId: string) {
  const region = body.region;

  if (!region) {
    return { ok: false as const, error: "Town Index region payload is invalid." };
  }

  const indexAtlasPageId = normalizeOptionalSanbornText(region.indexAtlasPageId, 220);
  const regionLabel = normalizeOptionalSanbornText(region.regionLabel, 180) ?? "Unlabeled index region";
  const sheetReference = normalizeOptionalSanbornText(region.sheetReference, 120);
  const requestedRegionType = normalizeOptionalSanbornText(region.regionType, 80);
  const requestedWorkflowStatus = normalizeOptionalSanbornText(region.workflowStatus, 80);
  const requestedProgressStatus = normalizeOptionalSanbornText(region.progressStatus, 80);
  const regionType = normalizeTownIndexRegionType(requestedRegionType);
  const workflowStatus = normalizeTownIndexStatus(requestedWorkflowStatus);
  const progressStatus = normalizeTownIndexStatus(requestedProgressStatus, workflowStatus);
  const polygon = validateTownIndexRegionPolygon(region.sourcePolygon);

  if (!indexAtlasPageId) {
    return { ok: false as const, error: "Town Index region must reference an index page." };
  }

  if (requestedRegionType && !sanbornTownIndexRegionTypes.includes(requestedRegionType as (typeof sanbornTownIndexRegionTypes)[number])) {
    return { ok: false as const, error: "Town Index region type is not allowed." };
  }

  if (
    (requestedWorkflowStatus && !sanbornTownIndexStatuses.includes(requestedWorkflowStatus as (typeof sanbornTownIndexStatuses)[number])) ||
    (requestedProgressStatus && !sanbornTownIndexStatuses.includes(requestedProgressStatus as (typeof sanbornTownIndexStatuses)[number]))
  ) {
    return { ok: false as const, error: "Town Index region status is not allowed." };
  }

  if (!polygon.ok) {
    return { ok: false as const, error: polygon.error };
  }

  return {
    ok: true as const,
    value: {
      regionId:
        normalizeOptionalSanbornText(region.regionId, 260) ??
        buildDefaultTownIndexRegionId({
          atlasId,
          regionLabel,
          sheetReference,
        }),
      indexAtlasPageId,
      linkedAtlasPageId: normalizeOptionalSanbornText(region.linkedAtlasPageId, 220),
      linkedSheetAssetId: normalizeOptionalSanbornText(region.linkedSheetAssetId, 180),
      regionLabel,
      sheetReference,
      regionType,
      sourcePolygon: polygon.polygon,
      workflowStatus,
      progressStatus,
      notes: normalizeOptionalSanbornText(region.notes, 4000),
    },
  };
}

export async function GET(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const townPackageId = request.nextUrl.searchParams.get("townPackageId");
  const atlasId = normalizeOptionalSanbornText(request.nextUrl.searchParams.get("atlasId"), 220);

  if (!atlasId) {
    return jsonError(400, "Atlas ID is required.");
  }

  const townPackageResult = await getRequestedTownPackage(access.supabase, townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const atlasResult = await access.supabase
    .from("sanborn_atlases")
    .select("id")
    .eq("town_package_id", townPackageResult.data.id)
    .eq("atlas_id", atlasId)
    .maybeSingle();

  if (atlasResult.error || !atlasResult.data) {
    return jsonError(400, "Sanborn atlas was not found in the selected town package.");
  }

  const regionsResult = await access.supabase
    .from("sanborn_town_index_regions")
    .select("id, region_id, town_package_id, atlas_id, index_atlas_page_id, linked_atlas_page_id, linked_sheet_asset_id, region_label, sheet_reference, region_type, source_polygon, workflow_status, progress_status, review_status, evidence_classification, notes, updated_at")
    .eq("town_package_id", townPackageResult.data.id)
    .eq("atlas_id", atlasResult.data.id)
    .order("sheet_reference", { ascending: true })
    .order("region_label", { ascending: true });

  if (regionsResult.error) {
    return jsonError(503, `Town Index regions could not be loaded: ${regionsResult.error.message}`);
  }

  return NextResponse.json({ ok: true, regions: regionsResult.data ?? [] });
}

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as TownIndexRegionBody | null;
  const atlasId = normalizeOptionalSanbornText(body?.atlasId, 220);

  if (!body || !atlasId) {
    return jsonError(400, "Town Index region payload is invalid.");
  }

  const townPackageResult = await getRequestedTownPackage(access.supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const normalized = normalizeRegionPayload(body, atlasId);

  if (!normalized.ok) {
    return jsonError(400, normalized.error);
  }

  const saveResult = await access.supabase.rpc("save_sanborn_town_index_region", {
    p_town_package_id: townPackageResult.data.id,
    p_atlas_id: atlasId,
    p_region: normalized.value,
  });

  if (saveResult.error) {
    const status = saveResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Town Index region could not be saved: ${saveResult.error.message}`);
  }

  const saved = saveResult.data as { id?: string; review_status?: string | null; evidence_classification?: string | null; updated_at?: string | null } | null;

  return NextResponse.json({
    ok: true,
    region: {
      ...normalized.value,
      rowId: saved?.id ?? "",
      townPackageId: townPackageResult.data.id,
      atlasId,
      reviewStatus: saved?.review_status ?? "unknown",
      evidenceClassification: saved?.evidence_classification ?? "unknown",
      updatedAt: saved?.updated_at ?? new Date().toISOString(),
      isPersisted: true,
    },
    savedAt: new Date().toISOString(),
  });
}

export async function DELETE(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as { townPackageId?: string | null; atlasId?: string | null; regionId?: string | null } | null;
  const atlasId = normalizeOptionalSanbornText(body?.atlasId, 220);
  const regionId = normalizeOptionalSanbornText(body?.regionId, 260);

  if (!body || !atlasId || !regionId) {
    return jsonError(400, "Town Index region delete payload is invalid.");
  }

  const townPackageResult = await getRequestedTownPackage(access.supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const deleteResult = await access.supabase.rpc("delete_sanborn_town_index_region", {
    p_town_package_id: townPackageResult.data.id,
    p_atlas_id: atlasId,
    p_region_id: regionId,
  });

  if (deleteResult.error) {
    const status = deleteResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Town Index region could not be deleted: ${deleteResult.error.message}`);
  }

  return NextResponse.json({ ok: true, regionId, result: deleteResult.data ?? null, savedAt: new Date().toISOString() });
}
