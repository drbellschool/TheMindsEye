const allowedReviewStatuses = [
  "verified_fact",
  "source_based_inference",
  "illustrative",
  "fictional_gameplay",
  "unknown",
  "rejected",
] as const;

type ReviewStatus = (typeof allowedReviewStatuses)[number];

export const recentReviewEventQueryLimit = 12;
export const dashboardReviewTimelineLimit = 8;
export const communityReviewTimelineEmptyState = "No review events loaded from Supabase yet.";

export type ReviewEventRow = {
  target_table: string | null;
  target_id: string | null;
  previous_review_status: string | null;
  next_review_status: string | null;
  reviewer_identifier?: string | null;
  reviewer_name: string | null;
  occurred_at: string | null;
  summary: string | null;
  review_note: string | null;
};

export type CommunityReviewTimelineEvent = {
  id: string;
  targetTable: string;
  targetId: string;
  previousStatus: ReviewStatus;
  nextStatus: ReviewStatus;
  reviewerName: string;
  occurredAt: string;
  occurredAtDateLabel: string;
  occurredAtLabel: string;
  summary: string;
  reviewNote: string;
  transitionLabel: string;
};

function normalizeReviewStatus(value: string | null | undefined): ReviewStatus {
  return allowedReviewStatuses.includes(value as ReviewStatus) ? (value as ReviewStatus) : "unknown";
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value : fallback;
}

function getOccurredTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function formatOccurredAt(value: string | null): { occurredAtDateLabel: string; occurredAtLabel: string } {
  if (!value) {
    return {
      occurredAtDateLabel: "Unknown date",
      occurredAtLabel: "Unknown date",
    };
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return {
      occurredAtDateLabel: "Unknown date",
      occurredAtLabel: "Unknown date",
    };
  }

  const iso = parsed.toISOString();

  return {
    occurredAtDateLabel: iso.slice(0, 10),
    occurredAtLabel: `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`,
  };
}

function compareReviewEvents(a: ReviewEventRow, b: ReviewEventRow): number {
  const timestampDifference = getOccurredTimestamp(b.occurred_at) - getOccurredTimestamp(a.occurred_at);

  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  const tableDifference = normalizeText(a.target_table, "unknown_table").localeCompare(normalizeText(b.target_table, "unknown_table"));

  if (tableDifference !== 0) {
    return tableDifference;
  }

  return normalizeText(a.target_id, "unknown-target").localeCompare(normalizeText(b.target_id, "unknown-target"));
}

export function buildReviewEventTimeline(
  rows: ReviewEventRow[],
  limit = dashboardReviewTimelineLimit,
): CommunityReviewTimelineEvent[] {
  return [...rows]
    .sort(compareReviewEvents)
    .slice(0, limit)
    .map((row, index) => {
      const targetTable = normalizeText(row.target_table, "unknown_table");
      const targetId = normalizeText(row.target_id, "unknown-target");
      const previousStatus = normalizeReviewStatus(row.previous_review_status);
      const nextStatus = normalizeReviewStatus(row.next_review_status);
      const reviewerName = normalizeText(row.reviewer_name, normalizeText(row.reviewer_identifier, "unknown reviewer"));
      const summary = normalizeText(row.summary, "No review summary recorded.");
      const reviewNote = normalizeText(row.review_note, "No review note recorded.");
      const occurredAt = formatOccurredAt(row.occurred_at);

      return {
        id: `${targetTable}:${targetId}:${row.occurred_at ?? "unknown"}:${index}`,
        targetTable,
        targetId,
        previousStatus,
        nextStatus,
        reviewerName,
        occurredAt: row.occurred_at ?? "",
        occurredAtDateLabel: occurredAt.occurredAtDateLabel,
        occurredAtLabel: occurredAt.occurredAtLabel,
        summary,
        reviewNote,
        transitionLabel: `${previousStatus} -> ${nextStatus}`,
      };
    });
}

export function filterReviewTimeline(events: CommunityReviewTimelineEvent[], targetTables: string[]): CommunityReviewTimelineEvent[] {
  return events.filter((event) => targetTables.includes(event.targetTable));
}

export function formatReviewTimelineEvent(event: CommunityReviewTimelineEvent): string {
  return `${event.targetTable}: ${event.summary} (${event.reviewerName}, ${event.occurredAtDateLabel}, ${event.transitionLabel})`;
}

export function formatReviewTimelineHistory(events: CommunityReviewTimelineEvent[]): string[] {
  return events.map(formatReviewTimelineEvent);
}
