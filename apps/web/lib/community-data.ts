import { cache } from "react";

import {
  buildReviewEventTimeline,
  communityReviewTimelineEmptyState,
  filterReviewTimeline,
  formatReviewTimelineHistory,
  recentReviewEventQueryLimit,
  type ReviewEventRow,
} from "@/lib/community-review-events";
import {
  buildCommunityStatusSummaries,
  combineChipStates,
  hasAnyQueryErrors,
  normalizeReviewStatus,
  summarizeStatusCounts,
  toChipState,
  type ReviewEventStatusRow,
  type ReviewStatus,
  type ReviewStatusCounts,
  type StatusRow,
} from "@/lib/community-status";
import { communityDemo, type CommunityDemoData } from "@/lib/demo-data";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type ReleaseState = "ready" | "guarded" | "blocked";

type CountQueryResult = {
  count: number | null;
  error: { message: string } | null;
};

type TownPackageRow = {
  name: string;
  slug: string;
  year: number;
  package_id: string;
  state_region: string | null;
  evidence_start_year: number | null;
  evidence_end_year: number | null;
  release_state: string | null;
  release_notes: string | null;
};

type SourceRecordRow = {
  source_id: string;
  title: string;
  archive_name: string | null;
  rights_note: string | null;
  review_status: string | null;
  source_date: string | null;
  ocr_excerpt: string | null;
};

type MapLayerRow = {
  layer_id: string;
  label: string;
  sheet_number: number | null;
  review_status: string | null;
  alignment_scope: string | null;
  notes: string | null;
};

type BuildingRow = {
  building_id: string;
  label: string;
  sheet_reference: string | null;
  review_status: string | null;
  certainty: string | null;
  art_state: string | null;
  notes: string | null;
};

type PersonRow = {
  person_id: string;
  display_name: string;
  occupation: string | null;
  review_status: string | null;
  certainty: string | null;
  notes: string | null;
};

type BusinessRow = {
  business_id: string;
  display_name: string;
  business_type: string | null;
  review_status: string | null;
  certainty: string | null;
  notes: string | null;
};

const supabaseFallbackWarning = "Using demo fallback because Supabase data could not be loaded.";

export type CommunityDataSource = "supabase" | "demo_fallback";

export type CommunityDataLoadResult = {
  data: CommunityDemoData;
  source: CommunityDataSource;
  warningMessage?: string;
};

function cloneDemoData(): CommunityDemoData {
  return JSON.parse(JSON.stringify(communityDemo)) as CommunityDemoData;
}

function formatScope(startYear: number | null, endYear: number | null, fallback: string): string {
  if (startYear && endYear) {
    return `${startYear}-${endYear} evidence gate`;
  }

  return fallback;
}

function formatSourceDate(sourceDate: string | null, fallback: string): string {
  if (!sourceDate) {
    return fallback;
  }

  return sourceDate.slice(0, 7);
}

function deriveReleaseState(releaseClassification: string | null | undefined, unresolvedCount: number): ReleaseState {
  const normalizedReleaseClassification = normalizeReviewStatus(releaseClassification);

  if (normalizedReleaseClassification === "rejected" || unresolvedCount > 0) {
    return "blocked";
  }

  if (normalizedReleaseClassification === "verified_fact") {
    return "ready";
  }

  return "guarded";
}

function countOrZero(result: CountQueryResult): number {
  return result.count ?? 0;
}

function buildFallbackResult(warningMessage?: string): CommunityDataLoadResult {
  return {
    data: communityDemo,
    source: "demo_fallback",
    warningMessage,
  };
}

function buildReviewStateTags(counts: ReviewStatusCounts) {
  const tagStatuses: ReviewStatus[] = ["verified_fact", "source_based_inference", "illustrative", "unknown"];

  return tagStatuses.map((status) => ({
    label: `${status} (${counts[status]})`,
    state: toChipState(status),
  }));
}

export const loadCommunityData = cache(async (): Promise<CommunityDataLoadResult> => {
  if (!hasSupabaseEnv()) {
    return buildFallbackResult();
  }

  try {
    const supabase = await createClient();

    if (!supabase) {
      return buildFallbackResult(supabaseFallbackWarning);
    }

    const [
      townPackageResult,
      primarySourceResult,
      sourceStatusRowsResult,
      claimStatusRowsResult,
      mapLayerStatusRowsResult,
      mapLayerRowsResult,
      buildingStatusRowsResult,
      buildingRowsResult,
      peopleStatusRowsResult,
      peopleRowsResult,
      businessStatusRowsResult,
      businessRowsResult,
      assetRequestsCountResult,
      reviewEventStatusRowsResult,
      recentReviewEventsResult,
    ] = await Promise.all([
      supabase
        .from("town_packages")
        .select("name, slug, year, package_id, state_region, evidence_start_year, evidence_end_year, release_state, release_notes")
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle<TownPackageRow>(),
      supabase
        .from("source_records")
        .select("source_id, title, archive_name, rights_note, review_status, source_date, ocr_excerpt")
        .order("source_date", { ascending: true })
        .limit(1)
        .maybeSingle<SourceRecordRow>(),
      supabase.from("source_records").select("review_status"),
      supabase.from("claims").select("review_status"),
      supabase.from("map_layers").select("review_status"),
      supabase
        .from("map_layers")
        .select("layer_id, label, sheet_number, review_status, alignment_scope, notes")
        .order("sheet_number", { ascending: true })
        .limit(6),
      supabase.from("buildings").select("review_status"),
      supabase
        .from("buildings")
        .select("building_id, label, sheet_reference, review_status, certainty, art_state, notes")
        .order("created_at", { ascending: true })
        .limit(24),
      supabase.from("people").select("review_status"),
      supabase
        .from("people")
        .select("person_id, display_name, occupation, review_status, certainty, notes")
        .order("created_at", { ascending: true })
        .limit(24),
      supabase.from("businesses").select("review_status"),
      supabase
        .from("businesses")
        .select("business_id, display_name, business_type, review_status, certainty, notes")
        .order("created_at", { ascending: true })
        .limit(24),
      supabase.from("asset_requests").select("*", { count: "exact", head: true }),
      supabase.from("review_events").select("next_review_status"),
      supabase
        .from("review_events")
        .select("summary, target_table, target_id, reviewer_identifier, reviewer_name, previous_review_status, next_review_status, occurred_at, review_note")
        .order("occurred_at", { ascending: false })
        .limit(recentReviewEventQueryLimit),
    ]);

    if (
      hasAnyQueryErrors([
        townPackageResult,
        primarySourceResult,
        sourceStatusRowsResult,
        claimStatusRowsResult,
        mapLayerStatusRowsResult,
        mapLayerRowsResult,
        buildingStatusRowsResult,
        buildingRowsResult,
        peopleStatusRowsResult,
        peopleRowsResult,
        businessStatusRowsResult,
        businessRowsResult,
        assetRequestsCountResult,
        reviewEventStatusRowsResult,
        recentReviewEventsResult,
      ])
    ) {
      return buildFallbackResult(supabaseFallbackWarning);
    }

    const data = cloneDemoData();
    const townPackage = townPackageResult.data;
    const primarySource = primarySourceResult.data;
    const sourceStatusRows = (sourceStatusRowsResult.data ?? []) as StatusRow[];
    const claimStatusRows = (claimStatusRowsResult.data ?? []) as StatusRow[];
    const mapLayerStatusRows = (mapLayerStatusRowsResult.data ?? []) as StatusRow[];
    const mapLayerRows = (mapLayerRowsResult.data ?? []) as MapLayerRow[];
    const buildingStatusRows = (buildingStatusRowsResult.data ?? []) as StatusRow[];
    const buildingRows = (buildingRowsResult.data ?? []) as BuildingRow[];
    const peopleStatusRows = (peopleStatusRowsResult.data ?? []) as StatusRow[];
    const peopleRows = (peopleRowsResult.data ?? []) as PersonRow[];
    const businessStatusRows = (businessStatusRowsResult.data ?? []) as StatusRow[];
    const businessRows = (businessRowsResult.data ?? []) as BusinessRow[];
    const reviewEventStatusRows = (reviewEventStatusRowsResult.data ?? []) as ReviewEventStatusRow[];
    const recentReviewEvents = (recentReviewEventsResult.data ?? []) as ReviewEventRow[];

    const statusSummaries = buildCommunityStatusSummaries({
      sourceRecords: sourceStatusRows,
      mapLayers: mapLayerStatusRows,
      buildings: buildingStatusRows,
      people: peopleStatusRows,
      businesses: businessStatusRows,
      claims: claimStatusRows,
      reviewEvents: reviewEventStatusRows,
    });

    data.statusSummaries = statusSummaries;

    const sourcesCount = statusSummaries.sourceRecords.total;
    const claimsCount = statusSummaries.claims.total;
    const sheetsCount = statusSummaries.mapLayers.total;
    const buildingsCount = statusSummaries.buildings.total;
    const peopleCount = statusSummaries.people.total;
    const businessesCount = statusSummaries.businesses.total;
    const assetRequestsCount = countOrZero(assetRequestsCountResult);
    const unresolvedCount = statusSummaries.unresolvedReviewEvents;

    const releaseState = deriveReleaseState(townPackage?.release_state, unresolvedCount);
    const buildingStatusCounts = statusSummaries.buildings.counts;
    const peopleStatusCounts = statusSummaries.people.counts;
    const businessStatusCounts = statusSummaries.businesses.counts;

    const trackedCount = sourcesCount + sheetsCount + buildingsCount + peopleCount + businessesCount + claimsCount;
    const resolvedCount = Math.max(trackedCount - unresolvedCount, 0);
    const progressPercent = trackedCount > 0 ? Math.max(0, Math.min(100, Math.round((resolvedCount / trackedCount) * 100))) : 0;

    const recentReviewTimeline = buildReviewEventTimeline(recentReviewEvents);
    const fullReviewHistoryTimeline = buildReviewEventTimeline(recentReviewEvents, recentReviewEventQueryLimit);
    const overallHistory = formatReviewTimelineHistory(fullReviewHistoryTimeline);
    const mapTimeline = filterReviewTimeline(fullReviewHistoryTimeline, ["map_layers"]);
    const identityTimeline = filterReviewTimeline(fullReviewHistoryTimeline, ["people", "businesses"]);
    const sourceTimeline = filterReviewTimeline(fullReviewHistoryTimeline, ["source_records"]);
    const mapHistory = formatReviewTimelineHistory(mapTimeline);
    const sourceHistory = formatReviewTimelineHistory(sourceTimeline);
    const releaseBlockers = fullReviewHistoryTimeline
      .filter((event) => event.nextStatus !== "verified_fact" && event.nextStatus !== "rejected")
      .map((event) => event.summary);

    const primaryMapLayer = mapLayerRows[0];
    const primaryBuilding = buildingRows[0];
    const primaryPerson = peopleRows[0];
    const primaryBusiness = businessRows[0];

    data.town.name = townPackage?.name ?? "Community Review";
    data.town.slug = townPackage?.slug ?? "community-review";
    data.town.year = townPackage?.year ?? 0;
    data.town.packageId = townPackage?.package_id ?? "No town package loaded";
    data.town.stateRegion = townPackage?.state_region ?? "Supabase town package metadata not yet loaded";
    data.town.scope = formatScope(townPackage?.evidence_start_year ?? null, townPackage?.evidence_end_year ?? null, "Evidence window not yet loaded");
    data.town.releaseState = releaseState;

    data.summary.sources = sourcesCount;
    data.summary.sheets = sheetsCount;
    data.summary.buildings = buildingsCount;
    data.summary.people = peopleCount;
    data.summary.businesses = businessesCount;
    data.summary.unresolved = unresolvedCount;
    data.summary.progressPercent = progressPercent;

    data.statusChips = data.statusChips.map((chip) => {
      switch (chip.label) {
        case "Sources":
          return { ...chip, value: String(sourcesCount), state: statusSummaries.sourceRecords.state };
        case "Sheets":
          return { ...chip, value: String(sheetsCount), state: statusSummaries.mapLayers.state };
        case "Buildings":
          return { ...chip, value: String(buildingsCount), state: statusSummaries.buildings.state };
        case "People":
          return { ...chip, value: String(peopleCount), state: statusSummaries.people.state };
        case "Businesses":
          return { ...chip, value: String(businessesCount), state: statusSummaries.businesses.state };
        case "Release":
          return { ...chip, value: releaseState, state: releaseState };
        default:
          return chip;
      }
    });

    data.routeCards = data.routeCards.map((routeCard) => {
      switch (routeCard.href) {
        case "/community":
          return { ...routeCard, statValue: `${progressPercent}%`, state: releaseState };
        case "/community/map-auditor":
          return { ...routeCard, statValue: String(sheetsCount), state: statusSummaries.mapLayers.state };
        case "/community/building-auditor":
          return { ...routeCard, statValue: String(buildingsCount), state: statusSummaries.buildings.state };
        case "/community/people-auditor":
          return {
            ...routeCard,
            statValue: String(peopleCount + businessesCount),
            state: combineChipStates([statusSummaries.people.state, statusSummaries.businesses.state]),
          };
        case "/community/source-provenance-inspector":
          return { ...routeCard, statValue: String(sourcesCount), state: statusSummaries.sourceRecords.state };
        case "/community/release-gate":
          return { ...routeCard, statValue: releaseState, state: releaseState };
        default:
          return routeCard;
      }
    });

    data.communityDashboard.hero.title =
      townPackage?.year && townPackage?.name ? `${townPackage.name} ${townPackage.year} Community Dashboard` : "Community Dashboard";
    data.communityDashboard.hero.subtitle = "Supabase-backed Community review surface with safe demo fallback when queries fail.";
    data.communityDashboard.yearGate.value = data.town.scope;
    data.communityDashboard.yearGate.detail = `${sourcesCount} source records currently loaded from Supabase.`;
    data.communityDashboard.releaseGate.state = releaseState;
    data.communityDashboard.releaseGate.reason =
      townPackage?.release_notes ??
      (unresolvedCount > 0
        ? `${unresolvedCount} unresolved review events currently block release.`
        : `Supabase read is enabled; release remains ${releaseState}.`);
    data.communityDashboard.overviewCards = data.communityDashboard.overviewCards.map((card) => {
      switch (card.label) {
        case "Sources":
          return { ...card, value: String(sourcesCount), detail: statusSummaries.sourceRecords.summary };
        case "Sheets":
          return { ...card, value: String(sheetsCount), detail: statusSummaries.mapLayers.summary };
        case "Buildings":
          return { ...card, value: String(buildingsCount), detail: statusSummaries.buildings.summary };
        case "People":
          return { ...card, value: String(peopleCount), detail: statusSummaries.people.summary };
        case "Businesses":
          return { ...card, value: String(businessesCount), detail: statusSummaries.businesses.summary };
        case "Unresolved":
          return {
            ...card,
            value: String(unresolvedCount),
            detail:
              unresolvedCount > 0
                ? `${unresolvedCount} unresolved review events currently block release.`
                : "No unresolved review events are currently blocking release.",
          };
        default:
          return card;
      }
    });
    data.communityDashboard.blockers = releaseBlockers;
    data.communityDashboard.evidenceInspector.sourceId = primarySource?.source_id ?? "No source loaded";
    data.communityDashboard.evidenceInspector.title = primarySource?.title ?? "No source records loaded from Supabase";
    data.communityDashboard.evidenceInspector.summary = primarySource
      ? `Primary source metadata loaded from Supabase. ${statusSummaries.sourceRecords.summary}`
      : "Supabase is connected, but source_records is empty for the active town package.";
    data.communityDashboard.evidenceInspector.fields = [
      {
        label: "Citation",
        value: primarySource?.archive_name ?? "No archive metadata loaded",
        detail: "Primary archive metadata is shown when source_records are present.",
      },
      {
        label: "Rights",
        value: primarySource?.rights_note ?? "unknown",
        detail: "Rights and reuse notes stay attached to the record.",
      },
      {
        label: "Review state",
        value: primarySource ? normalizeReviewStatus(primarySource.review_status) : "unknown",
        detail: statusSummaries.sourceRecords.summary,
      },
      {
        label: "Map year",
        value: primarySource ? formatSourceDate(primarySource.source_date, "unknown") : "unknown",
        detail: primarySource ? "Shown from the first available source record." : "No source date is available yet.",
      },
    ];
    data.communityDashboard.reviewTimeline = recentReviewTimeline;
    data.communityDashboard.reviewTimelineEmptyState = communityReviewTimelineEmptyState;
    data.communityDashboard.history = overallHistory.length > 0 ? overallHistory : [communityReviewTimelineEmptyState];

    data.mapAuditor.sheetStrip =
      mapLayerRows.length > 0
        ? mapLayerRows.map((layer, index) => ({
            label: layer.label || `Sheet ${layer.sheet_number ?? index + 1}`,
            status: normalizeReviewStatus(layer.review_status),
            notes: layer.notes ?? `Alignment scope: ${layer.alignment_scope ?? "local_only"}.`,
          }))
        : [
            {
              label: "Map layers",
              status: String(sheetsCount),
              notes: "No map_layers rows loaded from Supabase yet.",
            },
          ];
    data.mapAuditor.workspace.subtitle = "Supabase-backed stitching surface with safe fallback when data is unavailable.";
    data.mapAuditor.workspace.calloutLabel = "Supabase map layers";
    data.mapAuditor.workspace.calloutValue = String(sheetsCount);
    data.mapAuditor.workspace.calloutDetail = primaryMapLayer
      ? primaryMapLayer.notes ?? `Primary map layer review status: ${normalizeReviewStatus(primaryMapLayer.review_status)}.`
      : "No map_layers rows loaded from Supabase yet.";
    data.mapAuditor.georeference.status = primaryMapLayer?.alignment_scope ?? "unknown";
    data.mapAuditor.georeference.detail = primaryMapLayer
      ? `Primary map layer review status: ${normalizeReviewStatus(primaryMapLayer.review_status)}.`
      : "No map layer review status is available yet.";
    data.mapAuditor.georeference.warning =
      mapLayerRows.length > 0
        ? "Read-only map review is enabled; control-point writes are not part of this milestone."
        : "Control-point details will appear after map layers are loaded from Supabase.";
    data.mapAuditor.controlPoints = [];
    data.mapAuditor.evidence.fields = [
      {
        label: "Map layers",
        value: String(sheetsCount),
        detail: statusSummaries.mapLayers.summary,
      },
      {
        label: "Primary layer",
        value: primaryMapLayer?.label ?? "No map layer loaded",
        detail: primaryMapLayer
          ? `Sheet ${primaryMapLayer.sheet_number ?? "unknown"} in the current review set.`
          : "A primary map layer will appear here after map_layers rows are loaded.",
      },
      {
        label: "Map status",
        value: primaryMapLayer ? normalizeReviewStatus(primaryMapLayer.review_status) : "unknown",
        detail: "Current review status on the primary map layer.",
      },
      {
        label: "Source status",
        value: primarySource ? normalizeReviewStatus(primarySource.review_status) : "unknown",
        detail: "Primary source review state linked to the map surface.",
      },
    ];
    data.mapAuditor.history = mapHistory.length > 0 ? mapHistory : ["No map review events loaded from Supabase yet."];

    data.buildingAuditor.selectedBuilding.title = primaryBuilding?.label ?? "No buildings loaded from Supabase";
    data.buildingAuditor.selectedBuilding.subtitle = `${buildingsCount} building records loaded from Supabase for the current town package.`;
    data.buildingAuditor.selectedBuilding.fields = [
      {
        label: "Building records",
        value: String(buildingsCount),
        detail: statusSummaries.buildings.summary,
      },
      {
        label: "Primary building",
        value: primaryBuilding?.building_id ?? "No building loaded",
        detail: primaryBuilding ? "Primary building row from Supabase." : "No building row is available yet.",
      },
      {
        label: "Review status",
        value: primaryBuilding ? normalizeReviewStatus(primaryBuilding.review_status) : "unknown",
        detail: summarizeStatusCounts(buildingStatusCounts),
      },
      {
        label: "Certainty",
        value: primaryBuilding?.certainty ?? "unknown",
        detail: "Preserved from the building review record.",
      },
      {
        label: "Art state",
        value: primaryBuilding ? normalizeReviewStatus(primaryBuilding.art_state) : "illustrative",
        detail: `${assetRequestsCount} asset requests currently tracked.`,
      },
    ];
    data.buildingAuditor.footprint.note = primaryBuilding
      ? "Footprint review is read-only in this milestone and remains tied to Supabase building records."
      : "No building footprint can be reviewed until buildings are loaded from Supabase.";
    data.buildingAuditor.artPreview.title = primaryBuilding?.label ?? "No building art candidate loaded";
    data.buildingAuditor.artPreview.detail =
      assetRequestsCount > 0
        ? `${assetRequestsCount} asset requests currently linked to the community review model.`
        : "No asset_requests rows are linked to the community review model yet.";
    data.buildingAuditor.artPreview.tags = [
      { label: `Buildings ${buildingsCount}`, state: statusSummaries.buildings.state },
      { label: `Assets ${assetRequestsCount}`, state: assetRequestsCount > 0 ? "partial" : "guarded" },
      { label: "Read only", state: "guarded" },
    ];
    data.buildingAuditor.extractedLabels = [
      {
        label: "Buildings",
        value: String(buildingsCount),
        detail: statusSummaries.buildings.summary,
      },
      {
        label: "Primary label",
        value: primaryBuilding?.label ?? "No building loaded",
        detail: primaryBuilding ? "Current display label on the primary building record." : "A building label will appear here after rows are loaded.",
      },
      {
        label: "Review summary",
        value: summarizeStatusCounts(buildingStatusCounts),
        detail: "Status distribution across Supabase building rows.",
      },
    ];
    data.buildingAuditor.provenance.fields = [
      {
        label: "Building records",
        value: String(buildingsCount),
        detail: statusSummaries.buildings.summary,
      },
      {
        label: "Illustrative assets",
        value: String(assetRequestsCount),
        detail: "Asset requests remain illustrative unless reviewed later.",
      },
      {
        label: "Primary source",
        value: primarySource?.source_id ?? "unknown",
        detail: "Source linkage remains visible for building review.",
      },
      {
        label: "Reviewer note",
        value: primaryBuilding?.notes ?? "No review note recorded.",
        detail: "Notes from the primary building review record when available.",
      },
    ];
    data.buildingAuditor.reviewStates = buildReviewStateTags(buildingStatusCounts);

    data.peopleAuditor.sourceIssues = [
      {
        label: "People",
        value: String(peopleCount),
        detail: statusSummaries.people.summary,
      },
      {
        label: "Businesses",
        value: String(businessesCount),
        detail: statusSummaries.businesses.summary,
      },
      {
        label: "Source records",
        value: String(sourcesCount),
        detail: statusSummaries.sourceRecords.summary,
      },
    ];
    data.peopleAuditor.personReview.title = primaryPerson?.display_name ?? "No people loaded from Supabase";
    data.peopleAuditor.personReview.subtitle = `${peopleCount} people records currently available from Supabase.`;
    data.peopleAuditor.personReview.fields = [
      {
        label: "Name",
        value: primaryPerson?.display_name ?? "No person loaded",
        detail: primaryPerson ? "Primary person review row from Supabase." : "A person record will appear here after rows are loaded.",
      },
      {
        label: "Occupation",
        value: primaryPerson?.occupation ?? "unknown",
        detail: "Occupation is preserved from the person review record when available.",
      },
      {
        label: "People count",
        value: String(peopleCount),
        detail: summarizeStatusCounts(peopleStatusCounts),
      },
      {
        label: "Review status",
        value: primaryPerson ? normalizeReviewStatus(primaryPerson.review_status) : "unknown",
        detail: primaryPerson?.notes ?? "Current person review state from Supabase.",
      },
    ];
    data.peopleAuditor.businessReview.title = primaryBusiness?.display_name ?? "No businesses loaded from Supabase";
    data.peopleAuditor.businessReview.subtitle = `${businessesCount} business records currently available from Supabase.`;
    data.peopleAuditor.businessReview.fields = [
      {
        label: "Business",
        value: primaryBusiness?.display_name ?? "No business loaded",
        detail: primaryBusiness ? "Primary business review row from Supabase." : "A business record will appear here after rows are loaded.",
      },
      {
        label: "Type",
        value: primaryBusiness?.business_type ?? "unknown",
        detail: "Business type is preserved from the review record when available.",
      },
      {
        label: "Businesses count",
        value: String(businessesCount),
        detail: summarizeStatusCounts(businessStatusCounts),
      },
      {
        label: "Review status",
        value: primaryBusiness ? normalizeReviewStatus(primaryBusiness.review_status) : "unknown",
        detail: primaryBusiness?.notes ?? "Current business review state from Supabase.",
      },
    ];
    data.peopleAuditor.legend = [
      {
        label: "People statuses",
        state: statusSummaries.people.state,
        note: summarizeStatusCounts(peopleStatusCounts),
      },
      {
        label: "Business statuses",
        state: statusSummaries.businesses.state,
        note: summarizeStatusCounts(businessStatusCounts),
      },
      {
        label: "Combined queue",
        state: unresolvedCount > 0 ? "guarded" : "ready",
        note: `${peopleCount + businessesCount} total identity records currently in review.`,
      },
    ];
    data.peopleAuditor.unresolved = identityTimeline
      .filter((event) => event.nextStatus !== "verified_fact" && event.nextStatus !== "rejected")
      .map((event) => event.summary);
    data.peopleAuditor.history =
      identityTimeline.length > 0 ? formatReviewTimelineHistory(identityTimeline) : ["No people or business review events loaded from Supabase yet."];

    data.sourceProvenanceInspector.source.title = primarySource?.title ?? "No source records loaded from Supabase";
    data.sourceProvenanceInspector.source.subtitle = primarySource
      ? "Primary source metadata loaded from Supabase."
      : "Supabase is connected, but source_records is empty for the active town package.";
    data.sourceProvenanceInspector.source.fields = [
      {
        label: "Source ID",
        value: primarySource?.source_id ?? "No source loaded",
        detail: "Referenced by the Supabase-backed town package when available.",
      },
      {
        label: "Archive",
        value: primarySource?.archive_name ?? "unknown",
        detail: "Primary archive citation.",
      },
      {
        label: "Issue date",
        value: primarySource ? formatSourceDate(primarySource.source_date, "unknown") : "unknown",
        detail: "Historical scope anchor.",
      },
      {
        label: "Review status",
        value: primarySource ? normalizeReviewStatus(primarySource.review_status) : "unknown",
        detail: statusSummaries.sourceRecords.summary,
      },
    ];
    data.sourceProvenanceInspector.ocr.quote = primarySource?.ocr_excerpt ?? "No OCR excerpt is available in Supabase yet.";
    data.sourceProvenanceInspector.rights.fields = [
      {
        label: "Source count",
        value: String(sourcesCount),
        detail: statusSummaries.sourceRecords.summary,
      },
      {
        label: "Citation string",
        value: primarySource?.title ?? "No source title loaded",
        detail: "Primary source title loaded from Supabase when available.",
      },
      {
        label: "Rights",
        value: primarySource?.rights_note ?? "unknown",
        detail: "Access and rights notes stay attached to each source record.",
      },
    ];
    data.sourceProvenanceInspector.linkedRecords = [
      {
        label: "Sources",
        value: String(sourcesCount),
        detail: statusSummaries.sourceRecords.summary,
      },
      {
        label: "Buildings",
        value: String(buildingsCount),
        detail: statusSummaries.buildings.summary,
      },
      {
        label: "People",
        value: String(peopleCount + businessesCount),
        detail: `${statusSummaries.people.summary} | ${statusSummaries.businesses.summary}`,
      },
      {
        label: "Claims",
        value: String(claimsCount),
        detail: statusSummaries.claims.summary,
      },
    ];
    data.sourceProvenanceInspector.trail = [
      "Source record -> candidate record -> human review -> release gate",
      "Released historical records must retain provenance, certainty, and classification.",
    ];
    data.sourceProvenanceInspector.history = sourceHistory.length > 0 ? sourceHistory : ["No source review events loaded from Supabase yet."];

    data.releaseGate.state = releaseState;
    data.releaseGate.reason =
      townPackage?.release_notes ??
      (unresolvedCount > 0
        ? `${unresolvedCount} unresolved review events currently block release.`
        : `Supabase read is enabled; release remains ${releaseState}.`);
    data.releaseGate.progressPercent = progressPercent;
    data.releaseGate.progressDetail =
      unresolvedCount > 0
        ? `${unresolvedCount} unresolved review events currently block release.`
        : "No unresolved review events are currently blocking release.";
    data.releaseGate.blockers = releaseBlockers;
    data.releaseGate.criteria = [
      {
        label: "Source records",
        value: String(sourcesCount),
        detail: statusSummaries.sourceRecords.summary,
      },
      {
        label: "Map layers",
        value: String(sheetsCount),
        detail: statusSummaries.mapLayers.summary,
      },
      {
        label: "Building anchors",
        value: String(buildingsCount),
        detail: statusSummaries.buildings.summary,
      },
      {
        label: "People and businesses",
        value: String(peopleCount + businessesCount),
        detail: `${statusSummaries.people.summary} | ${statusSummaries.businesses.summary}`,
      },
      {
        label: "Claims",
        value: String(claimsCount),
        detail: statusSummaries.claims.summary,
      },
      {
        label: "Review events",
        value: String(unresolvedCount),
        detail: "Unresolved review events still blocking release.",
      },
    ];
    data.releaseGate.history = overallHistory.length > 0 ? overallHistory : ["No release-gate review events loaded from Supabase yet."];

    return {
      data,
      source: "supabase",
    };
  } catch {
    return buildFallbackResult(supabaseFallbackWarning);
  }
});
