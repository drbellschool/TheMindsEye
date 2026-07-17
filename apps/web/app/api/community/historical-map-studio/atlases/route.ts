import { NextRequest, NextResponse } from "next/server";

import {
  buildDefaultSanbornAtlasId,
  normalizeOptionalSanbornText,
  normalizePositiveInteger,
  normalizeSanbornReviewStatus,
} from "@/lib/sanborn-atlas";
import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type AtlasSaveBody = {
  townPackageId?: string;
  mapYear?: number;
  atlasId?: string;
  sourceRecordId?: string | null;
  title?: string | null;
  editionYear?: number | string | null;
  editionDate?: string | null;
  volumeLabel?: string | null;
  expectedPageCount?: number | string | null;
};

type SourceRecordRow = {
  id: string;
};

function normalizeEditionDate(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalSanbornText(value, 10);
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export async function POST(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as AtlasSaveBody | null;

  if (!body) {
    return jsonError(400, "Atlas payload is invalid.");
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
  const mapYear = normalizePositiveInteger(body.mapYear) ?? townPackage.year;
  const editionYear = normalizePositiveInteger(body.editionYear) ?? mapYear;
  const volumeLabel = normalizeOptionalSanbornText(body.volumeLabel, 80);
  const expectedPageCount = normalizePositiveInteger(body.expectedPageCount);
  const title = normalizeOptionalSanbornText(body.title, 240) ?? `${townPackage.name} ${editionYear} Sanborn Atlas`;
  let atlasId =
    normalizeOptionalSanbornText(body.atlasId, 160) ??
    buildDefaultSanbornAtlasId({
      townPackageId: townPackage.package_id,
      editionYear,
      volumeLabel,
    });
  const sourceRecordId = normalizeOptionalSanbornText(body.sourceRecordId, 120);

  if (sourceRecordId) {
    const sourceResult = await supabase
      .from("source_records")
      .select("id")
      .eq("id", sourceRecordId)
      .eq("town_package_id", townPackage.id)
      .maybeSingle<SourceRecordRow>();

    if (sourceResult.error) {
      return jsonError(503, "Atlas source record could not be verified.");
    }

    if (!sourceResult.data) {
      return jsonError(400, "Atlas source record must belong to the active town package.");
    }
  }

  let existingAtlasQuery = supabase
    .from("sanborn_atlases")
    .select("atlas_id")
    .eq("town_package_id", townPackage.id)
    .eq("edition_year", editionYear)
    .limit(1);

  existingAtlasQuery = volumeLabel ? existingAtlasQuery.eq("volume_label", volumeLabel) : existingAtlasQuery.is("volume_label", null);
  const existingAtlasResult = await existingAtlasQuery.maybeSingle<{ atlas_id: string }>();

  if (existingAtlasResult.error) {
    return jsonError(503, "Existing Sanborn atlas could not be checked.");
  }

  atlasId = existingAtlasResult.data?.atlas_id ?? atlasId;

  const saveResult = await supabase
    .from("sanborn_atlases")
    .upsert(
      {
        atlas_id: atlasId,
        town_package_id: townPackage.id,
        source_record_id: sourceRecordId,
        title,
        edition_year: editionYear,
        edition_date: normalizeEditionDate(body.editionDate),
        volume_label: volumeLabel,
        expected_page_count: expectedPageCount,
        review_status: normalizeSanbornReviewStatus("unknown"),
        evidence_classification: normalizeSanbornReviewStatus("unknown"),
      },
      { onConflict: "atlas_id" },
    )
    .select("id, atlas_id, updated_at")
    .single();

  if (saveResult.error || !saveResult.data) {
    return jsonError(503, "Sanborn atlas could not be saved.");
  }

  return NextResponse.json({
    ok: true,
    atlasId: saveResult.data.atlas_id,
    rowId: saveResult.data.id,
    savedAt: saveResult.data.updated_at ?? new Date().toISOString(),
  });
}
