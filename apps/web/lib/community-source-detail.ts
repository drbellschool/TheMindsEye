import { cache } from "react";

import { buildReviewEventTimeline, type CommunityReviewTimelineEvent, type ReviewEventRow } from "./community-review-events.ts";
import { normalizeReviewStatus, type ReviewStatus } from "./community-status.ts";
import { communityDemo } from "./demo-data/index.ts";

const sourceDetailFallbackWarning = "Using demo fallback because Supabase source detail could not be loaded.";
const sourceDetailUnavailableWarning = "Supabase source detail could not be loaded and no demo fallback exists for this source ID.";

type SourceRecordMetadata = Record<string, unknown>;

type SourceRecordRow = {
  id: string;
  source_id: string;
  title: string;
  archive_name: string | null;
  source_url: string | null;
  source_date: string | null;
  page_reference: string | null;
  rights_note: string | null;
  ocr_excerpt: string | null;
  review_status: string | null;
  certainty: string | null;
  metadata: SourceRecordMetadata | null;
};

type ClaimRow = {
  claim_id: string;
  claim_text: string;
  claim_type: string | null;
  review_status: string | null;
  certainty: string | null;
  building_id: string | null;
  person_id: string | null;
  business_id: string | null;
};

type BuildingRow = {
  id: string;
  building_id: string;
  label: string;
  sheet_reference: string | null;
  review_status: string | null;
  certainty: string | null;
  notes: string | null;
};

type PersonRow = {
  id: string;
  person_id: string;
  display_name: string;
  occupation: string | null;
  review_status: string | null;
  certainty: string | null;
  notes: string | null;
};

type BusinessRow = {
  id: string;
  business_id: string;
  display_name: string;
  business_type: string | null;
  review_status: string | null;
  certainty: string | null;
  notes: string | null;
};

type QueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type SupabaseLikeClient = {
  from: (...args: any[]) => any;
};

export type CommunitySourceLinkedClaim = {
  claimId: string;
  claimText: string;
  evidenceClassification: ReviewStatus;
  reviewStatus: ReviewStatus;
  certainty: string;
};

export type CommunitySourceLinkedRecord = {
  id: string;
  title: string;
  detail: string;
  reviewStatus: ReviewStatus;
  certainty: string;
  note: string;
};

export type CommunitySourceDetailRecord = {
  sourceId: string;
  title: string;
  archiveName: string;
  sourceUrl: string | null;
  sourceDate: string;
  pageReference: string;
  rightsNote: string;
  ocrExcerpt: string;
  reviewStatus: ReviewStatus;
  certainty: string;
  evidenceClassification: ReviewStatus;
  linkedClaims: CommunitySourceLinkedClaim[];
  linkedBuildings: CommunitySourceLinkedRecord[];
  linkedPeople: CommunitySourceLinkedRecord[];
  linkedBusinesses: CommunitySourceLinkedRecord[];
  reviewTimeline: CommunityReviewTimelineEvent[];
  reviewTimelineEmptyState: string;
};

export type CommunitySourceDetailLoadResult = {
  source: "supabase" | "demo_fallback";
  warningMessage?: string;
  record: CommunitySourceDetailRecord | null;
};

export const communitySourceDetailReviewTimelineEmptyState = "No source review notes are stored for this source record yet.";

async function loadSupabaseServerHelpers() {
  return import("./supabase/server.ts");
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback;
}

function normalizeCertainty(value: string | null | undefined): string {
  return normalizeText(value, "unknown");
}

function getMetadataString(metadata: SourceRecordMetadata | null, keys: string[]): string | null {
  if (!metadata || Array.isArray(metadata)) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function cloneDemoSourceDetail(record: CommunitySourceDetailRecord): CommunitySourceDetailRecord {
  return JSON.parse(JSON.stringify(record)) as CommunitySourceDetailRecord;
}

function getDemoSourceDetailMap(): Record<string, CommunitySourceDetailRecord> {
  return communityDemo.sourceDetails as Record<string, CommunitySourceDetailRecord>;
}

export function getDemoSourceDetail(sourceId: string): CommunitySourceDetailRecord | null {
  const demoRecord = getDemoSourceDetailMap()[sourceId];
  return demoRecord ? cloneDemoSourceDetail(demoRecord) : null;
}

export function buildDemoSourceDetailResult(sourceId: string): CommunitySourceDetailLoadResult {
  return {
    source: "demo_fallback",
    record: getDemoSourceDetail(sourceId),
  };
}

export function buildSourceDetailFailureResult(sourceId: string): CommunitySourceDetailLoadResult {
  const demoRecord = getDemoSourceDetail(sourceId);

  if (demoRecord) {
    return {
      source: "demo_fallback",
      warningMessage: sourceDetailFallbackWarning,
      record: demoRecord,
    };
  }

  return {
    source: "supabase",
    warningMessage: sourceDetailUnavailableWarning,
    record: null,
  };
}

export function normalizeEvidenceClassification(value: string | null | undefined): ReviewStatus {
  return normalizeReviewStatus(value);
}

function getEvidenceClassification(metadata: SourceRecordMetadata | null): ReviewStatus {
  return normalizeEvidenceClassification(
    getMetadataString(metadata, ["evidence_classification", "evidenceClassification", "claim_type"]),
  );
}

function createEmptyQueryResult<T>(): QueryResult<T> {
  return {
    data: [],
    error: null,
  };
}

function collectLinkedIds(rows: ClaimRow[], key: "building_id" | "person_id" | "business_id"): string[] {
  const ids = new Set<string>();

  for (const row of rows) {
    const value = row[key];

    if (value) {
      ids.add(value);
    }
  }

  return [...ids];
}

function buildLinkedClaims(rows: ClaimRow[]): CommunitySourceLinkedClaim[] {
  return [...rows]
    .sort((a, b) => a.claim_id.localeCompare(b.claim_id))
    .map((row) => ({
      claimId: row.claim_id,
      claimText: normalizeText(row.claim_text, "Unavailable"),
      evidenceClassification: normalizeEvidenceClassification(row.claim_type),
      reviewStatus: normalizeReviewStatus(row.review_status),
      certainty: normalizeCertainty(row.certainty),
    }));
}

function buildLinkedBuildings(rows: BuildingRow[]): CommunitySourceLinkedRecord[] {
  return [...rows]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((row) => ({
      id: row.building_id,
      title: row.label,
      detail: normalizeText(row.sheet_reference, "Sheet reference unavailable"),
      reviewStatus: normalizeReviewStatus(row.review_status),
      certainty: normalizeCertainty(row.certainty),
      note: normalizeText(row.notes, "No building review note recorded."),
    }));
}

function buildLinkedPeople(rows: PersonRow[]): CommunitySourceLinkedRecord[] {
  return [...rows]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .map((row) => ({
      id: row.person_id,
      title: row.display_name,
      detail: normalizeText(row.occupation, "Occupation unavailable"),
      reviewStatus: normalizeReviewStatus(row.review_status),
      certainty: normalizeCertainty(row.certainty),
      note: normalizeText(row.notes, "No person review note recorded."),
    }));
}

function buildLinkedBusinesses(rows: BusinessRow[]): CommunitySourceLinkedRecord[] {
  return [...rows]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .map((row) => ({
      id: row.business_id,
      title: row.display_name,
      detail: normalizeText(row.business_type, "Business type unavailable"),
      reviewStatus: normalizeReviewStatus(row.review_status),
      certainty: normalizeCertainty(row.certainty),
      note: normalizeText(row.notes, "No business review note recorded."),
    }));
}

export function buildCommunitySourceDetail(input: {
  sourceRecord: SourceRecordRow;
  claims: ClaimRow[];
  buildings: BuildingRow[];
  people: PersonRow[];
  businesses: BusinessRow[];
  reviewEvents: ReviewEventRow[];
}): CommunitySourceDetailRecord {
  return {
    sourceId: input.sourceRecord.source_id,
    title: input.sourceRecord.title,
    archiveName: normalizeText(input.sourceRecord.archive_name, "Unavailable"),
    sourceUrl: input.sourceRecord.source_url,
    sourceDate: normalizeText(input.sourceRecord.source_date, "Unavailable"),
    pageReference: normalizeText(input.sourceRecord.page_reference, "Unavailable"),
    rightsNote: normalizeText(input.sourceRecord.rights_note, "Unavailable"),
    ocrExcerpt: normalizeText(input.sourceRecord.ocr_excerpt, "Unavailable"),
    reviewStatus: normalizeReviewStatus(input.sourceRecord.review_status),
    certainty: normalizeCertainty(input.sourceRecord.certainty),
    evidenceClassification: getEvidenceClassification(input.sourceRecord.metadata),
    linkedClaims: buildLinkedClaims(input.claims),
    linkedBuildings: buildLinkedBuildings(input.buildings),
    linkedPeople: buildLinkedPeople(input.people),
    linkedBusinesses: buildLinkedBusinesses(input.businesses),
    reviewTimeline: buildReviewEventTimeline(input.reviewEvents, 8),
    reviewTimelineEmptyState: communitySourceDetailReviewTimelineEmptyState,
  };
}

async function fetchLinkedRecords(supabase: SupabaseLikeClient, claims: ClaimRow[]) {
  const buildingIds = collectLinkedIds(claims, "building_id");
  const personIds = collectLinkedIds(claims, "person_id");
  const businessIds = collectLinkedIds(claims, "business_id");

  const [buildingsResult, peopleResult, businessesResult] = await Promise.all([
    buildingIds.length > 0
      ? supabase
          .from("buildings")
          .select("id, building_id, label, sheet_reference, review_status, certainty, notes")
          .in("id", buildingIds)
      : Promise.resolve(createEmptyQueryResult<BuildingRow>()),
    personIds.length > 0
      ? supabase
          .from("people")
          .select("id, person_id, display_name, occupation, review_status, certainty, notes")
          .in("id", personIds)
      : Promise.resolve(createEmptyQueryResult<PersonRow>()),
    businessIds.length > 0
      ? supabase
          .from("businesses")
          .select("id, business_id, display_name, business_type, review_status, certainty, notes")
          .in("id", businessIds)
      : Promise.resolve(createEmptyQueryResult<BusinessRow>()),
  ]);

  return { buildingsResult, peopleResult, businessesResult };
}

export const loadCommunitySourceDetail = cache(async (sourceId: string): Promise<CommunitySourceDetailLoadResult> => {
  try {
    const { createClient, hasSupabaseEnv } = await loadSupabaseServerHelpers();

    if (!hasSupabaseEnv()) {
      return buildDemoSourceDetailResult(sourceId);
    }

    const supabase = await createClient();

    if (!supabase) {
      return buildSourceDetailFailureResult(sourceId);
    }

    const sourceRecordResult = await supabase
      .from("source_records")
      .select("id, source_id, title, archive_name, source_url, source_date, page_reference, rights_note, ocr_excerpt, review_status, certainty, metadata")
      .eq("source_id", sourceId)
      .maybeSingle<SourceRecordRow>();

    if (sourceRecordResult.error) {
      return buildSourceDetailFailureResult(sourceId);
    }

    const sourceRecord = sourceRecordResult.data;

    if (!sourceRecord) {
      return {
        source: "supabase",
        record: null,
      };
    }

    const [claimsResult, reviewEventsResult] = await Promise.all([
      supabase
        .from("claims")
        .select("claim_id, claim_text, claim_type, review_status, certainty, building_id, person_id, business_id")
        .eq("source_record_id", sourceRecord.id),
      supabase
        .from("review_events")
        .select("target_table, target_id, previous_review_status, next_review_status, reviewer_identifier, reviewer_name, occurred_at, summary, review_note")
        .eq("target_table", "source_records")
        .eq("target_id", sourceId)
        .order("occurred_at", { ascending: false }),
    ]);

    if (claimsResult.error || reviewEventsResult.error) {
      return buildSourceDetailFailureResult(sourceId);
    }

    const claims = (claimsResult.data ?? []) as ClaimRow[];
    const { buildingsResult, peopleResult, businessesResult } = await fetchLinkedRecords(supabase, claims);

    if (buildingsResult.error || peopleResult.error || businessesResult.error) {
      return buildSourceDetailFailureResult(sourceId);
    }

    return {
      source: "supabase",
      record: buildCommunitySourceDetail({
        sourceRecord,
        claims,
        buildings: (buildingsResult.data ?? []) as BuildingRow[],
        people: (peopleResult.data ?? []) as PersonRow[],
        businesses: (businessesResult.data ?? []) as BusinessRow[],
        reviewEvents: (reviewEventsResult.data ?? []) as ReviewEventRow[],
      }),
    };
  } catch {
    return buildSourceDetailFailureResult(sourceId);
  }
});
