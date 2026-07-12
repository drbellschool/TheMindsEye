import { NextRequest, NextResponse } from "next/server";

import { validateStudioMetadataInput } from "@/lib/historical-map-studio";
import { getStudioAssetByAssetId, jsonError, requireMapStudioWriteAccess } from "@/lib/historical-map-studio-server";

export const runtime = "nodejs";

type MetadataBody = {
  assetId?: string;
  sheetNumber?: number | null;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  archiveName?: string | null;
  rightsNote?: string | null;
  intakeNotes?: string | null;
  evidenceClassification?: string | null;
  reviewStatus?: string | null;
};

type CurrentAssetMetadataRow = {
  id: string;
  asset_id: string;
  town_package_id: string;
  source_record_id: string | null;
  sheet_number: number | null;
  original_filename: string;
  evidence_classification: string | null;
  review_status: string | null;
};

type SourceRecordCheckRow = {
  id: string;
};

async function verifySourceRecord(supabase: any, townPackageId: string, sourceRecordId: string | null) {
  if (!sourceRecordId) {
    return { ok: true as const };
  }

  const result = await supabase.from("source_records").select("id").eq("id", sourceRecordId).eq("town_package_id", townPackageId).maybeSingle();

  if (result.error) {
    return { ok: false as const, response: jsonError(503, "Source record validation failed.") };
  }

  if (!result.data) {
    return { ok: false as const, response: jsonError(400, "Selected source record does not belong to this town package.") };
  }

  return { ok: true as const };
}

export async function PATCH(request: NextRequest) {
  const access = await requireMapStudioWriteAccess();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as MetadataBody | null;

  if (!body?.assetId) {
    return jsonError(400, "Asset ID is required.");
  }

  const validation = validateStudioMetadataInput(body);

  if (!validation.ok) {
    return jsonError(400, validation.error);
  }

  const { supabase } = access;
  const currentResult = await supabase
    .from("sanborn_sheet_assets")
    .select("id, asset_id, town_package_id, source_record_id, sheet_number, original_filename, evidence_classification, review_status")
    .eq("asset_id", body.assetId)
    .maybeSingle();

  if (currentResult.error) {
    return jsonError(503, "Sanborn sheet metadata lookup failed.");
  }

  if (!currentResult.data) {
    return jsonError(404, "Sanborn sheet asset was not found.");
  }

  const current = currentResult.data;
  const sourceValidation = await verifySourceRecord(supabase, current.town_package_id, validation.value.sourceRecordId);

  if (!sourceValidation.ok) {
    return sourceValidation.response;
  }

  const updateResult = await supabase
    .from("sanborn_sheet_assets")
    .update({
      sheet_number: validation.value.sheetNumber,
      source_record_id: validation.value.sourceRecordId,
      source_url: validation.value.sourceUrl,
      archive_name: validation.value.archiveName,
      rights_note: validation.value.rightsNote,
      intake_notes: validation.value.intakeNotes,
      evidence_classification: validation.value.evidenceClassification,
      review_status: validation.value.reviewStatus,
    })
    .eq("id", current.id);

  if (updateResult.error) {
    return jsonError(503, "Sanborn sheet metadata could not be updated.");
  }

  const statusChanged = current.review_status !== validation.value.reviewStatus;
  const evidenceChanged = current.evidence_classification !== validation.value.evidenceClassification;

  if (statusChanged || evidenceChanged) {
    await supabase.from("review_events").insert({
      town_package_id: current.town_package_id,
      target_table: "sanborn_sheet_assets",
      target_id: current.asset_id,
      source_record_id: validation.value.sourceRecordId,
      action_type: evidenceChanged && statusChanged ? "metadata_and_status_change" : statusChanged ? "status_change" : "evidence_classification_change",
      previous_review_status: current.review_status ?? "unknown",
      next_review_status: validation.value.reviewStatus,
      reviewer_identifier: "historical-map-studio-owner",
      reviewer_name: "Historical Map Studio Owner",
      reviewer_role: "owner",
      certainty: "unknown",
      is_verified: false,
      summary: `Updated Sanborn sheet metadata for ${current.original_filename}.`,
      review_note: validation.value.intakeNotes,
    });
  }

  const assetResult = await getStudioAssetByAssetId(supabase, current.asset_id);

  return NextResponse.json({
    ok: true,
    asset: assetResult.data ?? { asset_id: current.asset_id },
    reviewEventCreated: statusChanged || evidenceChanged,
  });
}
