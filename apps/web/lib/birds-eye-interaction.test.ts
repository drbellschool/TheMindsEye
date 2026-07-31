import assert from "node:assert/strict";
import test from "node:test";

import {
  BIRDS_EYE_MARKER_DIAMETER_CSS_PX,
  BIRDS_EYE_MARKER_SELECTED_RING_CSS_PX,
  birdsEyeImageRoundTripError,
  birdsEyeNormalizedToScreen,
  birdsEyeScreenToNormalized,
  calculateBirdsEyeRenderedImageLayout,
  centeredBirdsEyeMarkerAnchor,
  mapClickRoundTripError,
  type BirdsEyeImageViewport,
  type BirdsEyeScreenPoint,
} from "./birds-eye-interaction.ts";

const viewport = {
  cssWidth: 900,
  cssHeight: 520,
  imageWidth: 1800,
  imageHeight: 1200,
  view: { x: 240, y: 100, width: 900, height: 600 },
};

function requiredScreen(point: BirdsEyeScreenPoint | null): BirdsEyeScreenPoint {
  assert.ok(point, "expected a valid rendered-image layout");
  return point;
}

function assertNear(actual: number, expected: number, tolerance = 0.000001): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} was not within ${tolerance} of ${expected}`);
}

test("historical image screen conversion accounts for preserveAspectRatio letterboxing", () => {
  const normalized = { x: 0.5, y: 0.5 };
  const screen = requiredScreen(birdsEyeNormalizedToScreen(normalized, viewport));
  assertNear(screen.x, 632);
  assertNear(screen.y, 433.33333333333337);
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

test("one rendered-image layout drives fit, zoom, pan, resize, and letterboxed marker anchors", () => {
  const normalized = { x: 0.37, y: 0.61 };
  const cases: BirdsEyeImageViewport[] = [
    { cssWidth: 900, cssHeight: 520, imageWidth: 1800, imageHeight: 1200, view: { x: 0, y: 0, width: 1800, height: 1200 } },
    { cssWidth: 900, cssHeight: 520, imageWidth: 1800, imageHeight: 1200, view: { x: 450, y: 300, width: 900, height: 600 } },
    { cssWidth: 900, cssHeight: 520, imageWidth: 1800, imageHeight: 1200, view: { x: 250, y: 140, width: 900, height: 600 } },
    { cssWidth: 1260, cssHeight: 470, imageWidth: 1800, imageHeight: 1200, view: { x: 250, y: 140, width: 900, height: 600 } },
  ];

  for (const candidate of cases) {
    const layout = calculateBirdsEyeRenderedImageLayout(candidate);
    assert.ok(layout);
    const screen = requiredScreen(birdsEyeNormalizedToScreen(normalized, candidate));
    assert.notDeepEqual(screen, { x: 0, y: 0 });
    assertNear(screen.x, layout.renderedImageRect.x + normalized.x * candidate.imageWidth * layout.scale);
    assertNear(screen.y, layout.renderedImageRect.y + normalized.y * candidate.imageHeight * layout.scale);
    assert.ok(birdsEyeImageRoundTripError(normalized, candidate) < 1);
  }
});

test("markers are withheld until pane layout is valid instead of stacking at the origin", () => {
  const unavailable = { ...viewport, cssWidth: 0, cssHeight: 0 };
  assert.equal(calculateBirdsEyeRenderedImageLayout(unavailable), null);
  assert.equal(birdsEyeNormalizedToScreen({ x: 0.5, y: 0.5 }, unavailable), null);
  assert.equal(birdsEyeImageRoundTripError({ x: 0.5, y: 0.5 }, unavailable), Number.POSITIVE_INFINITY);
});

test("historical calibration markers retain their CSS-space diameter and selected ring", () => {
  assert.equal(BIRDS_EYE_MARKER_DIAMETER_CSS_PX, 22);
  assert.equal(BIRDS_EYE_MARKER_SELECTED_RING_CSS_PX, 28);
});
