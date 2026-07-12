import assert from "node:assert/strict";
import test from "node:test";

import {
  boundsFromCorners,
  calculateAffineTransform,
  clampOverlayOpacity,
  cornersFromBounds,
  createDefaultGeoCorners,
  deleteControlPoint,
  deriveGeoreferenceStatus,
  getCompleteControlPoints,
  getGeoCornerLabel,
  hasMinimumControlPoints,
  isOperationalMapCenter,
  isValidLatitude,
  isValidLongitude,
  normalizeControlPoint,
  normalizeGeoBounds,
  normalizeGeoreferenceStatus,
  normalizeGeoreferenceTargetType,
  type GeoCorners,
  type HistoricalMapControlPoint,
} from "./historical-map-georeference.ts";

function point(overrides: Partial<HistoricalMapControlPoint> & { controlPointId: string }): HistoricalMapControlPoint {
  return normalizeControlPoint({
    label: "Point",
    imageX: 0,
    imageY: 0,
    latitude: 0,
    longitude: 0,
    confidence: "draft",
    notes: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  });
}

test("validates latitude and longitude ranges", () => {
  assert.equal(isValidLatitude(90), true);
  assert.equal(isValidLatitude(-90), true);
  assert.equal(isValidLatitude(90.01), false);
  assert.equal(isValidLatitude(Number.NaN), false);
  assert.equal(isValidLongitude(180), true);
  assert.equal(isValidLongitude(-180), true);
  assert.equal(isValidLongitude(180.01), false);
  assert.equal(isOperationalMapCenter({ latitude: 0, longitude: 0 }), false);
  assert.equal(isOperationalMapCenter({ latitude: 0, longitude: 0 }, true), true);
});

test("uses standard geographic corner labels", () => {
  assert.equal(getGeoCornerLabel("northwest"), "NW");
  assert.equal(getGeoCornerLabel("northeast"), "NE");
  assert.equal(getGeoCornerLabel("southeast"), "SE");
  assert.equal(getGeoCornerLabel("southwest"), "SW");
});

test("normalizes geographic bounds regardless of input order", () => {
  assert.deepEqual(
    normalizeGeoBounds({
      northLatitude: 10,
      southLatitude: 20,
      eastLongitude: -95,
      westLongitude: -94,
    }),
    {
      northLatitude: 20,
      southLatitude: 10,
      eastLongitude: -94,
      westLongitude: -95,
    },
  );
  assert.equal(normalizeGeoBounds({ northLatitude: 10, southLatitude: 10, eastLongitude: -94, westLongitude: -95 }), null);
  assert.equal(normalizeGeoBounds({ northLatitude: 91, southLatitude: 10, eastLongitude: -94, westLongitude: -95 }), null);
});

test("derives bounds and corners for rectangular overlay restoration", () => {
  const bounds = normalizeGeoBounds({
    northLatitude: 33.43,
    southLatitude: 33.42,
    eastLongitude: -94.04,
    westLongitude: -94.05,
  });

  assert.ok(bounds);
  assert.deepEqual(cornersFromBounds(bounds).northwest, { latitude: 33.43, longitude: -94.05 });
  assert.deepEqual(boundsFromCorners(cornersFromBounds(bounds)), bounds);
});

test("normalizes control-point pairing and invalid values", () => {
  const complete = point({ controlPointId: "cp-1", imageX: 10, imageY: 20, latitude: 33.1, longitude: -94.1 });
  const invalid = point({ controlPointId: "cp-2", imageX: Number.NaN, imageY: 20, latitude: 99, longitude: -181 });

  assert.deepEqual(getCompleteControlPoints([complete, invalid]), [
    {
      imageX: 10,
      imageY: 20,
      latitude: 33.1,
      longitude: -94.1,
    },
  ]);
});

test("requires at least three complete control-point pairs", () => {
  const points = [
    point({ controlPointId: "cp-1", imageX: 0, imageY: 0, latitude: 33, longitude: -94 }),
    point({ controlPointId: "cp-2", imageX: 100, imageY: 0, latitude: 33, longitude: -93.99 }),
  ];

  assert.equal(hasMinimumControlPoints(points), false);
  assert.equal(calculateAffineTransform(getCompleteControlPoints(points)).ok, false);
});

test("calculates affine transformation from sufficient point pairs", () => {
  const pairs = [
    { imageX: 0, imageY: 0, latitude: 33, longitude: -94 },
    { imageX: 100, imageY: 0, latitude: 33, longitude: -93.99 },
    { imageX: 0, imageY: 100, latitude: 32.99, longitude: -94 },
    { imageX: 100, imageY: 100, latitude: 32.99, longitude: -93.99 },
  ];
  const result = calculateAffineTransform(pairs);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.controlPointCount, 4);
    assert.ok(result.residualError < 1e-9);
    assert.ok(Math.abs(result.matrix.latitude[1] + 0.0001) < 1e-9);
    assert.ok(Math.abs(result.matrix.longitude[0] - 0.0001) < 1e-9);
  }
});

test("handles affine transform failure for collinear image points", () => {
  const result = calculateAffineTransform([
    { imageX: 0, imageY: 0, latitude: 33, longitude: -94 },
    { imageX: 10, imageY: 10, latitude: 33.1, longitude: -93.9 },
    { imageX: 20, imageY: 20, latitude: 33.2, longitude: -93.8 },
  ]);

  assert.equal(result.ok, false);
});

test("derives georeference status from corners and control points", () => {
  const emptyCorners: GeoCorners = { northwest: null, northeast: null, southeast: null, southwest: null };
  const defaultCorners = createDefaultGeoCorners({ latitude: 33.4251, longitude: -94.0477 });
  const draftPoints = [point({ controlPointId: "cp-1" })];
  const alignedPoints = [
    point({ controlPointId: "cp-1", imageX: 0, imageY: 0, latitude: 33, longitude: -94 }),
    point({ controlPointId: "cp-2", imageX: 100, imageY: 0, latitude: 33, longitude: -93.99 }),
    point({ controlPointId: "cp-3", imageX: 0, imageY: 100, latitude: 32.99, longitude: -94 }),
  ];

  assert.equal(deriveGeoreferenceStatus({ corners: emptyCorners, controlPoints: [] }), "not_started");
  assert.equal(deriveGeoreferenceStatus({ corners: defaultCorners, controlPoints: [] }), "bounding_box");
  assert.equal(deriveGeoreferenceStatus({ corners: emptyCorners, controlPoints: draftPoints }), "control_points_draft");
  assert.equal(deriveGeoreferenceStatus({ corners: emptyCorners, controlPoints: alignedPoints }), "aligned_draft");
  assert.equal(deriveGeoreferenceStatus({ corners: emptyCorners, controlPoints: [], reviewed: true }), "reviewed");
});

test("normalizes status, target type, overlay opacity, and saved restoration state", () => {
  assert.equal(normalizeGeoreferenceStatus("reviewed"), "reviewed");
  assert.equal(normalizeGeoreferenceStatus("approved"), "not_started");
  assert.equal(normalizeGeoreferenceTargetType("workspace"), "workspace");
  assert.equal(normalizeGeoreferenceTargetType("building"), "sheet");
  assert.equal(clampOverlayOpacity(-5), 0);
  assert.equal(clampOverlayOpacity(2), 1);
  assert.equal(clampOverlayOpacity(undefined), 0.65);
});

test("deletes control points by ID without mutating others", () => {
  const points = [point({ controlPointId: "cp-1" }), point({ controlPointId: "cp-2" })];

  assert.deepEqual(deleteControlPoint(points, "cp-1").map((item) => item.controlPointId), ["cp-2"]);
});
