import assert from "node:assert/strict";
import test from "node:test";
import { birdsEyeCalibrationQuality, completeBirdsEyeControlPointCount, createBirdsEyeGlobalTransform, solveBirdsEyeLocalWarp, warpBirdsEyeForward, warpBirdsEyeInverse } from "./birds-eye-calibration.ts";

const point = (sequence: number, complete = true) => ({ id: String(sequence), sequence, label: `Point ${sequence}`, note: "", anchorType: "intersection" as const, linkedMapPieceId: null, longitude: complete ? -94 + sequence * 0.001 : null, latitude: complete ? 33 + sequence * 0.001 : null, imageX: complete ? sequence * 20 : null, imageY: complete ? sequence * 10 : null, enabled: true, deletedAt: null });

test("Birds-Eye global transform round trips geographic coordinates", () => {
  const transform = createBirdsEyeGlobalTransform({ centerLatitude: 33.4, centerLongitude: -94, bearing: 315, pitch: 58, perspectiveStrength: 0.3, scaleX: 1.2, scaleY: 0.9 });
  const source = { longitude: -93.99, latitude: 33.41 };
  const result = transform.inverse(transform.forward(source.longitude, source.latitude));
  assert.ok(result);
  assert.ok(Math.abs(result.longitude - source.longitude) < 1e-7);
  assert.ok(Math.abs(result.latitude - source.latitude) < 1e-7);
});

test("control-point quality separates complete, disabled, and incomplete pairs", () => {
  const points = [point(1), point(2), point(3, false), { ...point(4), enabled: false }];
  assert.equal(completeBirdsEyeControlPointCount(points), 2);
  const quality = birdsEyeCalibrationQuality(points);
  assert.equal(quality.totalPoints, 4);
  assert.equal(quality.disabledPoints, 1);
  assert.equal(quality.incompletePoints, 1);
  assert.equal(quality.valid, false);
});

test("local calibration uses a piecewise affine mesh and preserves inverse hit testing", () => {
  const transform = createBirdsEyeGlobalTransform({ centerLatitude: 0, centerLongitude: 0, scaleX: 100000, scaleY: 100000, perspectiveStrength: 0 });
  const points = [
    { ...point(1), longitude: -0.01, latitude: -0.01, imageX: 100, imageY: 500 },
    { ...point(2), longitude: 0.01, latitude: -0.01, imageX: 900, imageY: 520 },
    { ...point(3), longitude: 0.01, latitude: 0.01, imageX: 880, imageY: 100 },
    { ...point(4), longitude: -0.01, latitude: 0.01, imageX: 120, imageY: 80 },
    { ...point(5), longitude: 0, latitude: 0, imageX: 500, imageY: 300 },
    { ...point(6), longitude: 0.005, latitude: 0, imageX: 700, imageY: 310 },
  ];
  const model = solveBirdsEyeLocalWarp(points, transform);
  assert.equal(model.type, "delaunay_piecewise_affine");
  assert.equal(model.solvedPointCount, 6);
  const warped = warpBirdsEyeForward(transform.forward(0, 0), model);
  const inverse = warpBirdsEyeInverse(warped, model);
  assert.ok(Math.abs(inverse.x - transform.forward(0, 0).x) < 1e-6);
  assert.ok(Math.abs(inverse.y - transform.forward(0, 0).y) < 1e-6);
});
