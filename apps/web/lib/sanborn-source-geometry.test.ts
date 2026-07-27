import test from "node:test";
import assert from "node:assert/strict";
import { calculateSourceQuadrilateralMeasurements, getSquareCornersEligibility, isSourceQuadrilateralAlreadySquare, normalizedSourcePointsToPixels, squareSanbornQuadrilateral } from "./sanborn-source-geometry.ts";

const rectangle = [{ x: .2, y: .3 }, { x: .8, y: .3 }, { x: .8, y: .7 }, { x: .2, y: .7 }];

test("source measurements use image pixel dimensions, not normalized aspect", () => {
  const pixels = normalizedSourcePointsToPixels(rectangle, 2000, 1000);
  assert.deepEqual(pixels[0], { x: 400, y: 300 });
  assert.equal(calculateSourceQuadrilateralMeasurements(rectangle, 2000, 1000)?.maximumCornerDeviation, 0);
});

test("square corners preserves orientation, center, and rectangular proportions", () => {
  const skewed = [{ x: .2, y: .2 }, { x: .82, y: .28 }, { x: .75, y: .68 }, { x: .15, y: .6 }];
  const result = squareSanbornQuadrilateral(skewed, 2000, 1000);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const measurements = calculateSourceQuadrilateralMeasurements(result.points, 2000, 1000);
  assert.ok(measurements?.valid);
  assert.ok((measurements?.maximumCornerDeviation ?? 99) < 0.001);
  assert.ok((measurements?.oppositeEdgeDrift.topBottom ?? 99) < 0.001);
  const beforeWidth = Math.hypot((skewed[1].x - skewed[0].x) * 2000, (skewed[1].y - skewed[0].y) * 1000);
  const afterWidth = Math.hypot((result.points[1].x - result.points[0].x) * 2000, (result.points[1].y - result.points[0].y) * 1000);
  assert.ok(afterWidth / beforeWidth > .8 && afterWidth / beforeWidth < 1.2);
});

test("square corners fits a boundary-crossing rectangle without clamping individual vertices", () => {
  const result = squareSanbornQuadrilateral([{ x: -.1, y: .2 }, { x: .9, y: .1 }, { x: 1.1, y: .8 }, { x: .1, y: .9 }], 1000, 1000);
  assert.equal(result.ok, false);
  const validEdge = squareSanbornQuadrilateral([{ x: .02, y: .2 }, { x: .98, y: .1 }, { x: .92, y: .8 }, { x: .08, y: .9 }], 1000, 1000);
  assert.equal(validEdge.ok, true);
  if (validEdge.ok) assert.ok(validEdge.points.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
});

test("already square tolerance and ineligible polygons are explicit", () => {
  assert.equal(isSourceQuadrilateralAlreadySquare(rectangle, 1000, 1000), true);
  assert.equal(squareSanbornQuadrilateral(rectangle.slice(0, 3), 1000, 1000).ok, false);
});

test("square corners eligibility canonicalizes a different starting corner and winding", () => {
  const reversed = [rectangle[2], rectangle[1], rectangle[0], rectangle[3]];
  const result = getSquareCornersEligibility({ geometryType: "polygon", points: reversed, width: 2000, height: 1000 });
  assert.equal(result.alreadySquare, true);
  assert.equal(result.disabledReason, "This piece is already squared.");
  assert.equal(result.normalizedPoints.length, 4);
});

test("square corners eligibility falls back to legacy sourcePolygon", () => {
  const result = getSquareCornersEligibility({ geometryType: "polygon", sourcePolygon: rectangle, width: 2000, height: 1000 });
  assert.equal(result.alreadySquare, true);
  assert.equal(result.disabledReason, "This piece is already squared.");
  const staleGeometry = getSquareCornersEligibility({ geometryType: "polygon", points: [], sourcePolygon: rectangle, width: 2000, height: 1000 });
  assert.equal(staleGeometry.alreadySquare, true);
});

test("square corners eligibility explains delayed dimensions and duplicate points", () => {
  assert.equal(getSquareCornersEligibility({ geometryType: "polygon", points: rectangle }).disabledReason, "Source image dimensions are still loading.");
  assert.equal(getSquareCornersEligibility({ geometryType: "polygon", points: [rectangle[0], rectangle[0], rectangle[2], rectangle[3]], width: 2000, height: 1000 }).disabledReason, "Polygon contains duplicate points.");
});
