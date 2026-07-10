import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCommunitySourceDetail,
  buildDemoSourceDetailResult,
  buildSourceDetailFailureResult,
  communitySourceDetailReviewTimelineEmptyState,
  normalizeEvidenceClassification,
} from "./community-source-detail.ts";

test("normalizes missing or invalid evidence classifications to unknown", () => {
  const detail = buildCommunitySourceDetail({
    sourceRecord: {
      id: "source-row-1",
      source_id: "source_test_invalid",
      title: "Invalid status source",
      archive_name: null,
      source_url: null,
      source_date: null,
      page_reference: null,
      rights_note: null,
      ocr_excerpt: null,
      review_status: "not_a_real_status",
      certainty: null,
      metadata: {
        evidence_classification: "invalid_status",
      },
    },
    claims: [
      {
        claim_id: "claim_1",
        claim_text: "Candidate claim",
        claim_type: "bad_type",
        review_status: "another_bad_status",
        certainty: null,
        building_id: null,
        person_id: null,
        business_id: null,
      },
    ],
    buildings: [],
    people: [],
    businesses: [],
    reviewEvents: [
      {
        target_table: "source_records",
        target_id: "source_test_invalid",
        previous_review_status: "bad_previous",
        next_review_status: null,
        reviewer_identifier: "reviewer_1",
        reviewer_name: null,
        occurred_at: null,
        summary: null,
        review_note: null,
      },
    ],
  });

  assert.equal(normalizeEvidenceClassification("not_allowed"), "unknown");
  assert.equal(detail.reviewStatus, "unknown");
  assert.equal(detail.evidenceClassification, "unknown");
  assert.equal(detail.linkedClaims[0]?.evidenceClassification, "unknown");
  assert.equal(detail.linkedClaims[0]?.reviewStatus, "unknown");
  assert.equal(detail.reviewTimeline[0]?.previousStatus, "unknown");
  assert.equal(detail.reviewTimeline[0]?.nextStatus, "unknown");
});

test("returns empty linked record sets and a clear review-note empty state", () => {
  const detail = buildCommunitySourceDetail({
    sourceRecord: {
      id: "source-row-2",
      source_id: "source_test_empty",
      title: "Empty linked record source",
      archive_name: "Archive",
      source_url: null,
      source_date: null,
      page_reference: null,
      rights_note: null,
      ocr_excerpt: null,
      review_status: null,
      certainty: null,
      metadata: null,
    },
    claims: [],
    buildings: [],
    people: [],
    businesses: [],
    reviewEvents: [],
  });

  assert.deepEqual(detail.linkedClaims, []);
  assert.deepEqual(detail.linkedBuildings, []);
  assert.deepEqual(detail.linkedPeople, []);
  assert.deepEqual(detail.linkedBusinesses, []);
  assert.deepEqual(detail.reviewTimeline, []);
  assert.equal(detail.reviewTimelineEmptyState, communitySourceDetailReviewTimelineEmptyState);
});

test("demo lookup returns no record for an unknown source ID so the route can render not found", () => {
  const result = buildDemoSourceDetailResult("source_that_does_not_exist");

  assert.equal(result.source, "demo_fallback");
  assert.equal(result.record, null);
  assert.equal(result.warningMessage, undefined);
});

test("query-failure fallback uses demo data only when a matching demo source exists", () => {
  const demoResult = buildSourceDetailFailureResult("source_texarkana_1885_sanborn_loc");
  const missingResult = buildSourceDetailFailureResult("source_that_does_not_exist");

  assert.equal(demoResult.source, "demo_fallback");
  assert.equal(demoResult.record?.sourceId, "source_texarkana_1885_sanborn_loc");
  assert.match(demoResult.warningMessage ?? "", /demo fallback/i);

  assert.equal(missingResult.source, "supabase");
  assert.equal(missingResult.record, null);
  assert.match(missingResult.warningMessage ?? "", /no demo fallback exists/i);
});
