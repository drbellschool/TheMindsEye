import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceSanbornSourceImageLifecycle,
  getSanbornSourceImageAspectRatio,
  resetSanbornSourceImageLifecycle,
} from "./sanborn-source-image.ts";

test("source image aspect ratio uses asset dimensions and safe fallback", () => {
  assert.equal(getSanbornSourceImageAspectRatio(1200, 800), 1.5);
  assert.equal(getSanbornSourceImageAspectRatio(800, 1200), 800 / 1200);
  assert.equal(getSanbornSourceImageAspectRatio(0, 1200), 1);
  assert.equal(getSanbornSourceImageAspectRatio(null, null), 1);
});

test("source image lifecycle resets on asset or signed URL changes", () => {
  const loaded = advanceSanbornSourceImageLifecycle(resetSanbornSourceImageLifecycle(), "load");
  assert.equal(loaded.state, "loaded");
  assert.deepEqual(advanceSanbornSourceImageLifecycle(loaded, "asset_change"), resetSanbornSourceImageLifecycle());
});

test("source image retries once and recovers after the first error", () => {
  const firstRetry = advanceSanbornSourceImageLifecycle(resetSanbornSourceImageLifecycle(), "error");
  assert.equal(firstRetry.state, "retrying");
  assert.equal(firstRetry.automaticRetryUsed, true);
  assert.equal(advanceSanbornSourceImageLifecycle(firstRetry, "load").state, "loaded");
});

test("source image stays failed after the second error and manual retry is controlled", () => {
  const firstRetry = advanceSanbornSourceImageLifecycle(resetSanbornSourceImageLifecycle(), "error");
  const failed = advanceSanbornSourceImageLifecycle(firstRetry, "error");
  assert.equal(failed.state, "failed");
  assert.equal(advanceSanbornSourceImageLifecycle(failed, "error").state, "failed");
  const manualRetry = advanceSanbornSourceImageLifecycle(failed, "manual_retry");
  assert.equal(manualRetry.state, "retrying");
  assert.equal(manualRetry.automaticRetryUsed, false);
});

test("drawing readiness is false until image lifecycle reaches loaded", () => {
  const loading = resetSanbornSourceImageLifecycle();
  assert.equal(loading.state === "loaded", false);
  assert.equal(advanceSanbornSourceImageLifecycle(loading, "load").state === "loaded", true);
});
