import { NextRequest, NextResponse } from "next/server";

import {
  buildDefaultSanbornAtlasId,
  normalizeOptionalSanbornText,
  normalizeSanbornEditionYear,
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
  notes?: string | null;
  createNew?: boolean | null;
};

type SourceRecordRow = {
  id: string;
};

type AtlasRow = {
  id: string;
  atlas_id: string;
  town_package_id: string;
  edition_year?: number | null;
  volume_label?: string | null;
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
  const mapYear = normalizeSanbornEditionYear(body.mapYear) ?? townPackage.year;
  const editionYear = normalizeSanbornEditionYear(body.editionYear) ?? mapYear;
  const volumeLabel = normalizeOptionalSanbornText(body.volumeLabel, 80);
  const expectedPageCount = normalizePositiveInteger(body.expectedPageCount);
  const title = normalizeOptionalSanbornText(body.title, 240) ?? `${townPackage.name} ${editionYear} Sanborn Atlas`;
  const notes = normalizeOptionalSanbornText(body.notes, 4000);
  const requestedAtlasId = normalizeOptionalSanbornText(body.atlasId, 160);
  const createNew = body.createNew === true;
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
    .is("archived_at", null)
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

  if (createNew && existingAtlasResult.data) {
    return jsonError(409, "A Sanborn edition for this year and volume already exists. Select it, or confirm a distinct volume before creating another edition.");
  }

  if (createNew && suppliedAtlasResult.data) {
    return jsonError(409, "That Sanborn edition already exists. Select it instead of creating a duplicate year.");
  }

  const existingAtlas = createNew ? suppliedAtlasResult.data ?? null : suppliedAtlasResult.data ?? existingAtlasResult.data ?? null;
  atlasId = existingAtlas?.atlas_id ?? atlasId;

  const record = {
    source_record_id: sourceRecordId,
    title,
    edition_year: editionYear,
    edition_date: editionDate,
    volume_label: volumeLabel,
    expected_page_count: expectedPageCount,
    notes,
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

export async function PATCH(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as { townPackageId?: string; atlasId?: string; archiveReason?: string | null; restore?: boolean | null } | null;
  const atlasId = normalizeOptionalSanbornText(body?.atlasId, 160);

  if (!body || !atlasId) {
    return jsonError(400, "Atlas archive payload is invalid.");
  }

  const townPackageResult = await getRequestedTownPackage(access.supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  if (body.restore === true) {
    const atlasResult = await access.supabase
      .from("sanborn_atlases")
      .select("id, atlas_id, town_package_id, edition_year, volume_label, updated_at")
      .eq("atlas_id", atlasId)
      .maybeSingle<AtlasRow>();

    if (atlasResult.error) {
      return jsonError(503, "Archived Sanborn atlas could not be checked.");
    }

    if (!atlasResult.data) {
      return jsonError(404, "Archived Sanborn atlas was not found.");
    }

    if (atlasResult.data.town_package_id !== townPackageResult.data.id) {
      return jsonError(400, "Atlas ID belongs to another town package.");
    }

    let duplicateQuery = access.supabase
      .from("sanborn_atlases")
      .select("id")
      .eq("town_package_id", townPackageResult.data.id)
      .eq("edition_year", atlasResult.data.edition_year)
      .is("archived_at", null)
      .neq("id", atlasResult.data.id)
      .limit(1);

    duplicateQuery = atlasResult.data.volume_label
      ? duplicateQuery.eq("volume_label", atlasResult.data.volume_label)
      : duplicateQuery.is("volume_label", null);

    const duplicateResult = await duplicateQuery.maybeSingle<{ id: string }>();

    if (duplicateResult.error) {
      return jsonError(503, "Active Sanborn edition duplicates could not be checked.");
    }

    if (duplicateResult.data) {
      return jsonError(409, "An active Sanborn edition already uses this year and volume.");
    }

    const restoreResult = await access.supabase
      .from("sanborn_atlases")
      .update({ archived_at: null, archive_reason: null })
      .eq("id", atlasResult.data.id)
      .select("atlas_id, updated_at")
      .single<{ atlas_id: string; updated_at: string | null }>();

    if (restoreResult.error || !restoreResult.data) {
      return jsonError(503, "Sanborn atlas could not be restored.");
    }

    return NextResponse.json({
      ok: true,
      atlasId: restoreResult.data.atlas_id,
      restored: true,
      savedAt: restoreResult.data.updated_at ?? new Date().toISOString(),
    });
  }

  const archiveResult = await access.supabase.rpc("archive_sanborn_atlas", {
    p_town_package_id: townPackageResult.data.id,
    p_atlas_id: atlasId,
    p_archive_reason: normalizeOptionalSanbornText(body.archiveReason, 1000) ?? "Archived from Historical Map Studio.",
  });

  if (archiveResult.error) {
    const status = archiveResult.error.code === "P0001" ? 400 : 503;
    return jsonError(status, `Sanborn atlas could not be archived: ${archiveResult.error.message}`);
  }

  return NextResponse.json({ ok: true, result: archiveResult.data ?? null, savedAt: new Date().toISOString() });
}

export async function DELETE(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as { townPackageId?: string; atlasId?: string } | null;
  const atlasId = normalizeOptionalSanbornText(body?.atlasId, 160);

  if (!body || !atlasId) {
    return jsonError(400, "Atlas delete payload is invalid.");
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const atlasResult = await supabase
    .from("sanborn_atlases")
    .select("id, atlas_id, town_package_id")
    .eq("atlas_id", atlasId)
    .maybeSingle<{ id: string; atlas_id: string; town_package_id: string }>();

  if (atlasResult.error) {
    return jsonError(503, "Sanborn atlas could not be checked before deletion.");
  }

  if (!atlasResult.data) {
    return jsonError(404, "Sanborn atlas was not found.");
  }

  if (atlasResult.data.town_package_id !== townPackageResult.data.id) {
    return jsonError(400, "Atlas ID belongs to another town package.");
  }

  const pageResult = await supabase.from("sanborn_atlas_pages").select("id").eq("atlas_id", atlasResult.data.id).limit(1);

  if (pageResult.error) {
    return jsonError(503, "Sanborn atlas dependencies could not be checked.");
  }

  if ((pageResult.data ?? []).length > 0) {
    return jsonError(409, "Developed editions must be archived instead of deleted.", { dependencySummary: { pages: pageResult.data?.length ?? 0 } });
  }

  const deleteResult = await supabase.from("sanborn_atlases").delete().eq("id", atlasResult.data.id);

  if (deleteResult.error) {
    return jsonError(503, "Empty Sanborn edition could not be deleted.");
  }

  return NextResponse.json({ ok: true, atlasId });
}
