import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReviewEventTimeline,
  communityReviewTimelineEmptyState,
  dashboardReviewTimelineLimit,
  formatReviewTimelineHistory,
} from "./community-review-events.ts";

test("sorts newest review events first and caps the dashboard timeline", () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    target_table: "buildings",
    target_id: `building_${index}`,
    previous_review_status: "unknown",
    next_review_status: "source_based_inference",
    reviewer_name: `Reviewer ${index}`,
    occurred_at: `2026-07-${String(index + 1).padStart(2, "0")}T08:00:00Z`,
    summary: `Summary ${index}`,
    review_note: `Note ${index}`,
  }));

  const timeline = buildReviewEventTimeline(rows);

  assert.equal(timeline.length, dashboardReviewTimelineLimit);
  assert.equal(timeline[0]?.targetId, "building_9");
  assert.equal(timeline[dashboardReviewTimelineLimit - 1]?.targetId, "building_2");
});

test("normalizes missing values and invalid statuses safely", () => {
  const timeline = buildReviewEventTimeline([
    {
      target_table: null,
      target_id: "",
      previous_review_status: "not_a_status",
      next_review_status: null,
      reviewer_identifier: "community_seed_01",
      reviewer_name: null,
      occurred_at: null,
      summary: null,
      review_note: " ",
    },
  ]);

  assert.equal(timeline[0]?.targetTable, "unknown_table");
  assert.equal(timeline[0]?.targetId, "unknown-target");
  assert.equal(timeline[0]?.previousStatus, "unknown");
  assert.equal(timeline[0]?.nextStatus, "unknown");
  assert.equal(timeline[0]?.reviewerName, "community_seed_01");
  assert.equal(timeline[0]?.occurredAtDateLabel, "Unknown date");
  assert.equal(timeline[0]?.occurredAtLabel, "Unknown date");
  assert.equal(timeline[0]?.summary, "No review summary recorded.");
  assert.equal(timeline[0]?.reviewNote, "No review note recorded.");
});

test("places invalid or missing dates after valid review events", () => {
  const timeline = buildReviewEventTimeline([
    {
      target_table: "people",
      target_id: "person_recent",
      previous_review_status: "unknown",
      next_review_status: "source_based_inference",
      reviewer_name: "Recent reviewer",
      occurred_at: "2026-07-11T10:30:00Z",
      summary: "Recent event",
      review_note: "Recent note",
    },
    {
      target_table: "people",
      target_id: "person_invalid",
      previous_review_status: "unknown",
      next_review_status: "illustrative",
      reviewer_name: "Invalid reviewer",
      occurred_at: "not-a-date",
      summary: "Invalid date event",
      review_note: "Invalid note",
    },
    {
      target_table: "people",
      target_id: "person_missing",
      previous_review_status: "unknown",
      next_review_status: "unknown",
      reviewer_name: "Missing reviewer",
      occurred_at: null,
      summary: "Missing date event",
      review_note: "Missing note",
    },
  ]);

  assert.equal(timeline[0]?.targetId, "person_recent");
  assert.equal(timeline[1]?.targetId, "person_invalid");
  assert.equal(timeline[2]?.targetId, "person_missing");
});

test("returns an empty timeline state without triggering fallback formatting", () => {
  const timeline = buildReviewEventTimeline([]);

  assert.deepEqual(timeline, []);
  assert.deepEqual(formatReviewTimelineHistory(timeline), []);
  assert.equal(communityReviewTimelineEmptyState, "No review events loaded from Supabase yet.");
});

