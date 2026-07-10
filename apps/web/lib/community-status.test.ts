import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCommunityStatusSummaries,
  buildStatusSummary,
  createEmptyReviewStatusCounts,
  hasAnyQueryErrors,
  normalizeReviewStatus,
} from "./community-status.ts";

test("groups each allowed review status", () => {
  const summary = buildStatusSummary("Buildings", [
    { review_status: "verified_fact" },
    { review_status: "source_based_inference" },
    { review_status: "illustrative" },
    { review_status: "fictional_gameplay" },
    { review_status: "unknown" },
    { review_status: "rejected" },
  ]);

  assert.equal(summary.total, 6);
  assert.deepEqual(summary.counts, {
    verified_fact: 1,
    source_based_inference: 1,
    illustrative: 1,
    fictional_gameplay: 1,
    unknown: 1,
    rejected: 1,
  });
});

test("missing status becomes unknown", () => {
  const summary = buildStatusSummary("People", [{ review_status: null }]);

  assert.equal(summary.counts.unknown, 1);
  assert.equal(summary.total, 1);
});

test("empty result sets produce zero counts", () => {
  const summary = buildStatusSummary("Claims", []);

  assert.equal(summary.total, 0);
  assert.deepEqual(summary.counts, createEmptyReviewStatusCounts());
  assert.equal(summary.summary, "No records loaded from Supabase yet.");
});

test("invalid status becomes unknown", () => {
  assert.equal(normalizeReviewStatus("not_a_real_status"), "unknown");

  const summary = buildStatusSummary("Source records", [{ review_status: "not_a_real_status" }]);
  assert.equal(summary.counts.unknown, 1);
});

test("counts unresolved review events using allowed unresolved states", () => {
  const summaries = buildCommunityStatusSummaries({
    sourceRecords: [],
    mapLayers: [],
    buildings: [],
    people: [],
    businesses: [],
    claims: [],
    reviewEvents: [
      { next_review_status: "verified_fact" },
      { next_review_status: "source_based_inference" },
      { next_review_status: "illustrative" },
      { next_review_status: "unknown" },
      { next_review_status: null },
      { next_review_status: "rejected" },
    ],
  });

  assert.equal(summaries.unresolvedReviewEvents, 4);
});

test("query errors can trigger safe fallback behavior", () => {
  assert.equal(
    hasAnyQueryErrors([
      { error: null },
      { error: { message: "query failed" } },
    ]),
    true,
  );

  assert.equal(
    hasAnyQueryErrors([
      { error: null },
      { error: null },
    ]),
    false,
  );
});
