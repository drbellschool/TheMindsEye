import { communityDemo, type CommunityDemoData } from "@/lib/demo-data";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type ReviewStatus =
  | "verified_fact"
  | "source_based_inference"
  | "illustrative"
  | "fictional_gameplay"
  | "unknown"
  | "rejected";

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
};

type ReviewEventRow = {
  summary: string;
  entity_table: string;
  reviewer_name: string | null;
  previous_review_status: ReviewStatus | null;
  next_review_status: ReviewStatus | null;
  occurred_at: string | null;
};

const unresolvedStatuses: ReviewStatus[] = ["source_based_inference", "illustrative", "unknown"];

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

function toChipState(reviewStatus: ReviewStatus | null): "ready" | "reviewing" | "partial" | "guarded" | "blocked" {
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

export async function loadCommunityData(): Promise<CommunityDemoData> {
  if (!hasSupabaseEnv()) {
    return communityDemo;
  }

  try {
    const supabase = await createClient();

    if (!supabase) {
      return communityDemo;
    }

    const [
      townPackageResult,
      primarySourceResult,
      sourcesCountResult,
      mapLayersCountResult,
      buildingsCountResult,
      peopleCountResult,
      businessesCountResult,
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
        .select("source_id, title, archive_name, rights_note, review_status, source_date")
        .order("source_date", { ascending: true })
        .limit(1)
        .maybeSingle<SourceRecordRow>(),
      supabase.from("source_records").select("*", { count: "exact", head: true }),
      supabase.from("map_layers").select("*", { count: "exact", head: true }),
      supabase.from("buildings").select("*", { count: "exact", head: true }),
      supabase.from("people").select("*", { count: "exact", head: true }),
      supabase.from("businesses").select("*", { count: "exact", head: true }),
      supabase.from("review_events").select("*", { count: "exact", head: true }).in("next_review_status", unresolvedStatuses),
      supabase
        .from("review_events")
        .select("summary, entity_table, reviewer_name, previous_review_status, next_review_status, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(3),
    ]);

    if (
      hasAnyQueryErrors([
        townPackageResult,
        primarySourceResult,
        sourcesCountResult,
        mapLayersCountResult,
        buildingsCountResult,
        peopleCountResult,
        businessesCountResult,
        unresolvedCountResult,
        recentReviewEventsResult,
      ])
    ) {
      return communityDemo;
    }

    const data = cloneDemoData();
    const townPackage = townPackageResult.data;
    const primarySource = primarySourceResult.data;
    const recentReviewEvents = (recentReviewEventsResult.data ?? []) as ReviewEventRow[];

    const sourcesCount = countOrZero(sourcesCountResult);
    const sheetsCount = countOrZero(mapLayersCountResult);
    const buildingsCount = countOrZero(buildingsCountResult);
    const peopleCount = countOrZero(peopleCountResult);
    const businessesCount = countOrZero(businessesCountResult);
    const unresolvedCount = countOrZero(unresolvedCountResult);
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

    if (recentReviewEvents.length > 0) {
      data.communityDashboard.history = recentReviewEvents.map((event) => {
        const reviewer = event.reviewer_name ?? "unknown reviewer";
        const previousStatus = event.previous_review_status ?? "unknown";
        const nextStatus = event.next_review_status ?? "unknown";
        const occurredAt = event.occurred_at ? event.occurred_at.slice(0, 10) : "unknown date";

        return `${event.entity_table}: ${event.summary} (${reviewer}, ${occurredAt}, ${previousStatus} -> ${nextStatus})`;
      });
    }

    return data;
  } catch {
    return communityDemo;
  }
}
