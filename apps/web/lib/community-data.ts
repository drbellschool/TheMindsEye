import { cache } from "react";

import { communityDemo, type CommunityDemoData } from "@/lib/demo-data";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type ReviewStatus =
  | "verified_fact"
  | "source_based_inference"
  | "illustrative"
  | "fictional_gameplay"
  | "unknown"
  | "rejected";

type ChipState = "ready" | "reviewing" | "partial" | "guarded" | "blocked";

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
  release_state: ReviewStatus | null;
  release_notes: string | null;
};

type SourceRecordRow = {
  source_id: string;
  title: string;
  archive_name: string | null;
  rights_note: string | null;
  review_status: ReviewStatus | null;
  source_date: string | null;
  ocr_excerpt: string | null;
};

type MapLayerRow = {
  layer_id: string;
  label: string;
  sheet_number: number | null;
  review_status: ReviewStatus | null;
  alignment_scope: string | null;
  notes: string | null;
};

type BuildingRow = {
  building_id: string;
  label: string;
  sheet_reference: string | null;
  review_status: ReviewStatus | null;
  certainty: string | null;
  art_state: ReviewStatus | null;
  notes: string | null;
};

type PersonRow = {
  person_id: string;
  display_name: string;
  occupation: string | null;
  review_status: ReviewStatus | null;
  certainty: string | null;
  notes: string | null;
};

type BusinessRow = {
  business_id: string;
  display_name: string;
  business_type: string | null;
  review_status: ReviewStatus | null;
  certainty: string | null;
  notes: string | null;
};

type ReviewEventRow = {
  summary: string;
  target_table: string;
  reviewer_name: string | null;
  previous_review_status: ReviewStatus | null;
  next_review_status: ReviewStatus | null;
  occurred_at: string | null;
};

type ReviewStatusCounts = Partial<Record<ReviewStatus, number>>;

const unresolvedStatuses: ReviewStatus[] = ["source_based_inference", "illustrative", "unknown"];
const supabaseFallbackWarning = "Using demo fallback because Supabase data could not be loaded.";
const displayStatusOrder: ReviewStatus[] = [
  "verified_fact",
  "source_based_inference",
  "illustrative",
  "fictional_gameplay",
  "unknown",
  "rejected",
];

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

function toChipState(reviewStatus: ReviewStatus | null): ChipState {
  switch (reviewStatus) {
    case "verified_fact":
      return "ready";
    case "source_based_inference":
      return "reviewing";
    case "illustrative":
    case "fictional_gameplay":
      return "partial";
    case "rejected":
      return "blocked";
    case "unknown":
    default:
      return "guarded";
  }
}

function countOrZero(result: CountQueryResult): number {
  return result.count ?? 0;
}

function hasAnyQueryErrors(results: Array<{ error: { message: string } | null }>): boolean {
  return results.some((result) => result.error);
}

function buildFallbackResult(warningMessage?: string): CommunityDataLoadResult {
  return {
    data: communityDemo,
    source: "demo_fallback",
    warningMessage,
  };
}

function countReviewStatuses<T extends { review_status: ReviewStatus | null }>(rows: T[]): ReviewStatusCounts {
  const counts: ReviewStatusCounts = {};

  for (const row of rows) {
    const reviewStatus = row.review_status ?? "unknown";
    counts[reviewStatus] = (counts[reviewStatus] ?? 0) + 1;
  }

  return counts;
}

function summarizeStatusCounts(counts: ReviewStatusCounts): string {
  const parts = displayStatusOrder
    .filter((status) => (counts[status] ?? 0) > 0)
    .map((status) => `${status}: ${counts[status]}`);

  return parts.length > 0 ? parts.join(" · ") : "No reviewed records available.";
}

function buildReviewStateTags(counts: ReviewStatusCounts) {
  const tagStatuses: ReviewStatus[] = ["verified_fact", "source_based_inference", "illustrative", "unknown"];

  return tagStatuses.map((status) => ({
    label: `${status} (${counts[status] ?? 0})`,
    state: toChipState(status),
  }));
}

function formatReviewHistory(event: ReviewEventRow): string {
  const reviewer = event.reviewer_name ?? "unknown reviewer";
  const previousStatus = event.previous_review_status ?? "unknown";
  const nextStatus = event.next_review_status ?? "unknown";
  const occurredAt = event.occurred_at ? event.occurred_at.slice(0, 10) : "unknown date";

  return `${event.target_table}: ${event.summary} (${reviewer}, ${occurredAt}, ${previousStatus} -> ${nextStatus})`;
}

function filterReviewEvents(events: ReviewEventRow[], targetTables: string[]): ReviewEventRow[] {
  return events.filter((event) => targetTables.includes(event.target_table));
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
      sourcesCountResult,
      claimsCountResult,
      mapLayersCountResult,
      mapLayerRowsResult,
      buildingsCountResult,
      buildingRowsResult,
      peopleCountResult,
      peopleRowsResult,
      businessesCountResult,
      businessRowsResult,
      assetRequestsCountResult,
      unresolvedCountResult,
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
      supabase.from("source_records").select("*", { count: "exact", head: true }),
      supabase.from("claims").select("*", { count: "exact", head: true }),
      supabase.from("map_layers").select("*", { count: "exact", head: true }),
      supabase
        .from("map_layers")
        .select("layer_id, label, sheet_number, review_status, alignment_scope, notes")
        .order("sheet_number", { ascending: true })
        .limit(6),
      supabase.from("buildings").select("*", { count: "exact", head: true }),
      supabase
        .from("buildings")
        .select("building_id, label, sheet_reference, review_status, certainty, art_state, notes")
        .order("created_at", { ascending: true })
        .limit(24),
      supabase.from("people").select("*", { count: "exact", head: true }),
      supabase
        .from("people")
        .select("person_id, display_name, occupation, review_status, certainty, notes")
        .order("created_at", { ascending: true })
        .limit(24),
      supabase.from("businesses").select("*", { count: "exact", head: true }),
      supabase
        .from("businesses")
        .select("business_id, display_name, business_type, review_status, certainty, notes")
        .order("created_at", { ascending: true })
        .limit(24),
      supabase.from("asset_requests").select("*", { count: "exact", head: true }),
      supabase.from("review_events").select("*", { count: "exact", head: true }).in("next_review_status", unresolvedStatuses),
      supabase
        .from("review_events")
        .select("summary, target_table, reviewer_name, previous_review_status, next_review_status, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(6),
    ]);

    if (
      hasAnyQueryErrors([
        townPackageResult,
        primarySourceResult,
        sourcesCountResult,
        claimsCountResult,
        mapLayersCountResult,
        mapLayerRowsResult,
        buildingsCountResult,
        buildingRowsResult,
        peopleCountResult,
        peopleRowsResult,
        businessesCountResult,
        businessRowsResult,
        assetRequestsCountResult,
        unresolvedCountResult,
        recentReviewEventsResult,
      ])
    ) {
      return buildFallbackResult(supabaseFallbackWarning);
    }

    const data = cloneDemoData();
    const townPackage = townPackageResult.data;
    const primarySource = primarySourceResult.data;
    const mapLayerRows = (mapLayerRowsResult.data ?? []) as MapLayerRow[];
    const buildingRows = (buildingRowsResult.data ?? []) as BuildingRow[];
    const peopleRows = (peopleRowsResult.data ?? []) as PersonRow[];
    const businessRows = (businessRowsResult.data ?? []) as BusinessRow[];
    const recentReviewEvents = (recentReviewEventsResult.data ?? []) as ReviewEventRow[];

    const sourcesCount = countOrZero(sourcesCountResult);
    const claimsCount = countOrZero(claimsCountResult);
    const sheetsCount = countOrZero(mapLayersCountResult);
    const buildingsCount = countOrZero(buildingsCountResult);
    const peopleCount = countOrZero(peopleCountResult);
    const businessesCount = countOrZero(businessesCountResult);
    const assetRequestsCount = countOrZero(assetRequestsCountResult);
    const unresolvedCount = countOrZero(unresolvedCountResult);

    const buildingStatusCounts = countReviewStatuses(buildingRows);
    const peopleStatusCounts = countReviewStatuses(peopleRows);
    const businessStatusCounts = countReviewStatuses(businessRows);

    const trackedCount = sourcesCount + sheetsCount + buildingsCount + peopleCount + businessesCount;
    const resolvedCount = Math.max(trackedCount - unresolvedCount, 0);
    const progressPercent =
      trackedCount > 0 ? Math.max(0, Math.min(100, Math.round((resolvedCount / trackedCount) * 100))) : data.summary.progressPercent;

    if (townPackage) {
      data.town.name = townPackage.name;
      data.town.slug = townPackage.slug;
      data.town.year = townPackage.year;
      data.town.packageId = townPackage.package_id;
      data.town.stateRegion = townPackage.state_region ?? data.town.stateRegion;
      data.town.scope = formatScope(townPackage.evidence_start_year, townPackage.evidence_end_year, data.town.scope);
      data.town.releaseState = townPackage.release_state ?? data.town.releaseState;
      data.communityDashboard.hero.title = `${townPackage.name} ${townPackage.year} Community Dashboard`;
      data.communityDashboard.releaseGate.state = townPackage.release_state ?? data.communityDashboard.releaseGate.state;
      data.communityDashboard.releaseGate.reason =
        townPackage.release_notes ?? `Supabase read is enabled, but release remains ${townPackage.release_state ?? "unknown"}.`;
    }

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
          return { ...chip, value: String(sourcesCount) };
        case "Sheets":
          return { ...chip, value: String(sheetsCount) };
        case "Buildings":
          return { ...chip, value: String(buildingsCount) };
        case "People":
          return { ...chip, value: String(peopleCount) };
        case "Businesses":
          return { ...chip, value: String(businessesCount) };
        case "Release":
          return { ...chip, value: data.town.releaseState, state: toChipState(data.town.releaseState as ReviewStatus) };
        default:
          return chip;
      }
    });

    data.routeCards = data.routeCards.map((routeCard) => {
      switch (routeCard.href) {
        case "/community":
          return { ...routeCard, statValue: `${progressPercent}%` };
        case "/community/map-auditor":
          return { ...routeCard, statValue: String(sheetsCount) };
        case "/community/building-auditor":
          return { ...routeCard, statValue: String(buildingsCount) };
        case "/community/people-auditor":
          return { ...routeCard, statValue: String(peopleCount + businessesCount) };
        case "/community/source-provenance-inspector":
          return { ...routeCard, statValue: String(sourcesCount) };
        case "/community/release-gate":
          return { ...routeCard, statValue: data.town.releaseState };
        default:
          return routeCard;
      }
    });

    data.communityDashboard.overviewCards = data.communityDashboard.overviewCards.map((card) => {
      switch (card.label) {
        case "Sources":
          return { ...card, value: String(sourcesCount) };
        case "Sheets":
          return { ...card, value: String(sheetsCount) };
        case "Buildings":
          return { ...card, value: String(buildingsCount) };
        case "People":
          return { ...card, value: String(peopleCount) };
        case "Businesses":
          return { ...card, value: String(businessesCount) };
        case "Unresolved":
          return { ...card, value: String(unresolvedCount) };
        default:
          return card;
      }
    });

    if (primarySource) {
      data.communityDashboard.evidenceInspector.sourceId = primarySource.source_id;
      data.communityDashboard.evidenceInspector.title = primarySource.title;
      data.communityDashboard.evidenceInspector.summary = "Primary source metadata loaded from Supabase when available.";
      data.communityDashboard.evidenceInspector.fields = data.communityDashboard.evidenceInspector.fields.map((field) => {
        switch (field.label) {
          case "Citation":
            return { ...field, value: primarySource.archive_name ?? field.value, detail: "Primary archive citation." };
          case "Rights":
            return { ...field, value: primarySource.rights_note ?? field.value, detail: "Rights and reuse notes stay attached to the record." };
          case "Review state":
            return { ...field, value: primarySource.review_status ?? field.value, detail: "No record is auto-promoted to verified by default." };
          case "Map year":
            return { ...field, value: formatSourceDate(primarySource.source_date, field.value), detail: "Shown from the first available source record." };
          default:
            return field;
        }
      });
    }

    const overallHistory = recentReviewEvents.map(formatReviewHistory);
    if (overallHistory.length > 0) {
      data.communityDashboard.history = overallHistory;
    }

    if (mapLayerRows.length > 0) {
      const primaryMapLayer = mapLayerRows[0];
      data.mapAuditor.sheetStrip = mapLayerRows.map((layer, index) => ({
        label: layer.label || `Sheet ${layer.sheet_number ?? index + 1}`,
        status: layer.review_status ?? "unknown",
        notes: layer.notes ?? `Alignment scope: ${layer.alignment_scope ?? "local_only"}.`,
      }));
      data.mapAuditor.workspace.calloutLabel = "Supabase map layers";
      data.mapAuditor.workspace.calloutValue = String(sheetsCount);
      data.mapAuditor.workspace.calloutDetail =
        primaryMapLayer.notes ?? `Primary map layer review status: ${primaryMapLayer.review_status ?? "unknown"}.`;
      data.mapAuditor.georeference.status = primaryMapLayer.alignment_scope ?? data.mapAuditor.georeference.status;
      data.mapAuditor.georeference.detail = `Primary map layer review status: ${primaryMapLayer.review_status ?? "unknown"}.`;
      data.mapAuditor.evidence.fields = [
        {
          label: "Map layers",
          value: String(sheetsCount),
          detail: "Supabase map layers currently available for the town package.",
        },
        {
          label: "Primary layer",
          value: primaryMapLayer.label,
          detail: `Sheet ${primaryMapLayer.sheet_number ?? "unknown"} in the current review set.`,
        },
        {
          label: "Map status",
          value: primaryMapLayer.review_status ?? "unknown",
          detail: "Current review status on the primary map layer.",
        },
        {
          label: "Source status",
          value: primarySource?.review_status ?? "unknown",
          detail: "Primary source review state linked to the map surface.",
        },
      ];

      const mapHistory = filterReviewEvents(recentReviewEvents, ["map_layers"]).map(formatReviewHistory);
      if (mapHistory.length > 0) {
        data.mapAuditor.history = mapHistory;
      }
    }

    if (buildingRows.length > 0) {
      const primaryBuilding = buildingRows[0];
      data.buildingAuditor.selectedBuilding.title = primaryBuilding.label;
      data.buildingAuditor.selectedBuilding.subtitle = `${buildingsCount} building records loaded from Supabase for the current town package.`;
      data.buildingAuditor.selectedBuilding.fields = [
        {
          label: "Building ID",
          value: primaryBuilding.building_id,
          detail: "Primary building row from Supabase.",
        },
        {
          label: "Sheet anchor",
          value: primaryBuilding.sheet_reference ?? "unknown",
          detail: "Sheet reference from the building review record.",
        },
        {
          label: "Review status",
          value: primaryBuilding.review_status ?? "unknown",
          detail: summarizeStatusCounts(buildingStatusCounts),
        },
        {
          label: "Certainty",
          value: primaryBuilding.certainty ?? "unknown",
          detail: "Preserved from the building review record.",
        },
        {
          label: "Art state",
          value: primaryBuilding.art_state ?? "illustrative",
          detail: `${assetRequestsCount} asset requests currently tracked.`,
        },
      ];
      data.buildingAuditor.artPreview.detail = `${assetRequestsCount} asset requests currently linked to the community review model.`;
      data.buildingAuditor.extractedLabels = [
        {
          label: "Buildings",
          value: String(buildingsCount),
          detail: "Supabase building rows in the current review set.",
        },
        {
          label: "Primary label",
          value: primaryBuilding.label,
          detail: "Current display label on the primary building record.",
        },
        {
          label: "Review summary",
          value: summarizeStatusCounts(buildingStatusCounts),
          detail: "Status distribution across loaded building rows.",
        },
      ];
      data.buildingAuditor.provenance.fields = [
        {
          label: "Building records",
          value: String(buildingsCount),
          detail: "Total building rows available in Supabase.",
        },
        {
          label: "Illustrative assets",
          value: String(assetRequestsCount),
          detail: "Asset requests remain illustrative unless reviewed later.",
        },
        {
          label: "Primary source",
          value: primarySource?.source_id ?? "unknown",
          detail: "Source link preserved for building review.",
        },
        {
          label: "Reviewer note",
          value: primaryBuilding.notes ?? "No review note recorded.",
          detail: "Notes from the primary building review record.",
        },
      ];
      data.buildingAuditor.reviewStates = buildReviewStateTags(buildingStatusCounts);
    }

    const primaryPerson = peopleRows[0];
    const primaryBusiness = businessRows[0];

    data.peopleAuditor.sourceIssues = [
      {
        label: "People",
        value: String(peopleCount),
        detail: "Supabase people rows currently in the review queue.",
      },
      {
        label: "Businesses",
        value: String(businessesCount),
        detail: "Supabase business rows currently in the review queue.",
      },
      {
        label: "Source records",
        value: String(sourcesCount),
        detail: "Source trail available for identity review.",
      },
    ];

    if (primaryPerson) {
      data.peopleAuditor.personReview.fields = [
        {
          label: "Name",
          value: primaryPerson.display_name,
          detail: "Primary person review row from Supabase.",
        },
        {
          label: "Confidence",
          value: primaryPerson.certainty ?? "unknown",
          detail: "Supabase certainty value on the person record.",
        },
        {
          label: "People count",
          value: String(peopleCount),
          detail: summarizeStatusCounts(peopleStatusCounts),
        },
        {
          label: "Review status",
          value: primaryPerson.review_status ?? "unknown",
          detail: primaryPerson.notes ?? "Current person review state from Supabase.",
        },
      ];
    }

    if (primaryBusiness) {
      data.peopleAuditor.businessReview.fields = [
        {
          label: "Business",
          value: primaryBusiness.display_name,
          detail: "Primary business review row from Supabase.",
        },
        {
          label: "Type",
          value: primaryBusiness.business_type ?? "unknown",
          detail: "Business type preserved from the review record.",
        },
        {
          label: "Businesses count",
          value: String(businessesCount),
          detail: summarizeStatusCounts(businessStatusCounts),
        },
        {
          label: "Review status",
          value: primaryBusiness.review_status ?? "unknown",
          detail: primaryBusiness.notes ?? "Current business review state from Supabase.",
        },
      ];
    }

    data.peopleAuditor.legend = [
      {
        label: "People statuses",
        state: "reviewing",
        note: summarizeStatusCounts(peopleStatusCounts),
      },
      {
        label: "Business statuses",
        state: "reviewing",
        note: summarizeStatusCounts(businessStatusCounts),
      },
      {
        label: "Combined queue",
        state: unresolvedCount > 0 ? "guarded" : "ready",
        note: `${peopleCount + businessesCount} total identity records currently in review.`,
      },
    ];

    const identityEvents = filterReviewEvents(recentReviewEvents, ["people", "businesses"]);
    if (identityEvents.length > 0) {
      data.peopleAuditor.unresolved = identityEvents
        .filter((event) => unresolvedStatuses.includes(event.next_review_status ?? "unknown"))
        .map((event) => event.summary);
      data.peopleAuditor.history = identityEvents.map(formatReviewHistory);
    }

    if (primarySource) {
      data.sourceProvenanceInspector.source.fields = [
        {
          label: "Source ID",
          value: primarySource.source_id,
          detail: "Referenced by the Supabase-backed town package.",
        },
        {
          label: "Archive",
          value: primarySource.archive_name ?? "unknown",
          detail: "Primary archive citation.",
        },
        {
          label: "Issue date",
          value: formatSourceDate(primarySource.source_date, "unknown"),
          detail: "Historical scope anchor.",
        },
        {
          label: "Review status",
          value: primarySource.review_status ?? "unknown",
          detail: "Current Supabase review state.",
        },
      ];
      data.sourceProvenanceInspector.ocr.quote = primarySource.ocr_excerpt ?? data.sourceProvenanceInspector.ocr.quote;
      data.sourceProvenanceInspector.rights.fields = [
        {
          label: "Source count",
          value: String(sourcesCount),
          detail: "Supabase source records in the current town package.",
        },
        {
          label: "Citation string",
          value: primarySource.title,
          detail: "Primary source title loaded from Supabase.",
        },
        {
          label: "Rights",
          value: primarySource.rights_note ?? "unknown",
          detail: "Access and rights notes stay attached to each source record.",
        },
      ];
    }

    data.sourceProvenanceInspector.linkedRecords = [
      {
        label: "Sources",
        value: String(sourcesCount),
        detail: "Supabase source records currently available.",
      },
      {
        label: "Buildings",
        value: String(buildingsCount),
        detail: "Reviewed and candidate anchors linked from the source set.",
      },
      {
        label: "People",
        value: String(peopleCount + businessesCount),
        detail: "Identity and business records remain review-bound.",
      },
      {
        label: "Claims",
        value: String(claimsCount),
        detail: "Claims remain provenance-labeled and non-verified by default.",
      },
    ];

    const sourceHistory = filterReviewEvents(recentReviewEvents, ["source_records"]);
    if (sourceHistory.length > 0) {
      data.sourceProvenanceInspector.history = sourceHistory.map(formatReviewHistory);
    }

    data.releaseGate.state = townPackage?.release_state ?? data.releaseGate.state;
    data.releaseGate.reason =
      townPackage?.release_notes ??
      (unresolvedCount > 0
        ? `${unresolvedCount} unresolved review events currently block release.`
        : "No unresolved review events are currently blocking release.");
    data.releaseGate.progressPercent = progressPercent;
    data.releaseGate.progressDetail =
      unresolvedCount > 0
        ? `${unresolvedCount} unresolved review events currently block release.`
        : "No unresolved review events are currently blocking release.";

    if (recentReviewEvents.length > 0) {
      data.releaseGate.blockers = recentReviewEvents
        .filter((event) => unresolvedStatuses.includes(event.next_review_status ?? "unknown"))
        .map((event) => event.summary);
      data.releaseGate.history = recentReviewEvents.map(formatReviewHistory);
    }

    data.releaseGate.criteria = [
      {
        label: "Citations",
        value: primarySource?.review_status ?? "unknown",
        detail: `${sourcesCount} source records currently available.`,
      },
      {
        label: "Map stitching",
        value: mapLayerRows[0]?.review_status ?? "unknown",
        detail: `${sheetsCount} map layers currently tracked.`,
      },
      {
        label: "Building anchors",
        value: summarizeStatusCounts(buildingStatusCounts),
        detail: `${buildingsCount} building records currently tracked.`,
      },
      {
        label: "People identities",
        value: summarizeStatusCounts(peopleStatusCounts),
        detail: `${peopleCount} people and ${businessesCount} businesses currently in review.`,
      },
      {
        label: "Review events",
        value: String(unresolvedCount),
        detail: "Unresolved review events still blocking release.",
      },
    ];

    return {
      data,
      source: "supabase",
    };
  } catch {
    return buildFallbackResult(supabaseFallbackWarning);
  }
});
