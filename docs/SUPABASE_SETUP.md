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
9. `supabase/migrations/0009_town_package_location_metadata.sql`
10. `supabase/migrations/0010_sanborn_atlas_page_piece_inventory.sql`
11. `supabase/migrations/0011_sanborn_map_piece_geographic_placement.sql`
12. `supabase/migrations/0012_fix_sanborn_map_piece_save_scope.sql`
13. `supabase/migrations/0013_town_reconstruction_source_provenance.sql`
14. `supabase/migrations/0014_town_index_regions.sql`
15. `supabase/migrations/0015_page_classification_workflow.sql`
16. `supabase/migrations/0016_functional_source_regions.sql`
17. `supabase/migrations/0017_atlas_edition_management.sql`

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
- Sanborn atlas, atlas-page, and map-piece inventory tables plus service-role save RPCs.
- Piece-specific geographic placement records for saved map pieces, including four-corner quadrilateral validation and service-role save RPCs.
- The scoped RPC replacement that fixes map-piece placement save scope on databases that already applied `0011`.
- Durable source identity and provenance fields on `source_records`, including `SRC-XXXXXXXXXXXX` display IDs, repository metadata, Library of Congress fields, persistent URLs, IIIF URLs, rights notes, source status, and source links from sheets, pages, map pieces, buildings, people, and businesses.
- Durable Town Index mission-map regions with normalized source-image polygons, non-sequential sheet references, scoped page/sheet links, explicit workflow statuses, RLS, and service-role-only save/delete RPCs.
- Page Classification workflow fields on Sanborn atlas pages, including canonical page types, printed references, display titles, classification notes, explicit primary Town Index designation, safe backfill from legacy page types, and a service-role-only atlas-page save RPC.
- Functional Sanborn source regions with normalized source-image polygons, region-purpose types, source-page/sheet links, optional Town Index inclusion, optional Map Pieces availability for geographic regions, scoped save/delete RPCs, RLS, and service-role-only access.
- Sanborn edition-management archive fields and service-role-only RPCs for archiving editions/pages and moving pages between saved editions without cross-town mutations.

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
- Explicit Sanborn edition creation through `+ Add year`; towns show only saved atlas/edition records and do not receive automatic year suggestions.
- Upload scoping to the active town and active Sanborn edition, with upload disabled until an edition is selected or created.
- Stored sheet gallery with signed image previews.
- Konva-based stitching workspace with drag, scale, rotate, opacity, visibility, lock state, and layer order.
- Manual save plus debounced autosave for layout transforms and viewport.
- Metadata edits for source URL, archive, rights, notes, evidence classification, and review status.
- Shared Town Reconstruction context across Map, Buildings, People, and Sources routes.
- Six Historical Map Studio stations: Town & Edition, Source Record, Town Index, Sheet Inventory, Map Pieces, and Map Placement.
- Town Index mission-map region drawing, editing, linking, deletion, legend, and status/progress summaries.
- Image replacement and deletion through server routes that keep Supabase service-role credentials server-only.
- Page management actions for moving pages to another edition, replacing images, archiving pages, and blocking hard deletes when source regions, map pieces, placements, source links, or primary-index work exist.
- Piece-first Map Placement for saved Sanborn map pieces, with all visible placed pieces shown on a shared town canvas.
- Sticky Map Pieces source-image toolbar with select/draw/pan tools, zoom in/out, fit image, 100%, reset view, and fit selected piece while keeping source polygons in normalized coordinates.
- Optional advanced whole-sheet reference alignment for backward-compatible sheet-level georeferencing.
- Authoritative sheet-level geographic placement in Georeferencing mode.
- Modern Leaflet overlay mode using saved independent Sanborn sheet transforms.
- Town-package map center recovery; Texarkana 1885 should open near `33.425, -94.047`.
- Town/address/ZIP lookup that can save `town_packages` center and location metadata for new towns.
- Compact image diagnostics for signed URL state, image load state, natural dimensions, and transform fallback.

Layouts are persisted as transform data, not screenshots. The original uploaded image remains unchanged.

## Leaflet And Modern Tiles

The modern map uses Leaflet and React Leaflet on the client only. The default basemap is OpenStreetMap:

```text
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

Keep the required OpenStreetMap attribution visible. If a future tile provider is added, document the provider URL, attribution, usage limits, and any required environment variables.

Location search runs through the server route at `/api/community/historical-map-studio/geocode`. It supports direct `latitude,longitude` input without an external request. Town, address, and ZIP searches use OpenStreetMap Nominatim server-side with an identifying User-Agent and cached successful responses; do not call Nominatim on every keystroke or expose geocoding logic from the browser. Set `GEOCODING_USER_AGENT` in Vercel if you want a project-specific contact string.

Migration `0009_town_package_location_metadata.sql` adds:

- `location_query`
- `location_display_name`
- `location_north`
- `location_south`
- `location_east`
- `location_west`

The studio reuses `center_latitude`, `center_longitude`, and `default_zoom` for the active map center.

Migration `0013_town_reconstruction_source_provenance.sql` is required for creating new durable source records from the Source Info drawer. Migration `0014_town_index_regions.sql` is required for legacy persistent Town Index region save/delete behavior. Migration `0016_functional_source_regions.sql` is required for PR #73 functional source regions, canonical page-type repair, Source Record region saves, and Town Index reuse of saved sheet-coverage regions. Until `0016` is applied, the studio falls back to legacy Town Index region reads where possible and shows visible database errors for source-region writes rather than fabricating data.

Migration `0015_page_classification_workflow.sql` is required for page-type-driven station behavior. Until `0015` is applied, older atlas pages still load through the compatibility query, but page classification fields cannot persist and the Source Record classification controls will return visible database errors instead of silently pretending to save.

Migration `0017_atlas_edition_management.sql` is required for PR #75 edition/page management. Until `0017` is applied, saved editions still load, but edition notes, archive states, page archive, and page move actions cannot persist.

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
- Optional: `GEOCODING_USER_AGENT`
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
16. Open the shared Town Reconstruction header and confirm the active town, edition, sheet, and block/piece stay visible.
17. Open Source Info and confirm the durable source ID, repository, citation, and persistent record link are shown when a source is linked.
18. Create a Library of Congress source record from the Source Info drawer after applying `0013`; confirm the row receives a `SRC-XXXXXXXXXXXX` internal source ID.
19. Use the six Historical Map Studio stations and confirm Building Reconstruction, People & Activity, and Evidence Review do not appear in the station rail.
20. In Town Index, draw a region, close the polygon, link it to a non-sequential sheet reference, save it, reload, and confirm the region and `indexRegionId` selection restore.
21. Confirm invalid or self-intersecting region polygons are rejected before save.
22. In Source Record, classify a cover page and confirm Map Pieces explains that cover pages do not use map pieces.
23. Classify one uploaded page as Index or mixed, explicitly set it as the primary Town Index, and confirm Town Index loads that page immediately.
24. In Source Record, mark functional regions for town coverage, sheet coverage, printed index, and geographic map content; save regions and confirm Town Index reuses the sheet-coverage regions without redrawing.
25. Confirm Map Pieces and Map Placement are enabled only for Sanborn Sheet or Inset / Special Sheet pages.
26. Open Town & Edition, confirm the edition selector lists only saved editions, create a new year with `+ Add year`, and confirm the active context switches to the new empty edition.
27. Confirm upload is disabled when no edition is active and successful uploads report the active town and edition.
28. Move a misplaced page to another edition, confirm source metadata and storage identity are preserved, and confirm cross-town destination moves are rejected.
29. Replace an uploaded image and confirm failed replacements keep the old image; when dimensions change, review source-region polygons and map pieces.
30. Archive pages or editions that contain reconstruction work; hard delete only empty pages or empty editions after warnings.
31. In Map Pieces, zoom in/out, fit image, reset view, pan while zoomed, fit the selected piece, edit a polygon, save, and confirm zoom/pan did not alter normalized source coordinates.
32. Confirm direct anon table/RPC access to `sanborn_town_index_regions` and atlas-page classification writes fails, while the Next.js service-role APIs work.
33. Switch from Map to Buildings, People, and Sources and confirm URL context is preserved.

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
