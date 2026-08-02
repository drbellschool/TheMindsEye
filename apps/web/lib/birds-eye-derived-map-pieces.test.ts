import assert from "node:assert/strict";
import test from "node:test";
import { buildBirdsEyeDerivedProvenance, calculateBirdsEyeDerivedVisualAgreement, defaultBirdsEyeDerivedPlacement, derivedPieceSourceShapeUnchanged, mapBirdsEyeDerivedMapPieceRow } from "./birds-eye-derived-map-pieces.ts";

test("region types receive conservative approximate placement defaults", () => {
  assert.deepEqual(defaultBirdsEyeDerivedPlacement("block"), { placementType: "city_block", placementPrecision: "broad_area" });
  assert.deepEqual(defaultBirdsEyeDerivedPlacement("building"), { placementType: "building", placementPrecision: "approximate" });
  assert.deepEqual(defaultBirdsEyeDerivedPlacement("waterway"), { placementType: "waterway", placementPrecision: "approximate" });
});

test("derived row preserves source geometry and never requires geographic geometry at creation", () => {
  const source = { geometryType: "polygon", coordinateSpace: "normalized_image", coordinates: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.3, y: 0.5 }] } as const;
  const piece = mapBirdsEyeDerivedMapPieceRow({ id: "1", derived_piece_id: "derived-1", town_package_id: "town", atlas_id: "atlas", source_region_id: "region", reference_asset_id: "asset", source_filename: "old.jpg", label: "Beautiful House", region_type: "block", placement_type: "city_block", placement_precision: "broad_area", source_image_geometry: source, geographic_geometry: null, creation_status: "ready_for_placement" });
  assert.ok(piece);
  assert.equal(piece?.sourceClassification, "birds_eye_derived");
  assert.equal(piece?.geographicGeometry, null);
  assert.deepEqual(piece?.sourceImageGeometry, source);
});

test("provenance explicitly distinguishes illustration evidence from geographic placement", () => {
  const note = buildBirdsEyeDerivedProvenance({ label: "Beautiful House", regionType: "block", referenceAssetId: "asset-1", imageGeometry: { geometryType: "polygon", coordinateSpace: "normalized_image", coordinates: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] }, description: "Between Pine and Olive", reconstructionNotes: "" }, "Old_map.jpg");
  assert.match(note, /approximate placement/i);
  assert.match(note, /asset-1/);
});

test("Step 6 placement cannot rewrite the original source-region shape", () => {
  const source = { geometryType: "polygon", coordinateSpace: "normalized_image", coordinates: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 }, { x: 0.3, y: 0.5 }] } as const;
  assert.equal(derivedPieceSourceShapeUnchanged(source, structuredClone(source)), true);
  assert.equal(derivedPieceSourceShapeUnchanged(source, { ...source, coordinates: [{ x: 0.2, y: 0.1 }, ...source.coordinates.slice(1)] }), false);
});

test("round-trip comparison is visual guidance rather than survey accuracy", () => {
  const source = { geometryType: "polygon", coordinateSpace: "normalized_image", coordinates: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.4 }, { x: 0.2, y: 0.4 }] } as const;
  const projected = { ...source, coordinates: source.coordinates.map((point) => ({ x: point.x + 0.01, y: point.y + 0.01 })) };
  assert.equal(calculateBirdsEyeDerivedVisualAgreement(source, projected).label, "Strong visual agreement");
});
