import { NextRequest, NextResponse } from "next/server";

import {
  buildDefaultSanbornAtlasId,
  normalizeOptionalSanbornText,
  normalizePositiveInteger,
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

type AtlasRow = {
  id: string;
  atlas_id: string;
  town_package_id: string;
  updated_at: string | null;
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
  const requestedAtlasId = normalizeOptionalSanbornText(body.atlasId, 160);
  let atlasId =
    requestedAtlasId ??
    buildDefaultSanbornAtlasId({
      townPackageId: townPackage.package_id,
      editionYear,
      volumeLabel,
    });
  const sourceRecordId = normalizeOptionalSanbornText(body.sourceRecordId, 120);
  const editionDate = normalizeEditionDate(body.editionDate);

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

  const suppliedAtlasResult = await supabase
    .from("sanborn_atlases")
    .select("id, atlas_id, town_package_id, updated_at")
    .eq("atlas_id", atlasId)
    .maybeSingle<AtlasRow>();

  if (suppliedAtlasResult.error) {
    return jsonError(503, "Existing Sanborn atlas ID could not be checked.");
  }

  if (suppliedAtlasResult.data && suppliedAtlasResult.data.town_package_id !== townPackage.id) {
    return jsonError(400, "Atlas ID belongs to another town package.");
  }

  let existingAtlasQuery = supabase
    .from("sanborn_atlases")
    .select("id, atlas_id, town_package_id, updated_at")
    .eq("town_package_id", townPackage.id)
    .eq("edition_year", editionYear)
    .limit(1);

  existingAtlasQuery = volumeLabel ? existingAtlasQuery.eq("volume_label", volumeLabel) : existingAtlasQuery.is("volume_label", null);
  const existingAtlasResult = await existingAtlasQuery.maybeSingle<AtlasRow>();

  if (existingAtlasResult.error) {
    return jsonError(503, "Existing Sanborn atlas could not be checked.");
  }

  if (suppliedAtlasResult.data && existingAtlasResult.data && suppliedAtlasResult.data.id !== existingAtlasResult.data.id) {
    return jsonError(400, "Atlas edition and volume already belong to another Sanborn atlas.");
  }

  if (requestedAtlasId && !suppliedAtlasResult.data && existingAtlasResult.data && existingAtlasResult.data.atlas_id !== requestedAtlasId) {
    return jsonError(400, "Atlas edition and volume already belong to another Sanborn atlas.");
  }

  const existingAtlas = suppliedAtlasResult.data ?? existingAtlasResult.data ?? null;
  atlasId = existingAtlas?.atlas_id ?? atlasId;

  const record = {
    source_record_id: sourceRecordId,
    title,
    edition_year: editionYear,
    edition_date: editionDate,
    volume_label: volumeLabel,
    expected_page_count: expectedPageCount,
  };

  const saveResult = existingAtlas
    ? await supabase
        .from("sanborn_atlases")
        .update(record)
        .eq("id", existingAtlas.id)
        .select("id, atlas_id, updated_at")
        .single()
    : await supabase
        .from("sanborn_atlases")
        .insert({
          ...record,
          atlas_id: atlasId,
          town_package_id: townPackage.id,
        })
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
