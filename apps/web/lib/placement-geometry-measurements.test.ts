import assert from "node:assert/strict";
import test from "node:test";

import { calculatePlacementGeometryMeasurements, compareParallelBearings } from "./placement-geometry-measurements.ts";

test("measures a right-angle quadrilateral and rotated rectangle", () => {
  const rectangle = calculatePlacementGeometryMeasurements([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]);
  assert.equal(rectangle.valid, true);
  assert.ok(rectangle.corners.every((corner) => Math.abs(corner.angle - 90) < 0.01));
  assert.ok(rectangle.oppositeEdgeDrift.topBottom < 0.01);
  assert.ok(rectangle.oppositeEdgeDrift.leftRight < 0.01);

  const rotated = calculatePlacementGeometryMeasurements([{ x: 10, y: 20 }, { x: 96.6, y: 70 }, { x: 71.6, y: 113.3 }, { x: -15, y: 63.3 }]);
  assert.ok(rotated.corners.every((corner) => Math.abs(corner.angle - 90) < 0.1));
});

test("measures skew and normalizes opposite edge bearings", () => {
  const skew = calculatePlacementGeometryMeasurements([{ x: 0, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 60 }, { x: 0, y: 50 }]);
  assert.equal(skew.valid, true);
  assert.ok(skew.maximumCornerDeviation > 0);
  assert.ok(skew.oppositeEdgeDrift.topBottom > 0);
  assert.equal(compareParallelBearings(359, 1), 2);
  assert.equal(compareParallelBearings(90, 270), 0);
});

test("rejects folded geometry", () => {
  const invalid = calculatePlacementGeometryMeasurements([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }]);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.message, "Invalid corner order");
});
