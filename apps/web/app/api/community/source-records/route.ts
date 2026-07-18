import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getRequestedTownPackage, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";
import { normalizeOptionalSanbornText, normalizePositiveInteger, sanitizeSanbornStableIdSegment } from "@/lib/sanborn-atlas";

export const runtime = "nodejs";

type SourceRecordCreateBody = {
  townPackageId?: string | null;
  title?: string | null;
  repositoryName?: string | null;
  collectionName?: string | null;
  repositoryExternalId?: string | null;
  persistentUrl?: string | null;
  itemPageUrl?: string | null;
  iiifManifestUrl?: string | null;
  imageServiceUrl?: string | null;
  itemResourceId?: string | null;
  editionYear?: number | string | null;
  sheetNumber?: string | number | null;
  mapPublisher?: string | null;
  publicationDate?: string | null;
  rightsStatement?: string | null;
  rightsUrl?: string | null;
  accessNote?: string | null;
  citationNote?: string | null;
  sourceStatus?: string | null;
};

function normalizeDate(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalSanbornText(value, 10);
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeSourceStatus(value: string | null | undefined): string {
  const normalized = normalizeOptionalSanbornText(value, 40) ?? "draft";
  return ["unknown", "draft", "linked", "reviewed", "archived", "missing", "conflict"].includes(normalized) ? normalized : "draft";
}

export async function POST(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as SourceRecordCreateBody | null;

  if (!body) {
    return jsonError(400, "Source record payload is invalid.");
  }

  const { supabase } = access;
  const townPackageResult = await getRequestedTownPackage(supabase, body.townPackageId);

  if (townPackageResult.error || !townPackageResult.data) {
    return jsonError(400, "The requested town package could not be loaded.");
  }

  const townPackage = townPackageResult.data;
  const repositoryName = normalizeOptionalSanbornText(body.repositoryName, 240) ?? "Library of Congress";
  const collectionName = normalizeOptionalSanbornText(body.collectionName, 240) ?? "Sanborn Fire Insurance Maps";
  const repositoryExternalId = normalizeOptionalSanbornText(body.repositoryExternalId, 240);
  const editionYear = normalizePositiveInteger(body.editionYear) ?? townPackage.year;
  const sheetNumber = normalizeOptionalSanbornText(String(body.sheetNumber ?? ""), 80);
  const title =
    normalizeOptionalSanbornText(body.title, 500) ??
    `${townPackage.name} ${editionYear} Sanborn${sheetNumber ? ` Sheet ${sheetNumber}` : ""}`;
  const sourceId = [
    "source",
    sanitizeSanbornStableIdSegment(townPackage.package_id),
    sanitizeSanbornStableIdSegment(editionYear),
    sanitizeSanbornStableIdSegment(repositoryName),
    sanitizeSanbornStableIdSegment(repositoryExternalId ?? randomUUID()),
  ].join("_");
  const persistentUrl = normalizeOptionalSanbornText(body.persistentUrl, 2000);

  const insertResult = await supabase
    .from("source_records")
    .insert({
      town_package_id: townPackage.id,
      source_id: sourceId,
      title,
      archive_name: repositoryName,
      source_url: persistentUrl ?? normalizeOptionalSanbornText(body.itemPageUrl, 2000),
      rights_note: normalizeOptionalSanbornText(body.rightsStatement, 2000),
      source_date: normalizeDate(body.publicationDate),
      page_reference: sheetNumber,
      repository_name: repositoryName,
      collection_name: collectionName,
      repository_external_id: repositoryExternalId,
      persistent_url: persistentUrl,
      item_page_url: normalizeOptionalSanbornText(body.itemPageUrl, 2000),
      iiif_manifest_url: normalizeOptionalSanbornText(body.iiifManifestUrl, 2000),
      image_service_url: normalizeOptionalSanbornText(body.imageServiceUrl, 2000),
      item_resource_id: normalizeOptionalSanbornText(body.itemResourceId, 500),
      town_name: townPackage.name,
      edition_year: editionYear,
      sheet_number: sheetNumber,
      map_publisher: normalizeOptionalSanbornText(body.mapPublisher, 240) ?? "Sanborn Map Company",
      publication_date: normalizeDate(body.publicationDate),
      imported_at: new Date().toISOString(),
      imported_by: "historical-map-studio",
      rights_statement: normalizeOptionalSanbornText(body.rightsStatement, 2000),
      rights_url: normalizeOptionalSanbornText(body.rightsUrl, 2000),
      access_note: normalizeOptionalSanbornText(body.accessNote, 2000),
      access_date: new Date().toISOString().slice(0, 10),
      citation_note: normalizeOptionalSanbornText(body.citationNote, 2000),
      source_status: normalizeSourceStatus(body.sourceStatus),
      metadata: {
        created_by: "historical-map-studio",
        source_identity_version: 1,
      },
    })
    .select("id, source_id, internal_source_id, title, repository_name, collection_name, repository_external_id, persistent_url")
    .single();

  if (insertResult.error || !insertResult.data) {
    return jsonError(503, `Source record could not be created: ${insertResult.error?.message ?? "Unknown database error"}`);
  }

  return NextResponse.json({
    ok: true,
    source: insertResult.data,
    savedAt: new Date().toISOString(),
  });
}
