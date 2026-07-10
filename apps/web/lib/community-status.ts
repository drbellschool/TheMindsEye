export const reviewStatuses = [
  "verified_fact",
  "source_based_inference",
  "illustrative",
  "fictional_gameplay",
  "unknown",
  "rejected",
] as const;

export const unresolvedStatuses = ["source_based_inference", "illustrative", "unknown"] as const;

export type ReviewStatus = (typeof reviewStatuses)[number];
export type UnresolvedStatus = (typeof unresolvedStatuses)[number];
export type ChipState = "ready" | "reviewing" | "partial" | "guarded" | "blocked";

export type ReviewStatusCounts = Record<ReviewStatus, number>;

export type StatusRow = {
  review_status: string | null;
};

export type ReviewEventStatusRow = {
  next_review_status: string | null;
};

export type QueryErrorCarrier = {
  error: { message: string } | null;
};

export type StatusSummary = {
  label: string;
  total: number;
  counts: ReviewStatusCounts;
  state: ChipState;
  summary: string;
};

export type CommunityStatusSummaries = {
  sourceRecords: StatusSummary;
  mapLayers: StatusSummary;
  buildings: StatusSummary;
  people: StatusSummary;
  businesses: StatusSummary;
  claims: StatusSummary;
  unresolvedReviewEvents: number;
};

export function createEmptyReviewStatusCounts(): ReviewStatusCounts {
  return {
    verified_fact: 0,
    source_based_inference: 0,
    illustrative: 0,
    fictional_gameplay: 0,
    unknown: 0,
    rejected: 0,
  };
}

export function normalizeReviewStatus(value: string | null | undefined): ReviewStatus {
  return reviewStatuses.includes(value as ReviewStatus) ? (value as ReviewStatus) : "unknown";
}

export function toChipState(reviewStatus: ReviewStatus | null): ChipState {
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

export function deriveChipStateFromCounts(counts: ReviewStatusCounts): ChipState {
  if (counts.rejected > 0) {
    return "blocked";
  }

  if (counts.unknown > 0) {
    return "guarded";
  }

  if (counts.source_based_inference > 0) {
    return "reviewing";
  }

  if (counts.illustrative > 0 || counts.fictional_gameplay > 0) {
    return "partial";
  }

  if (counts.verified_fact > 0) {
    return "ready";
  }

  return "guarded";
}

export function combineChipStates(states: ChipState[]): ChipState {
  const priority: ChipState[] = ["blocked", "guarded", "reviewing", "partial", "ready"];

  for (const state of priority) {
    if (states.includes(state)) {
      return state;
    }
  }

  return "guarded";
}

export function buildReviewStatusCounts(rows: StatusRow[]): ReviewStatusCounts {
  const counts = createEmptyReviewStatusCounts();

  for (const row of rows) {
    const reviewStatus = normalizeReviewStatus(row.review_status);
    counts[reviewStatus] += 1;
  }

  return counts;
}

export function summarizeStatusCounts(counts: ReviewStatusCounts): string {
  const parts = reviewStatuses
    .filter((status) => counts[status] > 0)
    .map((status) => `${status}: ${counts[status]}`);

  return parts.length > 0 ? parts.join(" | ") : "No records loaded from Supabase yet.";
}

export function buildStatusSummary(label: string, rows: StatusRow[]): StatusSummary {
  const counts = buildReviewStatusCounts(rows);

  return {
    label,
    total: rows.length,
    counts,
    state: deriveChipStateFromCounts(counts),
    summary: summarizeStatusCounts(counts),
  };
}

export function countUnresolvedReviewEvents(rows: ReviewEventStatusRow[]): number {
  return rows.filter((row) => unresolvedStatuses.includes(normalizeReviewStatus(row.next_review_status) as UnresolvedStatus)).length;
}

export function buildCommunityStatusSummaries(input: {
  sourceRecords: StatusRow[];
  mapLayers: StatusRow[];
  buildings: StatusRow[];
  people: StatusRow[];
  businesses: StatusRow[];
  claims: StatusRow[];
  reviewEvents: ReviewEventStatusRow[];
}): CommunityStatusSummaries {
  return {
    sourceRecords: buildStatusSummary("Source records", input.sourceRecords),
    mapLayers: buildStatusSummary("Map layers", input.mapLayers),
    buildings: buildStatusSummary("Buildings", input.buildings),
    people: buildStatusSummary("People", input.people),
    businesses: buildStatusSummary("Businesses", input.businesses),
    claims: buildStatusSummary("Claims", input.claims),
    unresolvedReviewEvents: countUnresolvedReviewEvents(input.reviewEvents),
  };
}

export function hasAnyQueryErrors(results: QueryErrorCarrier[]): boolean {
  return results.some((result) => result.error);
}
