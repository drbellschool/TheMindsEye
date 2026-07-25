import assert from "node:assert/strict";
import test from "node:test";

import { buildSanbornSourceContextViewport, clampSanbornSourceContextViewport, normalizedPointToSourceContextPoint, panSanbornSourceContextViewport } from "./sanborn-source-context.ts";

test("source context adds padding around polygon and line geometry", () => {
  const polygon = buildSanbornSourceContextViewport({
    sourcePolygon: [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.5 }],
    imageWidth: 1000,
    imageHeight: 800,
  });
  const line = buildSanbornSourceContextViewport({
    sourceGeometry: { geometryType: "line", points: [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.3 }] },
    imageWidth: 1000,
    imageHeight: 800,
  });
  assert.ok(polygon.width > 100);
  assert.ok(line.width > 500);
  assert.ok(polygon.x >= 0 && polygon.y >= 0);
  assert.ok(polygon.x + polygon.width <= 1000);
  assert.ok(polygon.y + polygon.height <= 800);
});

test("point and junction context use a minimum neighborhood span", () => {
  const point = buildSanbornSourceContextViewport({
    sourceGeometry: { geometryType: "point", points: [{ x: 0.1, y: 0.9 }] },
    imageWidth: 1200,
    imageHeight: 900,
    minimumSpan: 0.2,
  });
  const junction = buildSanbornSourceContextViewport({
    sourceGeometry: { geometryType: "junction", points: [{ x: 0.5, y: 0.5 }] },
    imageWidth: 1200,
    imageHeight: 900,
  });
  assert.ok(point.width >= 1200 * 0.2);
  assert.ok(point.height >= 900 * 0.2);
  assert.ok(junction.x >= 0 && junction.y >= 0);
  assert.ok(junction.x + junction.width <= 1200);
  assert.ok(junction.y + junction.height <= 900);
});

test("context viewBox preserves the requested aspect ratio and overlay alignment", () => {
  const viewport = buildSanbornSourceContextViewport({
    sourceBBox: { minX: 0.92, minY: 0.1, maxX: 0.98, maxY: 0.2 },
    imageWidth: 1600,
    imageHeight: 1000,
    previewAspectRatio: 1.4,
  });
  const point = normalizedPointToSourceContextPoint({ x: 0.95, y: 0.15 }, viewport, 1600, 1000);
  assert.ok(Math.abs(viewport.aspectRatio - 1.4) < 0.02);
  assert.ok(point.x > 0 && point.x < 1);
  assert.ok(point.y > 0 && point.y < 1);
});

test("source context panning moves the crop and keeps the viewport clamped", () => {
  const viewport = buildSanbornSourceContextViewport({
    sourcePolygon: [{ x: 0.45, y: 0.45 }, { x: 0.55, y: 0.55 }],
    imageWidth: 1000,
    imageHeight: 1000,
    previewAspectRatio: 1,
  });
  const moved = panSanbornSourceContextViewport(viewport, 100, -80, 1000, 1000);
  assert.equal(moved.x, viewport.x - 100);
  assert.equal(moved.y, viewport.y + 80);
  const edge = panSanbornSourceContextViewport(moved, 10000, -10000, 1000, 1000);
  assert.equal(edge.x, 0);
  assert.equal(edge.y, 1000 - edge.height);
  assert.deepEqual(clampSanbornSourceContextViewport(edge, 1000, 1000), edge);
});
