# Birds-Eye Calibration and Scene Markup

## Scope

Historical Map Studio Step 7 aligns an edition-scoped historical Birds-Eye illustration with authoritative Map Placement geography, then records visual scene evidence on that illustration.

The workspace has three deliberately separate views:

1. **Historical Illustration** — the designated source image, calibration markers, scene regions, and Birds-Eye presentation geometry.
2. **Flat Geographic Map** — a live, undistorted Leaflet map with modern tiles, placed Map Pieces, optional Sanborn boundaries, and geographic control points.
3. **Warped Geographic Preview** — a derived vector preview that responds to calibration pairs without changing the Leaflet map or its stored coordinates.

## Source-of-truth boundary

```text
Map Placement latitude/longitude and geographic geometry
  -> deterministic source fingerprint
  -> Birds-Eye calibration projection
  -> optional Birds-Eye-only presentation adjustment
```

Map Placement remains authoritative. Step 7 never writes to Sanborn Map Piece source geometry, Map Placement corners, latitude/longitude, placement status, or source provenance.

`historical_map_birds_eye_piece_presentations.projected_image_geometry` is derived from Map Placement. `adjusted_image_geometry` is optional presentation-only geometry. A changed Map Placement fingerprint marks the presentation stale; it does not silently replace a human adjustment.

## Calibration stages

The deterministic solver gives useful feedback at every complete-pair count:

- 0 pairs: flat geographic preview.
- 1 pair: translation anchor.
- 2 pairs: translation, rotation, and scale estimate.
- 3 pairs: coarse affine alignment.
- 4–5 pairs: rough, valid broad alignment.
- 6 or more pairs: global affine solve plus local Delaunay piecewise-affine correction.

Disabled and incomplete points are excluded. The UI reports duplicate or too-close points, near-collinear layouts, possible outliers, residuals, and the worst point.

Control-point image coordinates remain compatible with the PR #101 pixel fields. Clicks are calculated against the original reference dimensions, while scene and presentation polygons use normalized `0..1` image coordinates.

## Scene-region evidence

Migration `0026_birds_eye_scene_regions.sql` creates:

- `public.historical_map_birds_eye_scene_regions`;
- `public.historical_map_birds_eye_piece_presentations`;
- additive control-point context columns;
- normalized-image validation helpers;
- scoped save/archive RPCs;
- atomic bulk projection persistence;
- service-role-only table and function access.

Scene regions remain tied to the town, edition, and exact reference asset on which they were drawn. Changing the designated reference does not reinterpret old normalized coordinates. Archive writes retain the row and append a review event.

Supported initial region types are building, building group, block, street, railroad, depot, industrial site, bridge, waterway, vegetation, open land, landmark, skyline, background, and unknown. Adding a type requires extending the shared client allowlist and migration constraint together.

## Reconstruction evidence package

The inspector can copy a durable JSON package containing:

- reference asset ID and original filename;
- normalized crop bounds;
- scene polygon;
- linked Map Piece, source-record, and building IDs;
- region type and label;
- visible features and reconstruction/rendering notes;
- confidence and review status;
- geographic source fingerprint.

Signed image URLs are intentionally excluded because they expire and are not evidence identifiers.

The future building renderer contract will combine:

- the historical Birds-Eye crop;
- the reviewed Sanborn footprint;
- authoritative geographic placement;
- linked source evidence;
- scene notes;
- nearby spatial context.

The historical artist’s drawing is reconstruction evidence, not mechanically exact architecture. A future renderer must preserve that uncertainty and may not promote an inferred visual detail to verified fact.

## Migration and deployment

Apply migrations in filename order. PR #107 specifically requires:

```text
supabase/migrations/0026_birds_eye_scene_regions.sql
```

Apply it after `0025_birds_eye_perspective_calibration.sql`, then redeploy the web application. Do not edit or rerun a rewritten `0025`; `0026` replaces the calibration save function additively while preserving existing calibration rows and control-point UUIDs.

Before production review:

1. Confirm the two new tables and control-point columns exist.
2. Confirm RLS is enabled and only `service_role` has table/RPC access.
3. Open Step 7 normally and verify the no-store bootstrap returns calibration, points, regions, and presentations.
4. Verify an archived edition opens read-only.
5. Record Map Placement coordinates before and after a presentation adjustment and confirm they are identical.

If `0026` has not been applied, calibration remains viewable and the UI displays a migration-required warning; scene-region and presentation writes must not pretend to succeed.
