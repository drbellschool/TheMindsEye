# Supabase Setup

## Scope

This setup supports the Community Verification Console and the Historical Map Studio in `apps/web`.

Community review pages remain public and read-only. The Historical Map Studio currently opens without an owner-login screen and uses server routes for Sanborn sheet uploads, sheet metadata, saved layouts, image replacement, deletion, and georeferencing data.

This does not add full authentication, teacher dashboards, student dashboards, gameplay, source ingestion, OCR, AI map interpretation, GeoTIFF export, MBTiles, or survey-grade GIS certification.

## Environment

Create `apps/web/.env.local` from `apps/web/.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-anon-key

SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
SANBORN_MAX_UPLOAD_BYTES=26214400
```

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are browser-safe. `SUPABASE_SERVICE_ROLE_KEY` must stay server-only and must never use the `NEXT_PUBLIC_*` prefix.

## Create The Supabase Project

1. Open https://supabase.com/ and create a new project.
2. Wait for provisioning to complete.
3. In `Project Settings > API`, copy the Project URL and publishable key.
4. In the same area, copy the service-role key for server-only use.

## Apply Database Migrations

Run these SQL files in order from the Supabase SQL Editor:

1. `supabase/migrations/0001_initial_community_schema.sql`
2. `supabase/migrations/0002_sanborn_sheet_assets.sql`
3. `supabase/migrations/0003_historical_map_studio.sql`
4. `supabase/migrations/0004_historical_map_georeferencing.sql`
5. `supabase/migrations/0005_historical_map_sheet_placement_transforms.sql`
6. `supabase/migrations/0006_historical_map_sheet_georeferences.sql`
7. `supabase/migrations/0007_map_first_sheet_georeferencing.sql`
8. `supabase/migrations/0008_fix_map_studio_center_and_draft_status.sql`

The migrations create:

- Community read-model tables such as `town_packages`, `source_records`, `claims`, `buildings`, `people`, `businesses`, `map_layers`, and `review_events`.
- Private Storage bucket `sanborn-sheets`.
- `sanborn_sheet_assets` for original uploaded sheet metadata.
- `historical_map_workspaces` and `historical_map_sheet_placements` for saved Konva layout state.
- `historical_map_georeferences` and `historical_map_control_points` for GPS bounds, four-corner coordinates, control-point pairs, transform metadata, and overlay preferences.
- Skew and flip placement fields used by the stitching canvas transform controls.
- `historical_map_sheet_georeferences` for authoritative per-sheet geographic transforms rendered over the modern Leaflet basemap.
- Pivot, projective warp, transform-version, and placement-status fields for map-first four-corner sheet placement.
- Town-package map center metadata (`center_latitude`, `center_longitude`, `default_zoom`) so the studio does not silently initialize at `0,0`.
- Draft placement status and legacy repair logic for accidental all-zero sheet georeferences.

No uploaded or generated record is verified by default. New image intake records default to `unknown` evidence classification and `unknown` review status.

## Seed Data

After migrations are applied, run:

```sql
-- paste and run supabase/seed.sql
```

The seed creates a small Texarkana review set for local review. Demo fallback still works if Supabase tables or env vars are unavailable.

## Storage Bucket

The `sanborn-sheets` bucket should remain private or otherwise access-controlled. Do not make it public just to display images.

Historical Map Studio displays images by calling server routes that:

- verify the requested asset exists in `sanborn_sheet_assets`;
- read the controlled storage path from the database;
- reject arbitrary browser-supplied paths;
- create a short-lived signed Supabase Storage URL;
- return only the signed URL and safe metadata.

## Historical Map Studio

Primary route:

```text
/community/historical-map-studio
```

Compatibility route:

```text
/community/map-auditor
```

The compatibility route redirects to the Historical Map Studio.

The studio supports:

- Sanborn sheet upload to private Supabase Storage.
- Stored sheet gallery with signed image previews.
- Konva-based stitching workspace with drag, scale, rotate, opacity, visibility, lock state, and layer order.
- Manual save plus debounced autosave for layout transforms and viewport.
- Metadata edits for source URL, archive, rights, notes, evidence classification, and review status.
- Image replacement and deletion through server routes that keep Supabase service-role credentials server-only.
- GPS georeferencing mode with historical image points matched to modern latitude/longitude markers.
- Authoritative sheet-level geographic placement in Georeferencing mode.
- Modern Leaflet overlay mode using saved independent Sanborn sheet transforms.
- Town-package map center recovery; Texarkana 1885 should open near `33.425, -94.047`.
- Compact image diagnostics for signed URL state, image load state, natural dimensions, and transform fallback.

Layouts are persisted as transform data, not screenshots. The original uploaded image remains unchanged.

## Leaflet And Modern Tiles

The modern map uses Leaflet and React Leaflet on the client only. The default basemap is OpenStreetMap:

```text
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

Keep the required OpenStreetMap attribution visible. If a future tile provider is added, document the provider URL, attribution, usage limits, and any required environment variables.

## Georeferencing Accuracy

The georeferencing model stores three related levels of alignment:

- Optional local prep-canvas placement for rough sheet organization before geographic alignment.
- Sheet-level geographic placement with four authoritative corners, center coordinates, geographic spans, rotation, non-uniform scale, skew, pivot, projective warp metadata, flips, opacity, layer order, visibility, placement status, and lock state.
- Control-point pairs and affine transform metadata when at least three complete point pairs exist.

Georeference Sheets mode is the authoritative final arrangement. Modern Overlay renders the saved independent sheet-level geographic layers over Leaflet, not a flattened composite image. The browser renderer uses a custom projective image overlay that maps each uploaded sheet into its four stored geographic corners. GDAL export remains deferred. Independent corner coordinates and control points are persisted so a later GDAL service can use the same data for `gdal_translate` and `gdalwarp`.

Do not label this output as survey-grade. It is a visual historical alignment workspace for review and later export work.

## Vercel Environment Variables

In Vercel Project Settings, add:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SANBORN_MAX_UPLOAD_BYTES`

Redeploy after saving variables. The public Community pages continue to fall back safely when Supabase is unavailable, but Historical Map Studio writes require the server-only variables.

## Manual Production Checks

1. Open `/community` and confirm the data-source badge says `Supabase` or `Demo fallback`.
2. Open `/community/historical-map-studio`.
3. Upload PNG, JPEG, or WebP Sanborn sheets.
4. Confirm thumbnails load from signed URLs and the bucket remains private.
5. Drag, scale, rotate, skew, hide, lock, reorder, and adjust opacity for sheets.
6. Save the layout, reload, and confirm transforms and viewport restore.
7. Edit metadata and confirm only allowed classifications are saved.
8. Replace an incorrect image and confirm placement is preserved.
9. Delete an incorrect sheet and confirm placement, metadata, and storage object cleanup.
10. Open the default `Georeference Sheets` mode.
11. Add unplaced sheets directly to the map at the current center or by clicking a GPS location.
12. In `Edit historical sheets` mode, drag the sheet, move individual corners, rotate, scale, skew, flip, hide, lock, reorder, adjust pivot, and adjust opacity.
13. Save, reload, and confirm every sheet-level geographic transform restores.
14. Add paired historical/GPS control points, calculate alignment, and save.
15. Switch to Modern Overlay mode, adjust opacity, fit the historical assembly, reload, and confirm the saved independent layers restore.

## Local Validation

From `apps/web`:

```bash
npm install
npm run test:unit
npm run build
```

From the repository root:

```bash
py -3.11 scripts/validate_mindseye.py
py -3.11 -m unittest discover -s tests -p "test_*.py"
```
