import assert from "node:assert/strict";
import test from "node:test";

import {
  createBirdsEyeFlatProjection,
  projectBirdsEyeGeographicFlat,
  projectBirdsEyeThroughSolve,
  solveBirdsEyeStagedCalibration,
  type BirdsEyeControlPoint,
} from "./birds-eye-calibration.ts";
import {
  buildBirdsEyeEvidencePackage,
  checksumBirdsEyeGeographicGeometry,
  createProjectedBirdsEyePresentation,
  denormalizeBirdsEyeImagePoint,
  deriveBirdsEyeCropBounds,
  isBirdsEyePresentationStale,
  mapBirdsEyePiecePresentationRow,
  mapBirdsEyeSceneRegionRow,
  normalizeBirdsEyeImagePoint,
  projectBirdsEyePlacedGeometry,
  replaceBirdsEyeGeometryVertex,
  resetBirdsEyePresentationAdjustment,
  rotateBirdsEyeGeometry,
  scaleBirdsEyeGeometry,
  translateBirdsEyeGeometry,
  validateBirdsEyeImageGeometry,
  type BirdsEyeImageGeometry,
  type BirdsEyePlacedGeometry,
  type BirdsEyeSceneRegion,
} from "./birds-eye-scene.ts";

const polygon: BirdsEyeImageGeometry = {
  geometryType: "polygon",
  coordinates: [
    { x: 0.15, y: 0.20 },
    { x: 0.40, y: 0.18 },
    { x: 0.44, y: 0.48 },
    { x: 0.17, y: 0.52 },
  ],
  coordinateSpace: "normalized_image",
};

const placedPiece = (): BirdsEyePlacedGeometry => ({
  id: "piece-1888-12",
  label: "Block 12",
  geometry: null,
  corners: {
    northwest: { latitude: 33.010, longitude: -94.010 },
    northeast: { latitude: 33.010, longitude: -94.000 },
    southeast: { latitude: 33.000, longitude: -94.000 },
    southwest: { latitude: 33.000, longitude: -94.010 },
  },
  placementStatus: "placed",
  reviewStatus: "source_based_inference",
});

function sceneRegion(): BirdsEyeSceneRegion {
  return {
    id: "c5f42b2e-acde-4cf4-9f86-c948b7a332ad",
    regionId: "birds-eye-region-building-group-1",
    townPackageId: "town-texarkana",
    atlasId: "atlas-texarkana-1888",
    referenceAssetId: "birds-eye-texarkana-1888",
    regionType: "building_group",
    label: "Rail depot building group",
    description: "Three roof forms beside the rail line.",
    imageGeometry: polygon,
    linkedMapPieceId: "piece-1888-12",
    linkedSourceRecordId: "3f89d92c-ac7a-4d55-a6f2-cb8776d4bef0",
    linkedBuildingId: "building-depot-1",
    evidenceClassification: "source_based_inference",
    reviewStatus: "unknown",
    confidence: 0.72,
    visibleFeatures: { roofCount: 3, summary: "Three pitched roofs and a platform." },
    reconstructionNotes: "Treat roof count as provisional.",
    renderingNotes: "Keep nearby rail context.",
    cropBounds: deriveBirdsEyeCropBounds(polygon),
    isVisible: true,
    isLocked: false,
    sortOrder: 1,
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
    archivedAt: null,
    isPersisted: true,
  };
}

test("scene polygons persist normalized image coordinates and reject unsafe geometry", () => {
  assert.deepEqual(validateBirdsEyeImageGeometry(polygon), { ok: true, geometry: polygon });
  assert.equal(validateBirdsEyeImageGeometry({
    ...polygon,
    coordinates: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 }],
  }).ok, false);
  assert.equal(validateBirdsEyeImageGeometry({ ...polygon, coordinates: [{ x: 0.1, y: 0.1 }, { x: 1.2, y: 0.2 }, { x: 0.3, y: 0.3 }] }).ok, false);
  assert.equal(validateBirdsEyeImageGeometry({ ...polygon, coordinates: [{ x: "0.1", y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.1 }] }).ok, false);
});

test("historical clicks round trip through original dimensions without screen pixels becoming authoritative", () => {
  const normalized = normalizeBirdsEyeImagePoint(640, 360, 2560, 1440);
  assert.deepEqual(normalized, { x: 0.25, y: 0.25 });
  assert.deepEqual(denormalizeBirdsEyeImagePoint(normalized, 2560, 1440), { x: 640, y: 360 });
  assert.throws(() => normalizeBirdsEyeImagePoint(10, 10, 0, 100), /dimensions/);
});

test("vertex editing remains normalized and crop bounds derive from the designated source geometry", () => {
  const edited = replaceBirdsEyeGeometryVertex(polygon, 0, { x: 0.10, y: 0.15 });
  assert.deepEqual(edited.coordinates[0], { x: 0.10, y: 0.15 });
  assert.deepEqual(polygon.coordinates[0], { x: 0.15, y: 0.20 });
  const crop = deriveBirdsEyeCropBounds(edited, 0);
  assert.ok(crop);
  assert.equal(crop.coordinateSpace, "normalized_image");
  assert.equal(crop.x, 0.10);
  assert.equal(crop.y, 0.15);
  assert.ok(Math.abs(crop.width - 0.34) < 1e-12);
  assert.ok(Math.abs(crop.height - 0.37) < 1e-12);
});

test("scene-region row hydration preserves edition, reference, links, review state, and archive state", () => {
  const source = sceneRegion();
  const mapped = mapBirdsEyeSceneRegionRow({
    id: source.id,
    region_id: source.regionId,
    town_package_id: source.townPackageId,
    atlas_id: source.atlasId,
    reference_asset_id: source.referenceAssetId,
    region_type: source.regionType,
    label: source.label,
    description: source.description,
    image_geometry: source.imageGeometry,
    linked_map_piece_id: source.linkedMapPieceId,
    linked_source_record_id: source.linkedSourceRecordId,
    linked_building_id: source.linkedBuildingId,
    evidence_classification: source.evidenceClassification,
    review_status: source.reviewStatus,
    confidence: source.confidence,
    visible_features: source.visibleFeatures,
    reconstruction_notes: source.reconstructionNotes,
    rendering_notes: source.renderingNotes,
    crop_bounds: source.cropBounds,
    is_visible: source.isVisible,
    is_locked: source.isLocked,
    sort_order: source.sortOrder,
    created_at: source.createdAt,
    updated_at: source.updatedAt,
    archived_at: "2026-07-29T00:00:00Z",
  });
  assert.ok(mapped);
  assert.equal(mapped.atlasId, "atlas-texarkana-1888");
  assert.equal(mapped.referenceAssetId, "birds-eye-texarkana-1888");
  assert.equal(mapped.linkedMapPieceId, "piece-1888-12");
  assert.equal(mapped.linkedSourceRecordId, source.linkedSourceRecordId);
  assert.equal(mapped.linkedBuildingId, "building-depot-1");
  assert.equal(mapped.archivedAt, "2026-07-29T00:00:00Z");
});

test("Map Placement projection is downstream and never mutates geographic source geometry", () => {
  const source = placedPiece();
  const before = structuredClone(source);
  const projected = projectBirdsEyePlacedGeometry(source, (coordinate) => ({
    x: (coordinate.longitude + 94.02) * 20,
    y: (33.02 - coordinate.latitude) * 20,
  }));
  assert.ok(projected);
  assert.equal(projected.geometryType, "polygon");
  assert.equal(projected.coordinateSpace, "normalized_image");
  assert.deepEqual(source, before);
});

test("presentation adjustment is stored separately and reset returns to its projected baseline", () => {
  const source = placedPiece();
  const projected = projectBirdsEyePlacedGeometry(source, (coordinate) => ({
    x: (coordinate.longitude + 94.02) * 20,
    y: (33.02 - coordinate.latitude) * 20,
  }));
  assert.ok(projected);
  const presentation = createProjectedBirdsEyePresentation({
    atlasId: "atlas-texarkana-1888",
    geometry: projected,
    referenceAssetId: "birds-eye-texarkana-1888",
    source,
    townPackageId: "town-texarkana",
  });
  assert.equal(
    presentation.presentationId,
    "birds-eye-presentation-atlas-texarkana-1888-birds-eye-texarkana-1888-piece-1888-12",
  );
  const adjusted = rotateBirdsEyeGeometry(scaleBirdsEyeGeometry(translateBirdsEyeGeometry(projected, 0.01, -0.02), 1.03), 2);
  const withAdjustment = { ...presentation, adjustedImageGeometry: adjusted, adjustmentStatus: "adjusted" as const };
  assert.notDeepEqual(withAdjustment.adjustedImageGeometry, withAdjustment.projectedImageGeometry);
  assert.deepEqual(source, placedPiece());
  const reset = resetBirdsEyePresentationAdjustment(withAdjustment);
  assert.equal(reset.adjustedImageGeometry, null);
  assert.equal(reset.adjustmentStatus, "projected");
  assert.deepEqual(reset.projectedImageGeometry, projected);
});

test("hidden presentation state survives reprojection and adjustment reset", () => {
  const source = placedPiece();
  const hidden = createProjectedBirdsEyePresentation({
    atlasId: "atlas-texarkana-1888",
    geometry: polygon,
    referenceAssetId: "birds-eye-texarkana-1888",
    source,
    townPackageId: "town-texarkana",
    existing: {
      ...createProjectedBirdsEyePresentation({
        atlasId: "atlas-texarkana-1888",
        geometry: polygon,
        referenceAssetId: "birds-eye-texarkana-1888",
        source,
        townPackageId: "town-texarkana",
      }),
      adjustedImageGeometry: translateBirdsEyeGeometry(polygon, 0.01, 0),
      adjustmentStatus: "hidden",
      isVisible: false,
    },
  });
  assert.equal(hidden.adjustmentStatus, "hidden");
  assert.equal(resetBirdsEyePresentationAdjustment(hidden).adjustmentStatus, "hidden");
});

test("source checksum changes mark a projection stale without overwriting an adjusted presentation", () => {
  const source = placedPiece();
  const projected = projectBirdsEyePlacedGeometry(source, (coordinate) => ({
    x: (coordinate.longitude + 94.02) * 20,
    y: (33.02 - coordinate.latitude) * 20,
  }));
  assert.ok(projected);
  const presentation = {
    ...createProjectedBirdsEyePresentation({
      atlasId: "atlas-texarkana-1888",
      geometry: projected,
      referenceAssetId: "birds-eye-texarkana-1888",
      source,
      townPackageId: "town-texarkana",
    }),
    adjustedImageGeometry: translateBirdsEyeGeometry(projected, 0.02, 0.01),
    adjustmentStatus: "adjusted" as const,
  };
  const changedSource = structuredClone(source);
  changedSource.corners!.northwest!.latitude += 0.0005;
  assert.notEqual(checksumBirdsEyeGeographicGeometry(source), checksumBirdsEyeGeographicGeometry(changedSource));
  assert.equal(isBirdsEyePresentationStale(presentation, changedSource), true);
  const stale = createProjectedBirdsEyePresentation({
    atlasId: "atlas-texarkana-1888",
    geometry: projected,
    referenceAssetId: "birds-eye-texarkana-1888",
    source: changedSource,
    townPackageId: "town-texarkana",
    existing: presentation,
  });
  assert.equal(stale.adjustmentStatus, "stale");
  assert.deepEqual(stale.adjustedImageGeometry, presentation.adjustedImageGeometry);
  assert.deepEqual(stale.projectedImageGeometry, presentation.projectedImageGeometry);
});

test("piece-presentation hydration keeps projected and adjusted geometry distinct", () => {
  const mapped = mapBirdsEyePiecePresentationRow({
    id: "7c33cb62-2f05-4db9-903a-a895eaa8d82a",
    presentation_id: "birds-eye-presentation-atlas-1888-piece-12",
    town_package_id: "town-texarkana",
    atlas_id: "atlas-texarkana-1888",
    reference_asset_id: "birds-eye-texarkana-1888",
    map_piece_id: "piece-1888-12",
    source_geographic_geometry_checksum: "geo-fnv1a-12345678",
    projected_image_geometry: polygon,
    adjusted_image_geometry: translateBirdsEyeGeometry(polygon, 0.01, 0),
    adjustment_status: "adjusted",
    display_label: "Block 12",
    opacity: 0.55,
    is_visible: true,
    is_locked: false,
    notes: "",
    review_status: "unknown",
    archived_at: null,
  });
  assert.ok(mapped);
  assert.equal(mapped.adjustmentStatus, "adjusted");
  assert.notDeepEqual(mapped.adjustedImageGeometry, mapped.projectedImageGeometry);
});

test("evidence package includes durable IDs and notes but never a signed image URL", () => {
  const source = placedPiece();
  const presentation = createProjectedBirdsEyePresentation({
    atlasId: "atlas-texarkana-1888",
    geometry: polygon,
    referenceAssetId: "birds-eye-texarkana-1888",
    source,
    townPackageId: "town-texarkana",
  });
  const evidence = buildBirdsEyeEvidencePackage({
    referenceAssetId: "birds-eye-texarkana-1888",
    referenceFilename: "Old_map-Texarkana-1888.jpg",
    region: sceneRegion(),
    presentation,
  });
  assert.equal(evidence.referenceAssetId, "birds-eye-texarkana-1888");
  assert.equal(evidence.referenceFilename, "Old_map-Texarkana-1888.jpg");
  assert.equal(evidence.linkedMapPieceId, "piece-1888-12");
  assert.equal(evidence.linkedSourceRecordId, sceneRegion().linkedSourceRecordId);
  assert.equal(evidence.geographicSourceFingerprint, presentation.sourceGeographicGeometryChecksum);
  assert.match(evidence.rendererCaution, /not mechanically exact/i);
  assert.doesNotMatch(JSON.stringify(evidence), /signed|https?:\/\//i);
});

test("calibration, scene markup, presentation adjustment, and rehydration round trip without changing Map Placement", () => {
  const source = placedPiece();
  const authoritativeBefore = JSON.stringify(source);
  const sourceCoordinates = [
    source.corners!.northwest!,
    source.corners!.northeast!,
    source.corners!.southeast!,
    source.corners!.southwest!,
  ];
  const flatProjection = createBirdsEyeFlatProjection({
    coordinates: sourceCoordinates.map((coordinate) => ({ longitude: coordinate.longitude, latitude: coordinate.latitude })),
    centerLatitude: 33.005,
    centerLongitude: -94.005,
    width: 2000,
    height: 1200,
  });
  const points: BirdsEyeControlPoint[] = sourceCoordinates.map((coordinate, index) => {
    const flat = projectBirdsEyeGeographicFlat(coordinate.longitude, coordinate.latitude, flatProjection);
    return {
      id: `existing-point-${index + 1}`,
      sequence: index + 1,
      label: `Landmark ${index + 1}`,
      note: "",
      anchorType: index === 0 ? "railroad_crossing" : "intersection",
      linkedMapPieceId: index === 0 ? source.id : null,
      longitude: coordinate.longitude,
      latitude: coordinate.latitude,
      imageX: flat.x * 0.82 + 130,
      imageY: flat.y * 0.72 + 90,
      enabled: true,
      deletedAt: null,
    };
  });
  const solve = solveBirdsEyeStagedCalibration({ points, flatProjection });
  assert.equal(solve.valid, true);
  const projected = projectBirdsEyePlacedGeometry(source, (coordinate) => {
    const image = projectBirdsEyeThroughSolve(coordinate.longitude, coordinate.latitude, solve);
    return { x: image.x / 2000, y: image.y / 1200 };
  });
  assert.ok(projected);
  const baseline = createProjectedBirdsEyePresentation({
    atlasId: "atlas-texarkana-1888",
    geometry: projected,
    referenceAssetId: "birds-eye-texarkana-1888",
    source,
    townPackageId: "town-texarkana",
  });
  const adjusted = {
    ...baseline,
    adjustedImageGeometry: translateBirdsEyeGeometry(baseline.projectedImageGeometry, 0.008, -0.004),
    adjustmentStatus: "adjusted" as const,
  };
  const region = sceneRegion();
  const hydratedRegion = mapBirdsEyeSceneRegionRow({
    ...region,
    region_id: region.regionId,
    town_package_id: region.townPackageId,
    atlas_id: region.atlasId,
    reference_asset_id: region.referenceAssetId,
    region_type: region.regionType,
    image_geometry: region.imageGeometry,
    linked_map_piece_id: region.linkedMapPieceId,
    linked_source_record_id: region.linkedSourceRecordId,
    linked_building_id: region.linkedBuildingId,
    evidence_classification: region.evidenceClassification,
    review_status: region.reviewStatus,
    visible_features: region.visibleFeatures,
    reconstruction_notes: region.reconstructionNotes,
    rendering_notes: region.renderingNotes,
    crop_bounds: region.cropBounds,
    is_visible: region.isVisible,
    is_locked: region.isLocked,
    sort_order: region.sortOrder,
  });
  const hydratedPresentation = mapBirdsEyePiecePresentationRow({
    ...adjusted,
    presentation_id: adjusted.presentationId,
    town_package_id: adjusted.townPackageId,
    atlas_id: adjusted.atlasId,
    reference_asset_id: adjusted.referenceAssetId,
    map_piece_id: adjusted.mapPieceId,
    source_geographic_geometry_checksum: adjusted.sourceGeographicGeometryChecksum,
    projected_image_geometry: adjusted.projectedImageGeometry,
    adjusted_image_geometry: adjusted.adjustedImageGeometry,
    adjustment_status: adjusted.adjustmentStatus,
    display_label: adjusted.displayLabel,
    is_visible: adjusted.isVisible,
    is_locked: adjusted.isLocked,
    review_status: adjusted.reviewStatus,
  });
  assert.ok(hydratedRegion);
  assert.ok(hydratedPresentation);
  assert.equal(hydratedRegion.linkedMapPieceId, source.id);
  assert.equal(hydratedPresentation.adjustmentStatus, "adjusted");
  assert.notDeepEqual(hydratedPresentation.adjustedImageGeometry, hydratedPresentation.projectedImageGeometry);
  assert.equal(JSON.stringify(source), authoritativeBefore);
  assert.deepEqual(points.map((candidate) => candidate.id), ["existing-point-1", "existing-point-2", "existing-point-3", "existing-point-4"]);
});
