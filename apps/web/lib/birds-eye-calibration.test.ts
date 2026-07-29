import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBirdsEyeAffine,
  birdsEyeCalibrationQuality,
  completeBirdsEyeControlPointCount,
  createBirdsEyeFlatProjection,
  createBirdsEyeGlobalTransform,
  projectBirdsEyeGeographicFlat,
  projectBirdsEyeThroughSolve,
  solveBirdsEyeLocalWarp,
  solveBirdsEyeStagedCalibration,
  warpBirdsEyeForward,
  warpBirdsEyeInverse,
  type BirdsEyeAffineMatrix,
  type BirdsEyeControlPoint,
} from "./birds-eye-calibration.ts";

const point = (sequence: number, complete = true): BirdsEyeControlPoint => ({
  id: String(sequence),
  sequence,
  label: `Point ${sequence}`,
  note: "",
  anchorType: "intersection",
  linkedMapPieceId: null,
  longitude: complete ? -94 + sequence * 0.001 : null,
  latitude: complete ? 33 + sequence * 0.001 : null,
  imageX: complete ? sequence * 20 : null,
  imageY: complete ? sequence * 10 : null,
  enabled: true,
  deletedAt: null,
});

const geographicCoordinates = [
  { longitude: -94.010, latitude: 33.010 },
  { longitude: -93.990, latitude: 33.010 },
  { longitude: -93.990, latitude: 32.990 },
  { longitude: -94.010, latitude: 32.990 },
  { longitude: -94.000, latitude: 33.000 },
  { longitude: -93.995, latitude: 33.004 },
  { longitude: -94.006, latitude: 32.997 },
  { longitude: -93.997, latitude: 32.994 },
];

const flatProjection = createBirdsEyeFlatProjection({
  coordinates: geographicCoordinates,
  centerLatitude: 33,
  centerLongitude: -94,
  width: 1200,
  height: 800,
});

const targetMatrix: BirdsEyeAffineMatrix = {
  a: 0.82,
  b: 0.14,
  c: -0.11,
  d: 0.76,
  e: 135,
  f: 74,
};

function stagedPoints(count = geographicCoordinates.length): BirdsEyeControlPoint[] {
  return geographicCoordinates.slice(0, count).map((coordinate, index) => {
    const target = applyBirdsEyeAffine(
      projectBirdsEyeGeographicFlat(coordinate.longitude, coordinate.latitude, flatProjection),
      targetMatrix,
    );
    return {
      ...point(index + 1),
      longitude: coordinate.longitude,
      latitude: coordinate.latitude,
      imageX: target.x,
      imageY: target.y,
    };
  });
}

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

test("zero control points preserves a flat geographic preview", () => {
  const solve = solveBirdsEyeStagedCalibration({ points: [], flatProjection });
  const coordinate = geographicCoordinates[0];
  assert.equal(solve.stage, "flat");
  assert.equal(solve.completePointCount, 0);
  assert.equal(solve.statusLabel, "Flat geographic preview");
  assert.deepEqual(
    projectBirdsEyeThroughSolve(coordinate.longitude, coordinate.latitude, solve),
    projectBirdsEyeGeographicFlat(coordinate.longitude, coordinate.latitude, flatProjection),
  );
});

test("one point creates translation only and cannot catastrophically deform distances", () => {
  const solve = solveBirdsEyeStagedCalibration({ points: stagedPoints(1), flatProjection });
  assert.equal(solve.stage, "translation");
  assert.deepEqual(
    { a: solve.globalMatrix.a, b: solve.globalMatrix.b, c: solve.globalMatrix.c, d: solve.globalMatrix.d },
    { a: 1, b: 0, c: 0, d: 1 },
  );
  const sourceA = projectBirdsEyeGeographicFlat(geographicCoordinates[2].longitude, geographicCoordinates[2].latitude, flatProjection);
  const sourceB = projectBirdsEyeGeographicFlat(geographicCoordinates[3].longitude, geographicCoordinates[3].latitude, flatProjection);
  const targetA = projectBirdsEyeThroughSolve(geographicCoordinates[2].longitude, geographicCoordinates[2].latitude, solve);
  const targetB = projectBirdsEyeThroughSolve(geographicCoordinates[3].longitude, geographicCoordinates[3].latitude, solve);
  assert.ok(Math.abs(Math.hypot(sourceA.x - sourceB.x, sourceA.y - sourceB.y) - Math.hypot(targetA.x - targetB.x, targetA.y - targetB.y)) < 1e-7);
});

test("two points estimate rotation and uniform scale", () => {
  const points = stagedPoints(2);
  const solve = solveBirdsEyeStagedCalibration({ points, flatProjection });
  assert.equal(solve.stage, "similarity");
  for (const candidate of points) {
    const projected = projectBirdsEyeThroughSolve(candidate.longitude!, candidate.latitude!, solve);
    assert.ok(Math.abs(projected.x - candidate.imageX!) < 1e-6);
    assert.ok(Math.abs(projected.y - candidate.imageY!) < 1e-6);
  }
  assert.ok(Math.abs(solve.globalMatrix.a - solve.globalMatrix.d) < 1e-9);
  assert.ok(Math.abs(solve.globalMatrix.b + solve.globalMatrix.c) < 1e-9);
});

test("three non-collinear points provide a coarse affine transform", () => {
  const points = stagedPoints(3);
  const solve = solveBirdsEyeStagedCalibration({ points, flatProjection });
  assert.equal(solve.stage, "coarse");
  assert.equal(solve.nearCollinear, false);
  assert.ok((solve.maximumResidualPixels ?? Infinity) < 1e-6);
});

test("four points mark the broad calibration valid", () => {
  const solve = solveBirdsEyeStagedCalibration({ points: stagedPoints(4), flatProjection });
  assert.equal(solve.stage, "rough");
  assert.equal(solve.valid, true);
  assert.match(solve.statusLabel, /Rough alignment/);
});

test("six points activate the deterministic local piecewise warp", () => {
  const points = stagedPoints(6).map((candidate, index) => index === 4
    ? { ...candidate, imageX: candidate.imageX! + 12, imageY: candidate.imageY! - 8 }
    : candidate);
  const solve = solveBirdsEyeStagedCalibration({ points, flatProjection });
  assert.equal(solve.stage, "local");
  assert.equal(solve.localWarp.solvedPointCount, 6);
  assert.ok(solve.localWarp.triangles.length > 0);
  const control = points[4];
  const warped = projectBirdsEyeThroughSolve(control.longitude!, control.latitude!, solve);
  assert.ok(Math.abs(warped.x - control.imageX!) < 1e-6);
  assert.ok(Math.abs(warped.y - control.imageY!) < 1e-6);
});

test("disabled and incomplete points are excluded from staged solving", () => {
  const points = stagedPoints(6);
  points[4] = { ...points[4], enabled: false };
  points[5] = { ...points[5], imageY: null };
  const solve = solveBirdsEyeStagedCalibration({ points, flatProjection });
  assert.equal(solve.completePointCount, 4);
  assert.equal(solve.stage, "rough");
});

test("duplicate and too-close pairs are warned and invalidate calibration", () => {
  const points = stagedPoints(4);
  points[1] = {
    ...points[1],
    longitude: points[0].longitude,
    latitude: points[0].latitude,
    imageX: points[0].imageX,
    imageY: points[0].imageY,
  };
  const solve = solveBirdsEyeStagedCalibration({ points, flatProjection });
  assert.deepEqual(solve.duplicatePointSequences, [1, 2]);
  assert.equal(solve.valid, false);
  assert.ok(solve.warnings.some((warning) => /duplicates|too close/i.test(warning)));
});

test("near-collinear landmarks are detected and explained", () => {
  const points = [0, 1, 2, 3].map((index): BirdsEyeControlPoint => ({
    ...point(index + 1),
    longitude: -94.01 + index * 0.006,
    latitude: 33,
    imageX: 100 + index * 180,
    imageY: 300,
  }));
  const projection = createBirdsEyeFlatProjection({
    coordinates: points.map((candidate) => ({ longitude: candidate.longitude!, latitude: candidate.latitude! })),
    centerLatitude: 33,
    centerLongitude: -94,
    width: 1000,
    height: 700,
  });
  const solve = solveBirdsEyeStagedCalibration({ points, flatProjection: projection });
  assert.equal(solve.nearCollinear, true);
  assert.equal(solve.valid, false);
  assert.ok(solve.warnings.some((warning) => /collinear/i.test(warning)));
});

test("staged solve is deterministic and accepts legacy PR #101 point objects", () => {
  const legacyPoints = stagedPoints(6).map(({ sourceMapZoom: _zoom, sourceMapBearing: _bearing, sourceMapLabel: _label, historicalImageNote: _imageNote, geographicNote: _geoNote, ...legacy }) => legacy);
  const first = solveBirdsEyeStagedCalibration({ points: legacyPoints, flatProjection });
  const second = solveBirdsEyeStagedCalibration({ points: structuredClone(legacyPoints), flatProjection });
  assert.deepEqual(first, second);
  assert.deepEqual(legacyPoints.map((candidate) => candidate.id), ["1", "2", "3", "4", "5", "6"]);
});

test("legacy local calibration preserves inverse hit testing", () => {
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
