import { cache } from "react";

import {
  buildSanbornIntakeState,
  createEmptySanbornIntakeState,
  normalizeSanbornEvidenceClassification,
  sanbornDefaultMaxUploadBytes,
  sanbornSheetBucket,
  type SanbornIntakeState,
  type SanbornSheetAssetSummary,
  type SanbornSourceOption,
} from "./sanborn-intake.ts";
import { normalizeReviewStatus } from "./community-status.ts";
import { communityDemo } from "./demo-data/index.ts";

type QueryError = {
  message: string;
};

type TownPackageRow = {
  id: string;
  package_id: string;
  name: string;
  state_region: string | null;
  year: number;
};

type MapLayerRow = {
  id: string;
  sheet_number: number | null;
};

type SourceRecordRow = {
  id: string;
  source_id: string;
  title: string;
  source_url: string | null;
  archive_name: string | null;
  rights_note: string | null;
};

type SanbornSheetAssetRow = {
  asset_id: string;
  sheet_number: number | null;
  original_filename: string;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  sha256_checksum: string | null;
  source_record_id: string | null;
  source_url: string | null;
  archive_name: string | null;
  rights_note: string | null;
  evidence_classification: string | null;
  review_status: string | null;
  intake_notes: string | null;
  uploaded_at: string | null;
};

async function loadSupabaseServerHelpers() {
  return import("./supabase/server.ts");
}

async function loadSupabaseAdminHelpers() {
  return import("./supabase/admin.ts");
}

function getConfiguredMaxUploadBytes(): number {
  const configured = Number.parseInt(process.env.SANBORN_MAX_UPLOAD_BYTES ?? "", 10);

  return Number.isFinite(configured) && configured > 0 ? configured : sanbornDefaultMaxUploadBytes;
}

function getReadOnlyWarning(parts: string[]): string {
  return `Sanborn Sheet Intake is running in demo/read-only mode. ${parts.join(" ")}`;
}

function buildDemoReadOnlyState(warningMessage?: string): SanbornIntakeState {
  return {
    ...createEmptySanbornIntakeState({
      warningMessage,
      maxUploadBytes: getConfiguredMaxUploadBytes(),
    }),
    townPackage: {
      id: null,
      packageId: communityDemo.town.packageId,
      name: communityDemo.town.name,
      region: communityDemo.town.stateRegion,
      year: communityDemo.town.year,
    },
    activeMapYear: communityDemo.town.year,
    expectedSheetCount: communityDemo.summary.sheets,
    missingSheetNumbers: Array.from({ length: communityDemo.summary.sheets }, (_, index) => index + 1),
  };
}

function getExpectedSheetCount(mapLayers: MapLayerRow[]): number {
  if (mapLayers.length === 0) {
    return 0;
  }

  const maxSheetNumber = Math.max(0, ...mapLayers.map((layer) => layer.sheet_number ?? 0));

  return Math.max(mapLayers.length, maxSheetNumber);
}

function mapSourceOptions(sourceRecords: SourceRecordRow[]): SanbornSourceOption[] {
  return sourceRecords
    .map((row) => ({
      sourceRecordId: row.id,
      sourceId: row.source_id,
      title: row.title,
      sourceUrl: row.source_url,
      archiveName: row.archive_name,
      rightsNote: row.rights_note,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

function mapSanbornAssets(rows: SanbornSheetAssetRow[], sourceRecords: SourceRecordRow[]): SanbornSheetAssetSummary[] {
  const sourceRecordById = new Map(sourceRecords.map((record) => [record.id, record]));

  return rows.map((row) => {
    const sourceRecord = row.source_record_id ? sourceRecordById.get(row.source_record_id) : null;

    return {
      assetId: row.asset_id,
      sheetNumber: row.sheet_number,
      originalFilename: row.original_filename,
      byteSize: row.byte_size ?? 0,
      width: row.width,
      height: row.height,
      checksum: row.sha256_checksum,
      sourceRecordId: row.source_record_id,
      sourceId: sourceRecord?.source_id ?? null,
      sourceTitle: sourceRecord?.title ?? null,
      sourceUrl: row.source_url ?? sourceRecord?.source_url ?? null,
      archiveName: row.archive_name ?? sourceRecord?.archive_name ?? null,
      rightsNote: row.rights_note ?? sourceRecord?.rights_note ?? null,
      evidenceClassification: normalizeSanbornEvidenceClassification(row.evidence_classification),
      reviewStatus: normalizeReviewStatus(row.review_status),
      intakeNotes: row.intake_notes,
      uploadedAt: row.uploaded_at,
    };
  });
}

function hasError(result: { error: QueryError | null }): boolean {
  return Boolean(result.error);
}

export const loadSanbornIntakeData = cache(async (): Promise<SanbornIntakeState> => {
  const maxUploadBytes = getConfiguredMaxUploadBytes();
  const { createClient, hasSupabaseEnv } = await loadSupabaseServerHelpers();

  if (!hasSupabaseEnv()) {
    return buildDemoReadOnlyState(getReadOnlyWarning(["Add Supabase public environment variables before using real uploads."]));
  }

  try {
    const supabase = await createClient();

    if (!supabase) {
      return buildDemoReadOnlyState(getReadOnlyWarning(["Supabase could not be initialized for read access."]));
    }

    const [townPackageResult, sourceRecordsResult, mapLayersResult, sanbornAssetsResult] = await Promise.all([
      supabase
        .from("town_packages")
        .select("id, package_id, name, state_region, year")
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle<TownPackageRow>(),
      supabase.from("source_records").select("id, source_id, title, source_url, archive_name, rights_note").order("title", { ascending: true }),
      supabase.from("map_layers").select("id, sheet_number").order("sheet_number", { ascending: true }),
      supabase
        .from("sanborn_sheet_assets")
        .select(
          "asset_id, sheet_number, original_filename, byte_size, width, height, sha256_checksum, source_record_id, source_url, archive_name, rights_note, evidence_classification, review_status, intake_notes, uploaded_at",
        )
        .order("sheet_number", { ascending: true })
        .order("uploaded_at", { ascending: false }),
    ]);

    if (hasError(townPackageResult) || hasError(sourceRecordsResult) || hasError(mapLayersResult) || hasError(sanbornAssetsResult)) {
      return buildDemoReadOnlyState(getReadOnlyWarning(["Run the Sanborn migration and confirm the metadata table is available."]));
    }

    const townPackage = townPackageResult.data;

    if (!townPackage) {
      return buildDemoReadOnlyState(getReadOnlyWarning(["No town package row is available yet."]));
    }

    const sourceRecords = (sourceRecordsResult.data ?? []) as SourceRecordRow[];
    const mapLayers = (mapLayersResult.data ?? []) as MapLayerRow[];
    const sanbornAssets = mapSanbornAssets((sanbornAssetsResult.data ?? []) as SanbornSheetAssetRow[], sourceRecords);
    const sourceOptions = mapSourceOptions(sourceRecords);
    const expectedSheetCount = getExpectedSheetCount(mapLayers);
    const { createAdminClient, hasSupabaseAdminEnv } = await loadSupabaseAdminHelpers();
    const readOnlyReasons: string[] = [];
    let bucketIsReady = false;

    if (!hasSupabaseAdminEnv()) {
      readOnlyReasons.push("Add the server-only Supabase service-role key before enabling Storage uploads.");
    } else {
      const adminClient = createAdminClient();
      const bucketResult = adminClient ? await adminClient.storage.getBucket(sanbornSheetBucket) : { data: null, error: { message: "Supabase admin client unavailable" } };

      bucketIsReady = Boolean(bucketResult.data && !bucketResult.error);

      if (!bucketIsReady) {
        readOnlyReasons.push(`Create the private Supabase Storage bucket named ${sanbornSheetBucket}.`);
      }
    }

    if (!process.env.SANBORN_INTAKE_TOKEN) {
      readOnlyReasons.push("Add SANBORN_INTAKE_TOKEN as a server-only deployment variable before enabling writes.");
    }

    return buildSanbornIntakeState({
      mode: readOnlyReasons.length === 0 && bucketIsReady ? "write_enabled" : "read_only",
      warningMessage: readOnlyReasons.length > 0 ? getReadOnlyWarning(readOnlyReasons) : undefined,
      bucketName: sanbornSheetBucket,
      maxUploadBytes,
      townPackage: {
        id: townPackage.id,
        packageId: townPackage.package_id,
        name: townPackage.name,
        region: townPackage.state_region ?? "Unknown region",
        year: townPackage.year,
      },
      activeMapYear: townPackage.year,
      expectedSheetCount,
      existingAssets: sanbornAssets,
      sourceOptions,
    });
  } catch {
    return buildDemoReadOnlyState(getReadOnlyWarning(["The intake read model failed safely before rendering."]));
  }
});
