import assert from "node:assert/strict";
import test from "node:test";

import {
  birdsEyeImageRoundTripError,
  birdsEyeNormalizedToScreen,
  birdsEyeScreenToNormalized,
  centeredBirdsEyeMarkerAnchor,
  mapClickRoundTripError,
} from "./birds-eye-interaction.ts";

const viewport = {
  cssWidth: 900,
  cssHeight: 520,
  imageWidth: 1800,
  imageHeight: 1200,
  view: { x: 240, y: 100, width: 900, height: 600 },
};

test("historical image screen conversion accounts for preserveAspectRatio letterboxing", () => {
  const normalized = { x: 0.5, y: 0.5 };
  const screen = birdsEyeNormalizedToScreen(normalized, viewport);
  assert.deepEqual(screen, { x: 632, y: 433.33333333333337 });
  assert.deepEqual(birdsEyeScreenToNormalized(screen, viewport), normalized);
  assert.equal(birdsEyeScreenToNormalized({ x: 5, y: 260 }, viewport), null);
});

test("historical image normalized round trips remain within one original-image pixel", () => {
  for (const normalized of [{ x: 0.25, y: 0.15 }, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.55 }]) {
    assert.ok(birdsEyeImageRoundTripError(normalized, viewport) < 1);
  }
});

test("map marker anchors and click round trips use the visual center", () => {
  assert.deepEqual(centeredBirdsEyeMarkerAnchor(30), [15, 15]);
  assert.ok(mapClickRoundTripError({ x: 203, y: 147 }, { x: 203, y: 147 }) <= 1);
});
