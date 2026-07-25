import { NextRequest, NextResponse } from "next/server";

import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";
import { normalizeOptionalSanbornText } from "@/lib/sanborn-atlas";
import {
  buildDefaultSourceRegionId,
  normalizeSourceRegionType,
  normalizeTownIndexStatus,
  sanbornSourceRegionTypes,
  sanbornTownIndexStatuses,
  sourceRegionSupportsMapPieces,
  validateTownIndexRegionPolygon,
} from "@/lib/sanborn-town-index";
import { normalizeDisplayColor, normalizeDisplayOpacity, validateReferenceResolution, type ReferenceResolution } from "@/lib/town-index-review";

export const runtime = "nodejs";

type SourceRegionBody = {
  townPackageId?: string | null;
  atlasId?: string | null;
  region?: {
    regionId?: string | null;
    sourceRegionId?: string | null;
    atlasPageId?: string | null;
    indexAtlasPageId?: string | null;
    sourceAssetId?: string | null;
    sourceRecordId?: string | null;
    linkedAtlasPageId?: string | null;
    linkedSheetAssetId?: string | null;
    regionLabel?: string | null;
    printedReference?: string | null;
    sheetReference?: string | null;
    regionType?: string | null;
    sourcePolygon?: unknown;
    normalizedPolygon?: unknown;
    workflowStatus?: string | null;
    includeInTownIndex?: boolean | null;
    availableToMapPieces?: boolean | null;
    displayColor?: string | null;
    displayOpacity?: number | string | null;
    referenceResolution?: string | null;
    referenceResolutionNote?: string | null;
    notes?: string | null;
  } | null;
};

function normalizeRegionPayload(body: SourceRegionBody, atlasId: string) {
  const region = body.region;

  if (!region) {
    return { ok: false as const, error: "Source region payload is invalid." };
  }

  const atlasPageId = normalizeOptionalSanbornText(region.atlasPageId ?? region.indexAtlasPageId, 220);
  const sourceAssetId = normalizeOptionalSanbornText(region.sourceAssetId, 180);
  const regionLabel = normalizeOptionalSanbornText(region.regionLabel, 180) ?? "Unlabeled source region";
  const printedReference = normalizeOptionalSanbornText(region.printedReference ?? region.sheetReference, 120);
  const requestedRegionType = normalizeOptionalSanbornText(region.regionType, 80);
  const requestedWorkflowStatus = normalizeOptionalSanbornText(region.workflowStatus, 80);
  const regionType = normalizeSourceRegionType(requestedRegionType);
  const workflowStatus = normalizeTownIndexStatus(requestedWorkflowStatus);
  const polygon = validateTownIndexRegionPolygon(region.normalizedPolygon ?? region.sourcePolygon);
  const availableToMapPieces = region.availableToMapPieces === true;
  const referenceResolution = validateReferenceResolution(region.referenceResolution, region.referenceResolutionNote);

  if (!atlasPageId) {
    return { ok: false as const, error: "Source region must reference an atlas page." };
  }

  if (requestedRegionType && !sanbornSourceRegionTypes.includes(requestedRegionType as (typeof sanbornSourceRegionTypes)[number])) {
    return { ok: false as const, error: "Source region type is not allowed." };
  }

  if (requestedWorkflowStatus && !sanbornTownIndexStatuses.includes(requestedWorkflowStatus as (typeof sanbornTownIndexStatuses)[number])) {
    return { ok: false as const, error: "Source region status is not allowed." };
  }

  if (!polygon.ok) {
    return { ok: false as const, error: polygon.error.replace("Index region", "Source region") };
  }

  if (!referenceResolution.ok) {
    return referenceResolution;
  }

  if (
    availableToMapPieces &&
    !sourceRegionSupportsMapPieces({
      regionType,
      availableToMapPieces,
    })
  ) {
    return { ok: false as const, error: "Only geographic map content or inset map regions can be made available to Map Pieces." };
  }

  return {
    ok: true as const,
    value: {
      regionId:
        normalizeOptionalSanbornText(region.sourceRegionId ?? region.regionId, 260) ??
        buildDefaultSourceRegionId({
          atlasId,
          regionLabel,
          printedReference,
        }),
      sourceRegionId: normalizeOptionalSanbornText(region.sourceRegionId ?? region.regionId, 260),
      atlasPageId,
      indexAtlasPageId: atlasPageId,
      sourceAssetId,
      sourceRecordId: normalizeOptionalSanbornText(region.sourceRecordId, 180),
      linkedAtlasPageId: normalizeOptionalSanbornText(region.linkedAtlasPageId, 220),
      linkedSheetAssetId: normalizeOptionalSanbornText(region.linkedSheetAssetId, 180),
      regionLabel,
      printedReference,
      sheetReference: printedReference,
      regionType,
      sourcePolygon: polygon.polygon,
      normalizedPolygon: polygon.polygon,
      workflowStatus,
      progressStatus: workflowStatus,
      includeInTownIndex: region.includeInTownIndex === true,
      availableToMapPieces,
      displayColor: normalizeDisplayColor(region.displayColor),
      displayOpacity: normalizeDisplayOpacity(region.displayOpacity),
      referenceResolution: referenceResolution.status as ReferenceResolution,
      referenceResolutionNote: referenceResolution.note,
      notes: normalizeOptionalSanbornText(region.notes, 4000),
    },
  };
}

export async function PUT(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as SourceRegionBody | null;
  const atlasId = normalizeOptionalSanbornText(body?.atlasId, 220);

  if (!body || !atlasId) {
    return jsonError(400, "Source region payload is invalid.");
  }

  const townPackageResult = await getRequestedTownPackage(access.supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const normalized = normalizeRegionPayload(body, atlasId);

  if (!normalized.ok) {
    return jsonError(400, normalized.error);
  }

  // The additive migration extends the canonical type allowlist; the legacy RPC is
  // retained for compatibility and only knows the pre-0020 fallback type.
  const rpcRegion = normalized.value.regionType === "specials" ? { ...normalized.value, regionType: "other" } : normalized.value;
  const saveResult = await access.supabase.rpc("save_sanborn_source_region", {
    p_town_package_id: townPackageResult.data.id,
    p_atlas_id: atlasId,
    p_region: rpcRegion,
  });

  if (saveResult.error) {
    const status = saveResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Source region could not be saved: ${saveResult.error.message}`);
  }

  const provenanceResult = await access.supabase.rpc("set_sanborn_source_region_provenance", {
    p_town_package_id: townPackageResult.data.id,
    p_atlas_id: atlasId,
    p_source_region_id: normalized.value.regionId,
    p_source_record_id: normalized.value.sourceRecordId,
  });
  if (provenanceResult.error) {
    const status = provenanceResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Source region provenance could not be saved: ${provenanceResult.error.message}`);
  }

  const displayResult = await access.supabase
    .from("sanborn_source_regions")
    .update({
      display_color: normalized.value.displayColor,
      display_opacity: normalized.value.displayOpacity,
      region_type: normalized.value.regionType,
      reference_resolution: normalized.value.referenceResolution,
      reference_resolution_note: normalized.value.referenceResolutionNote,
    })
    .eq("source_region_id", normalized.value.regionId)
    .eq("town_package_id", townPackageResult.data.id);
  if (displayResult.error) {
    return jsonError(503, `Town Index display metadata could not be saved: ${displayResult.error.message}`);
  }

  const saved = saveResult.data as {
    id?: string;
    source_region_id?: string;
    review_status?: string | null;
    evidence_classification?: string | null;
    updated_at?: string | null;
  } | null;

  return NextResponse.json({
    ok: true,
    region: {
      ...normalized.value,
      regionId: saved?.source_region_id ?? normalized.value.regionId,
      rowId: saved?.id ?? "",
      townPackageId: townPackageResult.data.id,
      atlasId,
      reviewStatus: saved?.review_status ?? "unknown",
      evidenceClassification: saved?.evidence_classification ?? "unknown",
      sourceRecordId: provenanceResult.data?.source_record_id ?? normalized.value.sourceRecordId ?? null,
      displayColor: normalized.value.displayColor,
      displayOpacity: normalized.value.displayOpacity,
      referenceResolution: normalized.value.referenceResolution,
      referenceResolutionNote: normalized.value.referenceResolutionNote,
      updatedAt: saved?.updated_at ?? new Date().toISOString(),
      isPersisted: true,
    },
    savedAt: new Date().toISOString(),
  });
}

export async function DELETE(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as { townPackageId?: string | null; atlasId?: string | null; sourceRegionId?: string | null; regionId?: string | null } | null;
  const atlasId = normalizeOptionalSanbornText(body?.atlasId, 220);
  const regionId = normalizeOptionalSanbornText(body?.sourceRegionId ?? body?.regionId, 260);

  if (!body || !atlasId || !regionId) {
    return jsonError(400, "Source region delete payload is invalid.");
  }

  const townPackageResult = await getRequestedTownPackage(access.supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const deleteResult = await access.supabase.rpc("delete_sanborn_source_region", {
    p_town_package_id: townPackageResult.data.id,
    p_atlas_id: atlasId,
    p_source_region_id: regionId,
  });

  if (deleteResult.error) {
    const status = deleteResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Source region could not be deleted: ${deleteResult.error.message}`);
  }

  return NextResponse.json({ ok: true, regionId, result: deleteResult.data ?? null, savedAt: new Date().toISOString() });
}
