import { normalizeReviewStatus, toChipState } from "@/lib/community-status";

import { StatusChip } from "./StatusChip";

type ReviewTimelineEvent = {
  id: string;
  targetTable: string;
  targetId: string;
  previousStatus: string;
  nextStatus: string;
  reviewerName: string;
  occurredAtLabel: string;
  summary: string;
  reviewNote: string;
};

type ReviewTimelineProps = {
  emptyState: string;
  events: ReviewTimelineEvent[];
};

function formatStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function ReviewTimeline({ emptyState, events }: ReviewTimelineProps) {
  if (events.length === 0) {
    return <p className="small-muted">{emptyState}</p>;
  }

  return (
    <div className="dashboard-timeline">
      {events.map((event) => {
        const previousStatus = normalizeReviewStatus(event.previousStatus);
        const nextStatus = normalizeReviewStatus(event.nextStatus);

        return (
          <article className="dashboard-timeline-item" key={event.id}>
            <div className="dashboard-timeline__header">
              <div className="dashboard-timeline__field">
                <p className="dashboard-section-label">Target table</p>
                <strong>{event.targetTable}</strong>
              </div>

              <div className="dashboard-timeline__meta">
                <span className="tag">{event.occurredAtLabel}</span>
                <span className="tag">{event.reviewerName}</span>
              </div>
            </div>

            <div className="dashboard-timeline__field">
              <p className="dashboard-section-label">Target ID</p>
              <strong>{event.targetId}</strong>
            </div>

            <p className="dashboard-timeline__summary">{event.summary}</p>

            <div className="dashboard-timeline__transition">
              <StatusChip label="From" value={formatStatusLabel(previousStatus)} state={toChipState(previousStatus)} />
              <span className="dashboard-timeline__arrow" aria-hidden="true">
                {"->"}
              </span>
              <StatusChip label="To" value={formatStatusLabel(nextStatus)} state={toChipState(nextStatus)} />
            </div>

            <p className="dashboard-timeline__note">
              <span className="dashboard-timeline__note-label">Review note</span>
              {event.reviewNote}
            </p>
          </article>
        );
      })}
    </div>
  );
}

